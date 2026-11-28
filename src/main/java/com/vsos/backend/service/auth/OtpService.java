package com.vsos.backend.service.auth;

import com.vsos.backend.config.AuthProperties;
import com.vsos.backend.security.JwtService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.Duration;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

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
    private static final DefaultRedisScript<Long> ISSUE_OTP = new DefaultRedisScript<>("""
            redis.call('DEL', KEYS[1])
            redis.call('HSET', KEYS[1], 'h', ARGV[1], 'attempts', '0')
            redis.call('EXPIRE', KEYS[1], ARGV[2])
            return 1
            """, Long.class);
    private static final DefaultRedisScript<Long> VERIFY_OTP = new DefaultRedisScript<>("""
            local stored = redis.call('HGET', KEYS[1], 'h')
            if not stored then return 0 end
            local attempts = tonumber(redis.call('HGET', KEYS[1], 'attempts') or '0')
            local maxAttempts = tonumber(ARGV[2])
            if attempts >= maxAttempts then redis.call('DEL', KEYS[1]); return 0 end
            local expected = ARGV[1]
            local diff = bit.bxor(#stored, #expected)
            for i = 1, #expected do
                diff = bit.bor(diff, bit.bxor(string.byte(stored, i) or 0, string.byte(expected, i)))
            end
            if diff == 0 then redis.call('DEL', KEYS[1]); return 1 end
            attempts = redis.call('HINCRBY', KEYS[1], 'attempts', 1)
            if attempts >= maxAttempts then redis.call('DEL', KEYS[1]) end
            return 0
            """, Long.class);
    private static final DefaultRedisScript<Long> INCREMENT_LIMIT = new DefaultRedisScript<>("""
            local count = redis.call('INCR', KEYS[1])
            if count == 1 or redis.call('TTL', KEYS[1]) == -1 then
                redis.call('EXPIRE', KEYS[1], ARGV[1])
            end
            return count
            """, Long.class);
    private static final DefaultRedisScript<String> READ_LIMIT = new DefaultRedisScript<>("""
            local count = redis.call('GET', KEYS[1])
            if count and redis.call('TTL', KEYS[1]) == -1 then
                redis.call('EXPIRE', KEYS[1], ARGV[1])
            end
            return count
            """, String.class);
    private static final DefaultRedisScript<Long> RESERVE_LOGIN = new DefaultRedisScript<>("""
            local kind = redis.call('TYPE', KEYS[1]).ok
            if kind == 'string' then
                local count = redis.call('GET', KEYS[1])
                if not string.match(count, '^%d+$') then return redis.error_reply('invalid login counter') end
                local ttl = redis.call('PTTL', KEYS[1])
                redis.call('DEL', KEYS[1])
                redis.call('HSET', KEYS[1], 'failures', count, 'pending', '0')
                if ttl > 0 then redis.call('PEXPIRE', KEYS[1], ttl)
                else redis.call('EXPIRE', KEYS[1], ARGV[2]) end
            elseif kind == 'none' then
                redis.call('HSET', KEYS[1], 'failures', '0', 'pending', '0')
                redis.call('EXPIRE', KEYS[1], ARGV[2])
            elseif kind ~= 'hash' then
                return redis.error_reply('invalid login counter type')
            end
            local failures = tonumber(redis.call('HGET', KEYS[1], 'failures'))
            local pending = tonumber(redis.call('HGET', KEYS[1], 'pending'))
            if not failures or not pending or failures < 0 or pending < 0 then
                return redis.error_reply('invalid login counter')
            end
            if redis.call('TTL', KEYS[1]) == -1 then redis.call('EXPIRE', KEYS[1], ARGV[2]) end
            if failures + pending >= tonumber(ARGV[1]) then return 0 end
            redis.call('HSET', KEYS[1], 'attempt:' .. ARGV[3], '1')
            redis.call('HINCRBY', KEYS[1], 'pending', 1)
            return 1
            """, Long.class);
    private static final DefaultRedisScript<Long> FINISH_LOGIN = new DefaultRedisScript<>("""
            if redis.call('HDEL', KEYS[1], 'attempt:' .. ARGV[1]) == 0 then return 0 end
            redis.call('HINCRBY', KEYS[1], 'pending', -1)
            if ARGV[2] == '1' then redis.call('HSET', KEYS[1], 'failures', '0')
            else redis.call('HINCRBY', KEYS[1], 'failures', 1) end
            return 1
            """, Long.class);

    private final StringRedisTemplate redis;
    private final AuthProperties props;
    private final JwtService jwtService;

    /** Atomically reserves capacity for an in-flight login; null means the account is limited. */
    public String reserveLogin(String email, int limit) {
        String attempt = UUID.randomUUID().toString();
        Long result = redis.execute(RESERVE_LOGIN, List.of("ratelimit:login_acct:" + email),
                Integer.toString(limit), Integer.toString(props.rateLimitWindowSeconds()), attempt);
        if (result == null) throw new IllegalStateException("Login limiter unavailable");
        return result == 1L ? attempt : null;
    }

    /** A success clears failures but preserves other in-flight reservations. */
    public void finishLogin(String email, String attempt, boolean success) {
        Long result = redis.execute(FINISH_LOGIN, List.of("ratelimit:login_acct:" + email), attempt, success ? "1" : "0");
        if (result == null) throw new IllegalStateException("Login limiter unavailable");
    }

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
        Long stored = redis.execute(ISSUE_OTP, List.of(key), digest(purpose, email, code), Integer.toString(props.otpTtlSeconds()));
        if (!Long.valueOf(1L).equals(stored)) throw new IllegalStateException("OTP storage unavailable");
        return Optional.of(code);
    }

    /**
     * Đúng mã: true và mã bị xoá ngay (dùng một lần). Sai mã: tăng bộ đếm; chạm otpMaxAttempts thì xoá mã.
     * So hash, đếm sai và xoá key trong một script Redis: chỉ một request đúng có thể thắng,
     * và mã cũ không thể xoá mã mới vừa được cấp.
     */
    public boolean verify(Purpose purpose, String email, String code) {
        if (code == null || !code.matches("\\d{6}")) {
            return false;
        }
        Long result = redis.execute(VERIFY_OTP, List.of(otpKey(purpose, email)),
                digest(purpose, email, code), Integer.toString(props.otpMaxAttempts()));
        return Long.valueOf(1L).equals(result);
    }

    /** Đếm một lượt trong cửa sổ rateLimitWindowSeconds. true = đã vượt {@code limit}. */
    public boolean hitRateLimit(String bucket, String key, int limit) {
        String counter = "ratelimit:" + bucket + ":" + key;
        Long count = redis.execute(INCREMENT_LIMIT, List.of(counter), Integer.toString(props.rateLimitWindowSeconds()));
        if (count == null) throw new IllegalStateException("Rate limit counter unavailable");
        return count > limit;
    }

    /** Chỉ đọc bộ đếm (không tăng): true = đã chạm {@code limit} trong cửa sổ hiện tại. */
    public boolean isRateLimited(String bucket, String key, int limit) {
        String value = redis.execute(READ_LIMIT, List.of("ratelimit:" + bucket + ":" + key),
                Integer.toString(props.rateLimitWindowSeconds()));
        if (value == null) {
            return false;
        }
        try {
            return Long.parseLong(value) >= limit;
        } catch (NumberFormatException e) {
            throw new IllegalStateException("Invalid rate limit counter", e);
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
