package com.vsos.backend.service.workspace;

import com.vsos.backend.common.audit.AuditLog;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ReportItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.SubmitReportRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceSummary;
import com.vsos.backend.repository.common.Db;
import com.vsos.backend.repository.common.Row;
import com.vsos.backend.repository.workspace.WorkspaceReportRepository;
import com.vsos.backend.common.Vs;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.vsos.backend.service.notification.NotificationService;

/**
 * Manager xem và duyệt báo cáo công việc theo project trong workspace mình quản lý (M8, M9 — ADR-038). Quyền MANAGER / ADMIN kiểm ở
 * controller; "đúng workspace của mình" qua {@link WorkspaceService#requireAccessible}.
 * <p>
 * Luật: chỉ báo cáo còn SUBMITTED mới duyệt được, quyết định là cuối (không duyệt lại); từ chối phải có nhận xét để người nộp biết sửa gì;
 * hai người duyệt cùng lúc thì người sau nhận lỗi thay vì ghi đè. Workspace ARCHIVED chỉ xem.
 * <p>
 * Duyệt xong thì báo cho người nộp ({@link NotificationService}). Engineer / Reviewer nộp báo cáo (kèm thông báo {@code REPORT_SUBMITTED}
 * cho Manager) ở {@link MemberWorkService}.
 */
@Service
public class WorkspaceReportService {

    public static final List<String> STATUSES = List.of("SUBMITTED", "APPROVED", "REJECTED");
    public static final List<String> DECISIONS = List.of("APPROVED", "REJECTED");

    private final WorkspaceService workspaces;
    private final WorkspaceReportRepository reports;
    private final NotificationService notifications;
    private final Db db;

    public WorkspaceReportService(WorkspaceService workspaces, WorkspaceReportRepository reports, NotificationService notifications) {
        this(workspaces, reports, notifications, null);
    }

    @Autowired
    public WorkspaceReportService(WorkspaceService workspaces, WorkspaceReportRepository reports, NotificationService notifications, Db db) {
        this.workspaces = workspaces;
        this.reports = reports;
        this.notifications = notifications;
        this.db = db;
    }

    /** M8: báo cáo của các project trong workspace, lọc tuỳ chọn theo trạng thái và project. */
    public List<ReportItem> list(long userId, String role, long workspaceId, String status, Long projectId) {
        workspaces.requireAccessible(userId, role, workspaceId);
        String s = status == null || status.isBlank() ? null : status.trim();
        if (s != null && !STATUSES.contains(s)) {
            throw new InvalidRequestException("Trạng thái phải thuộc " + STATUSES);
        }
        return reports.list(workspaceId, s, projectId);
    }

    /** M9: duyệt (APPROVED) hoặc từ chối (REJECTED, bắt buộc nhận xét) một báo cáo đang chờ. */
    @Transactional
    public ReportItem decide(long userId, String role, long workspaceId, long reportId, String decision, String note) {
        WorkspaceSummary ws = workspaces.requireAccessible(userId, role, workspaceId);
        WorkspaceService.requireActive(ws);
        String d = decision == null ? "" : decision.trim();
        if (!DECISIONS.contains(d)) {
            throw new InvalidRequestException("Quyết định phải thuộc " + DECISIONS);
        }
        String n = note == null || note.isBlank() ? null : note.trim();
        if ("REJECTED".equals(d) && n == null) {
            throw new InvalidRequestException("Từ chối báo cáo phải ghi nhận xét");
        }
        ReportItem current = reports.find(workspaceId, reportId);
        if (current == null) {
            throw new NotFoundException("báo cáo");
        }
        if (!"SUBMITTED".equals(current.status())) {
            throw new InvalidRequestException("Báo cáo này đã được duyệt rồi");
        }
        if (!reports.decide(reportId, d, userId, n, Vs.now())) {
            throw new InvalidRequestException("Báo cáo vừa được người khác duyệt; tải lại trang để xem kết quả");
        }
        AuditLog.event("workspace.report_decide", "success", "workspace_id", workspaceId, "report_id", reportId, "by", userId,
                "decision", d);
        // Bảng không có loại "kết quả duyệt báo cáo" riêng nên dùng SYSTEM.
        boolean approved = "APPROVED".equals(d);
        notifications.notify(current.submittedBy().id(), userId, workspaceId, "SYSTEM",
                "Báo cáo “" + current.title() + "” " + (approved ? "đã được duyệt" : "bị từ chối"),
                "Project " + current.project().name() + (n == null ? "." : ". Nhận xét: " + n), "REPORT", reportId);
        return reports.find(workspaceId, reportId);
    }
    /** FE-14: Kỹ sư / người duyệt nộp báo cáo công việc gắn với task hoặc project. */
    @Transactional
    public ReportItem submit(long userId, String role, SubmitReportRequest body) {
        String title = body.title() == null ? "" : body.title().trim();
        if (title.isEmpty()) {
            throw new InvalidRequestException("Tiêu đề báo cáo không được để trống");
        }
        String content = body.content() == null ? "" : body.content().trim();
        if (content.isEmpty()) {
            throw new InvalidRequestException("Nội dung báo cáo không được để trống");
        }

        Long taskId = body.taskId();
        Long projectId = body.projectId();

        if (taskId != null) {
            Row task = db.first("SELECT id, project_id, workspace_id FROM workspace_tasks WHERE id = ?", taskId);
            if (task == null) {
                throw new NotFoundException("task");
            }
            Long taskProjId = task.isNull("project_id") ? null : task.lng("project_id");
            if (projectId != null && taskProjId != null && !projectId.equals(taskProjId)) {
                throw new InvalidRequestException("Project đã chọn không khớp với project của task");
            }
            if (projectId == null) {
                projectId = taskProjId;
            }
            if (projectId == null) {
                throw new InvalidRequestException("Task này chưa được gắn với project; vui lòng chọn project");
            }
        } else if (projectId == null) {
            throw new InvalidRequestException("Cần chọn project hoặc task để nộp báo cáo");
        }

        Row proj = db.first("""
                SELECT p.id, p.name, p.status, p.workspace_id,
                       w.manager_id, w.status AS workspace_status
                  FROM projects p
                  JOIN workspaces w ON w.id = p.workspace_id
                 WHERE p.id = ?
                """, projectId);
        if (proj == null) {
            throw new NotFoundException("project");
        }
        if (!"ACTIVE".equals(proj.str("workspace_status"))) {
            throw new InvalidRequestException("Workspace đã lưu trữ, không thể nộp báo cáo");
        }
        if (!"ACTIVE".equals(proj.str("status"))) {
            throw new InvalidRequestException("Project đã lưu trữ, không thể nộp báo cáo");
        }

        String attachmentUrl = body.attachmentUrl() == null || body.attachmentUrl().isBlank() ? null : body.attachmentUrl().trim();
        long reportId = reports.insert(projectId, taskId, userId, title, content, attachmentUrl);
        AuditLog.event("workspace.report_submit", "success", "workspace_id", proj.lng("workspace_id"),
                "project_id", projectId, "task_id", taskId, "report_id", reportId, "by", userId);

        long managerId = proj.lng("manager_id");
        notifications.notify(managerId, userId, proj.lng("workspace_id"), "REPORT_SUBMITTED",
                "Báo cáo công việc mới: " + title,
                "Thành viên đã nộp báo cáo cho project " + proj.str("name") + ".",
                "REPORT", reportId);

        return reports.findById(reportId);
    }

    /** Lấy chi tiết một báo cáo công việc (FE-14). */
    public ReportItem getReport(long userId, String role, long reportId) {
        ReportItem r = reports.findById(reportId);
        if (r == null) {
            throw new NotFoundException("báo cáo");
        }
        return r;
    }

    /** Danh sách báo cáo do người dùng này nộp (FE-14). */
    public List<ReportItem> listMyReports(long userId, String role, String status, Long projectId) {
        String s = status == null || status.isBlank() ? null : status.trim();
        if (s != null && !STATUSES.contains(s)) {
            throw new InvalidRequestException("Trạng thái phải thuộc " + STATUSES);
        }
        return reports.listForSubmitter(userId, s, projectId);
    }
}
