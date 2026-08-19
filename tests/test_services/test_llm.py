"""Tests cho src/services/llm.py - Model Escalation"""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from pydantic import BaseModel

from src.services.llm import (
    MAX_RETRIES,
    _get_escalated_model,
    _get_primary_model,
    call_with_escalation,
)


class DummySchema(BaseModel):
    """Schema đơn giản cho test."""

    name: str
    value: int


class TestCallWithEscalation:
    """Test suite cho call_with_escalation."""

    def test_first_attempt_success(self):
        """Thành công lần đầu → trả về kết quả, không retry."""
        messages = [{"role": "user", "content": "test"}]

        # Mock ChatOpenAI để return thành công
        mock_result = DummySchema(name="test", value=42)
        with patch("src.services.llm.ChatOpenAI") as mock_chat:
            mock_llm_instance = MagicMock()
            mock_runnable = MagicMock()
            mock_runnable.invoke.return_value = mock_result
            mock_llm_instance.with_structured_output.return_value = mock_runnable
            mock_chat.return_value = mock_llm_instance

            result = call_with_escalation(messages, DummySchema)

            # Verify: gọi đúng model (primary)
            assert mock_chat.call_count == 1
            assert _get_primary_model() in str(mock_chat.call_args)

            # Verify: trả về đúng kết quả
            assert result.name == "test"
            assert result.value == 42

    def test_fail_once_retry_same_model(self):
        """Fail 1 lần → retry cùng model, lần 2 thành công."""
        messages = [{"role": "user", "content": "test"}]

        mock_result = DummySchema(name="test", value=42)
        with patch("src.services.llm.ChatOpenAI") as mock_chat:
            mock_llm_instance = MagicMock()
            mock_runnable = MagicMock()

            # Lần 1: fail với JSON error
            # Lần 2: thành công
            mock_runnable.invoke.side_effect = [
                Exception("json decode error"),  # attempt 0
                mock_result,  # attempt 1
            ]
            mock_llm_instance.with_structured_output.return_value = mock_runnable
            mock_chat.return_value = mock_llm_instance

            result = call_with_escalation(messages, DummySchema)

            # Verify: gọi 2 lần, cùng model (primary)
            assert mock_chat.call_count == 2
            assert result.name == "test"

    def test_fail_twice_escalate(self):
        """Fail 2 lần → lần 3 dùng escalated model."""
        messages = [{"role": "user", "content": "test"}]

        mock_result = DummySchema(name="test", value=42)
        with patch("src.services.llm.ChatOpenAI") as mock_chat:
            mock_llm_instance = MagicMock()
            mock_runnable = MagicMock()

            # Lần 1: fail
            # Lần 2: fail
            # Lần 3: thành công
            mock_runnable.invoke.side_effect = [
                Exception("json decode error"),  # attempt 0 - primary
                Exception("validation error"),  # attempt 1 - primary
                mock_result,  # attempt 2 - escalated
            ]
            mock_llm_instance.with_structured_output.return_value = mock_runnable
            mock_chat.return_value = mock_llm_instance

            call_with_escalation(messages, DummySchema)

            # Verify: gọi 3 lần
            assert mock_chat.call_count == 3

            # Verify: 2 lần đầu dùng primary, lần 3 dùng escalated
            calls = mock_chat.call_args_list
            assert _get_primary_model() in str(calls[0])
            assert _get_primary_model() in str(calls[1])
            assert _get_escalated_model() in str(calls[2])

    def test_fail_thrice_raise(self):
        """Fail 3 lần → ném lại đúng exception của lần cuối, không nuốt mất."""
        messages = [{"role": "user", "content": "test"}]

        with patch("src.services.llm.ChatOpenAI") as mock_chat:
            mock_llm_instance = MagicMock()
            mock_runnable = MagicMock()

            # Tất cả fail với schema error (escalatable)
            mock_runnable.invoke.side_effect = [
                Exception("validation error 1"),
                Exception("validation error 2"),
                Exception("validation error 3"),
            ]
            mock_llm_instance.with_structured_output.return_value = mock_runnable
            mock_chat.return_value = mock_llm_instance

            # Caller phải nhận được lỗi thật của lần thử cuối. Nếu chỗ này chỉ
            # assert `Exception` chung chung thì một `NotImplementedError` nuốt
            # mất nguyên nhân gốc vẫn làm test xanh.
            with pytest.raises(Exception) as exc_info:
                call_with_escalation(messages, DummySchema)

            assert not isinstance(exc_info.value, NotImplementedError)
            assert str(exc_info.value) == "validation error 3"

            # Verify: gọi đúng 3 lần
            assert mock_chat.call_count == MAX_RETRIES

    def test_non_escalatable_error_raise_immediately(self):
        """Lỗi rate limit → raise ngay, không retry."""
        messages = [{"role": "user", "content": "test"}]

        with patch("src.services.llm.ChatOpenAI") as mock_chat:
            mock_llm_instance = MagicMock()
            mock_runnable = MagicMock()

            # Fail với rate limit error (non-escalatable)
            mock_runnable.invoke.side_effect = Exception("rate limit exceeded")
            mock_llm_instance.with_structured_output.return_value = mock_runnable
            mock_chat.return_value = mock_llm_instance

            # Should raise ngay, không retry
            with pytest.raises(Exception) as exc_info:
                call_with_escalation(messages, DummySchema)

            assert "rate limit" in str(exc_info.value).lower()

            # Verify: chỉ gọi 1 lần, không retry
            assert mock_chat.call_count == 1
