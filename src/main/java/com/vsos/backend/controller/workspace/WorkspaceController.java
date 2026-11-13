package com.vsos.backend.controller.workspace;

import com.vsos.backend.config.OpenApiConfig;
import com.vsos.backend.dto.workspace.WorkspaceDtos.AddMemberRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MemberCandidate;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MemberItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.RemoveMemberResult;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ReportDecisionRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ReportItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.TaskItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.TaskRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.UpdateWorkspaceRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.WorkspaceDetail;
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
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * HTTP của workspace (M1…M9, {@code /api/v1/vehicsim/workspaces/...}). Xem workspace, thành viên, task, báo cáo: MANAGER / ENGINEER /
 * REVIEWER là Manager hoặc thành viên của workspace đó; thành viên chỉ thấy task giao cho mình và báo cáo mình nộp. Quản lý thành viên,
 * giao / sửa / xoá task, duyệt báo cáo: chỉ MANAGER được gán (luật role ở {@link VehicSimAccess}). Lớp này chỉ nhận request; nghiệp vụ ở
 * {@link WorkspaceService} / {@link WorkspaceTaskService} / {@link WorkspaceReportService}, lỗi đổi thành mã HTTP ở ApiExceptionHandler.
 */
@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim · Workspace", description = "Manager xem workspace, project, thành viên; thêm / bớt Engineer và Reviewer; giao task; duyệt báo cáo")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class WorkspaceController {

    private final WorkspaceService workspaces;
    private final WorkspaceTaskService tasks;
    private final WorkspaceReportService reports;
    private final VehicSimAccess access;

    @Operation(summary = "M1 — Workspace tôi quản lý")
    @GetMapping("/workspaces")
    public List<WorkspaceSummary> list(@AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireMemberManager(user);
        return workspaces.listWorkspaces(uid, VehicSimAccess.roleOf(user));
    }

    @Operation(summary = "M2 — Chi tiết workspace và các project bên trong")
    @GetMapping("/workspaces/{workspaceId}")
    public WorkspaceDetail detail(@PathVariable long workspaceId, @AuthenticationPrincipal UserDetails user) {
        return workspaces.detail(VehicSimAccess.requireWorkspaceRole(user), workspaceId);
    }

    @Operation(summary = "M2 — Manager được gán sửa tên và mô tả workspace (đổi Manager / lưu trữ ở Quản trị)")
    @PutMapping("/workspaces/{workspaceId}")
    public WorkspaceSummary updateInfo(@PathVariable long workspaceId, @Valid @RequestBody UpdateWorkspaceRequest body,
                                       @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireMemberManager(user);
        access.limitWrites(uid, "workspace_update");
        return workspaces.updateInfo(uid, VehicSimAccess.roleOf(user), workspaceId, body.name(), body.description());
    }

    @Operation(summary = "M3 — Thành viên của workspace")
    @GetMapping("/workspaces/{workspaceId}/members")
    public List<MemberItem> members(@PathVariable long workspaceId, @AuthenticationPrincipal UserDetails user) {
        return workspaces.members(VehicSimAccess.requireWorkspaceRole(user), workspaceId);
    }

    @Operation(summary = "M4 — Tìm tài khoản EXPERIENCER để thêm, chỉ theo email đúng hoàn toàn (trống hoặc khớp một phần: danh sách rỗng)")
    @GetMapping("/workspaces/{workspaceId}/member-candidates")
    public List<MemberCandidate> candidates(@PathVariable long workspaceId, @RequestParam(name = "q", required = false) String q,
                                            @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireMemberManager(user);
        // Hạn mức riêng để không dùng route này dò từng email.
        access.limitWrites(uid, "workspace_member_search");
        return workspaces.candidates(uid, VehicSimAccess.roleOf(user), workspaceId, q);
    }

    @Operation(summary = "M4 — Thêm tài khoản EXPERIENCER vào workspace và cấp role ENGINEER / REVIEWER")
    @PostMapping("/workspaces/{workspaceId}/members")
    public ResponseEntity<MemberItem> addMember(@PathVariable long workspaceId, @Valid @RequestBody AddMemberRequest body,
                                                @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireMemberManager(user);
        access.limitWrites(uid, "workspace_member");
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(workspaces.addMember(uid, VehicSimAccess.roleOf(user), workspaceId, body.userId(), body.role()));
    }

    @Operation(summary = "M5 — Bớt thành viên khỏi workspace (tự rời mọi project của workspace)")
    @DeleteMapping("/workspaces/{workspaceId}/members/{memberUserId}")
    public RemoveMemberResult removeMember(@PathVariable long workspaceId, @PathVariable long memberUserId,
                                           @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireMemberManager(user);
        access.limitWrites(uid, "workspace_member");
        return workspaces.removeMember(uid, VehicSimAccess.roleOf(user), workspaceId, memberUserId);
    }

    // ------------------------------------------------------------------ task (M6, M7)

    @Operation(summary = "M7 — Task của workspace (Manager: mọi task, lọc theo người nhận, assignee_id=0 là chưa giao; thành viên: task của mình)")
    @GetMapping("/workspaces/{workspaceId}/tasks")
    public List<TaskItem> listTasks(@PathVariable long workspaceId,
                                    @RequestParam(name = "status", required = false) String status,
                                    @RequestParam(name = "assignee_id", required = false) Long assigneeId,
                                    @AuthenticationPrincipal UserDetails user) {
        return tasks.list(VehicSimAccess.requireWorkspaceRole(user), workspaceId, status, assigneeId);
    }

    @Operation(summary = "M6 — Giao task mới")
    @PostMapping("/workspaces/{workspaceId}/tasks")
    public ResponseEntity<TaskItem> createTask(@PathVariable long workspaceId, @Valid @RequestBody TaskRequest body,
                                               @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireMemberManager(user);
        access.limitWrites(uid, "workspace_task");
        return ResponseEntity.status(HttpStatus.CREATED).body(tasks.create(uid, VehicSimAccess.roleOf(user), workspaceId, body));
    }

    @Operation(summary = "M7 — Sửa task: nội dung, người nhận, project, hạn, trạng thái, tiến độ (gửi đủ mọi trường)")
    @PutMapping("/workspaces/{workspaceId}/tasks/{taskId}")
    public TaskItem updateTask(@PathVariable long workspaceId, @PathVariable long taskId, @Valid @RequestBody TaskRequest body,
                               @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireMemberManager(user);
        access.limitWrites(uid, "workspace_task");
        return tasks.update(uid, VehicSimAccess.roleOf(user), workspaceId, taskId, body);
    }

    @Operation(summary = "M7 — Xoá task chưa có báo cáo")
    @DeleteMapping("/workspaces/{workspaceId}/tasks/{taskId}")
    public Map<String, Long> deleteTask(@PathVariable long workspaceId, @PathVariable long taskId,
                                        @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireMemberManager(user);
        access.limitWrites(uid, "workspace_task");
        tasks.delete(uid, VehicSimAccess.roleOf(user), workspaceId, taskId);
        // Trả thân JSON (không 204): client chung frontend/src/services/api.ts luôn đọc res.json().
        return Map.of("task_id", taskId);
    }

    // ------------------------------------------------------------------ báo cáo (M8, M9)

    @Operation(summary = "M8 — Báo cáo công việc trong workspace (Manager: mọi báo cáo; thành viên: báo cáo của mình)")
    @GetMapping("/workspaces/{workspaceId}/reports")
    public List<ReportItem> listReports(@PathVariable long workspaceId,
                                        @RequestParam(name = "status", required = false) String status,
                                        @RequestParam(name = "project_id", required = false) Long projectId,
                                        @AuthenticationPrincipal UserDetails user) {
        return reports.list(VehicSimAccess.requireWorkspaceRole(user), workspaceId, status, projectId);
    }

    @Operation(summary = "M9 — Duyệt (APPROVED) hoặc từ chối (REJECTED, bắt buộc nhận xét) báo cáo đang chờ")
    @PostMapping("/workspaces/{workspaceId}/reports/{reportId}/decision")
    public ReportItem decideReport(@PathVariable long workspaceId, @PathVariable long reportId, @Valid @RequestBody ReportDecisionRequest body,
                                   @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireMemberManager(user);
        access.limitWrites(uid, "workspace_report");
        return reports.decide(uid, VehicSimAccess.roleOf(user), workspaceId, reportId, body.decision(), body.note());
    }
}
