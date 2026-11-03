package com.vsos.backend.controller.workspace;

import com.vsos.backend.config.OpenApiConfig;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ChatMessage;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ReportItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.SendChatMessageRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.TaskItem;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * HTTP cho Manager / Kỹ sư / Người duyệt trong workspace (FE-03, FE-14): workspace của tôi, task được giao cho tôi, báo cáo tôi đã nộp,
 * chi tiết task / báo cáo, chat workspace. Mọi route cần MANAGER, ENGINEER hoặc REVIEWER ({@link VehicSimAccess#requireWorkspaceRole});
 * task / báo cáo của người khác chỉ người được giao / người nộp và Manager của workspace xem được, còn lại 404.
 * Cập nhật tiến độ và nộp báo cáo ở {@link MemberWorkController} ({@code /my/...}).
 */
@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim · Workspace · Thành viên",
     description = "Manager / Engineer / Reviewer: workspace của tôi, task và báo cáo của tôi, trao đổi trong workspace")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class EngineerWorkspaceController {

    private final WorkspaceService workspaces;
    private final WorkspaceTaskService tasks;
    private final WorkspaceReportService reports;
    private final VehicSimAccess access;

    @Operation(summary = "FE-03 — Workspace của tôi (MANAGER: workspace được gán; ENGINEER / REVIEWER: workspace là thành viên)")
    @GetMapping("/my-workspaces")
    public List<WorkspaceSummary> myWorkspaces(@AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireWorkspaceRole(user);
        return workspaces.listMyWorkspaces(uid, VehicSimAccess.roleOf(user));
    }

    @Operation(summary = "FE-03 / FE-14 — Task được giao cho tôi (lọc theo trạng thái, project)")
    @GetMapping("/my-tasks")
    public List<TaskItem> myTasks(@RequestParam(name = "status", required = false) String status,
                                  @RequestParam(name = "project_id", required = false) Long projectId,
                                  @AuthenticationPrincipal UserDetails user) {
        return tasks.listMyTasks(VehicSimAccess.requireWorkspaceRole(user), status, projectId);
    }

    @Operation(summary = "FE-03 / FE-14 — Chi tiết task: người được giao hoặc Manager của workspace")
    @GetMapping("/tasks/{taskId}")
    public TaskItem getTask(@PathVariable long taskId, @AuthenticationPrincipal UserDetails user) {
        return tasks.getTask(VehicSimAccess.requireWorkspaceRole(user), taskId);
    }

    @Operation(summary = "FE-14 — Báo cáo tôi đã nộp (lọc theo trạng thái, project)")
    @GetMapping("/my-reports")
    public List<ReportItem> myReports(@RequestParam(name = "status", required = false) String status,
                                      @RequestParam(name = "project_id", required = false) Long projectId,
                                      @AuthenticationPrincipal UserDetails user) {
        return reports.listMyReports(VehicSimAccess.requireWorkspaceRole(user), status, projectId);
    }

    @Operation(summary = "FE-14 — Chi tiết báo cáo và nhận xét duyệt: người nộp hoặc Manager nhận báo cáo")
    @GetMapping("/reports/{reportId}")
    public ReportItem getReport(@PathVariable long reportId, @AuthenticationPrincipal UserDetails user) {
        return reports.getReport(VehicSimAccess.requireWorkspaceRole(user), reportId);
    }

    @Operation(summary = "FE-03 — Tin nhắn trao đổi trong workspace (thành viên hoặc Manager của workspace)")
    @GetMapping("/workspaces/{workspaceId}/messages")
    public List<ChatMessage> listMessages(@PathVariable long workspaceId,
                                          @RequestParam(name = "limit", defaultValue = "50") int limit,
                                          @AuthenticationPrincipal UserDetails user) {
        return workspaces.listMessages(VehicSimAccess.requireWorkspaceRole(user), workspaceId, limit);
    }

    @Operation(summary = "FE-03 — Gửi tin nhắn trao đổi trong workspace (thành viên hoặc Manager của workspace)")
    @PostMapping("/workspaces/{workspaceId}/messages")
    public ResponseEntity<ChatMessage> sendMessage(@PathVariable long workspaceId,
                                                   @Valid @RequestBody SendChatMessageRequest body,
                                                   @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireWorkspaceRole(user);
        access.limitWrites(uid, "workspace_chat");
        return ResponseEntity.status(HttpStatus.CREATED).body(workspaces.sendMessage(uid, workspaceId, body.message()));
    }
}
