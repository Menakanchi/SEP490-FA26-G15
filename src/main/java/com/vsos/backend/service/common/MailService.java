package com.vsos.backend.service.common;

import com.vsos.backend.config.AuthProperties;
import jakarta.mail.internet.MimeMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.mail.javamail.MimeMessageHelper;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import com.vsos.backend.service.auth.OtpService;

/**
 * Gửi mã OTP qua SMTP, chạy nền để thời gian phản hồi không phụ thuộc việc có gửi mail hay không
 * (chống dò email). Chưa cấu hình SMTP thì không gửi; ngoài production, mã được ghi vào log để dev thử được.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class MailService {

    private final JavaMailSenderImpl mailSender;
    private final AuthProperties props;

    @Value("${app.env:development}")
    private String appEnv;

    /** Đã có tài khoản SMTP để gửi mã chưa. */
    public boolean isConfigured() {
        String username = mailSender.getUsername();
        return username != null && !username.isBlank() && mailSender.getPassword() != null && !mailSender.getPassword().isBlank();
    }

    @Async
    public void sendOtp(String toEmail, String code, OtpService.Purpose purpose) {
        boolean register = purpose == OtpService.Purpose.REGISTER;
        String title = register ? "Mã xác minh đăng ký tài khoản" : "Mã đặt lại mật khẩu";
        String action = register ? "hoàn tất đăng ký tài khoản" : "đặt lại mật khẩu";
        int ttlMinutes = Math.max(1, props.otpTtlSeconds() / 60);

        String username = mailSender.getUsername();
        if (!isConfigured()) {
            log.warn("SMTP chưa được cấu hình (thiếu SMTP_USER / SMTP_PASSWORD) — bỏ qua gửi email tới {}", toEmail);
            if (!"production".equalsIgnoreCase(appEnv)) {
                log.info("[DEV] Mã OTP ({}) cho {}: {}", purpose.value(), toEmail, code);
            }
            return;
        }

        String text = "Mã của bạn để " + action + " trên VehicSim là: " + code + "\n\n"
                + "Mã có hiệu lực trong " + ttlMinutes + " phút và chỉ dùng được một lần.\n"
                + "Nếu bạn không yêu cầu mã này, hãy bỏ qua email.\n\nVehicSim";
        String html = "<div style=\"font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;\">"
                + "<p>Mã của bạn để " + action + " trên <strong>VehicSim</strong> là:</p>"
                + "<p style=\"font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 16px 0;\">" + code + "</p>"
                + "<p>Mã có hiệu lực trong " + ttlMinutes + " phút và chỉ dùng được một lần.</p>"
                + "<p style=\"font-size: 12px; color: #64748b;\">Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p></div>";
        try {
            // App Password của Gmail hay được dán kèm khoảng trắng.
            mailSender.setPassword(mailSender.getPassword().replace(" ", ""));
            String from = props.smtpFromEmail() != null && !props.smtpFromEmail().isBlank() ? props.smtpFromEmail() : username;
            MimeMessage message = mailSender.createMimeMessage();
            MimeMessageHelper helper = new MimeMessageHelper(message, true, "UTF-8");
            helper.setFrom(from);
            helper.setTo(toEmail);
            helper.setSubject("[VehicSim] " + title + ": " + code);
            helper.setText(text, html);
            mailSender.send(message);
            log.info("Đã gửi OTP ({}) tới {}", purpose.value(), toEmail);
        } catch (Exception e) {
            log.error("Gửi email OTP tới {} thất bại: {}", toEmail, e.getMessage());
        }
    }
}
