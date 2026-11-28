package com.vsos.backend.repository.workspace;

import com.vsos.backend.dto.workspace.WorkspaceDtos.ChatMessage;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MemberCandidate;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MemberItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MyProject;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ProjectItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.UserRef;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceRef;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceSummary;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Câu SQL của màn quản lý workspace: workspace, project, thành viên (Manager — M1…M5; task ở {@link WorkspaceTaskRepository}).
 * SQL thuần qua {@link Db} như phần còn lại của VehicSim; tham gia transaction của service gọi nó. Tên ghép theo thứ tự họ – đệm – tên ({@code CONCAT_WS} bỏ qua đệm NULL).
 */
@Repository
public class WorkspaceRepository {

    private static final String FULL_NAME = "CONCAT_WS(' ', %1$s.last_name, %1$s.middle_name, %1$s.first_name)";

    private static final String SUMMARY_SELECT = """
            SELECT w.id, w.name, w.description, w.status, w.created_date,
                   m.id AS manager_id, %s AS manager_name, m.email AS manager_email,
                   (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) AS member_count,
                   (SELECT COUNT(*) FROM projects p WHERE p.workspace_id = w.id) AS project_count,
                   (SELECT COUNT(*) FROM task_reports r JOIN projects rp ON rp.id = r.project_id
                     WHERE rp.workspace_id = w.id AND r.status = 'SUBMITTED') AS pending_report_count
              FROM workspaces w
              JOIN users m ON m.id = w.manager_id
            """.formatted(FULL_NAME.formatted("m"));

    private final Db db;

    public WorkspaceRepository(Db db) {
        this.db = db;
    }

    // ------------------------------------------------------------------ workspace

    /** Workspace có Manager này, mới nhất trước. */
    public List<WorkspaceSummary> listManagedBy(long managerId) {
        return db.list(SUMMARY_SELECT + " WHERE w.manager_id = ? ORDER BY w.id DESC", managerId).stream().map(this::toSummary).toList();
    }

    /** Mọi workspace (ADMIN), mới nhất trước. */
    public List<WorkspaceSummary> listAll() {
        return db.list(SUMMARY_SELECT + " ORDER BY w.id DESC").stream().map(this::toSummary).toList();
    }

    /** Một workspace hoặc null. */
    public WorkspaceSummary find(long workspaceId) {
        Row row = db.first(SUMMARY_SELECT + " WHERE w.id = ?", workspaceId);
        return row == null ? null : toSummary(row);
    }

    /** Project thuộc workspace, kèm chủ project và số thành viên. */
    public List<ProjectItem> projectsOf(long workspaceId) {
        return db.list("""
                SELECT p.id, p.name, p.status, p.created_date,
                       o.id AS owner_id, %s AS owner_name, o.email AS owner_email,
                       (SELECT COUNT(*) FROM project_members pm WHERE pm.project_id = p.id) AS member_count
                  FROM projects p
                  JOIN users o ON o.id = p.created_by_user_id
                 WHERE p.workspace_id = ?
                 ORDER BY p.id DESC
                """.formatted(FULL_NAME.formatted("o")), workspaceId).stream()
                .map(r -> new ProjectItem(r.lng("id"), r.str("name"), r.str("status"),
                        new UserRef(r.lng("owner_id"), r.str("owner_name"), r.str("owner_email")),
                        (int) r.lng("member_count"), r.ts("created_date")))
                .toList();
    }

    // ------------------------------------------------------------------ thành viên

    /** Thành viên của workspace theo thứ tự vào trước. */
    public List<MemberItem> membersOf(long workspaceId) {
        return db.list("""
                SELECT u.id AS user_id, %s AS full_name, u.email, r.code AS role, u.is_active, wm.joined_at,
                       a.id AS added_by_id, %s AS added_by_name, a.email AS added_by_email,
                       (SELECT COUNT(*) FROM project_members pm
                         WHERE pm.workspace_id = wm.workspace_id AND pm.user_id = u.id) AS project_count,
                       (SELECT COUNT(*) FROM projects p
                         WHERE p.workspace_id = wm.workspace_id AND p.created_by_user_id = u.id) AS owned_project_count,
                       (SELECT COUNT(*) FROM workspace_tasks t
                         WHERE t.workspace_id = wm.workspace_id AND t.assigned_to_user_id = u.id AND t.status <> 'DONE') AS open_task_count
                  FROM workspace_members wm
                  JOIN users u ON u.id = wm.user_id
                  JOIN roles r ON r.id = u.role_id
                  LEFT JOIN users a ON a.id = wm.added_by_user_id
                 WHERE wm.workspace_id = ?
                 ORDER BY wm.joined_at, wm.id
                """.formatted(FULL_NAME.formatted("u"), FULL_NAME.formatted("a")), workspaceId).stream()
                .map(r -> new MemberItem(r.lng("user_id"), r.str("full_name"), r.str("email"), r.str("role"), r.bool("is_active"),
                        r.ts("joined_at"),
                        r.isNull("added_by_id") ? null : new UserRef(r.lng("added_by_id"), r.str("added_by_name"), r.str("added_by_email")),
                        (int) r.lng("project_count"), (int) r.lng("owned_project_count"), (int) r.lng("open_task_count")))
                .toList();
    }

    /**
     * Người thêm được: tài khoản tự đăng ký (EXPERIENCER) đang hoạt động, chưa ở workspace này (ADR-045), có email TRÙNG KHỚP
     * HOÀN TOÀN với {@code email} (không phân biệt hoa thường). Không khớp một phần: Manager không liệt kê hay dò danh sách
     * người dùng được, chỉ xác nhận được email mà mình đã biết. Tối đa một người (email là duy nhất).
     */
    public List<MemberCandidate> candidateByEmail(long workspaceId, String email) {
        return db.list("""
                SELECT u.id AS user_id, %s AS full_name, u.email, r.code AS role
                  FROM users u
                  JOIN roles r ON r.id = u.role_id
                 WHERE u.is_active = TRUE
                   AND r.code = 'EXPERIENCER'
                   AND NOT EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = ? AND wm.user_id = u.id)
                   AND LOWER(u.email) = LOWER(?)
                 LIMIT 1
                """.formatted(FULL_NAME.formatted("u")), workspaceId, email).stream()
                .map(r -> new MemberCandidate(r.lng("user_id"), r.str("full_name"), r.str("email"), r.str("role")))
                .toList();
    }

    /** Role và trạng thái của một tài khoản, hoặc null nếu không có. */
    public UserAccount findUser(long userId) {
        Row r = db.first("""
                SELECT u.id, u.email, u.is_active, r.code AS role
                  FROM users u JOIN roles r ON r.id = u.role_id
                 WHERE u.id = ? FOR UPDATE
                """, userId);
        return r == null ? null : new UserAccount(r.lng("id"), r.str("email"), r.str("role"), r.bool("is_active"));
    }

    /** Project ACTIVE trong các workspace ACTIVE mà người này là thành viên (nơi họ nộp được báo cáo), theo tên workspace rồi tên project. */
    public List<MyProject> memberProjects(long userId) {
        return db.list("""
                SELECT p.id, p.name, w.id AS ws_id, w.name AS ws_name, w.status AS ws_status
                  FROM projects p
                  JOIN workspaces w ON w.id = p.workspace_id
                  JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?
                 WHERE p.status = 'ACTIVE' AND w.status = 'ACTIVE'
                 ORDER BY w.name, p.name
                """, userId).stream()
                .map(r -> new MyProject(r.lng("id"), r.str("name"), new WorkspaceRef(r.lng("ws_id"), r.str("ws_name"), r.str("ws_status"))))
                .toList();
    }

    public boolean isMember(long workspaceId, long userId) {
        return db.first("SELECT 1 AS x FROM workspace_members WHERE workspace_id = ? AND user_id = ?", workspaceId, userId) != null;
    }

    /** {@code grantedRole}: role cấp lúc thêm (ADR-045), để bớt khỏi workspace cuối cùng thì trả về EXPERIENCER; null = role có từ trước. */
    public void addMember(long workspaceId, long userId, long addedBy, String grantedRole) {
        db.insert("INSERT INTO workspace_members (workspace_id, user_id, added_by_user_id, granted_role) VALUES (?,?,?,?)",
                workspaceId, userId, addedBy, grantedRole);
    }

    /** Role được cấp khi thêm người này vào workspace, hoặc null nếu role có từ trước (Admin cấp). */
    public String grantedRole(long workspaceId, long userId) {
        Row r = db.first("SELECT granted_role FROM workspace_members WHERE workspace_id = ? AND user_id = ?", workspaceId, userId);
        return r == null ? null : r.str("granted_role");
    }

    /** Số workspace người này đang là thành viên. */
    public int workspaceCount(long userId) {
        Object n = db.scalar("SELECT COUNT(*) FROM workspace_members WHERE user_id = ?", userId);
        return n == null ? 0 : ((Number) n).intValue();
    }

    /** Đổi role hệ thống của tài khoản ({@code users.role_id}); có hiệu lực từ request kế tiếp vì role đọc lại từ DB mỗi request. */
    public void setRole(long userId, String roleCode) {
        db.update("UPDATE users SET role_id = (SELECT id FROM roles WHERE code = ?), auth_version = auth_version + 1 WHERE id = ?", roleCode, userId);
    }

    /** Tên các project người này đang làm chủ trong workspace. */
    public List<String> ownedProjectNames(long workspaceId, long userId) {
        return db.list("SELECT name FROM projects WHERE workspace_id = ? AND created_by_user_id = ? ORDER BY id", workspaceId, userId)
                .stream().map(r -> r.str("name")).toList();
    }

    public int projectMembershipCount(long workspaceId, long userId) {
        Object n = db.scalar("SELECT COUNT(*) FROM project_members WHERE workspace_id = ? AND user_id = ?", workspaceId, userId);
        return n == null ? 0 : ((Number) n).intValue();
    }

    /** Xoá dòng thành viên; {@code project_members} của người đó trong workspace bị xoá theo (FK CASCADE). Trả số dòng đã xoá. */
    public int removeMember(long workspaceId, long userId) {
        return db.update("DELETE FROM workspace_members WHERE workspace_id = ? AND user_id = ?", workspaceId, userId);
    }

    /** Gỡ người nhận khỏi task chưa DONE của người này trong workspace (khi bớt thành viên). Trả số task đã gỡ. */
    public int unassignOpenTasks(long workspaceId, long userId) {
        return db.update("""
                UPDATE workspace_tasks SET assigned_to_user_id = NULL
                 WHERE workspace_id = ? AND assigned_to_user_id = ? AND status <> 'DONE'
                """, workspaceId, userId);
    }

    private WorkspaceSummary toSummary(Row r) {
        return new WorkspaceSummary(r.lng("id"), r.str("name"), r.str("description"), r.str("status"),
                new UserRef(r.lng("manager_id"), r.str("manager_name"), r.str("manager_email")),
                (int) r.lng("member_count"), (int) r.lng("project_count"), (int) r.lng("pending_report_count"), r.ts("created_date"));
    }

    /** Tài khoản rút gọn để service kiểm điều kiện thêm thành viên. */
    public record UserAccount(long id, String email, String role, boolean active) {
    }
    /** Workspace mà người này tham gia với tư cách thành viên (ENGINEER / REVIEWER). */
    public List<WorkspaceSummary> listForMember(long memberUserId) {
        return db.list(SUMMARY_SELECT + """
                 WHERE EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = w.id AND wm.user_id = ?)
                 ORDER BY w.id DESC
                """, memberUserId).stream().map(this::toSummary).toList();
    }


    /** Tên workspace đã có ở workspace khác chưa (cột {@code name} unique toàn hệ thống, migration 012). */
    public boolean nameTaken(String name, long exceptWorkspaceId) {
        return db.first("SELECT 1 FROM workspaces WHERE name = ? AND id <> ? LIMIT 1", name, exceptWorkspaceId) != null;
    }

    /** Đổi tên và mô tả; không đụng Manager, trạng thái hay người tạo. */
    public void updateInfo(long workspaceId, String name, String description) {
        db.update("UPDATE workspaces SET name = ?, description = ? WHERE id = ?", name, description, workspaceId);
    }

    /**
     * Tin nhắn của workspace, cũ trước mới sau; id tự tăng nên thứ tự id là thứ tự gửi.
     * <ul>
     *   <li>không mốc: {@code limit} tin mới nhất (lần mở kênh);</li>
     *   <li>{@code afterId}: tối đa {@code limit} tin có id lớn hơn (tải bù khi nối lại kênh realtime);</li>
     *   <li>{@code beforeId}: {@code limit} tin ngay trước tin đó (nút "Xem tin cũ hơn").</li>
     * </ul>
     * Service bảo đảm không truyền cả hai mốc.
     */
    public List<ChatMessage> listMessages(long workspaceId, int limit, Long afterId, Long beforeId) {
        String select = """
                SELECT m.id, m.workspace_id, m.message_text, m.created_date, m.edited_at,
                       u.id AS sender_id, %s AS sender_name, u.email AS sender_email
                  FROM workspace_messages m
                  JOIN users u ON u.id = m.sender_id
                 WHERE m.workspace_id = ?""".formatted(FULL_NAME.formatted("u"));
        List<Row> rows;
        if (afterId != null) {
            rows = db.list(select + " AND m.id > ? ORDER BY m.id ASC LIMIT ?", workspaceId, afterId, limit);
        } else if (beforeId != null) {
            rows = db.list("SELECT * FROM (" + select + " AND m.id < ? ORDER BY m.id DESC LIMIT ?) older ORDER BY id ASC",
                    workspaceId, beforeId, limit);
        } else {
            rows = db.list("SELECT * FROM (" + select + " ORDER BY m.id DESC LIMIT ?) latest ORDER BY id ASC", workspaceId, limit);
        }
        return rows.stream()
                .map(r -> new ChatMessage(
                        r.lng("id"),
                        r.lng("workspace_id"),
                        new UserRef(r.lng("sender_id"), r.str("sender_name"), r.str("sender_email")),
                        r.str("message_text"),
                        r.ts("created_date"),
                        r.ts("edited_at")
                )).toList();
    }

    /** Gửi tin nhắn mới vào kênh trao đổi của workspace. */
    public long insertMessage(long workspaceId, long senderId, String messageText) {
        return db.insert("""
                INSERT INTO workspace_messages (workspace_id, sender_id, message_text)
                VALUES (?, ?, ?)
                """, workspaceId, senderId, messageText);
    }
}
