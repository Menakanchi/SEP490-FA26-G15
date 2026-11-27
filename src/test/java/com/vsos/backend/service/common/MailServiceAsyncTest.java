package com.vsos.backend.service.common;

import com.vsos.backend.service.auth.OtpService;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Async;

import static org.assertj.core.api.Assertions.assertThat;

/** Mail OTP không được xếp hàng sau các lượt mô phỏng (simulationExecutor chỉ 1 luồng khi chạy CARLA). */
class MailServiceAsyncTest {

    @Test
    void otpMailRunsOnItsOwnExecutor() throws Exception {
        Async async = MailService.class.getMethod("sendOtp", String.class, String.class, OtpService.Purpose.class)
                .getAnnotation(Async.class);
        assertThat(async).isNotNull();
        assertThat(async.value()).isEqualTo("mailExecutor");
    }
}
