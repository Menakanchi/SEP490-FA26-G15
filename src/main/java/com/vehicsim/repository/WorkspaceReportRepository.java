package com.vehicsim.repository;

import com.vehicsim.dto.WorkspaceDtos.ProjectRef;
import com.vehicsim.dto.WorkspaceDtos.ReportItem;
import com.vehicsim.dto.WorkspaceDtos.TaskRef;
import com.vehicsim.dto.WorkspaceDtos.UserRef;
import com.vehicsim.vehicsim.Db;
import com.vehicsim.vehicsim.Row;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * Câu SQL của báo cáo công việc theo project (M8, M9 — bảng {@code task_reports}). Báo cáo thuộc workspace qua {@code projects.workspace_id}.
 * SQL thuần qua {@link Db}; tham gia transaction của service gọi nó.
 */
@Repository
public class WorkspaceReportRepository {

    private static final String SELECT = """
            SELECT r.id, r.report_title, r.report_content, r.attachment_url, r.status, r.reviewed_at, r.review_note, r.created_date,
                   p.id AS project_id, p.name AS project_name,
                   t.id AS task_id, t.title AS task_title,
                   s.id AS submitter_id, CONCAT_WS(' ', s.last_name, s.middle_name, s.first_name) AS submitter_name, s.email AS submitter_email,
                   v.id AS reviewer_id, CONCAT_WS(' ', v.last_name, v.middle_name, v.first_name) AS reviewer_name, v.email AS reviewer_email
              FROM task_reports r
              JOIN projects p ON p.id = r.project_id
              JOIN users s ON s.id = r.submitted_by_user_id
              LEFT JOIN workspace_tasks t ON t.id = r.task_id
              LEFT JOIN users v ON v.id = r.reviewed_by_user_id
            """;

    private final Db db;

    public WorkspaceReportRepository(Db db) {
        this.db = db;
    }

    /** Báo cáo của các project trong workspace, lọc tuỳ chọn theo trạng thái / project. Chờ duyệt trước, rồi mới nhất trước. */
    public List<ReportItem> list(long workspaceId, String status, Long projectId) {
        StringBuilder sql = new StringBuilder(SELECT).append(" WHERE p.workspace_id = ?");
        List<Object> args = new ArrayList<>(List.of(workspaceId));
        if (status != null) {
            sql.append(" AND r.status = ?");
            args.add(status);
        }
        if (projectId != null) {
            sql.append(" AND r.project_id = ?");
            args.add(projectId);
        }
        sql.append(" ORDER BY r.status <> 'SUBMITTED', r.created_date DESC, r.id DESC");
        return db.list(sql.toString(), args.toArray()).stream().map(WorkspaceReportRepository::toItem).toList();
    }

    /** Báo cáo thuộc workspace, hoặc null. */
    public ReportItem find(long workspaceId, long reportId) {
        Row row = db.first(SELECT + " WHERE p.workspace_id = ? AND r.id = ?", workspaceId, reportId);
        return row == null ? null : toItem(row);
    }

    /**
     * Chốt quyết định chỉ khi báo cáo còn SUBMITTED: hai người duyệt cùng lúc thì người sau không ghi đè (trả false).
     * Ghi đủ người duyệt + lúc duyệt cùng một câu để thoả {@code ck_tr_review}.
     */
    public boolean decide(long reportId, String status, long reviewerId, String note, LocalDateTime at) {
        return db.update("""
                UPDATE task_reports
                   SET status = ?, reviewed_by_user_id = ?, reviewed_at = ?, review_note = ?
                 WHERE id = ? AND status = 'SUBMITTED'
                """, status, reviewerId, at, note, reportId) == 1;
    }

    private static ReportItem toItem(Row r) {
        return new ReportItem(r.lng("id"),
                new ProjectRef(r.lng("project_id"), r.str("project_name")),
                r.isNull("task_id") ? null : new TaskRef(r.lng("task_id"), r.str("task_title")),
                new UserRef(r.lng("submitter_id"), r.str("submitter_name"), r.str("submitter_email")),
                r.str("report_title"), r.str("report_content"), r.str("attachment_url"), r.str("status"),
                r.isNull("reviewer_id") ? null : new UserRef(r.lng("reviewer_id"), r.str("reviewer_name"), r.str("reviewer_email")),
                r.ts("reviewed_at"), r.str("review_note"), r.ts("created_date"));
    }
}
