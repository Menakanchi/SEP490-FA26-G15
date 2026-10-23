package com.vehicsim.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Body và kết quả của các route quản lý workspace (Manager — M1…M5): xem workspace mình quản lý, thành viên, thêm / bớt
 * ENGINEER và REVIEWER. JSON snake_case giữ cùng quy ước với {@code frontend/src/services/vehicsim.ts}.
 */
public final class WorkspaceDtos {

    private WorkspaceDtos() {
    }

    /** {@code POST /workspaces/{id}/members}: thêm một người đã có tài khoản ENGINEER / REVIEWER. */
    public record AddMemberRequest(@JsonProperty("user_id") @NotNull Long userId) {
    }

    /** Người dùng rút gọn: Manager của workspace, người đã thêm thành viên, chủ project. */
    public record UserRef(long id, @JsonProperty("full_name") String fullName, String email) {
    }

    /** Một dòng ở danh sách workspace (M1). */
    public record WorkspaceSummary(
            long id,
            String name,
            String description,
            String status,
            UserRef manager,
            @JsonProperty("member_count") int memberCount,
            @JsonProperty("project_count") int projectCount,
            @JsonProperty("created_date") LocalDateTime createdDate) {
    }

    /** Project trong workspace (M2): Manager chỉ xem, không tạo — Engineer tự tạo project (ADR-037). */
    public record ProjectItem(
            long id,
            String name,
            String status,
            UserRef owner,
            @JsonProperty("member_count") int memberCount,
            @JsonProperty("created_date") LocalDateTime createdDate) {
    }

    /** Chi tiết một workspace (M2). */
    public record WorkspaceDetail(WorkspaceSummary workspace, List<ProjectItem> projects) {
    }

    /** Một thành viên (M3). {@code owned_project_count} &gt; 0 thì chưa bớt khỏi workspace được (M5). */
    public record MemberItem(
            @JsonProperty("user_id") long userId,
            @JsonProperty("full_name") String fullName,
            String email,
            String role,
            @JsonProperty("is_active") boolean isActive,
            @JsonProperty("joined_at") LocalDateTime joinedAt,
            @JsonProperty("added_by") UserRef addedBy,
            @JsonProperty("project_count") int projectCount,
            @JsonProperty("owned_project_count") int ownedProjectCount) {
    }

    /** Người có thể thêm vào workspace (M4): tài khoản đang hoạt động, role ENGINEER / REVIEWER, chưa là thành viên. */
    public record MemberCandidate(
            @JsonProperty("user_id") long userId,
            @JsonProperty("full_name") String fullName,
            String email,
            String role) {
    }

    /** Kết quả bớt thành viên (M5): số project người đó bị rời theo (CASCADE {@code project_members}). */
    public record RemoveMemberResult(
            @JsonProperty("user_id") long userId,
            @JsonProperty("removed_project_memberships") int removedProjectMemberships) {
    }
}
