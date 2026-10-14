package com.vehicsim.security;

import com.vehicsim.config.AuthProperties;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.SecretKey;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.util.Date;
import java.util.HexFormat;
import java.util.function.Function;

/**
 * JWT đăng nhập, stateless. Token mang {@code pwv} — dấu vân tay ngắn của password_hash lúc cấp.
 * Đổi / đặt lại mật khẩu làm hash đổi, nên mọi token cũ không còn khớp và bị từ chối
 * (không cần bảng thu hồi). Cùng cách với backend Python.
 */
@Service
@RequiredArgsConstructor
public class JwtService {

    private static final String DEFAULT_DEV_SECRET = "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";
    private static final String CLAIM_PWV = "pwv";

    private final AuthProperties authProperties;

    @Value("${jwt.secret:" + DEFAULT_DEV_SECRET + "}")
    private String secretKey;

    @Value("${app.env:development}")
    private String appEnv;

    @PostConstruct
    void refuseDefaultSecretInProduction() {
        if ("production".equalsIgnoreCase(appEnv) && DEFAULT_DEV_SECRET.equals(secretKey)) {
            throw new IllegalStateException("JWT_SECRET chưa được cấu hình — bắt buộc ở production");
        }
    }

    /** Thời hạn token, tính bằng giây (đưa thẳng vào {@code expires_in}). */
    public long expiresInSeconds() {
        return authProperties.accessTokenTtlMinutes() * 60L;
    }

    public String extractUsername(String token) {
        return extractClaim(token, Claims::getSubject);
    }

    public <T> T extractClaim(String token, Function<Claims, T> claimsResolver) {
        return claimsResolver.apply(extractAllClaims(token));
    }

    public String generateToken(UserDetails userDetails) {
        long now = System.currentTimeMillis();
        return Jwts.builder()
                .subject(userDetails.getUsername())
                .claim("type", "access")
                .claim(CLAIM_PWV, passwordFingerprint(userDetails.getPassword()))
                .issuedAt(new Date(now))
                .expiration(new Date(now + expiresInSeconds() * 1000))
                .signWith(getSignInKey())
                .compact();
    }

    /** Hợp lệ khi: đúng người, chưa hết hạn, tài khoản còn hoạt động và mật khẩu chưa đổi sau khi cấp token. */
    public boolean isTokenValid(String token, UserDetails userDetails) {
        Claims claims = extractAllClaims(token);
        if (!"access".equals(claims.get("type", String.class))) {
            return false;
        }
        String pwv = claims.get(CLAIM_PWV, String.class);
        return userDetails.isEnabled()
                && claims.getSubject().equals(userDetails.getUsername())
                && claims.getExpiration().after(new Date())
                && pwv != null
                && MessageDigest.isEqual(
                        pwv.getBytes(StandardCharsets.UTF_8),
                        passwordFingerprint(userDetails.getPassword()).getBytes(StandardCharsets.UTF_8));
    }

    /** HMAC-SHA256 bằng khoá bí mật của server, cắt còn {@code length} ký tự hex. */
    public String keyedDigest(String message, int length) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(getSignInKey());
            String hex = HexFormat.of().formatHex(mac.doFinal(message.getBytes(StandardCharsets.UTF_8)));
            return hex.substring(0, Math.min(length, hex.length()));
        } catch (GeneralSecurityException e) {
            throw new IllegalStateException(e);
        }
    }

    private String passwordFingerprint(String passwordHash) {
        return keyedDigest("pwv:" + passwordHash, 16);
    }

    private Claims extractAllClaims(String token) {
        return Jwts.parser()
                .verifyWith(getSignInKey())
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }

    private SecretKey getSignInKey() {
        return Keys.hmacShaKeyFor(Decoders.BASE64.decode(secretKey));
    }
}
