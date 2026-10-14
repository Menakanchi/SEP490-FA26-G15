package com.vehicsim.controller;

import com.vehicsim.config.OpenApiConfig;
import com.vehicsim.dto.auth.AuthRequests.EmailRequest;
import com.vehicsim.dto.auth.AuthRequests.PasswordChangeRequest;
import com.vehicsim.dto.auth.AuthRequests.PasswordResetRequest;
import com.vehicsim.dto.auth.AuthRequests.ProfileUpdateRequest;
import com.vehicsim.dto.auth.AuthRequests.RegisterVerifyRequest;
import com.vehicsim.dto.auth.AuthResponse;
import com.vehicsim.dto.auth.LoginRequest;
import com.vehicsim.dto.auth.RegisterRequest;
import com.vehicsim.dto.auth.UserDto;
import com.vehicsim.service.AuthService;
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

    /** Cùng một câu cho mọi nhánh của bước xin mã — không để lộ email nào đã đăng ký. */
    private static final String OTP_SENT_MESSAGE = "Nếu email hợp lệ, mã xác minh 6 số đã được gửi. Mã có hiệu lực trong ít phút.";

    private final AuthService authService;

    // ---- đăng nhập / đăng ký

    @Operation(summary = "Đăng nhập", description = "Trả về JWT trong trường access_token.")
    @PostMapping("/login")
    public ResponseEntity<AuthResponse> login(@Valid @RequestBody LoginRequest request, HttpServletRequest http) {
        return ResponseEntity.ok(authService.login(request, clientIp(http)));
    }

    @Operation(summary = "Đăng ký một bước", description = "Tạo tài khoản EXPERIENCER và trả về JWT như khi đăng nhập. Không xác minh email.")
    @PostMapping("/register")
    public ResponseEntity<AuthResponse> register(@Valid @RequestBody RegisterRequest request) {
        return ResponseEntity.ok(authService.register(request));
    }

    @Operation(summary = "Đăng ký bước 1: xin mã OTP", description = "Gửi mã 6 số qua email nếu email chưa có tài khoản. Luôn trả cùng một câu.")
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
    public ResponseEntity<AuthResponse> passwordChange(@Valid @RequestBody PasswordChangeRequest body, @AuthenticationPrincipal UserDetails userDetails) {
        return ResponseEntity.ok(authService.changePassword(userDetails.getUsername(), body.oldPassword(), body.newPassword()));
    }

    /**
     * Sau reverse proxy / Cloudflare phải đọc header của proxy tin cậy thay vì remoteAddr — chưa làm vì
     * hiện chưa có proxy nào trước backend.
     */
    private static String clientIp(HttpServletRequest request) {
        return request.getRemoteAddr() == null ? "unknown" : request.getRemoteAddr();
    }
}
