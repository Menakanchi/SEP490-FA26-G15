package com.vehicsim.controller;

import com.vehicsim.config.OpenApiConfig;
import com.vehicsim.dto.WorkspaceDtos.AddMemberRequest;
import com.vehicsim.dto.WorkspaceDtos.MemberCandidate;
import com.vehicsim.dto.WorkspaceDtos.MemberItem;
import com.vehicsim.dto.WorkspaceDtos.RemoveMemberResult;
import com.vehicsim.dto.WorkspaceDtos.WorkspaceDetail;
import com.vehicsim.dto.WorkspaceDtos.WorkspaceSummary;
import com.vehicsim.service.WorkspaceService;
import com.vehicsim.vehicsim.VehicSimAccess;
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
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * HTTP của màn quản lý workspace (Manager — M1…M5, {@code /api/v1/vehicsim/workspaces/...}). Mọi route cần MANAGER hoặc ADMIN
 * (luật ở {@link VehicSimAccess}); Manager chỉ thấy workspace mình được gán. Lớp này chỉ nhận request; nghiệp vụ ở
 * {@link WorkspaceService}, lỗi đổi thành mã HTTP ở ApiExceptionHandler.
 */
@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim · Workspace", description = "Manager xem workspace, project, thành viên; thêm / bớt Engineer và Reviewer")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class WorkspaceController {

    private final WorkspaceService workspaces;
    private final VehicSimAccess access;

    @Operation(summary = "M1 — Workspace tôi quản lý (ADMIN: mọi workspace)")
    @GetMapping("/workspaces")
    public List<WorkspaceSummary> list(@AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireWorkspaceManager(user);
        return workspaces.listWorkspaces(uid, VehicSimAccess.roleOf(user));
    }

    @Operation(summary = "M2 — Chi tiết workspace và các project bên trong")
    @GetMapping("/workspaces/{workspaceId}")
    public WorkspaceDetail detail(@PathVariable long workspaceId, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireWorkspaceManager(user);
        return workspaces.detail(uid, VehicSimAccess.roleOf(user), workspaceId);
    }

    @Operation(summary = "M3 — Thành viên của workspace")
    @GetMapping("/workspaces/{workspaceId}/members")
    public List<MemberItem> members(@PathVariable long workspaceId, @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireWorkspaceManager(user);
        return workspaces.members(uid, VehicSimAccess.roleOf(user), workspaceId);
    }

    @Operation(summary = "M4 — Tài khoản ENGINEER / REVIEWER có thể thêm (lọc theo email hoặc tên)")
    @GetMapping("/workspaces/{workspaceId}/member-candidates")
    public List<MemberCandidate> candidates(@PathVariable long workspaceId, @RequestParam(name = "q", required = false) String q,
                                            @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireWorkspaceManager(user);
        return workspaces.candidates(uid, VehicSimAccess.roleOf(user), workspaceId, q);
    }

    @Operation(summary = "M4 — Thêm ENGINEER / REVIEWER vào workspace")
    @PostMapping("/workspaces/{workspaceId}/members")
    public ResponseEntity<MemberItem> addMember(@PathVariable long workspaceId, @Valid @RequestBody AddMemberRequest body,
                                                @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireWorkspaceManager(user);
        access.limitWrites(uid, "workspace_member");
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(workspaces.addMember(uid, VehicSimAccess.roleOf(user), workspaceId, body.userId()));
    }

    @Operation(summary = "M5 — Bớt thành viên khỏi workspace (tự rời mọi project của workspace)")
    @DeleteMapping("/workspaces/{workspaceId}/members/{memberUserId}")
    public RemoveMemberResult removeMember(@PathVariable long workspaceId, @PathVariable long memberUserId,
                                           @AuthenticationPrincipal UserDetails user) {
        long uid = VehicSimAccess.requireWorkspaceManager(user);
        access.limitWrites(uid, "workspace_member");
        return workspaces.removeMember(uid, VehicSimAccess.roleOf(user), workspaceId, memberUserId);
    }
}
