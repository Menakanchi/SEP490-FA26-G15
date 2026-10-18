package com.vehicsim.service;

import com.vehicsim.config.AuthProperties;
import com.vehicsim.dto.auth.LoginRequest;
import com.vehicsim.entity.Role;
import com.vehicsim.entity.User;
import com.vehicsim.entity.enums.RoleCode;
import com.vehicsim.repository.RoleRepository;
import com.vehicsim.repository.UserRepository;
import com.vehicsim.security.JwtService;
import com.vehicsim.security.LegacyAwarePasswordEncoder;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.redis.core.HashOperations;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Luật cứng 7 (AGENTS.md): không lộ email có tồn tại hay không; mã OTP chỉ lưu dạng hash và dùng một lần (TD-33).
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
        auth = new AuthService(users, mock(RoleRepository.class), encoder, mock(JwtService.class), otpService, mail, PROPS);
        ReflectionTestUtils.setField(auth, "appEnv", "development");
    }

    private static User account(String email) {
        return User.builder().id(1L).email(email).passwordHash("stored").isActive(true)
                .role(Role.builder().code(RoleCode.EXPERIENCER).name("x").build()).lastName("A").firstName("B").build();
    }

    @Test
    void registrationCodeIsNotSentToAnEmailThatAlreadyHasAnAccount() {
        when(users.existsByEmail("taken@example.com")).thenReturn(true);
        auth.requestRegistration("taken@example.com", "1.1.1.1"); // không ném lỗi, để phản hồi giống email mới
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
        when(users.findByEmail("real@example.com")).thenReturn(Optional.of(account("real@example.com")));
        when(users.findByEmail("ghost@example.com")).thenReturn(Optional.empty());
        when(encoder.matches(any(), eq("stored"))).thenReturn(false);

        ResponseStatusException wrongPassword = login("real@example.com");
        ResponseStatusException unknownEmail = login("ghost@example.com");

        assertThat(unknownEmail.getStatusCode()).isEqualTo(wrongPassword.getStatusCode());
        assertThat(unknownEmail.getReason()).isEqualTo(wrongPassword.getReason());
        // Email lạ vẫn tốn đủ một lần băm, để độ trễ không tiết lộ tài khoản có tồn tại.
        verify(encoder).matches(any(), eq("dummy"));
    }

    private ResponseStatusException login(String email) {
        LoginRequest request = new LoginRequest();
        request.setEmail(email);
        request.setPassword("not-the-password");
        return org.junit.jupiter.api.Assertions.assertThrows(ResponseStatusException.class, () -> auth.login(request, "1.1.1.1"));
    }

    // ---- OtpService: lưu hash, gắn với mục đích, một lần

    private JwtService realJwt() {
        JwtService jwt = new JwtService(PROPS);
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
        OtpService otp = new OtpService(redisWith(hash, value), PROPS, realJwt());

        String registerCode = otp.issue(OtpService.Purpose.REGISTER, "a@b.c").orElseThrow();
        ArgumentCaptor<Map<Object, Object>> stored = ArgumentCaptor.forClass(Map.class);
        verify(hash).putAll(eq("otp:register:a@b.c"), stored.capture());
        String registerHash = stored.getValue().get("h").toString();

        assertThat(registerCode).matches("\\d{6}");
        assertThat(registerHash).doesNotContain(registerCode).hasSize(64);

        String resetCode = otp.issue(OtpService.Purpose.RESET, "a@b.c").orElseThrow();
        ArgumentCaptor<Map<Object, Object>> storedReset = ArgumentCaptor.forClass(Map.class);
        verify(hash).putAll(eq("otp:reset:a@b.c"), storedReset.capture());
        // Cùng email, hai mục đích: hash khác nhau, nên mã đăng ký không đặt lại được mật khẩu.
        // (Hai mã sinh ngẫu nhiên có thể trùng 1/10^6; so hash của CÙNG một mã mới là phép thử đúng.)
        JwtService jwt = realJwt();
        assertThat(jwt.keyedDigest("otp:register:a@b.c:" + registerCode, 64))
                .isNotEqualTo(jwt.keyedDigest("otp:reset:a@b.c:" + registerCode, 64));
        assertThat(storedReset.getValue().get("h").toString()).doesNotContain(resetCode);
    }

    @SuppressWarnings("unchecked")
    @Test
    void otpWorksOnceAndOnlyWithTheRightCode() {
        HashOperations<String, Object, Object> hash = mock(HashOperations.class);
        ValueOperations<String, String> value = mock(ValueOperations.class);
        StringRedisTemplate redis = redisWith(hash, value);
        when(value.setIfAbsent(anyString(), anyString(), any(java.time.Duration.class))).thenReturn(true);
        OtpService otp = new OtpService(redis, PROPS, realJwt());

        String code = otp.issue(OtpService.Purpose.REGISTER, "a@b.c").orElseThrow();
        ArgumentCaptor<Map<Object, Object>> stored = ArgumentCaptor.forClass(Map.class);
        verify(hash).putAll(eq("otp:register:a@b.c"), stored.capture());
        when(hash.get("otp:register:a@b.c", "h")).thenReturn(stored.getValue().get("h"));
        when(hash.increment(eq("otp:register:a@b.c"), eq("attempts"), eq(1L))).thenReturn(1L);
        when(redis.delete("otp:register:a@b.c")).thenReturn(true, false); // lần xoá thứ hai: không còn

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
}
