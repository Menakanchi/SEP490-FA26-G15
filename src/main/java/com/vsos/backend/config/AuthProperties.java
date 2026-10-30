package com.vsos.backend.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Cấu hình xác thực (prefix {@code app.auth}); mặc định khớp backend Python cũ. Giới hạn tần suất đếm trong cửa sổ
 * {@code rateLimitWindowSeconds}: đăng nhập theo IP và theo tài khoản (chỉ đếm lần SAI), xin OTP và đăng ký theo IP.
 */
@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(
        int accessTokenTtlMinutes,
        int otpTtlSeconds,
        int otpMaxAttempts,
        int otpResendCooldownSeconds,
        int otpRequestsPerIp,
        int loginAttemptsPerIp,
        int loginAttemptsPerAccount,
        int registerRequestsPerIp,
        int rateLimitWindowSeconds,
        String registrationMode,
        String smtpFromEmail
) {
}
