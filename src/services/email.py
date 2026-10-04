"""Dịch vụ gửi email qua SMTP cho VehicSim (mã OTP đăng ký / quên mật khẩu).

Nạp cấu hình từ `src.config.get_settings()` (đọc từ `.env`).
Hiện chỉ gửi mã OTP; ``send_email_smtp`` dùng lại được cho thông báo khác.
"""

from __future__ import annotations

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from src.config import get_settings

logger = logging.getLogger(__name__)


def send_email_smtp(
    to_email: str,
    subject: str,
    body_text: str,
    body_html: str | None = None,
) -> bool:
    """Gửi email qua SMTP server theo cấu hình trong `.env`.

    Args:
        to_email: Địa chỉ email người nhận.
        subject: Tiêu đề email.
        body_text: Nội dung email dạng văn bản thuần.
        body_html: Nội dung email dạng HTML (tùy chọn).

    Returns:
        bool: True nếu gửi thành công, False nếu có lỗi.
    """
    settings = get_settings()

    if not settings.smtp_user or not settings.smtp_password:
        logger.warning("SMTP chưa được cấu hình (thiếu smtp_user hoặc smtp_password trong .env). Bỏ qua gửi email.")
        return False

    smtp_host = settings.smtp_host or "smtp.gmail.com"
    smtp_port = settings.smtp_port or 587
    smtp_from = settings.smtp_from_email or settings.smtp_user

    # Xử lý khoảng trắng trong App Password của Gmail (nếu có)
    clean_password = settings.smtp_password.replace(" ", "")

    msg = MIMEMultipart("alternative") if body_html else MIMEMultipart()
    msg["Subject"] = subject
    msg["From"] = smtp_from
    msg["To"] = to_email

    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    if body_html:
        msg.attach(MIMEText(body_html, "html", "utf-8"))

    try:
        logger.info("Đang kết nối SMTP %s:%s để gửi mail cho %s...", smtp_host, smtp_port, to_email)
        with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(settings.smtp_user, clean_password)
            server.sendmail(smtp_from, [to_email], msg.as_string())

        logger.info("[SMTP SUCCESS] Đã gửi email thành công tới %s (Subject: '%s')", to_email, subject)
        return True
    except smtplib.SMTPAuthenticationError as exc:
        logger.error("[SMTP ERROR] Lỗi xác thực SMTP cho user %s: %s", settings.smtp_user, exc)
        return False
    except smtplib.SMTPException as exc:
        logger.error("[SMTP ERROR] Lỗi gửi mail SMTP tới %s: %s", to_email, exc)
        return False
    except Exception as exc:  # noqa: BLE001
        logger.exception("[SMTP ERROR] Ngoại lệ không xác định khi gửi mail tới %s: %s", to_email, exc)
        return False


_OTP_EMAIL_COPY = {
    "register": ("Mã xác minh đăng ký tài khoản", "hoàn tất đăng ký tài khoản"),
    "reset": ("Mã đặt lại mật khẩu", "đặt lại mật khẩu"),
}


def send_otp_email(to_email: str, code: str, purpose: str, ttl_minutes: int) -> bool:
    """Gửi mã OTP 6 số cho đăng ký (``register``) hoặc quên mật khẩu (``reset``)."""
    title, action = _OTP_EMAIL_COPY[purpose]
    subject = f"[VehicSim] {title}: {code}"
    body_text = (
        f"Mã của bạn để {action} trên VehicSim là: {code}\n\n"
        f"Mã có hiệu lực trong {ttl_minutes} phút và chỉ dùng được một lần.\n"
        f"Nếu bạn không yêu cầu mã này, hãy bỏ qua email.\n\n"
        f"VehicSim"
    )
    body_html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;">
        <p>Mã của bạn để {action} trên <strong>VehicSim</strong> là:</p>
        <p style="font-size: 32px; letter-spacing: 8px; font-weight: bold; margin: 16px 0;">{code}</p>
        <p>Mã có hiệu lực trong {ttl_minutes} phút và chỉ dùng được một lần.</p>
        <p style="font-size: 12px; color: #64748b;">Nếu bạn không yêu cầu mã này, hãy bỏ qua email.</p>
    </div>
    """
    return send_email_smtp(to_email, subject, body_text, body_html)
