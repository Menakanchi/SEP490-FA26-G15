package com.vsos.backend.service.auth;

import com.vsos.backend.dto.auth.AuthResponse;
import com.vsos.backend.dto.auth.UserDto;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.repository.user.UserRepository;
import com.vsos.backend.security.CustomUserDetails;
import com.vsos.backend.security.JwtService;
import com.vsos.backend.security.LegacyAwarePasswordEncoder;
import lombok.RequiredArgsConstructor;
import jakarta.persistence.EntityManager;
import jakarta.persistence.LockModeType;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;

/** Optional TOTP with encrypted secrets, one-time recovery codes and replay protection. */
@Service
@RequiredArgsConstructor
public class MfaService {
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final char[] BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567".toCharArray();
    private final JdbcTemplate jdbc;
    private final StringRedisTemplate redis;
    private final UserRepository users;
    private final LegacyAwarePasswordEncoder passwords;
    private final OtpService otp;
    private final JwtService jwt;
    private final EntityManager entityManager;

    @Value("${app.auth.mfa-encryption-key:}")
    private String encryptionKey;

    public record Setup(String secret, String uri) {}
    public record Enabled(AuthResponse session, List<String> recoveryCodes) {}

    public boolean enabled(long userId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM auth_mfa WHERE user_id = ?", Integer.class, userId);
        if (count == null) throw new IllegalStateException("MFA lookup unavailable");
        return count > 0;
    }

    @Transactional
    public Setup setup(String email, long expectedVersion, String password) {
        User user = lockedUser(email, expectedVersion);
        requirePassword(user, password);
        if (enabled(user.getId())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Xác thực hai bước đã được bật.");
        byte[] secret = new byte[20];
        RANDOM.nextBytes(secret);
        String encrypted = encrypt(user.getId(), secret);
        redis.opsForValue().set(pendingKey(user.getId()), encrypted, Duration.ofMinutes(5));
        String encoded = base32(secret);
        String label = URLEncoder.encode("VehicSim:" + user.getEmail(), StandardCharsets.UTF_8).replace("+", "%20");
        return new Setup(encoded, "otpauth://totp/" + label + "?secret=" + encoded + "&issuer=VehicSim&algorithm=SHA1&digits=6&period=30");
    }

    @Transactional
    public Enabled enable(String email, long expectedVersion, String password, String code) {
        User user = lockedUser(email, expectedVersion);
        requirePassword(user, password);
        if (enabled(user.getId())) throw new ResponseStatusException(HttpStatus.CONFLICT, "Xác thực hai bước đã được bật.");
        String encrypted = redis.opsForValue().get(pendingKey(user.getId()));
        if (encrypted == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thiết lập đã hết hạn. Hãy bắt đầu lại.");
        long step = matchingStep(decrypt(user.getId(), encrypted), code, -1);
        if (step < 0) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mã xác thực không đúng. Hãy thử lại.");
        jdbc.update("INSERT INTO auth_mfa (user_id, encrypted_secret, last_step) VALUES (?, ?, ?)", user.getId(), encrypted, step);
        List<String> recoveryCodes = createRecoveryCodes(user.getId());
        redis.delete(pendingKey(user.getId()));
        return new Enabled(renew(user), recoveryCodes);
    }

    private List<String> createRecoveryCodes(long userId) {
        List<String> recoveryCodes = new ArrayList<>();
        for (int i = 0; i < 10; i++) {
            byte[] random = new byte[16]; RANDOM.nextBytes(random);
            String recovery = HexFormat.of().formatHex(random);
            recoveryCodes.add(recovery);
            jdbc.update("INSERT INTO auth_mfa_recovery_codes (user_id, code_hash) VALUES (?, ?)", userId, recoveryHash(userId, recovery));
        }
        return List.copyOf(recoveryCodes);
    }

    @Transactional
    public List<String> replaceRecoveryCodes(String email, long expectedVersion, String password, String code) {
        User user = lockedUser(email, expectedVersion);
        requirePassword(user, password);
        if (!enabled(user.getId()) || !consume(user.getId(), code)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mã xác thực hoặc mã khôi phục không hợp lệ.");
        }
        jdbc.update("DELETE FROM auth_mfa_recovery_codes WHERE user_id = ?", user.getId());
        return createRecoveryCodes(user.getId());
    }

    @Transactional
    public AuthResponse disable(String email, long expectedVersion, String password, String code) {
        User user = lockedUser(email, expectedVersion);
        requirePassword(user, password);
        if (!enabled(user.getId()) || !consume(user.getId(), code)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mã xác thực hoặc mã khôi phục không hợp lệ.");
        }
        jdbc.update("DELETE FROM auth_mfa WHERE user_id = ?", user.getId());
        return renew(user);
    }

    /** Caller holds the user row lock and transaction through issuance of the session. */
    public boolean verifyForLogin(long userId, String code) {
        return !enabled(userId) || consume(userId, code);
    }

    private boolean consume(long userId, String code) {
        if (code == null || code.isBlank()) return false;
        String normalized = code.trim().toLowerCase(java.util.Locale.ROOT);
        if (normalized.matches("[0-9a-f]{32}")) {
            return jdbc.update("DELETE FROM auth_mfa_recovery_codes WHERE user_id = ? AND code_hash = ?", userId, recoveryHash(userId, normalized)) == 1;
        }
        var rows = jdbc.queryForList("SELECT encrypted_secret, last_step FROM auth_mfa WHERE user_id = ?", userId);
        if (rows.isEmpty()) return false;
        var row = rows.get(0);
        long lastStep = ((Number) row.get("last_step")).longValue();
        long step = matchingStep(decrypt(userId, (String) row.get("encrypted_secret")), normalized, lastStep);
        return step >= 0 && jdbc.update("UPDATE auth_mfa SET last_step = ? WHERE user_id = ? AND last_step < ?", step, userId, step) == 1;
    }

    private User lockedUser(String email, long expectedVersion) {
        User user = users.findLockedByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Phiên đăng nhập không hợp lệ."));
        entityManager.refresh(user, LockModeType.PESSIMISTIC_WRITE);
        if (Boolean.FALSE.equals(user.getIsActive()) || user.getAuthVersion() != expectedVersion)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Phiên đăng nhập không hợp lệ.");
        return user;
    }

    private void requirePassword(User user, String password) {
        if (otp.hitRateLimit("mfa_manage", Long.toString(user.getId()), 10))
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Quá nhiều yêu cầu. Vui lòng thử lại sau.");
        if (!passwords.matches(password, user.getPasswordHash()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mật khẩu hiện tại không đúng.");
    }

    private AuthResponse renew(User user) {
        user.setAuthVersion(user.getAuthVersion() + 1);
        User saved = users.saveAndFlush(user);
        return AuthResponse.of(jwt.generateToken(new CustomUserDetails(saved)), UserDto.fromEntity(saved), jwt.expiresInSeconds());
    }

    private byte[] key() {
        try {
            byte[] key = Base64.getDecoder().decode(encryptionKey);
            if (key.length == 32) return key;
        } catch (IllegalArgumentException ignored) { }
        throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Máy chủ chưa cấu hình khóa MFA hợp lệ.");
    }

    private String encrypt(long userId, byte[] secret) {
        try {
            byte[] nonce = new byte[12]; RANDOM.nextBytes(nonce);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, nonce));
            cipher.updateAAD(Long.toString(userId).getBytes(StandardCharsets.UTF_8));
            byte[] encrypted = cipher.doFinal(secret);
            return Base64.getEncoder().encodeToString(ByteBuffer.allocate(nonce.length + encrypted.length).put(nonce).put(encrypted).array());
        } catch (GeneralSecurityException e) { throw new IllegalStateException("MFA encryption failed", e); }
    }

    private byte[] decrypt(long userId, String encrypted) {
        try {
            byte[] bytes = Base64.getDecoder().decode(encrypted);
            if (bytes.length < 29) throw new IllegalStateException("Invalid MFA secret");
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key(), "AES"), new GCMParameterSpec(128, bytes, 0, 12));
            cipher.updateAAD(Long.toString(userId).getBytes(StandardCharsets.UTF_8));
            return cipher.doFinal(bytes, 12, bytes.length - 12);
        } catch (GeneralSecurityException | IllegalArgumentException e) { throw new IllegalStateException("MFA decryption failed", e); }
    }

    static long matchingStep(byte[] secret, String code, long lastStep) {
        return matchingStep(secret, code, lastStep, System.currentTimeMillis() / 30_000);
    }

    static long matchingStep(byte[] secret, String code, long lastStep, long now) {
        if (code == null || !code.matches("[0-9]{6}")) return -1;
        for (long step = now - 1; step <= now + 1; step++) {
            if (step > lastStep && MessageDigest.isEqual(totp(secret, step).getBytes(StandardCharsets.US_ASCII), code.getBytes(StandardCharsets.US_ASCII))) return step;
        }
        return -1;
    }

    static String totp(byte[] secret, long step) {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(step).array());
            int offset = hash[hash.length - 1] & 15;
            int value = (ByteBuffer.wrap(hash, offset, 4).getInt() & 0x7fffffff) % 1_000_000;
            return String.format(java.util.Locale.ROOT, "%06d", value);
        } catch (GeneralSecurityException e) { throw new IllegalStateException(e); }
    }

    private static String base32(byte[] input) {
        StringBuilder out = new StringBuilder();
        int buffer = 0, bits = 0;
        for (byte b : input) {
            buffer = (buffer << 8) | (b & 255); bits += 8;
            while (bits >= 5) { bits -= 5; out.append(BASE32[(buffer >> bits) & 31]); }
        }
        if (bits > 0) out.append(BASE32[(buffer << (5 - bits)) & 31]);
        return out.toString();
    }

    private static String recoveryHash(long userId, String code) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest((userId + ":" + code).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException e) { throw new IllegalStateException(e); }
    }
    private static String pendingKey(long userId) { return "mfa:pending:" + userId; }
}
