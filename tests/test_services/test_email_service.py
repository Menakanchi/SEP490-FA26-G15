from unittest.mock import MagicMock, patch

import pytest

from src.config import Settings
from src.services.email import (
    send_email_smtp,
    send_registration_received_email,
    send_reviewer_approval_email,
)


@pytest.fixture
def mock_settings(monkeypatch):
    settings = Settings(
        smtp_host="smtp.gmail.com",
        smtp_port=587,
        smtp_user="test_sender@gmail.com",
        smtp_password="test pass word",
        smtp_from_email="test_sender@gmail.com",
    )
    monkeypatch.setattr("src.services.email.get_settings", lambda: settings)
    return settings


def test_send_email_smtp_success(mock_settings):
    with patch("smtplib.SMTP") as mock_smtp_cls:
        mock_server = MagicMock()
        mock_smtp_cls.return_value.__enter__.return_value = mock_server

        success = send_email_smtp(
            to_email="recipient@example.com",
            subject="Test Subject",
            body_text="Test Body Text",
            body_html="<p>Test Body HTML</p>",
        )

        assert success is True
        mock_smtp_cls.assert_called_once_with("smtp.gmail.com", 587, timeout=15)
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once_with("test_sender@gmail.com", "testpassword")
        mock_server.sendmail.assert_called_once()


def test_send_email_smtp_missing_credentials(monkeypatch):
    settings = Settings(smtp_user="", smtp_password="")
    monkeypatch.setattr("src.services.email.get_settings", lambda: settings)

    success = send_email_smtp("to@example.com", "Subject", "Body")
    assert success is False


def test_send_reviewer_approval_email(mock_settings):
    with patch("src.services.email.send_email_smtp") as mock_send:
        mock_send.return_value = True

        res = send_reviewer_approval_email(
            to_email="reviewer@example.com",
            recipient_name="Nguyen Van A",
            username="reviewer_a",
            temp_password="Pass_123456",
        )

        assert res is True
        mock_send.assert_called_once()
        args, _ = mock_send.call_args
        assert args[0] == "reviewer@example.com"
        assert "Phê duyệt" in args[1]
        assert "reviewer_a" in args[2]
        assert "Pass_123456" in args[2]


def test_send_registration_received_email(mock_settings):
    with patch("src.services.email.send_email_smtp") as mock_send:
        mock_send.return_value = True

        res = send_registration_received_email(
            to_email="applicant@example.com",
            recipient_name="Tran Van B",
            username="reviewer_b",
        )

        assert res is True
        mock_send.assert_called_once()
        args, _ = mock_send.call_args
        assert args[0] == "applicant@example.com"
        assert "Tiếp nhận" in args[1]
