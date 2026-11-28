package com.vsos.backend.service.auth;

import com.vsos.backend.config.AuthProperties;
import com.vsos.backend.dto.auth.LoginRequest;
import com.vsos.backend.entity.user.Role;
import com.vsos.backend.entity.user.User;
import com.vsos.backend.entity.enums.RoleCode;
import com.vsos.backend.repository.user.RoleRepository;
import com.vsos.backend.repository.user.UserRepository;
import com.vsos.backend.security.JwtService;
import com.vsos.backend.security.LegacyAwarePasswordEncoder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.http.HttpStatus;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.Optional;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import com.vsos.backend.service.common.MailService;

/**
 * Luật cứng 7 (AGENTS.md): không lộ email có tồn tại hay không, trừ bước xin mã đăng ký (ADR-070); mã OTP chỉ lưu dạng hash và dùng một lần (TD-33).
 * Service thật, kho dữ liệu / Redis giả.
 */
class AuthPrivacyTest {

    private static final String SECRET = "404E635266556A586E3272357538782F413F4428472B4B6250645367566B5970";
    private static final AuthProperties PROPS = new AuthProperties(60, 600, 5, 60, 5, 10, 20, 10, 900, "otp", "");

    private UserRepository users;
    private OtpService otpService;
    private MailService mail;
    private LegacyAwarePasswordEncoder encoder;
    private AuthService auth;

    @BeforeEach
    void setUp() {
        users = mock(UserRepository.class);
        otpService = mock(OtpService.class);
        mail = mock(MailService.class);
        encoder = mock(LegacyAwarePasswordEncoder.class);
        when(encoder.dummyHash()).thenReturn("dummy");
        when(otpService.issue(any(), anyString())).thenReturn(Optional.of("123456"));
        when(otpService.reserveLogin(anyString(), org.mockito.ArgumentMatchers.anyInt())).thenReturn("attempt");
        auth = new AuthService(users, mock(RoleRepository.class), encoder, mock(JwtService.class), otpService, mail, PROPS, mock(MfaService.class), mock(jakarta.persistence.EntityManager.class));
        ReflectionTestUtils.setField(auth, "appEnv", "development");
    }

    private static User account(String email) {
        return User.builder().id(1L).email(email).passwordHash("stored").isActive(true)
                .role(Role.builder().code(RoleCode.EXPERIENCER).name("x").build()).lastName("A").firstName("B").build();
    }

    @Test
    void registrationCodeIsNotSentToAnEmailThatAlreadyHasAnAccount() {
        when(users.existsByEmail("taken@example.com")).thenReturn(true);
        // ADR-070: báo thẳng 409 thay vì giả như đã gửi mã.
        assertThatThrownBy(() -> auth.requestRegistration("taken@example.com", "1.1.1.1"))
                .isInstanceOfSatisfying(ResponseStatusException.class, e -> {
                    assertThat(e.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
                    assertThat(e.getReason()).isEqualTo(AuthService.EMAIL_TAKEN);
                });
        verify(otpService, never()).issue(any(), any());
        verify(mail, never()).sendOtp(any(), any(), any());
    }

    @Test
    void registrationCodeIsSentToANewEmail() {
        when(users.existsByEmail("new@example.com")).thenReturn(false);
        auth.requestRegistration("new@example.com", "1.1.1.1");
        verify(mail).sendOtp("new@example.com", "123456", OtpService.Purpose.REGISTER);
    }

    @Test
    void passwordResetCodeIsNotSentToAnUnknownOrDisabledAccount() {
        when(users.findByEmail("ghost@example.com")).thenReturn(Optional.empty());
        User disabled = account("off@example.com");
        disabled.setIsActive(false);
        when(users.findByEmail("off@example.com")).thenReturn(Optional.of(disabled));

        auth.requestPasswordReset("ghost@example.com", "1.1.1.1");
        auth.requestPasswordReset("off@example.com", "1.1.1.1");
        verify(otpService, never()).issue(any(), any());
        verify(mail, never()).sendOtp(any(), any(), any());
    }

    @Test
    void wrongPasswordAndUnknownEmailGiveTheSameError() {
        when(users.findLockedByEmail("real@example.com")).thenReturn(Optional.of(account("real@example.com")));
        when(users.findLockedByEmail("ghost@example.com")).thenReturn(Optional.empty());
        when(encoder.matches(any(), eq("stored"))).thenReturn(false);

        ResponseStatusException wrongPassword = login("real@example.com");
        ResponseStatusException unknownEmail = login("ghost@example.com");

        assertThat(unknownEmail.getStatusCode()).isEqualTo(wrongPassword.getStatusCode());
        assertThat(unknownEmail.getReason()).isEqualTo(wrongPassword.getReason());
        // Email lạ vẫn tốn đủ một lần băm, để độ trễ không tiết lộ tài khoản có tồn tại.
        verify(encoder).matches(any(), eq("dummy"));
    }

    @Test
    void passwordChangeRejectsAUserVersionThatChangedAfterAuthentication() {
        User account = account("real@example.com");
        account.setAuthVersion(1L);
        when(users.findLockedByEmail("real@example.com")).thenReturn(Optional.of(account));
        assertThatThrownBy(() -> auth.changePassword("real@example.com", "old", "new-password", 0))
                .isInstanceOfSatisfying(ResponseStatusException.class,
                        e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.UNAUTHORIZED));
        verify(users, never()).save(any());
    }

    private ResponseStatusException login(String email) {
        LoginRequest request = new LoginRequest();
        request.setEmail(email);
        request.setPassword("not-the-password");
        return org.junit.jupiter.api.Assertions.assertThrows(ResponseStatusException.class, () -> auth.login(request, "1.1.1.1"));
    }

    // ---- OtpService: lưu hash, gắn với mục đích, một lần

    private JwtService realJwt() {
        JwtService jwt = new JwtService(PROPS, mock(com.vsos.backend.security.TokenRevocationStore.class));
        ReflectionTestUtils.setField(jwt, "secretKey", SECRET);
        ReflectionTestUtils.setField(jwt, "appEnv", "development");
        return jwt;
    }

    @SuppressWarnings("unchecked")
    private static StringRedisTemplate redisWith(HashOperations<String, Object, Object> hash, ValueOperations<String, String> value) {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        when(redis.opsForHash()).thenReturn((HashOperations) hash);
        when(redis.opsForValue()).thenReturn(value);
        return redis;
    }

    @SuppressWarnings("unchecked")
    @Test
    void otpIsStoredOnlyAsAPurposeBoundHash() {
        HashOperations<String, Object, Object> hash = mock(HashOperations.class);
        ValueOperations<String, String> value = mock(ValueOperations.class);
        when(value.setIfAbsent(anyString(), anyString(), any(java.time.Duration.class))).thenReturn(true);
        StringRedisTemplate redis = redisWith(hash, value);
        when(redis.execute(any(RedisScript.class), any(List.class), any(Object[].class))).thenReturn(1L);
        OtpService otp = new OtpService(redis, PROPS, realJwt());

        String registerCode = otp.issue(OtpService.Purpose.REGISTER, "a@b.c").orElseThrow();
        ArgumentCaptor<String> stored = ArgumentCaptor.forClass(String.class);
        verify(redis).execute(any(RedisScript.class), eq(List.of("otp:register:a@b.c")), stored.capture(), eq("600"));
        String registerHash = stored.getValue();

        assertThat(registerCode).matches("\\d{6}");
        assertThat(registerHash).hasSize(64).isEqualTo(realJwt().keyedDigest("otp:register:a@b.c:" + registerCode, 64));

        String resetCode = otp.issue(OtpService.Purpose.RESET, "a@b.c").orElseThrow();
        ArgumentCaptor<String> storedReset = ArgumentCaptor.forClass(String.class);
        verify(redis).execute(any(RedisScript.class), eq(List.of("otp:reset:a@b.c")), storedReset.capture(), eq("600"));
        // Cùng email, hai mục đích: hash khác nhau, nên mã đăng ký không đặt lại được mật khẩu.
        // (Hai mã sinh ngẫu nhiên có thể trùng 1/10^6; so hash của CÙNG một mã mới là phép thử đúng.)
        JwtService jwt = realJwt();
        assertThat(jwt.keyedDigest("otp:register:a@b.c:" + registerCode, 64))
                .isNotEqualTo(jwt.keyedDigest("otp:reset:a@b.c:" + registerCode, 64));
        assertThat(storedReset.getValue()).isEqualTo(jwt.keyedDigest("otp:reset:a@b.c:" + resetCode, 64));
    }

    @SuppressWarnings("unchecked")
    @Test
    void otpWorksOnceAndOnlyWithTheRightCode() {
        HashOperations<String, Object, Object> hash = mock(HashOperations.class);
        ValueOperations<String, String> value = mock(ValueOperations.class);
        StringRedisTemplate redis = redisWith(hash, value);
        when(value.setIfAbsent(anyString(), anyString(), any(java.time.Duration.class))).thenReturn(true);
        when(redis.execute(any(RedisScript.class), any(List.class), any(Object[].class)))
                .thenReturn(1L, 0L, 0L, 1L, 0L);
        OtpService otp = new OtpService(redis, PROPS, realJwt());

        String code = otp.issue(OtpService.Purpose.REGISTER, "a@b.c").orElseThrow();

        String wrong = code.equals("000000") ? "111111" : "000000";
        assertThat(otp.verify(OtpService.Purpose.REGISTER, "a@b.c", wrong)).isFalse();
        assertThat(otp.verify(OtpService.Purpose.RESET, "a@b.c", code)).as("mã đăng ký không dùng cho đặt lại mật khẩu").isFalse();
        assertThat(otp.verify(OtpService.Purpose.REGISTER, "a@b.c", code)).isTrue();
        assertThat(otp.verify(OtpService.Purpose.REGISTER, "a@b.c", code)).as("dùng một lần").isFalse();
    }

    @Test
    void malformedCodesAreRejectedWithoutTouchingRedisCounters() {
        StringRedisTemplate redis = mock(StringRedisTemplate.class);
        @SuppressWarnings("unchecked")
        HashOperations<String, Object, Object> hash = mock(HashOperations.class);
        when(redis.opsForHash()).thenAnswer(i -> hash);
        when(hash.get(anyString(), eq("h"))).thenReturn("anything");
        OtpService otp = new OtpService(redis, PROPS, realJwt());
        assertThat(otp.verify(OtpService.Purpose.REGISTER, "a@b.c", "12345")).isFalse();
        assertThat(otp.verify(OtpService.Purpose.REGISTER, "a@b.c", "abcdef")).isFalse();
        verify(hash, never()).increment(anyString(), any(), org.mockito.ArgumentMatchers.anyLong());
    }

    @Test
    void unavailableRateLimitResultDoesNotPermitTheRequest() {
        OtpService otp = new OtpService(mock(StringRedisTemplate.class), PROPS, realJwt());
        assertThatThrownBy(() -> otp.hitRateLimit("login_ip", "127.0.0.1", 10))
                .isInstanceOf(IllegalStateException.class);
    }
}
