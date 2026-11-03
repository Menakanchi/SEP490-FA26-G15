package com.vsos.backend.security;

import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.spec.InvalidKeySpecException;
import java.util.HexFormat;

/**
 * Mã hoá mới bằng BCrypt, nhưng vẫn kiểm được hash cũ của backend Python/Forge:
 * {@code <salt hex>:<pbkdf2-sha256 hex>} với 100.000 vòng. Không có lớp này thì mọi tài khoản
 * đã tạo trước khi chuyển sang Java (kể cả admin) không đăng nhập được.
 */
public class LegacyAwarePasswordEncoder implements PasswordEncoder {

    private static final int LEGACY_ITERATIONS = 100_000;
    private static final int LEGACY_KEY_BITS = 256;

    private final BCryptPasswordEncoder bcrypt = new BCryptPasswordEncoder();

    @Override
    public String encode(CharSequence rawPassword) {
        return bcrypt.encode(rawPassword);
    }

    @Override
    public boolean matches(CharSequence rawPassword, String storedHash) {
        if (storedHash == null || storedHash.isEmpty()) {
            return false;
        }
        return isLegacy(storedHash) ? matchesLegacy(rawPassword, storedHash) : bcrypt.matches(rawPassword, storedHash);
    }

    /** Hash cũ nên được băm lại bằng BCrypt sau lần đăng nhập đúng. */
    @Override
    public boolean upgradeEncoding(String storedHash) {
        return isLegacy(storedHash);
    }

    public static boolean isLegacy(String storedHash) {
        return storedHash != null && storedHash.indexOf(':') > 0 && !storedHash.startsWith("$2");
    }

    private static boolean matchesLegacy(CharSequence rawPassword, String storedHash) {
        try {
            String[] parts = storedHash.split(":", 2);
            byte[] salt = HexFormat.of().parseHex(parts[0]);
            byte[] expected = HexFormat.of().parseHex(parts[1]);
            PBEKeySpec spec = new PBEKeySpec(rawPassword.toString().toCharArray(), salt, LEGACY_ITERATIONS, LEGACY_KEY_BITS);
            byte[] actual = SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded();
            return MessageDigest.isEqual(expected, actual);
        } catch (IllegalArgumentException | NoSuchAlgorithmException | InvalidKeySpecException e) {
            return false;
        }
    }

    private final String dummyHash = bcrypt.encode("dummy-password-for-timing");

    /** Hash giả để đăng nhập email lạ tốn thời gian ngang email thật (chống dò email theo độ trễ). */
    public String dummyHash() {
        return dummyHash;
    }
}
