package com.vsos.backend.service.notification;

import com.vsos.backend.dto.notification.NotificationDtos.NotificationList;
import com.vsos.backend.repository.notification.NotificationRepository;
import com.vsos.backend.common.Vs.InvalidRequestException;
import com.vsos.backend.common.Vs.NotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Thông báo theo người nhận (M10 — FE-03-08). Mọi role đọc được thông báo của chính mình; không ai đọc / đánh dấu của người khác.
 * <p>
 * Ghi thông báo ({@link #notify}) chạy trong transaction của thao tác gây ra nó: thao tác lỗi thì không có thông báo. Không tự báo cho
 * chính người làm. Nơi đang ghi: Manager thêm / bớt thành viên, giao task, duyệt / từ chối báo cáo. Chưa ghi: {@code REPORT_SUBMITTED} và
 * {@code WORKSPACE_ASSIGNED} (chưa có luồng nộp báo cáo / Admin gán Manager), thông báo của luồng mô phỏng / regression ({@code SIMULATION_*},
 * {@code RECOMMENDATION_*}, {@code FAILURE_DETECTED}, {@code CANDIDATE_CREATED}).
 */
@Service
public class NotificationService {

    static final int DEFAULT_LIMIT = 20;
    static final int MAX_LIMIT = 100;

    private final NotificationRepository repo;

    public NotificationService(NotificationRepository repo) {
        this.repo = repo;
    }

    /** Ghi một thông báo cho {@code recipientId}; bỏ qua khi người nhận chính là người làm ({@code actorId}). */
    public void notify(long recipientId, long actorId, Long workspaceId, String type, String title, String content,
                       String referenceType, Long referenceId) {
        if (recipientId == actorId) {
            return;
        }
        repo.insert(recipientId, workspaceId, type, truncate(title, 255), content, referenceType, referenceId);
    }

    public NotificationList list(long userId, boolean unreadOnly, Integer limit) {
        int n = limit == null ? DEFAULT_LIMIT : limit;
        if (n < 1 || n > MAX_LIMIT) {
            throw new InvalidRequestException("limit từ 1 đến " + MAX_LIMIT);
        }
        return new NotificationList(repo.list(userId, unreadOnly, n), repo.unreadCount(userId));
    }

    @Transactional
    public int markRead(long userId, long notificationId) {
        if (!repo.markRead(userId, notificationId)) {
            throw new NotFoundException("thông báo");
        }
        return repo.unreadCount(userId);
    }

    @Transactional
    public int markAllRead(long userId) {
        repo.markAllRead(userId);
        return repo.unreadCount(userId);
    }

    private static String truncate(String s, int max) {
        return s.length() <= max ? s : s.substring(0, max - 1) + "…";
    }
}
