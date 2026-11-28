package com.vsos.backend.service.auth;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class MfaTotpTest {
    @Test void rfc6238Sha1VectorAndReplayCheck() {
        byte[] secret = "12345678901234567890".getBytes(StandardCharsets.US_ASCII);
        assertThat(MfaService.totp(secret, 1)).isEqualTo("287082");
        long step = 1;
        String code = MfaService.totp(secret, step);
        assertThat(MfaService.matchingStep(secret, code, step - 1, step)).isEqualTo(step);
        assertThat(MfaService.matchingStep(secret, code, step, step)).isEqualTo(-1);
        assertThat(MfaService.matchingStep(secret, "invalid", -1, step)).isEqualTo(-1);
    }
}
