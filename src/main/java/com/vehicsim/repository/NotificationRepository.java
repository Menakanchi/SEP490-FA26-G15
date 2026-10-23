package com.vehicsim.repository;

import com.vehicsim.dto.NotificationDtos.NotificationItem;
import com.vehicsim.vehicsim.Db;
import com.vehicsim.vehicsim.Row;
import org.springframework.stereotype.Repository;

import java.util.List;

/**
 * Câu SQL của thông báo theo người nhận (M10 — bảng {@code notifications}, FE-03-08). Mọi câu đọc / sửa đều kèm {@code user_id} của người
 * đang đăng nhập nên không ai đọc hay đánh dấu được thông báo của người khác. SQL thuần qua {@link Db}; tham gia transaction của nơi gọi.
 */
@Repository
public class NotificationRepository {

    private final Db db;

    public NotificationRepository(Db db) {
        this.db = db;
    }

    public long insert(long userId, Long workspaceId, String type, String title, String content, String referenceType, Long referenceId) {
        return db.insert("""
                INSERT INTO notifications (user_id, workspace_id, type, title, content, reference_type, reference_id)
                VALUES (?,?,?,?,?,?,?)
                """, userId, workspaceId, type, title, content, referenceType, referenceId);
    }

    /** Thông báo mới nhất trước, tối đa {@code limit}; {@code unreadOnly} = chỉ chưa đọc. */
    public List<NotificationItem> list(long userId, boolean unreadOnly, int limit) {
        String sql = """
                SELECT n.id, n.type, n.title, n.content, n.reference_type, n.reference_id, n.is_read, n.created_date,
                       n.workspace_id, w.name AS workspace_name
                  FROM notifications n
                  LEFT JOIN workspaces w ON w.id = n.workspace_id
                 WHERE n.user_id = ?
                """
                + (unreadOnly ? " AND n.is_read = FALSE" : "")
                + " ORDER BY n.id DESC LIMIT ?";
        return db.list(sql, userId, limit).stream().map(NotificationRepository::toItem).toList();
    }

    public int unreadCount(long userId) {
        Object n = db.scalar("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = FALSE", userId);
        return n == null ? 0 : ((Number) n).intValue();
    }

    /** Đánh dấu một thông báo của người này là đã đọc; false nếu không có (hoặc là của người khác). */
    public boolean markRead(long userId, long notificationId) {
        if (db.first("SELECT 1 AS x FROM notifications WHERE id = ? AND user_id = ?", notificationId, userId) == null) {
            return false;
        }
        db.update("UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?", notificationId, userId);
        return true;
    }

    /** Đánh dấu mọi thông báo chưa đọc của người này; trả số dòng đã đổi. */
    public int markAllRead(long userId) {
        return db.update("UPDATE notifications SET is_read = TRUE WHERE user_id = ? AND is_read = FALSE", userId);
    }

    private static NotificationItem toItem(Row r) {
        return new NotificationItem(r.lng("id"), r.str("type"), r.str("title"), r.str("content"), r.str("reference_type"),
                r.getLong("reference_id"), r.getLong("workspace_id"), r.str("workspace_name"), r.bool("is_read"), r.ts("created_date"));
    }
}
