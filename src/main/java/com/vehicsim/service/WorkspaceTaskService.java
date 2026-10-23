package com.vehicsim.service;

import com.vehicsim.audit.AuditLog;
import com.vehicsim.dto.WorkspaceDtos.TaskItem;
import com.vehicsim.dto.WorkspaceDtos.TaskRequest;
import com.vehicsim.dto.WorkspaceDtos.WorkspaceSummary;
import com.vehicsim.repository.WorkspaceRepository;
import com.vehicsim.repository.WorkspaceRepository.UserAccount;
import com.vehicsim.repository.WorkspaceTaskRepository;
import com.vehicsim.vehicsim.Vs.InvalidRequestException;
import com.vehicsim.vehicsim.Vs.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Manager giao và theo dõi task trong workspace mình quản lý (M6, M7 — FE-03-07). Quyền MANAGER / ADMIN kiểm ở controller;
 * "đúng workspace của mình" qua {@link WorkspaceService#requireAccessible}.
 * <p>
 * Luật: chỉ giao cho thành viên workspace có tài khoản đang hoạt động; project (nếu gắn) phải thuộc workspace và còn ACTIVE; hạn không
 * được ở quá khứ khi đặt mới; DONE thì tiến độ 100 %. Task đã có báo cáo không xoá được (FK CASCADE sẽ xoá luôn báo cáo) và không đổi
 * project được (FK ghép {@code task_reports(task_id, project_id)} chặn). Giữ nguyên giá trị cũ thì không bị kiểm lại — task gắn project
 * nay đã lưu trữ hoặc đã quá hạn vẫn sửa được các trường khác. Workspace ARCHIVED chỉ xem.
 * <p>
 * Giao (hoặc đổi người nhận) thì báo {@code TASK_ASSIGNED} cho người nhận. Chưa làm: người được giao tự cập nhật tiến độ (UC của
 * Engineer / Reviewer).
 */
@Service
public class WorkspaceTaskService {

    /** Theo thứ tự hiển thị (thông báo lỗi liệt kê đúng thứ tự này). */
    public static final List<String> PRIORITIES = List.of("LOW", "MEDIUM", "HIGH", "URGENT");
    public static final List<String> STATUSES = List.of("TODO", "IN_PROGRESS", "REVIEW", "DONE");
    /** Tên tiếng Việt của độ ưu tiên, dùng trong nội dung thông báo. */
    private static final Map<String, String> PRIORITY_LABELS = Map.of("LOW", "thấp", "MEDIUM", "trung bình", "HIGH", "cao", "URGENT", "khẩn");

    private final WorkspaceService workspaces;
    private final WorkspaceRepository members;
    private final WorkspaceTaskRepository tasks;
    private final NotificationService notifications;

    public WorkspaceTaskService(WorkspaceService workspaces, WorkspaceRepository members, WorkspaceTaskRepository tasks,
                                NotificationService notifications) {
        this.workspaces = workspaces;
        this.members = members;
        this.tasks = tasks;
        this.notifications = notifications;
    }

    /** M7: task của workspace, lọc tuỳ chọn theo trạng thái và người nhận ({@code assigneeId = 0} = chưa giao ai). */
    public List<TaskItem> list(long userId, String role, long workspaceId, String status, Long assigneeId) {
        workspaces.requireAccessible(userId, role, workspaceId);
        String s = blankToNull(status);
        if (s != null && !STATUSES.contains(s)) {
            throw new InvalidRequestException("Trạng thái phải thuộc " + STATUSES);
        }
        return tasks.list(workspaceId, s, assigneeId);
    }

    /** M6: giao task mới. */
    @Transactional
    public TaskItem create(long userId, String role, long workspaceId, TaskRequest body) {
        WorkspaceSummary ws = workspaces.requireAccessible(userId, role, workspaceId);
        WorkspaceService.requireActive(ws);
        Fields f = validate(workspaceId, body, null);
        long id = tasks.insert(workspaceId, f.projectId, f.title, f.description, f.priority, f.status, f.progress, f.assigneeId, userId,
                f.dueDate);
        AuditLog.event("workspace.task_create", "success", "workspace_id", workspaceId, "task_id", id, "by", userId);
        notifyAssigned(ws, userId, id, f);
        return tasks.find(workspaceId, id);
    }

    /** M7: sửa task (gửi đủ mọi trường). */
    @Transactional
    public TaskItem update(long userId, String role, long workspaceId, long taskId, TaskRequest body) {
        WorkspaceSummary ws = workspaces.requireAccessible(userId, role, workspaceId);
        WorkspaceService.requireActive(ws);
        TaskItem current = tasks.find(workspaceId, taskId);
        if (current == null) {
            throw new NotFoundException("task");
        }
        Fields f = validate(workspaceId, body, current);
        tasks.update(workspaceId, taskId, f.projectId, f.title, f.description, f.priority, f.status, f.progress, f.assigneeId, f.dueDate);
        Long previousAssignee = current.assignee() == null ? null : current.assignee().id();
        if (!Objects.equals(previousAssignee, f.assigneeId)) {
            notifyAssigned(ws, userId, taskId, f);
        }
        AuditLog.event("workspace.task_update", "success", "workspace_id", workspaceId, "task_id", taskId, "by", userId,
                "status", f.status);
        return tasks.find(workspaceId, taskId);
    }

    /** M7: xoá task chưa có báo cáo. */
    @Transactional
    public void delete(long userId, String role, long workspaceId, long taskId) {
        WorkspaceSummary ws = workspaces.requireAccessible(userId, role, workspaceId);
        WorkspaceService.requireActive(ws);
        TaskItem current = tasks.find(workspaceId, taskId);
        if (current == null) {
            throw new NotFoundException("task");
        }
        if (current.reportCount() > 0) {
            throw new InvalidRequestException("Task đã có " + current.reportCount()
                    + " báo cáo; xoá task sẽ xoá luôn báo cáo nên không cho phép");
        }
        tasks.delete(workspaceId, taskId);
        AuditLog.event("workspace.task_delete", "success", "workspace_id", workspaceId, "task_id", taskId, "by", userId);
    }

    /** Báo cho người vừa được giao task (tạo mới có người nhận, hoặc đổi sang người nhận khác). */
    private void notifyAssigned(WorkspaceSummary ws, long actorId, long taskId, Fields f) {
        if (f.assigneeId == null) {
            return;
        }
        notifications.notify(f.assigneeId, actorId, ws.id(), "TASK_ASSIGNED", "Bạn được giao task: " + f.title,
                "Workspace " + ws.name() + " · ưu tiên " + PRIORITY_LABELS.get(f.priority)
                        + (f.dueDate == null ? "" : " · hạn " + f.dueDate.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))) + ".",
                "TASK", taskId);
    }

    /** Kiểm và chuẩn hoá body; {@code current} null khi tạo mới. */
    private Fields validate(long workspaceId, TaskRequest body, TaskItem current) {
        String title = body.title() == null ? "" : body.title().trim();
        if (title.isEmpty()) {
            throw new InvalidRequestException("Tên task không được để trống");
        }
        String priority = Objects.requireNonNullElse(blankToNull(body.priority()), current == null ? "MEDIUM" : current.priority());
        if (!PRIORITIES.contains(priority)) {
            throw new InvalidRequestException("Độ ưu tiên phải thuộc " + PRIORITIES);
        }
        String status = Objects.requireNonNullElse(blankToNull(body.status()), current == null ? "TODO" : current.status());
        if (!STATUSES.contains(status)) {
            throw new InvalidRequestException("Trạng thái phải thuộc " + STATUSES);
        }
        int progress = body.progressPct() != null ? body.progressPct() : current == null ? 0 : current.progressPct();
        if (progress < 0 || progress > 100) {
            throw new InvalidRequestException("Tiến độ từ 0 đến 100");
        }
        if ("DONE".equals(status)) {
            progress = 100;
        }

        Long assigneeId = body.assigneeId();
        Long currentAssignee = current == null || current.assignee() == null ? null : current.assignee().id();
        if (assigneeId != null && !assigneeId.equals(currentAssignee)) {
            if (!members.isMember(workspaceId, assigneeId)) {
                throw new InvalidRequestException("Chỉ giao task cho thành viên của workspace");
            }
            UserAccount account = members.findUser(assigneeId);
            if (account == null || !account.active()) {
                throw new InvalidRequestException("Tài khoản người nhận đang bị khoá, không giao task được");
            }
        }

        Long projectId = body.projectId();
        Long currentProject = current == null || current.project() == null ? null : current.project().id();
        if (!Objects.equals(projectId, currentProject)) {
            if (current != null && current.reportCount() > 0) {
                throw new InvalidRequestException("Task đã có báo cáo gắn với project hiện tại; không đổi project được");
            }
            if (projectId != null) {
                String projectStatus = tasks.projectStatusInWorkspace(workspaceId, projectId);
                if (projectStatus == null) {
                    throw new InvalidRequestException("Project không thuộc workspace này");
                }
                if (!"ACTIVE".equals(projectStatus)) {
                    throw new InvalidRequestException("Project đã lưu trữ, không gắn task mới được");
                }
            }
        }

        LocalDate dueDate = body.dueDate();
        LocalDate currentDue = current == null ? null : current.dueDate();
        if (dueDate != null && !dueDate.equals(currentDue) && dueDate.isBefore(LocalDate.now())) {
            throw new InvalidRequestException("Hạn hoàn thành không được ở quá khứ");
        }

        String description = blankToNull(body.description());
        return new Fields(title, description == null ? null : description.trim(), priority, status, progress, assigneeId, projectId, dueDate);
    }

    private static String blankToNull(String s) {
        return s == null || s.isBlank() ? null : s.trim();
    }

    private record Fields(String title, String description, String priority, String status, int progress, Long assigneeId,
                          Long projectId, LocalDate dueDate) {
    }
}
