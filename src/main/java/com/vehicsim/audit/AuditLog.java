package com.vehicsim.audit;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * Nhật ký thao tác nhạy cảm (TD-25): đăng nhập, đăng ký, đổi / đặt lại mật khẩu, quyết định Accept / Reject.
 *
 * <p>Mỗi sự kiện là một dòng {@code audit event=auth.login outcome=failure user=a@b.c ip=1.2.3.4 reason=bad_credentials}
 * ở logger {@code audit}, để lọc riêng bằng cấu hình log. Chỉ nhận cặp khoá-giá trị do nơi gọi chọn từng trường nên không bao giờ
 * vô tình ghi mật khẩu, mã OTP hay token; giá trị bị bỏ ký tự điều khiển (chống chèn dòng log giả) và cắt ngắn.
 */
public final class AuditLog {

    private static final Logger LOG = LoggerFactory.getLogger("audit");
    static final int MAX_VALUE_LENGTH = 200;

    private AuditLog() {
    }

    /** Ghi một sự kiện; {@code keyValues} là dãy khoá, giá trị, khoá, giá trị… (giá trị null bị bỏ qua). */
    public static void event(String event, String outcome, Object... keyValues) {
        if (LOG.isInfoEnabled()) {
            LOG.info(format(event, outcome, keyValues));
        }
    }

    static String format(String event, String outcome, Object... keyValues) {
        if (keyValues.length % 2 != 0) {
            throw new IllegalArgumentException("keyValues phải là các cặp khoá, giá trị");
        }
        StringBuilder sb = new StringBuilder("event=").append(clean(event)).append(" outcome=").append(clean(outcome));
        for (int i = 0; i < keyValues.length; i += 2) {
            Object value = keyValues[i + 1];
            if (value != null) {
                sb.append(' ').append(clean(String.valueOf(keyValues[i]))).append('=').append(clean(String.valueOf(value)));
            }
        }
        return sb.toString();
    }

    /** Bỏ ký tự điều khiển, cắt độ dài, và đặt trong ngoặc kép nếu có khoảng trắng / dấu bằng / ngoặc kép. */
    static String clean(String raw) {
        StringBuilder sb = new StringBuilder(Math.min(raw.length(), MAX_VALUE_LENGTH));
        for (int i = 0; i < raw.length() && sb.length() < MAX_VALUE_LENGTH; i++) {
            char c = raw.charAt(i);
            sb.append(Character.isISOControl(c) ? ' ' : c);
        }
        String s = sb.toString();
        if (s.isEmpty()) {
            return "\"\"";
        }
        boolean needsQuotes = s.chars().anyMatch(ch -> ch == ' ' || ch == '=' || ch == '"');
        return needsQuotes ? "\"" + s.replace("\\", "\\\\").replace("\"", "\\\"") + "\"" : s;
    }
}
