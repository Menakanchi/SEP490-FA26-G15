package com.vsos.backend.controller.workspace;

import com.vsos.backend.config.OpenApiConfig;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MyTaskItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.MyWork;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ReportItem;
import com.vsos.backend.dto.workspace.WorkspaceDtos.ReportSubmitRequest;
import com.vsos.backend.dto.workspace.WorkspaceDtos.TaskProgressRequest;
import com.vsos.backend.security.VehicSimAccess;
import com.vsos.backend.service.workspace.MemberWorkService;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * HTTP của "Nhiệm vụ & báo cáo" phía thành viên workspace ({@code /api/v1/vehicsim/my/...}): ENGINEER / REVIEWER xem task được giao,
 * cập nhật tiến độ, nộp báo cáo (luật role ở {@link VehicSimAccess#requireWorkspaceMember}). Nghiệp vụ ở {@link MemberWorkService}.
 */
@RestController
@RequestMapping("/api/v1/vehicsim/my")
@RequiredArgsConstructor
@Tag(name = "VehicSim · Việc của tôi", description = "Engineer / Reviewer xem task được giao, cập nhật tiến độ, nộp báo cáo công việc")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class MemberWorkController {

    private final MemberWorkService work;
    private final VehicSimAccess access;

    @Operation(summary = "Task được giao, báo cáo đã nộp và project nộp được báo cáo của tôi")
    @GetMapping("/work")
    public MyWork myWork(@AuthenticationPrincipal UserDetails user) {
        return work.myWork(VehicSimAccess.requireWorkspaceMember(user));
    }

    @Operation(summary = "Cập nhật trạng thái (TODO / IN_PROGRESS / REVIEW) và tiến độ task được giao cho tôi")
    @PutMapping("/tasks/{taskId}/progress")
    public MyTaskItem updateProgress(@PathVariable long taskId, @Valid @RequestBody TaskProgressRequest body,
                                     @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireWorkspaceMember(user);
        access.limitWrites(uid, "workspace_task");
        return work.updateProgress(uid, taskId, body);
    }

    @Operation(summary = "Nộp báo cáo công việc cho một project trong workspace của tôi")
    @PostMapping("/reports")
    public ResponseEntity<ReportItem> submitReport(@Valid @RequestBody ReportSubmitRequest body, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireWorkspaceMember(user);
        access.limitWrites(uid, "workspace_report");
        return ResponseEntity.status(HttpStatus.CREATED).body(work.submitReport(uid, body));
    }
}
