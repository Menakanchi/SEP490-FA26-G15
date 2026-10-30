package com.vsos.backend.dto.auth;

import com.vsos.backend.entity.enums.Gender;
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
    @Size(max = 255, message = "Email tối đa 255 ký tự")
    private String email;

    @NotBlank(message = "Mật khẩu không được để trống")
    @Size(min = 8, max = 72, message = AuthRequests.PASSWORD_RULE)
    private String password;

    @NotBlank(message = "Họ không được để trống")
    @Size(max = 80, message = "Họ tối đa 80 ký tự")
    private String lastName;

    @Size(max = 80, message = "Tên đệm tối đa 80 ký tự")
    private String middleName;

    @NotBlank(message = "Tên không được để trống")
    @Size(max = 80, message = "Tên tối đa 80 ký tự")
    private String firstName;

    private LocalDate dateOfBirth;

    private Gender gender;

    @Size(max = 30, message = "Số điện thoại tối đa 30 ký tự")
    private String phoneNumber;

    @Size(max = 500, message = "Địa chỉ tối đa 500 ký tự")
    private String address;

    @Size(max = 5000, message = "Giới thiệu tối đa 5000 ký tự")
    private String bio;
}
