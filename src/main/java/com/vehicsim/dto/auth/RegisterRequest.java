package com.vehicsim.dto.auth;

import com.vehicsim.entity.enums.Gender;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.*;

import java.time.LocalDate;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class RegisterRequest {

    @NotBlank(message = "Email không được để trống")
    @Email(message = "Email không đúng định dạng")
    private String email;

    @NotBlank(message = "Mật khẩu không được để trống")
    @Size(min = 8, max = 128, message = AuthRequests.PASSWORD_RULE)
    private String password;

    @NotBlank(message = "Họ không được để trống")
    private String lastName;

    private String middleName;

    @NotBlank(message = "Tên không được để trống")
    private String firstName;

    private LocalDate dateOfBirth;

    private Gender gender;

    private String phoneNumber;

    private String address;

    private String bio;
}
