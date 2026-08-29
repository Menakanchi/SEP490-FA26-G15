"""Dịch vụ gửi email qua SMTP cho Scenario Forge.

Nạp cấu hình từ `src.config.get_settings()` (đọc từ `.env`).
Hỗ trợ gửi mail phê duyệt tài khoản, thông báo đăng ký, và các mail hệ thống khác.
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


def send_reviewer_approval_email(
    to_email: str,
    recipient_name: str,
    username: str,
    temp_password: str,
) -> bool:
    """Gửi email thông báo Admin đã phê duyệt tài khoản Reviewer kèm mật khẩu tạm thời."""
    subject = "[Scenario Forge] Phê duyệt tài khoản Reviewer & Thông tin đăng nhập"

    name_display = recipient_name or username
    body_text = (
        f"Xin chào {name_display},\n\n"
        f"Yêu cầu đăng ký tài khoản Reviewer của bạn trên hệ thống Scenario Forge đã được Admin phê duyệt thành công!\n\n"
        f"Thông tin đăng nhập hệ thống của bạn:\n"
        f"  - Tên đăng nhập (Username): {username}\n"
        f"  - Mật khẩu tạm thời: {temp_password}\n\n"
        f"Vui lòng đăng nhập tại hệ thống và tiến hành đổi mật khẩu sau lần đăng nhập đầu tiên.\n\n"
        f"Trân trọng,\n"
        f"Ban Quản Trị Scenario Forge"
    )

    body_html = f"""
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1e3a8a;">Scenario Forge — Phê Duyệt Tài Khoản Reviewer</h2>
        <p>Xin chào <strong>{name_display}</strong>,</p>
        <p>Yêu cầu đăng ký tài khoản Reviewer của bạn trên hệ thống <strong>Scenario Forge</strong> đã được Admin phê duyệt thành công!</p>
        <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #2563eb; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Tên đăng nhập (Username):</strong> <code style="font-size: 14px;">{username}</code></p>
            <p style="margin: 5px 0;"><strong>Mật khẩu tạm thời:</strong> <code style="font-size: 14px; color: #dc2626;">{temp_password}</code></p>
        </div>
        <p>Vui lòng sử dụng thông tin trên để đăng nhập và nên thay đổi mật khẩu sau khi đăng nhập lần đầu tiên.</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #64748b;">Đây là email tự động từ hệ thống Scenario Forge. Vui lòng không phản hồi email này.</p>
    </div>
    """

    return send_email_smtp(to_email, subject, body_text, body_html)


def send_registration_received_email(
    to_email: str,
    recipient_name: str,
    username: str,
) -> bool:
    """Gửi email thông báo đã nhận yêu cầu đăng ký Reviewer và đang chờ Admin phê duyệt."""
    subject = "[Scenario Forge] Tiếp nhận yêu cầu đăng ký tài khoản Reviewer"

    name_display = recipient_name or username
    body_text = (
        f"Xin chào {name_display},\n\n"
        f"Hệ thống Scenario Forge đã tiếp nhận đơn đăng ký tài khoản Reviewer của bạn (Username: {username}).\n"
        f"Yêu cầu đang nằm trong hàng chờ thẩm định và phê duyệt của Admin.\n\n"
        f"Sau khi Admin phê duyệt, thông tin mật khẩu đăng nhập tạm thời sẽ được tự động gửi về địa chỉ email này.\n\n"
        f"Trân trọng,\n"
        f"Ban Quản Trị Scenario Forge"
    )

    return send_email_smtp(to_email, subject, body_text)
