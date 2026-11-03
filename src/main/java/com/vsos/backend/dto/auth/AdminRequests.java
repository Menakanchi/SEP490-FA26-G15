package com.vsos.backend.dto.auth;

import com.fasterxml.jackson.databind.PropertyNamingStrategies;
import com.fasterxml.jackson.databind.annotation.JsonNaming;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.entity.enums.TechRefType;
import jakarta.validation.constraints.*;
import java.math.BigDecimal;

/** Admin write contracts; full updates, never bind persistence entities from HTTP. */
public final class AdminRequests {
    private AdminRequests() {}

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record UserRequest(
            @NotBlank(message="Thông tin bắt buộc không được để trống") @Email(message="Email không đúng định dạng") @Size(message="Thông tin vượt quá độ dài cho phép", max=255) String email,
            @NotBlank(message="Thông tin bắt buộc không được để trống") @Size(message="Thông tin vượt quá độ dài cho phép", max=80) String lastName,
            @Size(message="Thông tin vượt quá độ dài cho phép", max=80) String middleName,
            @NotBlank(message="Thông tin bắt buộc không được để trống") @Size(message="Thông tin vượt quá độ dài cho phép", max=80) String firstName,
            @NotNull(message="Thiếu thông tin bắt buộc") RoleCode role,
            @NotNull(message="Thiếu thông tin bắt buộc") Boolean isActive,
            @Size(message="Thông tin vượt quá độ dài cho phép", max=72) String password) {
        @Override public String toString() { return "UserRequest[redacted]"; }
    }

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record WorkspaceRequest(
            @NotBlank(message="Thông tin bắt buộc không được để trống") @Size(message="Thông tin vượt quá độ dài cho phép", max=150) String name,
            @Size(message="Thông tin vượt quá độ dài cho phép", max=10000) String description,
            @NotNull(message="Thiếu thông tin bắt buộc") @Positive(message="ID phải lớn hơn 0") Long managerId) {}

    @JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
    public record ReferenceRequest(
            @NotBlank(message="Thông tin bắt buộc không được để trống") @Size(message="Thông tin vượt quá độ dài cho phép", max=100) String refCode,
            @NotNull(message="Thiếu thông tin bắt buộc") TechRefType refType,
            @NotBlank(message="Thông tin bắt buộc không được để trống") @Size(message="Thông tin vượt quá độ dài cho phép", max=255) String refName,
            @Digits(integer=18, fraction=12, message="Giá trị số tối đa 18 chữ số nguyên và 12 chữ số thập phân") BigDecimal refValue,
            @Size(message="Thông tin vượt quá độ dài cho phép", max=30) String unit,
            @Size(message="Thông tin vượt quá độ dài cho phép", max=10000) String description,
            @Size(message="Thông tin vượt quá độ dài cho phép", max=50) String sourceType,
            @Size(message="Thông tin vượt quá độ dài cho phép", max=500) String sourceTitle,
            @Size(message="Thông tin vượt quá độ dài cho phép", max=255) String author,
            @Size(message="Thông tin vượt quá độ dài cho phép", max=255) String organization,
            @Min(1) @Max(9999) Integer publicationYear,
            @Size(message="Thông tin vượt quá độ dài cho phép", max=50) String page,
            @Size(message="Thông tin vượt quá độ dài cho phép", max=1024) String url,
            @Size(message="Thông tin vượt quá độ dài cho phép", max=255) String doi,
            @NotNull(message="Thiếu thông tin bắt buộc") Boolean isActive) {}
}