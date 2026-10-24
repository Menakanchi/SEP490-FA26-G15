package com.vehicsim.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * Body và kết quả của các route quản lý workspace (Manager — M1…M9): xem workspace mình quản lý, thành viên, thêm / bớt
 * thành viên (cấp role ENGINEER / REVIEWER khi thêm), giao và theo dõi task, duyệt báo cáo công việc. JSON snake_case giữ cùng quy ước với {@code frontend/src/services/vehicsim.ts}.
 */
public final class WorkspaceDtos {

    private WorkspaceDtos() {
    }

    /** {@code POST /workspaces/{id}/members}: thêm một tài khoản EXPERIENCER và cấp role ENGINEER / REVIEWER cho người đó (ADR-045). */
    public record AddMemberRequest(
            @JsonProperty("user_id") @NotNull Long userId,
            @NotBlank(message = "Chọn vai trò ENGINEER hoặc REVIEWER cho người được thêm") String role) {
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
            @JsonProperty("pending_report_count") int pendingReportCount,
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
            @JsonProperty("owned_project_count") int ownedProjectCount,
            @JsonProperty("open_task_count") int openTaskCount) {
    }

    /** Người có thể thêm vào workspace (M4): tài khoản EXPERIENCER đang hoạt động, chưa là thành viên; role cấp lúc thêm. */
    public record MemberCandidate(
            @JsonProperty("user_id") long userId,
            @JsonProperty("full_name") String fullName,
            String email,
            String role) {
    }

    /**
     * Kết quả bớt thành viên (M5): số project người đó bị rời theo (CASCADE {@code project_members}), số task chưa xong được gỡ người
     * nhận (task đã DONE giữ tên người làm để còn lịch sử) và người đó có bị trả role về EXPERIENCER không (ADR-045).
     */
    public record RemoveMemberResult(
            @JsonProperty("user_id") long userId,
            @JsonProperty("removed_project_memberships") int removedProjectMemberships,
            @JsonProperty("unassigned_tasks") int unassignedTasks,
            @JsonProperty("role_reverted") boolean roleReverted) {
    }

    /**
     * {@code POST /workspaces/{id}/tasks} và {@code PUT …/tasks/{taskId}} (M6, M7): gửi đủ mọi trường, trường để trống = không có
     * (không giao ai, không gắn project, không có hạn). {@code status} / {@code progress_pct} bỏ trống khi tạo = TODO / 0.
     */
    public record TaskRequest(
            @NotBlank(message = "Tên task không được để trống") @Size(max = 255, message = "Tên task tối đa 255 ký tự") String title,
            @Size(max = 5000, message = "Mô tả tối đa 5000 ký tự") String description,
            String priority,
            String status,
            @JsonProperty("progress_pct") @Min(value = 0, message = "Tiến độ từ 0 đến 100")
            @Max(value = 100, message = "Tiến độ từ 0 đến 100") Integer progressPct,
            @JsonProperty("assignee_id") Long assigneeId,
            @JsonProperty("project_id") Long projectId,
            @JsonProperty("due_date") LocalDate dueDate) {
    }

    /** Project rút gọn gắn với task. */
    public record ProjectRef(long id, String name) {
    }

    /** Một task (M6, M7). {@code overdue}: quá hạn mà chưa DONE. {@code report_count} &gt; 0 thì không xoá / đổi project được. */
    public record TaskItem(
            long id,
            String title,
            String description,
            String priority,
            String status,
            @JsonProperty("progress_pct") int progressPct,
            UserRef assignee,
            ProjectRef project,
            @JsonProperty("created_by") UserRef createdBy,
            @JsonProperty("due_date") LocalDate dueDate,
            boolean overdue,
            @JsonProperty("report_count") int reportCount,
            @JsonProperty("created_date") LocalDateTime createdDate,
            @JsonProperty("updated_at") LocalDateTime updatedAt) {
    }

    /** Task rút gọn gắn với báo cáo. */
    public record TaskRef(long id, String title) {
    }

    /** Một báo cáo công việc theo project (M8). {@code SUBMITTED} = chờ Manager duyệt; đã duyệt thì có người duyệt, lúc duyệt, nhận xét. */
    public record ReportItem(
            long id,
            ProjectRef project,
            TaskRef task,
            @JsonProperty("submitted_by") UserRef submittedBy,
            String title,
            String content,
            @JsonProperty("attachment_url") String attachmentUrl,
            String status,
            @JsonProperty("reviewed_by") UserRef reviewedBy,
            @JsonProperty("reviewed_at") LocalDateTime reviewedAt,
            @JsonProperty("review_note") String reviewNote,
            @JsonProperty("created_date") LocalDateTime createdDate) {
    }

    /** {@code POST /workspaces/{id}/reports/{reportId}/decision} (M9): APPROVED / REJECTED; từ chối phải ghi nhận xét. */
    public record ReportDecisionRequest(
            @NotBlank(message = "Chọn APPROVED hoặc REJECTED") String decision,
            @Size(max = 4000, message = "Nhận xét tối đa 4000 ký tự") String note) {
    }
}
