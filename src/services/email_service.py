import os
import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

from src.config import get_settings

logger = logging.getLogger("scenario_forge.email")


def send_approval_email(
    to_email: str,
    recipient_name: str,
    username: str,
    temp_password: str,
    login_url: str = "http://localhost:3000/login",
) -> bool:
    """Gửi email phê duyệt tài khoản Reviewer qua SMTP với cơ chế Fallback Log an toàn.

    Trả về True nếu gửi thành công qua SMTP thực tế, False nếu dùng Fallback Log.
    Không bao giờ ném ngoại lệ làm gián đoạn luồng công việc của Admin.
    """
    settings = get_settings()
    subject = "[Scenario Forge] Tài khoản Reviewer của bạn đã được phê duyệt"

    plain_text = f"""Chào {recipient_name},

Chúc mừng! Yêu cầu đăng ký tài khoản Reviewer của bạn trên nền tảng Scenario Forge đã được Admin phê duyệt thành công.

Dưới đây là thông tin đăng nhập cá nhân của bạn:
- Tên đăng nhập (Username): {username}
- Mật khẩu tạm thời: {temp_password}
- Đường dẫn đăng nhập: {login_url}

Vui lòng đăng nhập và đổi mật khẩu sau lần truy cập đầu tiên để bảo mật tài khoản.

Trân trọng,
Đội ngũ Quản trị Scenario Forge
"""

    html_content = f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body {{ font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f8fafc; color: #1e293b; padding: 20px; }}
    .card {{ max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }}
    .header {{ background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); color: #ffffff; padding: 24px; text-align: center; }}
    .content {{ padding: 28px; }}
    .box {{ background-color: #f0f9ff; border: 1px solid #bae6fd; border-radius: 12px; padding: 16px; margin: 20px 0; }}
    .field {{ margin-bottom: 8px; font-size: 14px; }}
    .label {{ font-weight: 700; color: #0369a1; }}
    .value {{ font-family: monospace; font-size: 15px; font-weight: 700; color: #0f172a; background: #ffffff; padding: 2px 8px; border-radius: 4px; border: 1px solid #cbd5e1; }}
    .btn {{ display: inline-block; background-color: #0284c7; color: #ffffff !important; font-weight: 700; text-decoration: none; padding: 12px 24px; border-radius: 10px; margin-top: 16px; }}
    .footer {{ font-size: 12px; color: #64748b; text-align: center; padding: 16px; border-t: 1px solid #f1f5f9; }}
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2 style="margin:0; font-size: 20px;">Scenario Forge ADAS</h2>
      <p style="margin: 4px 0 0 0; opacity: 0.9; font-size: 13px;">Thông Báo Phê Duyệt Tài Khoản Reviewer</p>
    </div>
    <div class="content">
      <p>Xin chào <strong>{recipient_name}</strong>,</p>
      <p>Chúc mừng! Yêu cầu đăng ký tài khoản <strong>Reviewer (Kỹ sư Thẩm định)</strong> của bạn đã được Admin phê duyệt thành công.</p>
      
      <div class="box">
        <div class="field"><span class="label">Tên đăng nhập:</span> <span class="value">{username}</span></div>
        <div class="field"><span class="label">Mật khẩu tạm thời:</span> <span class="value">{temp_password}</span></div>
      </div>

      <p style="font-size: 13px; color: #475569;">Vui lòng đăng nhập hệ thống và đổi mật khẩu để đảm bảo an toàn.</p>
      <div style="text-align: center;">
        <a href="{login_url}" class="btn">Đăng Nhập Ngay</a>
      </div>
    </div>
    <div class="footer">
      Email này được gửi tự động từ hệ thống Scenario Forge. Vui lòng không phản hồi trực tiếp qua email này.
    </div>
  </div>
</body>
</html>
"""

    # Check if SMTP credentials are provided
    if not settings.smtp_user or not settings.smtp_host or settings.smtp_host in ("localhost", "127.0.0.1"):
        logger.info(
            f"[EMAIL SERVICE FALLBACK LOG] SMTP unconfigured or localhost. Sent email to {to_email} ({recipient_name}): Username: '{username}', Temp Password: '{temp_password}'"
        )
        print(
            f"\n[EMAIL SERVICE FALLBACK LOG] Send Email -> To: {to_email} | User: {username} | Pass: {temp_password}\n"
        )
        return False

    sender_name = getattr(settings, "smtp_from_name", None) or os.getenv("SMTP_FROM_NAME", "Scenario Forge ADAS")
    sender_email = settings.smtp_from_email or os.getenv("SMTP_FROM_EMAIL", settings.smtp_user)

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = formataddr((sender_name, sender_email))
        msg["To"] = to_email

        msg.attach(MIMEText(plain_text, "plain", "utf-8"))
        msg.attach(MIMEText(html_content, "html", "utf-8"))

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=5) as server:
            if settings.smtp_use_tls:
                server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(sender_email, [to_email], msg.as_string())

        logger.info(f"[EMAIL SERVICE SMTP SUCCESS] Successfully sent approval email to {to_email}")
        return True
    except Exception as exc:
        logger.warning(
            f"[EMAIL SERVICE FALLBACK LOG] Failed sending SMTP email to {to_email} ({exc}). Fallback Logged -> Username: '{username}', Temp Password: '{temp_password}'"
        )
        print(
            f"\n[EMAIL SERVICE FALLBACK LOG] Send Email -> To: {to_email} | User: {username} | Pass: {temp_password}\n"
        )
        return False
