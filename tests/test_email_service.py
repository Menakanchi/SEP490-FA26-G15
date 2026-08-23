from unittest.mock import MagicMock, patch
from email.utils import formataddr

from src.services.email_service import send_approval_email


def test_send_approval_email_formatting_and_fallback():
    """Test send_approval_email header formatting with formataddr and fallback logger behavior."""
    # 1. Fallback mode (unconfigured SMTP)
    mock_fallback_settings = MagicMock()
    mock_fallback_settings.smtp_host = "localhost"
    mock_fallback_settings.smtp_user = ""
    mock_fallback_settings.smtp_from_email = "noreply@scenarioforge.ai"
    mock_fallback_settings.smtp_from_name = "Scenario Forge ADAS"

    with patch("src.services.email_service.get_settings", return_value=mock_fallback_settings):
        result = send_approval_email(
            to_email="test_user@example.com",
            recipient_name="Test User",
            username="test_user",
            temp_password="Pass_Test123",
        )
        assert result is False

    # 2. SMTP mode with mocked SMTP server
    mock_settings = MagicMock()
    mock_settings.smtp_host = "smtp.example.com"
    mock_settings.smtp_port = 587
    mock_settings.smtp_user = "user@example.com"
    mock_settings.smtp_password = "password"
    mock_settings.smtp_from_name = "Scenario Forge ADAS"
    mock_settings.smtp_from_email = "noreply@scenarioforge.ai"
    mock_settings.smtp_use_tls = True

    with (
        patch("src.services.email_service.get_settings", return_value=mock_settings),
        patch("smtplib.SMTP") as mock_smtp_cls,
    ):
        mock_smtp = MagicMock()
        mock_smtp_cls.return_value.__enter__.return_value = mock_smtp

        smtp_result = send_approval_email(
            to_email="test_user@example.com",
            recipient_name="Test User",
            username="test_user",
            temp_password="Pass_Test123",
        )

        assert smtp_result is True
        assert mock_smtp.sendmail.called
        args = mock_smtp.sendmail.call_args[0]
        assert args[0] == "noreply@scenarioforge.ai"
        assert args[1] == ["test_user@example.com"]
        msg_str = args[2]
        expected_from = formataddr(("Scenario Forge ADAS", "noreply@scenarioforge.ai"))
        assert expected_from in msg_str
