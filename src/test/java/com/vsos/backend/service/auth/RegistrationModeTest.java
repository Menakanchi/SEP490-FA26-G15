package com.vsos.backend.service.auth;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** TD-35: production mặc định đăng ký bằng OTP (xác minh email); dev mặc định một bước. */
class RegistrationModeTest {

    @Test
    void autoPicksOtpInProductionAndOneStepElsewhere() {
        assertThat(RegistrationMode.resolve("auto", "production")).isEqualTo(RegistrationMode.OTP);
        assertThat(RegistrationMode.resolve("auto", "PRODUCTION")).isEqualTo(RegistrationMode.OTP);
        assertThat(RegistrationMode.resolve("auto", "development")).isEqualTo(RegistrationMode.ONE_STEP);
        assertThat(RegistrationMode.resolve("", "development")).isEqualTo(RegistrationMode.ONE_STEP);
        assertThat(RegistrationMode.resolve(null, "production")).isEqualTo(RegistrationMode.OTP);
    }

    @Test
    void explicitSettingWinsOverTheEnvironment() {
        assertThat(RegistrationMode.resolve("otp", "development")).isEqualTo(RegistrationMode.OTP);
        assertThat(RegistrationMode.resolve("one_step", "production")).isEqualTo(RegistrationMode.ONE_STEP);
        assertThat(RegistrationMode.resolve(" One-Step ", "production")).isEqualTo(RegistrationMode.ONE_STEP);
    }

    @Test
    void unknownValueFailsFastInsteadOfSilentlyOpeningRegistration() {
        assertThatThrownBy(() -> RegistrationMode.resolve("both", "production"))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("REGISTRATION_MODE");
    }

    @Test
    void wireValuesAreWhatTheFrontendExpects() {
        assertThat(RegistrationMode.OTP.wire()).isEqualTo("otp");
        assertThat(RegistrationMode.ONE_STEP.wire()).isEqualTo("one_step");
    }
}
