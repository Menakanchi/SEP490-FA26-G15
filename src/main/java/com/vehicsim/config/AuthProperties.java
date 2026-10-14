package com.vehicsim.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Cấu hình xác thực (prefix {@code app.auth}); mặc định khớp backend Python cũ. */
@ConfigurationProperties(prefix = "app.auth")
public record AuthProperties(
        int accessTokenTtlMinutes,
        int otpTtlSeconds,
        int otpMaxAttempts,
        int otpResendCooldownSeconds,
        int otpRequestsPerIp,
        int loginAttemptsPerIp,
        int rateLimitWindowSeconds,
        String smtpFromEmail
) {
}
