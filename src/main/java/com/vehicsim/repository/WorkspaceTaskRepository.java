package com.vehicsim.repository;

import com.vehicsim.dto.WorkspaceDtos.ProjectRef;
import com.vehicsim.dto.WorkspaceDtos.TaskItem;
import com.vehicsim.dto.WorkspaceDtos.UserRef;
import com.vehicsim.vehicsim.Db;
import com.vehicsim.vehicsim.Row;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

/**
 * Câu SQL của task Manager giao trong workspace (M6, M7 — bảng {@code workspace_tasks}). SQL thuần qua {@link Db}; tham gia transaction
 * của service gọi nó. {@code overdue} tính theo ngày của MySQL ({@code CURDATE()}) để mọi màn cùng một mốc.
 */
@Repository
public class WorkspaceTaskRepository {

    private static final String SELECT = """
            SELECT t.id, t.title, t.description, t.priority, t.status, t.progress_pct, t.due_date, t.created_date, t.updated_at,
                   (t.due_date IS NOT NULL AND t.due_date < CURDATE() AND t.status <> 'DONE') AS overdue,
                   a.id AS assignee_id, CONCAT_WS(' ', a.last_name, a.middle_name, a.first_name) AS assignee_name, a.email AS assignee_email,
                   p.id AS project_id, p.name AS project_name,
                   c.id AS creator_id, CONCAT_WS(' ', c.last_name, c.middle_name, c.first_name) AS creator_name, c.email AS creator_email,
                   (SELECT COUNT(*) FROM task_reports r WHERE r.task_id = t.id) AS report_count
              FROM workspace_tasks t
              JOIN users c ON c.id = t.created_by_user_id
              LEFT JOIN users a ON a.id = t.assigned_to_user_id
              LEFT JOIN projects p ON p.id = t.project_id
            """;

    private final Db db;

    public WorkspaceTaskRepository(Db db) {
        this.db = db;
    }

    /**
     * Task của workspace, lọc tuỳ chọn theo trạng thái / người nhận ({@code assigneeId = 0} = chưa giao ai). Sắp: chưa xong trước,
     * rồi ưu tiên cao trước, rồi hạn gần trước (không hạn để cuối), rồi mới nhất.
     */
    public List<TaskItem> list(long workspaceId, String status, Long assigneeId) {
        StringBuilder sql = new StringBuilder(SELECT).append(" WHERE t.workspace_id = ?");
        List<Object> args = new ArrayList<>(List.of(workspaceId));
        if (status != null) {
            sql.append(" AND t.status = ?");
            args.add(status);
        }
        if (assigneeId != null) {
            if (assigneeId == 0) {
                sql.append(" AND t.assigned_to_user_id IS NULL");
            } else {
                sql.append(" AND t.assigned_to_user_id = ?");
                args.add(assigneeId);
            }
        }
        sql.append("""
                 ORDER BY t.status = 'DONE',
                          FIELD(t.priority, 'URGENT', 'HIGH', 'MEDIUM', 'LOW'),
                          t.due_date IS NULL, t.due_date,
                          t.id DESC
                """);
        return db.list(sql.toString(), args.toArray()).stream().map(WorkspaceTaskRepository::toItem).toList();
    }

    /** Task thuộc workspace, hoặc null. */
    public TaskItem find(long workspaceId, long taskId) {
        Row row = db.first(SELECT + " WHERE t.workspace_id = ? AND t.id = ?", workspaceId, taskId);
        return row == null ? null : toItem(row);
    }

    public long insert(long workspaceId, Long projectId, String title, String description, String priority, String status, int progressPct,
                       Long assigneeId, long createdBy, LocalDate dueDate) {
        return db.insert("""
                INSERT INTO workspace_tasks (workspace_id, project_id, title, description, priority, status, progress_pct,
                                             assigned_to_user_id, created_by_user_id, due_date)
                VALUES (?,?,?,?,?,?,?,?,?,?)
                """, workspaceId, projectId, title, description, priority, status, progressPct, assigneeId, createdBy, dueDate);
    }

    public void update(long workspaceId, long taskId, Long projectId, String title, String description, String priority, String status,
                       int progressPct, Long assigneeId, LocalDate dueDate) {
        db.update("""
                UPDATE workspace_tasks
                   SET project_id = ?, title = ?, description = ?, priority = ?, status = ?, progress_pct = ?,
                       assigned_to_user_id = ?, due_date = ?
                 WHERE workspace_id = ? AND id = ?
                """, projectId, title, description, priority, status, progressPct, assigneeId, dueDate, workspaceId, taskId);
    }

    public int delete(long workspaceId, long taskId) {
        return db.update("DELETE FROM workspace_tasks WHERE workspace_id = ? AND id = ?", workspaceId, taskId);
    }

    /** Trạng thái của project nếu nó thuộc workspace này, hoặc null. */
    public String projectStatusInWorkspace(long workspaceId, long projectId) {
        Object status = db.scalar("SELECT status FROM projects WHERE id = ? AND workspace_id = ?", projectId, workspaceId);
        return status == null ? null : status.toString();
    }

    private static TaskItem toItem(Row r) {
        return new TaskItem(r.lng("id"), r.str("title"), r.str("description"), r.str("priority"), r.str("status"),
                (int) r.lng("progress_pct"),
                r.isNull("assignee_id") ? null : new UserRef(r.lng("assignee_id"), r.str("assignee_name"), r.str("assignee_email")),
                r.isNull("project_id") ? null : new ProjectRef(r.lng("project_id"), r.str("project_name")),
                new UserRef(r.lng("creator_id"), r.str("creator_name"), r.str("creator_email")),
                toDate(r.get("due_date")), r.bool("overdue"), (int) r.lng("report_count"), r.ts("created_date"), r.ts("updated_at"));
    }

    /** Cột DATE: driver MySQL trả {@code java.sql.Date} hoặc {@code LocalDate} tuỳ cấu hình. */
    static LocalDate toDate(Object value) {
        if (value == null) {
            return null;
        }
        if (value instanceof LocalDate d) {
            return d;
        }
        return ((java.sql.Date) value).toLocalDate();
    }
}
