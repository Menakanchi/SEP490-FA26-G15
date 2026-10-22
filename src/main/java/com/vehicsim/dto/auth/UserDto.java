package com.vehicsim.dto.auth;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.vehicsim.entity.User;
import com.vehicsim.entity.enums.Gender;
import com.vehicsim.entity.enums.RoleCode;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserDto {
    private Long id;
    private String email;
    /** Mã role: ADMIN / MANAGER / ENGINEER / REVIEWER / EXPERIENCER */
    private RoleCode role;

    @JsonProperty("is_active")
    private Boolean isActive;

    @JsonProperty("last_name")
    private String lastName;

    @JsonProperty("middle_name")
    private String middleName;

    @JsonProperty("first_name")
    private String firstName;

    /** Họ + tên ghép — frontend ApiUser.full_name đọc trường này. */
    @JsonProperty("full_name")
    private String fullName;

    @JsonProperty("date_of_birth")
    private LocalDate dateOfBirth;

    private Gender gender;

    @JsonProperty("phone_number")
    private String phoneNumber;

    private String address;
    private String bio;

    @JsonProperty("avatar_url")
    private String avatarUrl;

    @JsonProperty("last_login_at")
    private LocalDateTime lastLoginAt;

    @JsonProperty("created_date")
    private LocalDateTime createdDate;

    public static UserDto fromEntity(User user) {
        if (user == null) return null;
        return UserDto.builder()
                .id(user.getId())
                .email(user.getEmail())
                .role(user.getRole() != null ? user.getRole().getCode() : null)
                .isActive(user.getIsActive())
                .lastName(user.getLastName())
                .middleName(user.getMiddleName())
                .firstName(user.getFirstName())
                .fullName(user.getFullName())
                .dateOfBirth(user.getDateOfBirth())
                .gender(user.getGender())
                .phoneNumber(user.getPhoneNumber())
                .address(user.getAddress())
                .bio(user.getBio())
                .avatarUrl(user.getAvatarUrl())
                .lastLoginAt(user.getLastLoginAt())
                .createdDate(user.getCreatedDate())
                .build();
    }
}

