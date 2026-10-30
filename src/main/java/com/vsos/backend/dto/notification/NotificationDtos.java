package com.vsos.backend.dto.notification;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.LocalDateTime;
import java.util.List;

/** Kết quả của các route thông báo (M10, {@code /api/v1/vehicsim/notifications}). JSON snake_case như phần còn lại của VehicSim. */
public final class NotificationDtos {

    private NotificationDtos() {
    }

    /** Một thông báo. {@code reference_type} / {@code reference_id}: đối tượng được nhắc tới (TASK, REPORT, WORKSPACE…). */
    public record NotificationItem(
            long id,
            String type,
            String title,
            String content,
            @JsonProperty("reference_type") String referenceType,
            @JsonProperty("reference_id") Long referenceId,
            @JsonProperty("workspace_id") Long workspaceId,
            @JsonProperty("workspace_name") String workspaceName,
            @JsonProperty("is_read") boolean isRead,
            @JsonProperty("created_date") LocalDateTime createdDate) {
    }

    /** Danh sách + tổng số chưa đọc (số trên chuông, tính trên mọi thông báo chứ không chỉ trang đang trả). */
    public record NotificationList(List<NotificationItem> items, @JsonProperty("unread_count") int unreadCount) {
    }
}
