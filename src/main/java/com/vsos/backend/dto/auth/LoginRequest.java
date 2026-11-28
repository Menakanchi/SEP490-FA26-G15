package com.vsos.backend.dto.auth;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class LoginRequest {

    @NotBlank(message = "Email không được để trống")
    @Email(message = "Email không hợp lệ")
    private String email;

    @NotBlank(message = "Mật khẩu không được để trống")
    @Size(max = 128, message = "Mật khẩu tối đa 128 ký tự")
    private String password;

    @com.fasterxml.jackson.annotation.JsonProperty("mfa_code")
    @Size(max = 64, message = "Mã xác thực quá dài")
    private String mfaCode;
}
