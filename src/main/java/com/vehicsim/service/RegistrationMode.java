package com.vehicsim.service;

import java.util.Locale;

/**
 * Cách tự đăng ký (TD-35).
 * <ul>
 *   <li>{@link #ONE_STEP}: {@code POST /auth/register} tạo tài khoản và đăng nhập luôn, không xác minh email. Dùng cho dev
 *       (chưa cần SMTP) — nhưng ai cũng tạo được tài khoản bằng email không phải của mình và dò được email nào đã có.</li>
 *   <li>{@link #OTP}: email → mã 6 số → tài khoản. Chỉ người thật sự nhận được thư mới vào được; route một bước bị đóng.
 *       Cần SMTP.</li>
 * </ul>
 * Cấu hình {@code REGISTRATION_MODE}: {@code auto} (mặc định: production → OTP, còn lại → một bước), {@code one_step},
 * {@code otp}.
 */
public enum RegistrationMode {
    ONE_STEP, OTP;

    public static RegistrationMode resolve(String configured, String appEnv) {
        String value = configured == null ? "auto" : configured.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "", "auto" -> "production".equalsIgnoreCase(appEnv) ? OTP : ONE_STEP;
            case "one_step", "one-step" -> ONE_STEP;
            case "otp" -> OTP;
            default -> throw new IllegalStateException("REGISTRATION_MODE không hợp lệ: '" + configured + "' (auto | one_step | otp)");
        };
    }

    /** Giá trị trả cho frontend ({@code GET /auth/register/mode}). */
    public String wire() {
        return this == OTP ? "otp" : "one_step";
    }
}
