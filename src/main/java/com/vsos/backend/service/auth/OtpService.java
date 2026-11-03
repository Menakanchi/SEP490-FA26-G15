package com.vsos.backend.service.auth;

import com.vsos.backend.config.AuthProperties;
import com.vsos.backend.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;

/**
 * Mã OTP 6 số lưu trong Redis (cùng key và quy tắc với backend Python).
 * <p>
 * Mã 6 số chỉ có 10^6 khả năng nên phải đếm số lần nhập sai — vì vậy mã nằm trong Redis chứ không phải
 * token ký số. Chỉ lưu HMAC của mã (gắn cả purpose và email), nên mã đăng ký không dùng để đặt lại mật khẩu.
 * <ul>
 *   <li>{@code otp:{purpose}:{email}} — hash {h, attempts}, TTL = otpTtlSeconds</li>
 *   <li>{@code otp_cooldown:{purpose}:{email}} — chặn gửi lại liên tục</li>
 *   <li>{@code ratelimit:{bucket}:{key}} — bộ đếm theo cửa sổ thời gian (IP)</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class OtpService {

    public enum Purpose {
        REGISTER("register"), RESET("reset");

        private final String value;

        Purpose(String value) {
            this.value = value;
        }

        public String value() {
            return value;
        }
    }

    private static final SecureRandom RANDOM = new SecureRandom();

    private final StringRedisTemplate redis;
    private final AuthProperties props;
    private final JwtService jwtService;

    /**
     * Sinh mã mới và lưu hash của nó. Rỗng nếu email còn trong thời gian chờ gửi lại.
     * Người gọi không được để client biết nhánh rỗng — phản hồi phải giống hệt khi đã gửi mã.
     */
    public Optional<String> issue(Purpose purpose, String email) {
        int cooldown = props.otpResendCooldownSeconds();
        if (cooldown > 0) {
            Boolean first = redis.opsForValue().setIfAbsent(cooldownKey(purpose, email), "1", Duration.ofSeconds(cooldown));
            if (!Boolean.TRUE.equals(first)) {
                return Optional.empty();
            }
        }
        String code = String.format("%06d", RANDOM.nextInt(1_000_000));
        String key = otpKey(purpose, email);
        redis.delete(key);
        redis.opsForHash().putAll(key, Map.of("h", digest(purpose, email, code), "attempts", "0"));
        redis.expire(key, Duration.ofSeconds(props.otpTtlSeconds()));
        return Optional.of(code);
    }

    /**
     * Đúng mã: true và mã bị xoá ngay (dùng một lần). Sai mã: tăng bộ đếm; chạm otpMaxAttempts thì xoá mã.
     * Hai request cùng gửi đúng mã cùng lúc: chỉ request xoá được key (delete trả true) mới thắng.
     */
    public boolean verify(Purpose purpose, String email, String code) {
        String key = otpKey(purpose, email);
        Object stored = redis.opsForHash().get(key, "h");
        if (stored == null || code == null || !code.matches("\\d{6}")) {
            return false;
        }
        boolean matches = MessageDigest.isEqual(
                stored.toString().getBytes(StandardCharsets.UTF_8),
                digest(purpose, email, code).getBytes(StandardCharsets.UTF_8));
        if (matches) {
            return Boolean.TRUE.equals(redis.delete(key));
        }
        Long attempts = redis.opsForHash().increment(key, "attempts", 1);
        if (attempts != null && attempts >= props.otpMaxAttempts()) {
            redis.delete(key);
        }
        return false;
    }

    /** Đếm một lượt trong cửa sổ rateLimitWindowSeconds. true = đã vượt {@code limit}. */
    public boolean hitRateLimit(String bucket, String key, int limit) {
        String counter = "ratelimit:" + bucket + ":" + key;
        Long count = redis.opsForValue().increment(counter);
        if (count != null && count == 1L) {
            redis.expire(counter, Duration.ofSeconds(props.rateLimitWindowSeconds()));
        }
        return count != null && count > limit;
    }

    /** Chỉ đọc bộ đếm (không tăng): true = đã chạm {@code limit} trong cửa sổ hiện tại. */
    public boolean isRateLimited(String bucket, String key, int limit) {
        String value = redis.opsForValue().get("ratelimit:" + bucket + ":" + key);
        if (value == null) {
            return false;
        }
        try {
            return Long.parseLong(value) >= limit;
        } catch (NumberFormatException e) {
            return false;
        }
    }

    /** Xoá bộ đếm (vd. sau khi đăng nhập đúng thì không còn tính các lần sai trước đó). */
    public void clearRateLimit(String bucket, String key) {
        redis.delete("ratelimit:" + bucket + ":" + key);
    }

    private String digest(Purpose purpose, String email, String code) {
        return jwtService.keyedDigest("otp:" + purpose.value() + ":" + email + ":" + code, 64);
    }

    private static String otpKey(Purpose purpose, String email) {
        return "otp:" + purpose.value() + ":" + email;
    }

    private static String cooldownKey(Purpose purpose, String email) {
        return "otp_cooldown:" + purpose.value() + ":" + email;
    }
}
