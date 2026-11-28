package com.vsos.backend.controller.auth;

import com.vsos.backend.config.OpenApiConfig;
import com.vsos.backend.dto.auth.AuthRequests.EmailRequest;
import com.vsos.backend.dto.auth.AuthRequests.PasswordChangeRequest;
import com.vsos.backend.dto.auth.AuthRequests.PasswordResetRequest;
import com.vsos.backend.dto.auth.AuthRequests.ProfileUpdateRequest;
import com.vsos.backend.dto.auth.AuthRequests.RegisterVerifyRequest;
import com.vsos.backend.dto.auth.AuthResponse;
import com.vsos.backend.dto.auth.LoginRequest;
import com.vsos.backend.dto.auth.RegisterRequest;
import com.vsos.backend.dto.auth.UserDto;
import com.vsos.backend.service.auth.AuthService;
import com.vsos.backend.service.auth.MfaService;
import com.vsos.backend.security.CustomUserDetails;
import com.vsos.backend.dto.auth.AuthRequests.MfaPasswordRequest;
import com.vsos.backend.dto.auth.AuthRequests.MfaConfirmRequest;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
@Tag(name = "Auth", description = "Đăng ký, đăng nhập, quên mật khẩu và hồ sơ người dùng hiện tại")
public class AuthController {

    /** Câu trả về khi đã nhận yêu cầu xin mã (đăng ký: email mới; quên mật khẩu: mọi nhánh, không lộ email). */
    private static final String OTP_SENT_MESSAGE = "Nếu email hợp lệ, mã xác minh 6 số đã được gửi. Mã có hiệu lực trong ít phút.";

    private final AuthService authService;
    private final MfaService mfaService;

    // ---- đăng nhập / đăng ký

    @Operation(summary = "Đăng nhập", description = "Trả về JWT trong trường access_token.")
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        return ResponseEntity.ok(authService.login(request, clientIp(http)));
    }

    @Operation(summary = "Chế độ đăng ký", description = "`one_step` (POST /register, dev) `otp` (POST /register/request rồi /register/verify, production) hoặc `closed` (tắt đăng ký công khai). Frontend đọc để chọn đúng luồng.")
    @GetMapping("/register/mode")
    public Map<String, String> registrationMode() {
        return Map.of("mode", authService.registrationMode().wire());
    }

    @Operation(summary = "Đăng ký một bước", description = "Tạo tài khoản EXPERIENCER và trả về JWT như khi đăng nhập. Không xác minh email; giới hạn tần suất theo IP. Bị đóng (403) khi chế độ đăng ký là `otp`.")
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request, HttpServletRequest http) {
        return ResponseEntity.ok(authService.register(request, clientIp(http)));
    }

    @Operation(summary = "Đăng ký bước 1: xin mã OTP", description = "Gửi mã 6 số qua email nếu email chưa có tài khoản; email đã có tài khoản trả 409 (ADR-070).")
    @PostMapping("/register/request")
    public ResponseEntity<Map<String, String>> registerRequest(@Valid @RequestBody EmailRequest body, HttpServletRequest http) {
        authService.requestRegistration(body.email(), clientIp(http));
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("message_vi", OTP_SENT_MESSAGE));
    }

    @Operation(summary = "Đăng ký bước 2: mã OTP + họ tên + mật khẩu", description = "Mã đúng thì tạo tài khoản và trả JWT.")
    @PostMapping("/register/verify")
    public ResponseEntity<AuthResponse> registerVerify(@Valid @RequestBody RegisterVerifyRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(authService.completeRegistration(body.email(), body.code(), body.fullName(), body.password()));
    }

    // ---- quên mật khẩu

    @Operation(summary = "Quên mật khẩu: xin mã OTP", description = "Luôn trả cùng một câu, kể cả khi email không tồn tại.")
    @PostMapping("/password/forgot")
    public ResponseEntity<Map<String, String>> passwordForgot(@Valid @RequestBody EmailRequest body, HttpServletRequest http) {
        authService.requestPasswordReset(body.email(), clientIp(http));
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(Map.of("message_vi", OTP_SENT_MESSAGE));
    }

    @Operation(summary = "Đặt lại mật khẩu bằng mã OTP", description = "Mọi token cũ của tài khoản hết hiệu lực.")
    @PostMapping("/password/reset")
    public ResponseEntity<Map<String, Object>> passwordReset(@Valid @RequestBody PasswordResetRequest body) {
        authService.resetPassword(body.email(), body.code(), body.newPassword());
        return ResponseEntity.ok(Map.of("ok", true, "message_vi", "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới."));
    }

    // ---- cần đăng nhập

    @GetMapping("/mfa/status")
    public ResponseEntity<Map<String, Boolean>> mfaStatus(@AuthenticationPrincipal CustomUserDetails user) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
                .body(Map.of("enabled", mfaService.enabled(user.getUser().getId())));
    }

    @PostMapping("/mfa/setup")
    public ResponseEntity<MfaService.Setup> mfaSetup(@AuthenticationPrincipal CustomUserDetails user, @Valid @RequestBody MfaPasswordRequest body) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(mfaService.setup(user.getUsername(), authVersion(user), body.password()));
    }

    @PostMapping("/mfa/enable")
    public ResponseEntity<MfaService.Enabled> mfaEnable(@AuthenticationPrincipal CustomUserDetails user, @Valid @RequestBody MfaConfirmRequest body) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(mfaService.enable(user.getUsername(), authVersion(user), body.password(), body.code()));
    }

    @PostMapping("/mfa/disable")
    public ResponseEntity<AuthResponse> mfaDisable(@AuthenticationPrincipal CustomUserDetails user, @Valid @RequestBody MfaConfirmRequest body) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(mfaService.disable(user.getUsername(), authVersion(user), body.password(), body.code()));
    }

    @PostMapping("/mfa/recovery")
    public ResponseEntity<Map<String, Object>> mfaRecovery(@AuthenticationPrincipal CustomUserDetails user, @Valid @RequestBody MfaConfirmRequest body) {
        return ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore())
                .body(Map.of("codes", mfaService.replaceRecoveryCodes(user.getUsername(), authVersion(user), body.password(), body.code())));
    }

    @Operation(summary = "Thu hồi phiên đăng nhập hiện tại", security = @SecurityRequirement(name = OpenApiConfig.BEARER_AUTH))
    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@RequestHeader("Authorization") String authorization) {
        if (!authorization.startsWith("Bearer ")) return ResponseEntity.status(HttpStatus.UNAUTHORIZED).build();
        authService.logout(authorization.substring(7));
        return ResponseEntity.noContent().build();
    }

    @Operation(summary = "Thông tin người dùng hiện tại", description = "Cần JWT: bấm Authorize rồi dán access_token.",
            security = @SecurityRequirement(name = OpenApiConfig.BEARER_AUTH))
    @GetMapping("/me")
    public ResponseEntity<UserDto> getCurrentUser(@AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(authService.getCurrentUser(userDetails.getUsername()));
    }

    @Operation(summary = "Cập nhật họ tên", security = @SecurityRequirement(name = OpenApiConfig.BEARER_AUTH))
    @PutMapping("/me")
    public ResponseEntity<UserDto> updateMe(@Valid @RequestBody ProfileUpdateRequest body, @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(authService.updateProfile(userDetails.getUsername(), body.fullName()));
    }

    @Operation(summary = "Đổi mật khẩu",
            description = "Trả phiên MỚI: token cũ (kể cả token của request này) hết hiệu lực khi mật khẩu đổi.",
            security = @SecurityRequirement(name = OpenApiConfig.BEARER_AUTH))
    @PostMapping("/password/change")
    public ResponseEntity<AuthResponse> passwordChange(@Valid @RequestBody PasswordChangeRequest body, @AuthenticationPrincipal CustomUserDetails userDetails) {
        return ResponseEntity.ok(authService.changePassword(userDetails.getUsername(), body.oldPassword(), body.newPassword(), authVersion(userDetails)));
    }

    private static long authVersion(CustomUserDetails user) {
        Long version = user.getUser().getAuthVersion();
        return version == null ? 0 : version;
    }

    /**
     * Địa chỉ client dùng cho giới hạn tần suất. Sau reverse proxy / Cloudflare, đặt {@code FORWARD_HEADERS_STRATEGY=native}
     * để Tomcat thay {@code remoteAddr} bằng IP trong header của proxy tin cậy (TD-36); không bao giờ tự đọc
     * {@code X-Forwarded-For} ở đây, vì kẻ gọi trực tiếp có thể điền header đó để né giới hạn.
     */
    private static String clientIp(HttpServletRequest request) {
        return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    }
}
