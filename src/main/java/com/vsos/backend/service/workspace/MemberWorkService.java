package com.vsos.backend.service.workspace;

import com.vsos.backend.common.audit.AuditLog;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MyProject;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MyTaskItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MyWork;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ReportItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ReportSubmitRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.TaskItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.TaskProgressRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceRef;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceSummary;
import com.vsos.backend.repository.workspace.WorkspaceReportRepository;
import com.vsos.backend.repository.workspace.WorkspaceRepository;
import com.vsos.backend.repository.workspace.WorkspaceTaskRepository;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import com.vsos.backend.service.notification.NotificationService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.net.URI;
import java.util.List;
import java.util.Objects;

/**
 * Việc của thành viên workspace — ENGINEER / REVIEWER (UC-21, UC-64, UC-66, UC-68): xem task được giao, tự cập nhật trạng thái và tiến
 * độ, nộp báo cáo công việc cho Manager duyệt. Quyền role kiểm ở controller; ở đây kiểm "đúng việc của mình": task phải đang giao cho
 * người này, project phải thuộc workspace người này là thành viên.
 * <p>
 * Luật: người được giao chỉ đặt TODO / IN_PROGRESS / REVIEW — DONE là Manager xác nhận ({@link WorkspaceTaskService}); task đã DONE thì
 * không sửa nữa. Báo cáo chỉ nộp vào project ACTIVE của workspace ACTIVE; gắn task thì task phải của mình và cùng project (FK ghép
 * {@code task_reports(task_id, project_id)}). Đường dẫn đính kèm chỉ http(s). Đặt task sang REVIEW hoặc nộp báo cáo thì báo Manager.
 */
@Service
public class MemberWorkService {

    /** Trạng thái người được giao tự đặt; DONE để Manager xác nhận. */
    public static final List<String> MEMBER_STATUSES = List.of("TODO", "IN_PROGRESS", "REVIEW");

    private final WorkspaceRepository workspaces;
    private final WorkspaceTaskRepository tasks;
    private final WorkspaceReportRepository reports;
    private final NotificationService notifications;

    public MemberWorkService(WorkspaceRepository workspaces, WorkspaceTaskRepository tasks, WorkspaceReportRepository reports,
                             NotificationService notifications) {
        this.workspaces = workspaces;
        this.tasks = tasks;
        this.reports = reports;
        this.notifications = notifications;
    }

    /** Task được giao, báo cáo đã nộp và project nộp được báo cáo của người này. */
    public MyWork myWork(long userId) {
        return new MyWork(tasks.listAssignedTo(userId), reports.listSubmittedBy(userId), workspaces.memberProjects(userId));
    }

    /** Người được giao cập nhật trạng thái và tiến độ task của mình. */
    @Transactional
    public MyTaskItem updateProgress(long userId, long taskId, TaskProgressRequest body) {
        Long workspaceId = tasks.workspaceOf(taskId);
        TaskItem current = workspaceId == null ? null : tasks.find(workspaceId, taskId);
        // Task không giao cho mình (hoặc mình đã rời workspace) thì coi như không có, không lộ task của người khác.
        if (current == null || current.assignee() == null || current.assignee().id() != userId || !workspaces.isMember(workspaceId, userId)) {
            throw new NotFoundException("task");
        }
        WorkspaceSummary ws = workspaces.find(workspaceId);
        WorkspaceService.requireActive(ws);
        if (current.project() != null && !"ACTIVE".equals(tasks.projectStatusInWorkspace(workspaceId, current.project().id()))) {
            throw new InvalidRequestException("Project đã lưu trữ, không cập nhật tiến độ được");
        }
        if ("DONE".equals(current.status())) {
            throw new InvalidRequestException("Task đã được Manager xác nhận hoàn thành, không sửa được nữa");
        }
        String status = body.status() == null ? "" : body.status().trim();
        if (!MEMBER_STATUSES.contains(status)) {
            throw new InvalidRequestException("Trạng thái phải thuộc " + MEMBER_STATUSES + "; hoàn thành (DONE) do Manager xác nhận");
        }
        int progress = Objects.requireNonNullElse(body.progressPct(), current.progressPct());
        if (progress < 0 || progress > 100) {
            throw new InvalidRequestException("Tiến độ từ 0 đến 100");
        }
        if (!tasks.updateProgress(taskId, userId, status, progress)) {
            throw new InvalidRequestException("Task vừa được Manager thay đổi; tải lại trang để xem trạng thái mới");
        }
        AuditLog.event("workspace.task_progress", "success", "workspace_id", workspaceId, "task_id", taskId, "by", userId,
                "status", status, "progress", progress);
        if ("REVIEW".equals(status) && !"REVIEW".equals(current.status())) {
            notifications.notify(ws.manager().id(), userId, workspaceId, "SYSTEM", "Task chờ kiểm tra: " + current.title(),
                    (current.assignee().fullName() == null ? "Người được giao" : current.assignee().fullName())
                            + " báo đã làm xong (" + progress + " %), cần Manager xác nhận.", "TASK", taskId);
        }
        return new MyTaskItem(new WorkspaceRef(ws.id(), ws.name(), ws.status()),
                tasks.find(workspaceId, taskId));
    }

    /** Nộp báo cáo công việc cho Manager của workspace chứa project. */
    @Transactional
    public ReportItem submitReport(long userId, ReportSubmitRequest body) {
        MyProject project = workspaces.memberProjects(userId).stream()
                .filter(p -> body.projectId() != null && p.id() == body.projectId())
                .findFirst()
                .orElseThrow(() -> new InvalidRequestException(
                        "Chỉ nộp báo cáo vào project đang hoạt động của workspace bạn là thành viên"));
        long workspaceId = project.workspace().id();
        Long taskId = body.taskId();
        if (taskId != null) {
            TaskItem task = tasks.find(workspaceId, taskId);
            if (task == null || task.assignee() == null || task.assignee().id() != userId) {
                throw new InvalidRequestException("Chỉ gắn báo cáo với task đang giao cho bạn");
            }
            if (task.project() == null || task.project().id() != project.id()) {
                throw new InvalidRequestException("Task này không thuộc project đã chọn; chọn đúng project của task hoặc bỏ gắn task");
            }
        }
        String title = trimToNull(body.title());
        String content = trimToNull(body.content());
        if (title == null || content == null) {
            throw new InvalidRequestException("Báo cáo cần tiêu đề và nội dung");
        }
        String attachment = trimToNull(body.attachmentUrl());
        if (attachment != null && !isHttpUrl(attachment)) {
            throw new InvalidRequestException("Đường dẫn đính kèm phải bắt đầu bằng http:// hoặc https://");
        }
        long id = reports.insert(project.id(), taskId, userId, title, content, attachment);
        AuditLog.event("workspace.report_submit", "success", "workspace_id", workspaceId, "report_id", id, "by", userId);
        WorkspaceSummary ws = workspaces.find(workspaceId);
        ReportItem saved = reports.find(workspaceId, id);
        String submitterName = Objects.requireNonNullElse(trimToNull(saved.submittedBy().fullName()), "Người nộp");
        notifications.notify(ws.manager().id(), userId, workspaceId, "REPORT_SUBMITTED", "Báo cáo mới: " + title,
                submitterName + " nộp báo cáo cho project " + project.name() + ".", "REPORT", id);
        return saved;
    }

    private static boolean isHttpUrl(String value) {
        try {
            URI uri = URI.create(value);
            return ("http".equalsIgnoreCase(uri.getScheme()) || "https".equalsIgnoreCase(uri.getScheme())) && uri.getHost() != null;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }

    private static String trimToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }
}
