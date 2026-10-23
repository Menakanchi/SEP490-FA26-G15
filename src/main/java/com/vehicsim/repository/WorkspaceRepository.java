package com.vehicsim.repository;

import com.vehicsim.dto.WorkspaceDtos.MemberCandidate;
import com.vehicsim.dto.WorkspaceDtos.MemberItem;
import com.vehicsim.dto.WorkspaceDtos.ProjectItem;
import com.vehicsim.dto.WorkspaceDtos.UserRef;
import com.vehicsim.dto.WorkspaceDtos.WorkspaceSummary;
import com.vehicsim.vehicsim.Db;
import com.vehicsim.vehicsim.Row;
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
                   (SELECT COUNT(*) FROM projects p WHERE p.workspace_id = w.id) AS project_count
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
     * Người thêm được: đang hoạt động, role ENGINEER / REVIEWER, chưa ở workspace này; lọc theo email hoặc tên chứa {@code q}
     * (bỏ trống = tất cả). Tối đa {@code limit} người.
     */
    public List<MemberCandidate> candidatesFor(long workspaceId, String q, int limit) {
        String like = "%" + (q == null ? "" : q.trim().replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")) + "%";
        return db.list("""
                SELECT u.id AS user_id, %s AS full_name, u.email, r.code AS role
                  FROM users u
                  JOIN roles r ON r.id = u.role_id
                 WHERE u.is_active = TRUE
                   AND r.code IN ('ENGINEER', 'REVIEWER')
                   AND NOT EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.workspace_id = ? AND wm.user_id = u.id)
                   AND (u.email LIKE ? OR %s LIKE ?)
                 ORDER BY u.email
                 LIMIT ?
                """.formatted(FULL_NAME.formatted("u"), FULL_NAME.formatted("u")), workspaceId, like, like, limit).stream()
                .map(r -> new MemberCandidate(r.lng("user_id"), r.str("full_name"), r.str("email"), r.str("role")))
                .toList();
    }

    /** Role và trạng thái của một tài khoản, hoặc null nếu không có. */
    public UserAccount findUser(long userId) {
        Row r = db.first("""
                SELECT u.id, u.email, u.is_active, r.code AS role
                  FROM users u JOIN roles r ON r.id = u.role_id
                 WHERE u.id = ?
                """, userId);
        return r == null ? null : new UserAccount(r.lng("id"), r.str("email"), r.str("role"), r.bool("is_active"));
    }

    public boolean isMember(long workspaceId, long userId) {
        return db.first("SELECT 1 AS x FROM workspace_members WHERE workspace_id = ? AND user_id = ?", workspaceId, userId) != null;
    }

    public void addMember(long workspaceId, long userId, long addedBy) {
        db.insert("INSERT INTO workspace_members (workspace_id, user_id, added_by_user_id) VALUES (?,?,?)", workspaceId, userId, addedBy);
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
                (int) r.lng("member_count"), (int) r.lng("project_count"), r.ts("created_date"));
    }

    /** Tài khoản rút gọn để service kiểm điều kiện thêm thành viên. */
    public record UserAccount(long id, String email, String role, boolean active) {
    }
}
