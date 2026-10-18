package com.vehicsim.service;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** BCrypt chỉ dùng 72 byte đầu của mật khẩu — dài hơn thì bị chặn thay vì âm thầm cắt. */
class AuthPasswordRuleTest {

    @Test
    void passwordUpToSeventyTwoBytesIsAccepted() {
        assertThatCode(() -> AuthService.requirePasswordFitsBcrypt("a".repeat(72))).doesNotThrowAnyException();
        // 'é' chiếm 2 byte trong UTF-8: 36 ký tự = 72 byte
        assertThatCode(() -> AuthService.requirePasswordFitsBcrypt("é".repeat(36))).doesNotThrowAnyException();
    }

    @Test
    void longerThanSeventyTwoBytesIsRejectedEvenWhenTheCharacterCountIsSmall() {
        assertThatThrownBy(() -> AuthService.requirePasswordFitsBcrypt("a".repeat(73)))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode()).isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(e.getReason()).contains("72 byte");
                });
        // 37 ký tự nhưng 74 byte
        assertThatThrownBy(() -> AuthService.requirePasswordFitsBcrypt("é".repeat(37)))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void nullIsLeftToBeanValidation() {
        assertThatCode(() -> AuthService.requirePasswordFitsBcrypt(null)).doesNotThrowAnyException();
    }
}
