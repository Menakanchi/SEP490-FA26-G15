package com.vehicsim.service;

import com.vehicsim.audit.AuditLog;
import com.vehicsim.dto.WorkspaceDtos.MemberCandidate;
import com.vehicsim.dto.WorkspaceDtos.MemberItem;
import com.vehicsim.dto.WorkspaceDtos.RemoveMemberResult;
import com.vehicsim.dto.WorkspaceDtos.WorkspaceDetail;
import com.vehicsim.dto.WorkspaceDtos.WorkspaceSummary;
import com.vehicsim.repository.WorkspaceRepository;
import com.vehicsim.repository.WorkspaceRepository.UserAccount;
import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;

/**
 * Manager quản lý workspace được Admin gán (ADR-038): xem workspace, project, thành viên; thêm / bớt ENGINEER và REVIEWER
 * (ADR-035). ADMIN xem và thao tác được mọi workspace. Role MANAGER / ADMIN kiểm ở controller ({@code VehicSimAccess});
 * lớp này kiểm "đúng workspace của mình": workspace của Manager khác trả 404 như project khác, không lộ là có tồn tại.
 * <p>
 * Chưa làm (TD-30): app vẫn chạy trên một project, nên thêm / bớt thành viên chưa đổi dữ liệu mà người đó nhìn thấy.
 */
@Service
public class WorkspaceService {

    /** Chỉ hai role này vào được workspace (ADR-035); Manager quản lý qua {@code workspaces.manager_id}, không là thành viên. */
    public static final Set<String> MEMBER_ROLES = Set.of("ENGINEER", "REVIEWER");
    static final int CANDIDATE_LIMIT = 20;

    private final WorkspaceRepository repo;
    private final NotificationService notifications;

    public WorkspaceService(WorkspaceRepository repo, NotificationService notifications) {
        this.repo = repo;
        this.notifications = notifications;
    }

    /** M1: Manager thấy workspace mình quản lý; ADMIN thấy tất cả. */
    public List<WorkspaceSummary> listWorkspaces(long userId, String role) {
        return isAdmin(role) ? repo.listAll() : repo.listManagedBy(userId);
    }

    /** M2: thông tin workspace và các project bên trong. */
    public WorkspaceDetail detail(long userId, String role, long workspaceId) {
        WorkspaceSummary ws = requireAccessible(userId, role, workspaceId);
        return new WorkspaceDetail(ws, repo.projectsOf(workspaceId));
    }

    /** M3: mọi thành viên của workspace. */
    public List<MemberItem> members(long userId, String role, long workspaceId) {
        requireAccessible(userId, role, workspaceId);
        return repo.membersOf(workspaceId);
    }

    /** M4 (bước chọn người): tài khoản ENGINEER / REVIEWER đang hoạt động, chưa ở workspace, lọc theo email / tên. */
    public List<MemberCandidate> candidates(long userId, String role, long workspaceId, String q) {
        requireAccessible(userId, role, workspaceId);
        if (q != null && q.length() > 100) {
            throw new InvalidRequestException("Từ khoá tìm kiếm tối đa 100 ký tự");
        }
        return repo.candidatesFor(workspaceId, q, CANDIDATE_LIMIT);
    }

    /** M4: thêm một ENGINEER / REVIEWER đang hoạt động vào workspace còn ACTIVE. */
    @Transactional
    public MemberItem addMember(long userId, String role, long workspaceId, long memberUserId) {
        WorkspaceSummary ws = requireAccessible(userId, role, workspaceId);
        requireActive(ws);
        UserAccount account = repo.findUser(memberUserId);
        if (account == null) {
            throw new NotFoundException("người dùng");
        }
        if (!account.active()) {
            throw new InvalidRequestException("Tài khoản này đang bị khoá, không thêm vào workspace được");
        }
        if (!MEMBER_ROLES.contains(account.role())) {
            throw new InvalidRequestException("Chỉ thêm được tài khoản ENGINEER hoặc REVIEWER vào workspace (tài khoản này là "
                    + account.role() + ")");
        }
        if (repo.isMember(workspaceId, memberUserId)) {
            throw new InvalidRequestException("Người này đã là thành viên của workspace");
        }
        repo.addMember(workspaceId, memberUserId, userId);
        notifications.notify(memberUserId, userId, workspaceId, "MEMBER_ADDED", "Bạn được thêm vào workspace " + ws.name(),
                "Quản lý " + ws.manager().fullName() + " đã thêm bạn vào workspace " + ws.name() + ".", "WORKSPACE", workspaceId);
        AuditLog.event("workspace.member_add", "success", "workspace_id", workspaceId, "user_id", memberUserId, "by", userId);
        return repo.membersOf(workspaceId).stream().filter(m -> m.userId() == memberUserId).findFirst()
                .orElseThrow(() -> new IllegalStateException("thành viên vừa thêm không đọc lại được"));
    }

    /**
     * M5: bớt một thành viên. Người đó tự rời mọi project của workspace (FK CASCADE) và task chưa xong của họ về "chưa giao".
     * Người đang làm chủ project trong workspace thì chưa bớt được — chưa có luồng chuyển chủ project, bớt đi sẽ để project mồ côi.
     */
    @Transactional
    public RemoveMemberResult removeMember(long userId, String role, long workspaceId, long memberUserId) {
        WorkspaceSummary ws = requireAccessible(userId, role, workspaceId);
        requireActive(ws);
        if (!repo.isMember(workspaceId, memberUserId)) {
            throw new NotFoundException("thành viên");
        }
        List<String> owned = repo.ownedProjectNames(workspaceId, memberUserId);
        if (!owned.isEmpty()) {
            throw new InvalidRequestException("Người này đang là chủ " + owned.size() + " project trong workspace ("
                    + String.join(", ", owned) + "); chưa bớt khỏi workspace được");
        }
        int projects = repo.projectMembershipCount(workspaceId, memberUserId);
        // Task đã DONE giữ người làm để còn lịch sử; task chưa xong về "chưa giao" để Manager giao lại.
        int tasks = repo.unassignOpenTasks(workspaceId, memberUserId);
        repo.removeMember(workspaceId, memberUserId);
        // Bảng không có loại "rời workspace" riêng nên dùng SYSTEM.
        notifications.notify(memberUserId, userId, workspaceId, "SYSTEM", "Bạn không còn ở workspace " + ws.name(),
                "Bạn đã được bớt khỏi workspace " + ws.name() + "."
                        + (tasks > 0 ? " " + tasks + " task chưa xong của bạn đã chuyển về chưa giao." : ""),
                "WORKSPACE", workspaceId);
        AuditLog.event("workspace.member_remove", "success", "workspace_id", workspaceId, "user_id", memberUserId, "by", userId,
                "projects", projects, "unassigned_tasks", tasks);
        return new RemoveMemberResult(memberUserId, projects, tasks);
    }

    /** Workspace mà người này được quản lý (Manager được gán hoặc ADMIN); không thì 404. Dùng chung với {@link WorkspaceTaskService}. */
    public WorkspaceSummary requireAccessible(long userId, String role, long workspaceId) {
        WorkspaceSummary ws = repo.find(workspaceId);
        if (ws == null || (!isAdmin(role) && ws.manager().id() != userId)) {
            throw new NotFoundException("workspace");
        }
        return ws;
    }

    static void requireActive(WorkspaceSummary ws) {
        if (!"ACTIVE".equals(ws.status())) {
            throw new InvalidRequestException("Workspace đã lưu trữ, không thay đổi được");
        }
    }

    private static boolean isAdmin(String role) {
        return "ADMIN".equals(role);
    }
}
