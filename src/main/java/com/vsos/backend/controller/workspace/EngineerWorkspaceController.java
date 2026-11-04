package com.vsos.backend.controller.workspace;

import com.vsos.backend.config.OpenApiConfig;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ChatMessage;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ReportItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.SendChatMessageRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.SubmitReportRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.TaskItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.TaskStatusUpdateRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceSummary;
import com.vsos.backend.service.workspace.WorkspaceReportService;
import com.vsos.backend.service.workspace.WorkspaceService;
import com.vsos.backend.service.workspace.WorkspaceTaskService;
import com.vsos.backend.security.VehicSimAccess;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * HTTP cho Kỹ sư / Thành viên kỹ thuật (FE-03, FE-14):
 * - Xem workspace tham gia
 * - Xem task được giao, lọc task, cập nhật tiến độ / trạng thái
 * - Nộp báo cáo công việc gắn với task/project, xem báo cáo của mình và phản hồi duyệt
 * - Trao đổi trong kênh chat workspace
 */
@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim · Kỹ sư · Task & Báo cáo & Trao đổi",
     description = "Dành cho Engineer / Reviewer: xem task được giao, cập nhật tiến độ, nộp báo cáo, trao đổi kỹ thuật")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class EngineerWorkspaceController {

    private final WorkspaceService workspaces;
    private final WorkspaceTaskService tasks;
    private final WorkspaceReportService reports;
    private final VehicSimAccess access;

    /**
     * Lấy danh sách toàn bộ workspace mà tài khoản kỹ sư hiện tại có quyền truy cập.
     *
     * @param user thông tin định danh người dùng đăng nhập
     * @return danh sách tóm tắt các workspace phù hợp
     */
    @Operation(summary = "FE-03 — Danh sách workspace tôi tham gia (ADMIN: tất cả; MANAGER: quản lý; ENGINEER/REVIEWER: thành viên)")
    @GetMapping("/my-workspaces")
    public List<WorkspaceSummary> myWorkspaces(@AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.userId(user);
        String role = VehicSimAccess.roleOf(user);
        return workspaces.listMyWorkspaces(uid, role);
    }

    /**
     * Lấy danh sách nhiệm vụ (tasks) được giao cho kỹ sư đăng nhập, hỗ trợ lọc theo trạng thái và project.
     *
     * @param status trạng thái task cần lọc (TODO, IN_PROGRESS, REVIEW, DONE)
     * @param projectId mã project liên quan (tuỳ chọn)
     * @param user thông tin người dùng đang đăng nhập
     * @return danh sách các task phù hợp
     */
    @Operation(summary = "FE-03 / FE-14 — Danh sách task được giao cho tôi (lọc theo trạng thái, project)")
    @GetMapping({"/my-tasks", "/tasks"})
    public List<TaskItem> myTasks(@RequestParam(name = "status", required = false) String status,
                                  @RequestParam(name = "project_id", required = false) Long projectId,
                                  @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.userId(user);
        String role = VehicSimAccess.roleOf(user);
        return tasks.listMyTasks(uid, role, status, projectId);
    }

    @Operation(summary = "FE-03 / FE-14 — Chi tiết một task")
    @GetMapping("/tasks/{taskId}")
    public TaskItem getTask(@PathVariable long taskId, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.userId(user);
        String role = VehicSimAccess.roleOf(user);
        return tasks.getTask(uid, role, taskId);
    }

    /**
     * Cập nhật tiến độ hoàn thành và trạng thái của một nhiệm vụ được giao cho kỹ sư.
     *
     * @param taskId mã định danh task
     * @param body thông tin cập nhật gồm trạng thái và phần trăm tiến độ
     * @param user thông tin người dùng đang đăng nhập
     * @return thông tin task sau khi cập nhật
     */
    @Operation(summary = "FE-03 — Kỹ sư cập nhật tiến độ và trạng thái task được giao")
    @PatchMapping("/tasks/{taskId}/status")
    public TaskItem patchTaskStatus(@PathVariable long taskId,
                                    @Valid @RequestBody TaskStatusUpdateRequest body,
                                    @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.userId(user);
        String role = VehicSimAccess.roleOf(user);
        access.limitWrites(uid, "task_status");
        return tasks.updateStatus(uid, role, taskId, body.status(), body.progressPct());
    }

    @Operation(summary = "FE-03 — Kỹ sư cập nhật tiến độ và trạng thái task được giao (hỗ trợ PUT)")
    @PutMapping("/tasks/{taskId}/status")
    public TaskItem putTaskStatus(@PathVariable long taskId,
                                  @Valid @RequestBody TaskStatusUpdateRequest body,
                                  @AuthenticationPrincipal UserDetails user) {
        return patchTaskStatus(taskId, body, user);
    }

    /**
     * Nộp báo cáo công việc gắn với nhiệm vụ hoặc project cho quản lý phê duyệt.
     *
     * @param body nội dung báo cáo nộp kèm liên kết đính kèm nếu có
     * @param user thông tin kỹ sư đăng nộp
     * @return thông tin báo cáo đã nộp kèm trạng thái SUBMITTED
     */
    @Operation(summary = "FE-14 — Kỹ sư nộp báo cáo công việc gắn với task / project")
    @PostMapping("/reports")
    public ResponseEntity<ReportItem> submitReport(@Valid @RequestBody SubmitReportRequest body,
                                                   @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.userId(user);
        String role = VehicSimAccess.roleOf(user);
        access.limitWrites(uid, "workspace_report");
        return ResponseEntity.status(HttpStatus.CREATED).body(reports.submit(uid, role, body));
    }

    @Operation(summary = "FE-14 — Danh sách báo cáo do tôi đã nộp")
    @GetMapping({"/my-reports", "/reports"})
    public List<ReportItem> myReports(@RequestParam(name = "status", required = false) String status,
                                      @RequestParam(name = "project_id", required = false) Long projectId,
                                      @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.userId(user);
        String role = VehicSimAccess.roleOf(user);
        return reports.listMyReports(uid, role, status, projectId);
    }

    @Operation(summary = "FE-14 — Chi tiết một báo cáo công việc và nhận xét duyệt của Manager")
    @GetMapping("/reports/{reportId}")
    public ReportItem getReport(@PathVariable long reportId, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.userId(user);
        String role = VehicSimAccess.roleOf(user);
        return reports.getReport(uid, role, reportId);
    }

    @Operation(summary = "FE-03 — Tin nhắn trao đổi trong workspace")
    @GetMapping("/workspaces/{workspaceId}/messages")
    public List<ChatMessage> listMessages(@PathVariable long workspaceId,
                                          @RequestParam(name = "limit", defaultValue = "50") int limit,
                                          @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.userId(user);
        String role = VehicSimAccess.roleOf(user);
        return workspaces.listMessages(uid, role, workspaceId, limit);
    }

    @Operation(summary = "FE-03 — Gửi tin nhắn trao đổi trong workspace")
    @PostMapping("/workspaces/{workspaceId}/messages")
    public ResponseEntity<ChatMessage> sendMessage(@PathVariable long workspaceId,
                                                   @Valid @RequestBody SendChatMessageRequest body,
                                                   @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.userId(user);
        String role = VehicSimAccess.roleOf(user);
        access.limitWrites(uid, "workspace_chat");
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(workspaces.sendMessage(uid, role, workspaceId, body.message()));
    }
}
