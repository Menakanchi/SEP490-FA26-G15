package com.vehicsim.service;

import com.vehicsim.audit.AuditLog;
import com.vehicsim.dto.WorkspaceDtos.ReportItem;
import com.vehicsim.dto.WorkspaceDtos.WorkspaceSummary;
import com.vehicsim.repository.WorkspaceReportRepository;
import com.vehicsim.vehicsim.Vs;
import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/**
 * Manager xem và duyệt báo cáo công việc theo project trong workspace mình quản lý (M8, M9 — ADR-038). Quyền MANAGER / ADMIN kiểm ở
 * controller; "đúng workspace của mình" qua {@link WorkspaceService#requireAccessible}.
 * <p>
 * Luật: chỉ báo cáo còn SUBMITTED mới duyệt được, quyết định là cuối (không duyệt lại); từ chối phải có nhận xét để người nộp biết sửa gì;
 * hai người duyệt cùng lúc thì người sau nhận lỗi thay vì ghi đè. Workspace ARCHIVED chỉ xem.
 * <p>
 * Chưa làm: Engineer / Reviewer nộp báo cáo (UC của họ) và thông báo {@code REPORT_SUBMITTED} / kết quả duyệt (M10).
 */
@Service
public class WorkspaceReportService {

    public static final List<String> STATUSES = List.of("SUBMITTED", "APPROVED", "REJECTED");
    public static final List<String> DECISIONS = List.of("APPROVED", "REJECTED");

    private final WorkspaceService workspaces;
    private final WorkspaceReportRepository reports;

    public WorkspaceReportService(WorkspaceService workspaces, WorkspaceReportRepository reports) {
        this.workspaces = workspaces;
        this.reports = reports;
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
        return reports.find(workspaceId, reportId);
    }
}
