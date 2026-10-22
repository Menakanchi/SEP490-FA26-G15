package com.vehicsim.service;

import com.vehicsim.audit.AuditLog;
import com.vehicsim.config.AuthProperties;
import com.vehicsim.dto.auth.AuthResponse;
import com.vehicsim.dto.auth.LoginRequest;
import com.vehicsim.dto.auth.RegisterRequest;
import com.vehicsim.dto.auth.UserDto;
import com.vehicsim.entity.Role;
import com.vehicsim.entity.User;
import com.vehicsim.entity.enums.RoleCode;
import com.vehicsim.repository.RoleRepository;
import com.vehicsim.repository.UserRepository;
import com.vehicsim.security.CustomUserDetails;
import com.vehicsim.security.JwtService;
import com.vehicsim.security.LegacyAwarePasswordEncoder;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.util.Locale;

/**
 * Nghiệp vụ xác thực: đăng nhập JWT, đăng ký và quên mật khẩu bằng mã OTP 6 số.
 * Port từ {@code src_python_backup/services/auth/service.py}, giữ hai quy tắc chống dò email:
 * bước xin mã luôn trả lời giống nhau dù email có tồn tại hay không, và đăng nhập sai email
 * hay sai mật khẩu đều là cùng một lỗi (email lạ vẫn tốn đủ một lần băm).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private static final String INVALID_CREDENTIALS = "Email hoặc mật khẩu không đúng";
    private static final String INVALID_OTP = "Mã xác minh không đúng hoặc đã hết hạn. Vui lòng yêu cầu mã mới.";
    private static final String RATE_LIMITED = "Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.";
    private static final String CANNOT_REGISTER =
            "Không thể tạo tài khoản với thông tin này. Nếu bạn đã có tài khoản, hãy đăng nhập hoặc dùng Quên mật khẩu.";
    /** BCrypt chỉ dùng 72 byte đầu của mật khẩu — dài hơn thì phần sau bị bỏ qua mà người dùng không biết. */
    static final int BCRYPT_MAX_BYTES = 72;

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final LegacyAwarePasswordEncoder passwordEncoder;
    private final JwtService jwtService;
    private final OtpService otpService;
    private final MailService mailService;
    private final AuthProperties props;

    @Value("${app.env:development}")
    private String appEnv;

    private RegistrationMode registrationMode = RegistrationMode.ONE_STEP;

    @PostConstruct
    void resolveRegistrationMode() {
        registrationMode = RegistrationMode.resolve(props.registrationMode(), appEnv);
        if (registrationMode == RegistrationMode.OTP && !mailService.isConfigured()) {
            log.warn("Đăng ký bằng OTP đang bật nhưng SMTP chưa cấu hình (SMTP_USER / SMTP_PASSWORD) — không ai nhận được mã, nên không ai đăng ký được.");
        }
        if (registrationMode == RegistrationMode.ONE_STEP && "production".equalsIgnoreCase(appEnv)) {
            log.warn("REGISTRATION_MODE=one_step ở production: đăng ký không xác minh email (ai cũng tạo được tài khoản bằng email không phải của mình).");
        }
        log.info("Chế độ đăng ký: {}", registrationMode.wire());
    }

    public RegistrationMode registrationMode() {
        return registrationMode;
    }

    // ------------------------------------------------------------------ đăng nhập

    @Transactional
    public AuthResponse login(LoginRequest request, String clientIp) {
        if (otpService.hitRateLimit("login_ip", clientIp, props.loginAttemptsPerIp())) {
            AuditLog.event("auth.login", "blocked", "reason", "rate_limited_ip", "ip", clientIp);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, RATE_LIMITED);
        }
        String email = normalize(request.getEmail());
        // Giới hạn theo tài khoản chỉ đếm lần SAI: chặn dò mật khẩu từ nhiều IP, và email lạ bị đếm y hệt email thật
        // (không để lộ email nào tồn tại). Đổi lại, kẻ xấu làm khoá tạm một tài khoản được trong một cửa sổ.
        if (otpService.isRateLimited("login_acct", email, props.loginAttemptsPerAccount())) {
            AuditLog.event("auth.login", "blocked", "reason", "rate_limited_account", "user", email, "ip", clientIp);
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, RATE_LIMITED);
        }
        String rawPassword = request.getPassword();

        User user = userRepository.findByEmail(email).orElse(null);
        if (user == null) {
            passwordEncoder.matches(rawPassword, passwordEncoder.dummyHash());
            otpService.hitRateLimit("login_acct", email, props.loginAttemptsPerAccount());
            AuditLog.event("auth.login", "failure", "reason", "bad_credentials", "user", email, "ip", clientIp);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS);
        }
        if (!passwordEncoder.matches(rawPassword, user.getPasswordHash())) {
            otpService.hitRateLimit("login_acct", email, props.loginAttemptsPerAccount());
            AuditLog.event("auth.login", "failure", "reason", "bad_credentials", "user", email, "ip", clientIp);
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, INVALID_CREDENTIALS);
        }
        if (Boolean.FALSE.equals(user.getIsActive())) {
            AuditLog.event("auth.login", "failure", "reason", "account_disabled", "user", email, "user_id", user.getId(), "ip", clientIp);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Tài khoản đã bị khoá. Vui lòng liên hệ quản trị viên.");
        }
        otpService.clearRateLimit("login_acct", email);
        if (passwordEncoder.upgradeEncoding(user.getPasswordHash())) {
            user.setPasswordHash(passwordEncoder.encode(rawPassword)); // hash PBKDF2 cũ -> BCrypt
        }
        user.setLastLoginAt(LocalDateTime.now());
        User saved = userRepository.save(user);
        AuditLog.event("auth.login", "success", "user", email, "user_id", saved.getId(), "role", roleOf(saved), "ip", clientIp);
        return sessionFor(saved);
    }

    // ------------------------------------------------------------------ đăng ký

    /**
     * Đăng ký một bước, không xác minh email (route {@code POST /auth/register}). Có giới hạn theo IP; email / số điện
     * thoại trùng trả cùng một câu chung — không xác nhận tài khoản nào đã tồn tại. (Vẫn còn một "oracle": thành công
     * nghĩa là email mới. Chống triệt để cần xác minh email qua OTP — TD-35.)
     */
    @Transactional
    public AuthResponse register(RegisterRequest request, String clientIp) {
        if (registrationMode == RegistrationMode.OTP) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Đăng ký một bước đã tắt. Hãy đăng ký bằng mã xác minh gửi qua email.");
        }
        if (otpService.hitRateLimit("register_ip", clientIp, props.registerRequestsPerIp())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, RATE_LIMITED);
        }
        requirePasswordFitsBcrypt(request.getPassword());
        String email = normalize(request.getEmail());
        String phone = request.getPhoneNumber() == null ? null : request.getPhoneNumber().trim();
        if (userRepository.existsByEmail(email)
                || (phone != null && !phone.isEmpty() && userRepository.existsByPhoneNumber(phone))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, CANNOT_REGISTER);
        }
        User user = User.builder()
                .email(email)
                .passwordHash(passwordEncoder.encode(request.getPassword()))
                .role(selfRegisteredRole())
                .isActive(true)
                .lastName(request.getLastName())
                .middleName(request.getMiddleName())
                .firstName(request.getFirstName())
                .dateOfBirth(request.getDateOfBirth())
                .gender(request.getGender())
                .phoneNumber(phone == null || phone.isEmpty() ? null : phone)
                .address(request.getAddress())
                .bio(request.getBio())
                .build();
        User saved = userRepository.save(user);
        AuditLog.event("auth.register", "success", "mode", "one_step", "user", email, "user_id", saved.getId(), "ip", clientIp);
        return sessionFor(saved);
    }

    /** Bước 1 đăng ký: chỉ gửi mã khi email chưa có tài khoản; không gửi thì vẫn trả như đã gửi. */
    public void requestRegistration(String email, String clientIp) {
        checkOtpRequestRate(clientIp);
        String normalized = normalize(email);
        if (userRepository.existsByEmail(normalized)) {
            return;
        }
        otpService.issue(OtpService.Purpose.REGISTER, normalized)
                .ifPresent(code -> mailService.sendOtp(normalized, code, OtpService.Purpose.REGISTER));
    }

    /**
     * Bước 2 đăng ký: mã đúng mới tạo tài khoản, nên chỉ email chứng minh được là của mình mới vào DB.
     * Kiểm mã trước khi tra email để người chưa có mã hợp lệ không biết email đã đăng ký hay chưa.
     */
    @Transactional
    public AuthResponse completeRegistration(String email, String code, String fullName, String password) {
        requirePasswordFitsBcrypt(password);
        String normalized = normalize(email);
        if (!otpService.verify(OtpService.Purpose.REGISTER, normalized, code)) {
            AuditLog.event("auth.register", "failure", "mode", "otp", "reason", "invalid_code", "user", normalized);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID_OTP);
        }
        if (userRepository.existsByEmail(normalized)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Email này đã có tài khoản. Hãy đăng nhập.");
        }
        String[] names = splitFullName(fullName);
        User user = User.builder()
                .email(normalized)
                .passwordHash(passwordEncoder.encode(password))
                .role(selfRegisteredRole())
                .isActive(true)
                .lastName(names[0])
                .middleName(names[1])
                .firstName(names[2])
                .lastLoginAt(LocalDateTime.now())
                .build();
        User saved = userRepository.save(user);
        AuditLog.event("auth.register", "success", "mode", "otp", "user", normalized, "user_id", saved.getId());
        return sessionFor(saved);
    }

    // ------------------------------------------------------------------ quên mật khẩu

    public void requestPasswordReset(String email, String clientIp) {
        checkOtpRequestRate(clientIp);
        String normalized = normalize(email);
        User user = userRepository.findByEmail(normalized).orElse(null);
        if (user == null || Boolean.FALSE.equals(user.getIsActive())) {
            return;
        }
        otpService.issue(OtpService.Purpose.RESET, normalized)
                .ifPresent(code -> mailService.sendOtp(normalized, code, OtpService.Purpose.RESET));
    }

    /** Đổi hash mật khẩu thì pwv đổi và mọi JWT cấp trước đó hết hiệu lực. */
    @Transactional
    public void resetPassword(String email, String code, String newPassword) {
        requirePasswordFitsBcrypt(newPassword);
        String normalized = normalize(email);
        if (!otpService.verify(OtpService.Purpose.RESET, normalized, code)) {
            AuditLog.event("auth.password_reset", "failure", "reason", "invalid_code", "user", normalized);
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID_OTP);
        }
        User user = userRepository.findByEmail(normalized).orElse(null);
        if (user == null || Boolean.FALSE.equals(user.getIsActive())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, INVALID_OTP);
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
        AuditLog.event("auth.password_reset", "success", "user", normalized, "user_id", user.getId());
    }

    // ------------------------------------------------------------------ đã đăng nhập

    @Transactional(readOnly = true)
    public UserDto getCurrentUser(String email) {
        return UserDto.fromEntity(requireUser(email));
    }

    /** {@code PUT /auth/me}: đổi họ tên (frontend gửi một chuỗi {@code full_name}). */
    @Transactional
    public UserDto updateProfile(String email, String fullName) {
        User user = requireUser(email);
        String[] names = splitFullName(fullName);
        user.setLastName(names[0]);
        user.setMiddleName(names[1]);
        user.setFirstName(names[2]);
        return UserDto.fromEntity(userRepository.save(user));
    }

    /**
     * Đổi mật khẩu khi đang đăng nhập và trả <b>phiên mới</b>: đổi hash làm token hiện tại hết khớp
     * (các thiết bị khác bị đăng xuất), nên chính người vừa đổi cũng cần token mới ngay tại đây.
     */
    @Transactional
    public AuthResponse changePassword(String email, String oldPassword, String newPassword) {
        requirePasswordFitsBcrypt(newPassword);
        User user = requireUser(email);
        if (!passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            AuditLog.event("auth.password_change", "failure", "reason", "wrong_old_password", "user", email, "user_id", user.getId());
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mật khẩu hiện tại không đúng");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        User saved = userRepository.save(user);
        AuditLog.event("auth.password_change", "success", "user", email, "user_id", saved.getId());
        return sessionFor(saved);
    }

    // ------------------------------------------------------------------ helpers

    private static String roleOf(User user) {
        return user.getRole() == null ? null : String.valueOf(user.getRole().getCode());
    }

    private AuthResponse sessionFor(User user) {
        return AuthResponse.of(
                jwtService.generateToken(new CustomUserDetails(user)),
                UserDto.fromEntity(user),
                jwtService.expiresInSeconds());
    }

    private User requireUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn"));
    }

    private void checkOtpRequestRate(String clientIp) {
        if (otpService.hitRateLimit("otp_ip", clientIp, props.otpRequestsPerIp())) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, RATE_LIMITED);
        }
    }

    /** Người tự đăng ký luôn nhận role EXPERIENCER (ADR-035). */
    private Role selfRegisteredRole() {
        return roleRepository.findByCode(RoleCode.EXPERIENCER)
                .orElseGet(() -> roleRepository.save(Role.builder()
                        .code(RoleCode.EXPERIENCER)
                        .name("Experiencer")
                        .description("Người dùng độc lập tự đăng ký")
                        .build()));
    }

    /** Chặn mật khẩu dài hơn 72 byte (ký tự có dấu chiếm 2–3 byte) thay vì để BCrypt âm thầm cắt. */
    static void requirePasswordFitsBcrypt(String password) {
        if (password != null && password.getBytes(java.nio.charset.StandardCharsets.UTF_8).length > BCRYPT_MAX_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Mật khẩu quá dài: tối đa " + BCRYPT_MAX_BYTES + " byte (ký tự có dấu chiếm 2–3 byte)");
        }
    }

    private static String normalize(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    /**
     * Tách họ tên theo thói quen tiếng Việt: từ đầu là họ, từ cuối là tên, phần giữa là tên đệm.
     * Một từ duy nhất thì coi là tên (họ để trống).
     *
     * @return {họ, tên đệm hoặc null, tên}
     */
    static String[] splitFullName(String fullName) {
        String[] parts = fullName.trim().split("\\s+");
        if (parts.length == 1) {
            return new String[]{"", null, cut(parts[0])};
        }
        String middle = parts.length > 2
                ? String.join(" ", java.util.Arrays.copyOfRange(parts, 1, parts.length - 1))
                : null;
        return new String[]{cut(parts[0]), middle == null || middle.isEmpty() ? null : cut(middle), cut(parts[parts.length - 1])};
    }

    /** Cột họ/đệm/tên rộng 80 ký tự. */
    private static String cut(String s) {
        return s.length() > 80 ? s.substring(0, 80) : s;
    }
}
