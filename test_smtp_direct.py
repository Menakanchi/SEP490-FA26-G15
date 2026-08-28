import os
import sys
import smtplib
import traceback
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

def main():
    print("=== Testing Direct SMTP Connection ===")
    
    # 1. Load .env
    env_path = os.path.join(os.getcwd(), ".env")
    if not os.path.exists(env_path):
        print(f"ERROR: .env file not found at {env_path}")
        return
        
    load_dotenv(env_path, override=True)
    
    smtp_host = os.getenv("SMTP_HOST", "smtp.gmail.com")
    smtp_port_raw = os.getenv("SMTP_PORT", "587")
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_password = os.getenv("SMTP_PASSWORD", "")
    smtp_from = os.getenv("SMTP_FROM_EMAIL", smtp_user)
    
    print(f"Loaded config from .env:")
    print(f"  SMTP_HOST: {smtp_host}")
    print(f"  SMTP_PORT: {smtp_port_raw}")
    print(f"  SMTP_USER: {smtp_user}")
    print(f"  SMTP_FROM_EMAIL: {smtp_from}")
    print(f"  SMTP_PASSWORD length: {len(smtp_password)} (Raw value: '{smtp_password}')")
    
    try:
        smtp_port = int(smtp_port_raw)
    except ValueError:
        print(f"ERROR: Invalid SMTP_PORT '{smtp_port_raw}'")
        return

    # Clean password if it has spaces
    clean_password = smtp_password.replace(" ", "")
    print(f"  Cleaned SMTP_PASSWORD (without spaces) length: {len(clean_password)}")
    
    # Target recipient
    target_email = "ngochiine@gmail.com"
    
    msg = MIMEMultipart("alternative")
    msg["Subject"] = "[Scenario Forge] Test Direct Email SMTP"
    msg["From"] = smtp_from
    msg["To"] = target_email
    
    body_text = f"Chào bạn,\n\nĐây là email thử nghiệm gửi trực tiếp từ script test_smtp_direct.py.\nHost: {smtp_host}:{smtp_port}\nSender: {smtp_from}\n"
    msg.attach(MIMEText(body_text, "plain", "utf-8"))

    # 2. Attempt SMTP Connection
    for pass_to_try, label in [(smtp_password, "Raw password"), (clean_password, "Password without spaces")]:
        print(f"\n--- Attempting connection with {label} ---")
        try:
            print(f"Connecting to {smtp_host}:{smtp_port}...")
            server = smtplib.SMTP(smtp_host, smtp_port, timeout=15)
            server.set_debuglevel(1)  # Detailed debug output
            
            print("Sending EHLO...")
            server.ehlo()
            
            print("Starting TLS...")
            server.starttls()
            server.ehlo()
            
            print(f"Logging in as {smtp_user}...")
            server.login(smtp_user, pass_to_try)
            print("LOGIN SUCCESSFUL!")
            
            print(f"Sending message to {target_email}...")
            server.sendmail(smtp_from, [target_email], msg.as_string())
            print("EMAIL SENT SUCCESSFULLY!")
            
            server.quit()
            print("Connection closed cleanly.")
            return True
            
        except smtplib.SMTPAuthenticationError as e:
            print(f"SMTPAuthenticationError: {e}")
            traceback.print_exc()
        except smtplib.SMTPException as e:
            print(f"SMTPException: {e}")
            traceback.print_exc()
        except Exception as e:
            print(f"General Exception: {type(e).__name__} - {e}")
            traceback.print_exc()
            break

    print("\nSMTP send failed for all attempts.")
    return False

if __name__ == "__main__":
    main()
