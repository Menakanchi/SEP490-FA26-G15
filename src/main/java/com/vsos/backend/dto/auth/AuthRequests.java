package com.vsos.backend.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body của các route xác thực dùng JSON snake_case, giữ nguyên hợp đồng với frontend
 * ({@code frontend/src/services/api.ts}). Trần 72 ký tự (và 72 byte, kiểm ở AuthService) vì BCrypt chỉ dùng 72 byte đầu; cũng chặn DoS qua hash chuỗi dài.
 */
public final class AuthRequests {

    private AuthRequests() {
    }

    public static final String PASSWORD_RULE = "Mật khẩu phải từ 8 đến 72 ký tự";
    public static final String OTP_RULE = "Mã xác minh gồm đúng 6 chữ số";

    public record EmailRequest(
            @NotBlank(message = "Email không được để trống")
            @Email(message = "Email không đúng định dạng")
            String email) {
    }

    public record RegisterVerifyRequest(
            @NotBlank(message = "Email không được để trống")
            @Email(message = "Email không đúng định dạng")
            String email,
            @Pattern(regexp = "\\d{6}", message = OTP_RULE)
            String code,
            @JsonProperty("full_name")
            @NotBlank(message = "Họ và tên không được để trống")
            @Size(max = 150, message = "Họ và tên tối đa 150 ký tự")
            String fullName,
            @Size(min = 8, max = 72, message = PASSWORD_RULE)
            String password) {
    }

    public record PasswordResetRequest(
            @NotBlank(message = "Email không được để trống")
            @Email(message = "Email không đúng định dạng")
            String email,
            @Pattern(regexp = "\\d{6}", message = OTP_RULE)
            String code,
            @JsonProperty("new_password")
            @Size(min = 8, max = 72, message = PASSWORD_RULE)
            String newPassword) {
    }

    public record PasswordChangeRequest(
            @JsonProperty("old_password")
            @NotBlank(message = "Mật khẩu hiện tại không được để trống")
            @Size(max = 128, message = "Mật khẩu tối đa 128 ký tự")
            String oldPassword,
            @JsonProperty("new_password")
            @Size(min = 8, max = 72, message = PASSWORD_RULE)
            String newPassword) {
    }

    public record ProfileUpdateRequest(
            @JsonProperty("full_name")
            @NotBlank(message = "Họ và tên không được để trống")
            @Size(max = 150, message = "Họ và tên tối đa 150 ký tự")
            String fullName) {
    }
}
