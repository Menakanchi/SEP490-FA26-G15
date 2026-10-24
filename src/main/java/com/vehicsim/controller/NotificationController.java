package com.vehicsim.controller;

import com.vehicsim.config.OpenApiConfig;
import com.vehicsim.dto.NotificationDtos.NotificationList;
import com.vehicsim.service.NotificationService;
import com.vehicsim.vehicsim.VehicSimAccess;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * HTTP của thông báo (M10, {@code /api/v1/vehicsim/notifications}). Mọi role đã đăng nhập dùng được; mỗi người chỉ thấy và đánh dấu
 * thông báo của chính mình (id lấy từ token, không nhận từ request). Nghiệp vụ ở {@link NotificationService}.
 */
@RestController
@RequestMapping("/api/v1/vehicsim")
@RequiredArgsConstructor
@Tag(name = "VehicSim · Thông báo", description = "Thông báo của người đang đăng nhập: danh sách, số chưa đọc, đánh dấu đã đọc")
@SecurityRequirement(name = OpenApiConfig.BEARER_AUTH)
public class NotificationController {

    private final NotificationService notifications;

    @Operation(summary = "M10 — Thông báo của tôi (mới nhất trước) + số chưa đọc")
    @GetMapping("/notifications")
    public NotificationList list(@RequestParam(name = "unread_only", defaultValue = "false") boolean unreadOnly,
                                 @RequestParam(name = "limit", required = false) Integer limit,
                                 @AuthenticationPrincipal UserDetails user) {
        return notifications.list(VehicSimAccess.userId(user), unreadOnly, limit);
    }

    @Operation(summary = "M10 — Đánh dấu một thông báo đã đọc")
    @PostMapping("/notifications/{notificationId}/read")
    public Map<String, Integer> markRead(@PathVariable long notificationId, @AuthenticationPrincipal UserDetails user) {
        return Map.of("unread_count", notifications.markRead(VehicSimAccess.userId(user), notificationId));
    }

    @Operation(summary = "M10 — Đánh dấu mọi thông báo đã đọc")
    @PostMapping("/notifications/read-all")
    public Map<String, Integer> markAllRead(@AuthenticationPrincipal UserDetails user) {
        return Map.of("unread_count", notifications.markAllRead(VehicSimAccess.userId(user)));
    }
}
