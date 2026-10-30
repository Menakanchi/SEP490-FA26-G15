package com.vsos.backend.service.workspace;

import com.vsos.backend.common.audit.AuditLog;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MemberCandidate;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MemberItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.RemoveMemberResult;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceDetail;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceSummary;
import com.vsos.backend.repository.workspace.WorkspaceRepository;
import com.vsos.backend.repository.workspace.WorkspaceRepository.UserAccount;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.Set;
import com.vsos.backend.service.notification.NotificationService;

/**
 * Manager quản lý workspace được Admin gán (ADR-038): xem workspace, project, thành viên; thêm tài khoản tự đăng ký (EXPERIENCER)
 * và cấp role ENGINEER / REVIEWER cho người đó, bớt thành viên (ADR-045, thay một phần ADR-035). ADMIN xem và thao tác được mọi workspace. Role MANAGER / ADMIN kiểm ở controller ({@code VehicSimAccess});
 * lớp này kiểm "đúng workspace của mình": workspace của Manager khác trả 404 như project khác, không lộ là có tồn tại.
 * <p>
 * Chưa làm (TD-30): app vẫn chạy trên một project, nên thêm / bớt thành viên chưa đổi dữ liệu mà người đó nhìn thấy.
 */
@Service
public class WorkspaceService {

    /** Role cấp được khi thêm vào workspace (ADR-035/045); Manager quản lý qua {@code workspaces.manager_id}, không là thành viên. */
    public static final Set<String> MEMBER_ROLES = Set.of("ENGINEER", "REVIEWER");
    /** Role của tài khoản tự đăng ký — người duy nhất thêm được vào workspace, và role trả về khi rời workspace cuối cùng. */
    public static final String SELF_SIGNUP_ROLE = "EXPERIENCER";
    private static final Map<String, String> ROLE_LABEL = Map.of("ENGINEER", "Kỹ sư", "REVIEWER", "Người duyệt");
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

    /** M4 (bước chọn người): tài khoản EXPERIENCER đang hoạt động, chưa ở workspace, lọc theo email / tên. */
    public List<MemberCandidate> candidates(long userId, String role, long workspaceId, String q) {
        requireAccessible(userId, role, workspaceId);
        if (q != null && q.length() > 100) {
            throw new InvalidRequestException("Từ khoá tìm kiếm tối đa 100 ký tự");
        }
        return repo.candidatesFor(workspaceId, q, CANDIDATE_LIMIT);
    }

    /**
     * M4: thêm một tài khoản EXPERIENCER đang hoạt động vào workspace còn ACTIVE và đổi role hệ thống của người đó sang
     * {@code grantedRole} (ENGINEER / REVIEWER). Role đã cấp được ghi ở {@code workspace_members.granted_role} để khi bớt trả lại.
     */
    @Transactional
    public MemberItem addMember(long userId, String role, long workspaceId, long memberUserId, String grantedRole) {
        WorkspaceSummary ws = requireAccessible(userId, role, workspaceId);
        requireActive(ws);
        if (grantedRole == null || !MEMBER_ROLES.contains(grantedRole)) {
            throw new InvalidRequestException("Chọn vai trò ENGINEER hoặc REVIEWER cho người được thêm");
        }
        UserAccount account = repo.findUser(memberUserId);
        if (account == null) {
            throw new NotFoundException("người dùng");
        }
        if (!account.active()) {
            throw new InvalidRequestException("Tài khoản này đang bị khoá, không thêm vào workspace được");
        }
        if (repo.isMember(workspaceId, memberUserId)) {
            throw new InvalidRequestException("Người này đã là thành viên của workspace");
        }
        if (!SELF_SIGNUP_ROLE.equals(account.role())) {
            throw new InvalidRequestException("Chỉ thêm được tài khoản tự đăng ký (EXPERIENCER) vào workspace; tài khoản này đã là "
                    + account.role());
        }
        repo.setRole(memberUserId, grantedRole);
        repo.addMember(workspaceId, memberUserId, userId, grantedRole);
        String label = ROLE_LABEL.get(grantedRole);
        notifications.notify(memberUserId, userId, workspaceId, "MEMBER_ADDED", "Bạn được thêm vào workspace " + ws.name(),
                "Quản lý " + ws.manager().fullName() + " đã thêm bạn vào workspace " + ws.name() + " với vai trò " + label
                        + ". Đăng nhập lại để thấy đủ chức năng của vai trò mới.", "WORKSPACE", workspaceId);
        AuditLog.event("workspace.member_add", "success", "workspace_id", workspaceId, "user_id", memberUserId, "by", userId,
                "granted_role", grantedRole);
        return repo.membersOf(workspaceId).stream().filter(m -> m.userId() == memberUserId).findFirst()
                .orElseThrow(() -> new IllegalStateException("thành viên vừa thêm không đọc lại được"));
    }

    /**
     * M5: bớt một thành viên. Người đó tự rời mọi project của workspace (FK CASCADE) và task chưa xong của họ về "chưa giao".
     * Người đang làm chủ project trong workspace thì chưa bớt được — chưa có luồng chuyển chủ project, bớt đi sẽ để project mồ côi.
     * Role được cấp lúc thêm (ADR-045) trả về EXPERIENCER khi người đó không còn ở workspace nào và role chưa bị Admin đổi khác;
     * role có từ trước (Admin cấp) giữ nguyên.
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
        String granted = repo.grantedRole(workspaceId, memberUserId);
        repo.removeMember(workspaceId, memberUserId);
        UserAccount account = repo.findUser(memberUserId);
        boolean reverted = granted != null && repo.workspaceCount(memberUserId) == 0 && account != null && granted.equals(account.role());
        if (reverted) {
            repo.setRole(memberUserId, SELF_SIGNUP_ROLE);
        }
        // Bảng không có loại "rời workspace" riêng nên dùng SYSTEM.
        notifications.notify(memberUserId, userId, workspaceId, "SYSTEM", "Bạn không còn ở workspace " + ws.name(),
                "Bạn đã được bớt khỏi workspace " + ws.name() + "."
                        + (tasks > 0 ? " " + tasks + " task chưa xong của bạn đã chuyển về chưa giao." : "")
                        + (reverted ? " Tài khoản của bạn trở về loại tự đăng ký (Experiencer)." : ""),
                "WORKSPACE", workspaceId);
        AuditLog.event("workspace.member_remove", "success", "workspace_id", workspaceId, "user_id", memberUserId, "by", userId,
                "projects", projects, "unassigned_tasks", tasks, "role_reverted", reverted);
        return new RemoveMemberResult(memberUserId, projects, tasks, reverted);
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
