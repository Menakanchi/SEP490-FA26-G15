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
    collect_provider_metrics,
    token_cost_usd,
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
            assert mock_chat.call_args.kwargs["reasoning_effort"] == "none"

            # Verify: trả về đúng kết quả
            assert result.name == "test"
            assert result.value == 42

    def test_provider_usage_tinh_ca_output_va_cached_input(self):
        """Cost phải dùng usage thật; output không được âm thầm tính bằng 0."""
        messages = [{"role": "user", "content": "test"}]
        raw = MagicMock()
        raw.usage_metadata = {
            "input_tokens": 1_000,
            "output_tokens": 200,
            "input_token_details": {"cache_read": 400},
        }
        envelope = {
            "raw": raw,
            "parsed": DummySchema(name="test", value=42),
            "parsing_error": None,
        }
        with patch("src.services.llm.ChatOpenAI") as mock_chat:
            mock_chat.return_value.with_structured_output.return_value.invoke.return_value = envelope
            with collect_provider_metrics() as events:
                result = call_with_escalation(messages, DummySchema, operation="benchmark")

        assert result.value == 42
        assert events[0]["token_source"] == "provider"
        assert events[0]["input_tokens"] == 1_000
        assert events[0]["output_tokens"] == 200
        assert events[0]["cost_usd"] == pytest.approx(
            token_cost_usd(
                _get_primary_model(),
                input_tokens=1_000,
                output_tokens=200,
                cached_input_tokens=400,
            )
        )

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

    def test_timeout_retries_three_times_at_http_layer(self):
        """Timeout phải retry đúng trần và được truyền xuống HTTP client."""
        messages = [{"role": "user", "content": "test"}]

        with patch("src.services.llm.ChatOpenAI") as mock_chat:
            mock_llm_instance = MagicMock()
            mock_runnable = MagicMock()
            mock_runnable.invoke.side_effect = TimeoutError("request timed out")
            mock_llm_instance.with_structured_output.return_value = mock_runnable
            mock_chat.return_value = mock_llm_instance

            with pytest.raises(TimeoutError, match="timed out after 0.01s"):
                call_with_escalation(messages, DummySchema, timeout=0.01)

        assert mock_chat.call_count == MAX_RETRIES
        assert mock_runnable.invoke.call_count == MAX_RETRIES
        for call in mock_chat.call_args_list:
            assert call.kwargs["timeout"] == 0.01
            assert call.kwargs["max_retries"] == 0

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


def test_token_cost_usd_tru_cached_khoi_input_thuong() -> None:
    # gpt-5.4-mini: 600 token thường × 0,75 + 400 cached × 0,075
    # + 200 output × 4,5, tất cả theo 1M token.
    assert token_cost_usd(
        "gpt-5.4-mini",
        input_tokens=1_000,
        cached_input_tokens=400,
        output_tokens=200,
    ) == pytest.approx((600 * 0.75 + 400 * 0.075 + 200 * 4.5) / 1_000_000)


# ---------------------------------------------------------------------------
# Chọn provider: LLM_PROVIDER=openai | deepseek
# ---------------------------------------------------------------------------


@pytest.fixture
def deepseek_env(monkeypatch):
    from src.config import get_settings

    monkeypatch.setenv("LLM_PROVIDER", "deepseek")
    monkeypatch.setenv("DEEPSEEK_API_KEY", "ds-test-key")
    monkeypatch.delenv("MODEL_NAME", raising=False)
    monkeypatch.delenv("ESCALATED_MODEL", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_deepseek_models_default_to_current_names(deepseek_env) -> None:
    # deepseek-chat / deepseek-reasoner đã ngừng 24/07/2026.
    assert _get_primary_model() == "deepseek-flash"
    assert _get_escalated_model() == "deepseek-v4-pro"


def test_explicit_model_name_wins_over_provider_default(deepseek_env, monkeypatch) -> None:
    from src.config import get_settings

    monkeypatch.setenv("MODEL_NAME", "deepseek-v4-pro")
    get_settings.cache_clear()
    assert _get_primary_model() == "deepseek-v4-pro"


def test_deepseek_client_uses_deepseek_endpoint_key_and_disables_thinking(deepseek_env) -> None:
    from src.services.llm import _chat_model

    client = _chat_model("deepseek-flash")
    assert client.model_name == "deepseek-flash"
    assert client.openai_api_base == "https://api.deepseek.com"
    assert client.openai_api_key.get_secret_value() == "ds-test-key"
    assert client.reasoning_effort == "none"


def test_deepseek_structured_output_goes_through_function_calling(deepseek_env) -> None:
    """DeepSeek không có response_format json_schema: structured output phải qua tool call."""
    messages = [{"role": "user", "content": "test"}]
    with patch("src.services.llm.ChatOpenAI") as mock_chat:
        runnable = MagicMock()
        runnable.invoke.return_value = DummySchema(name="x", value=1)
        mock_chat.return_value.with_structured_output.return_value = runnable
        call_with_escalation(messages, DummySchema)
    _, kwargs = mock_chat.return_value.with_structured_output.call_args
    assert kwargs["method"] == "function_calling"
    assert mock_chat.call_args.kwargs["base_url"] == "https://api.deepseek.com"


def test_openai_structured_output_keeps_langchain_default() -> None:
    from src.services.llm import structured_output_kwargs

    assert structured_output_kwargs() == {}


def test_deepseek_rejects_thinking_mode(monkeypatch) -> None:
    """Thinking mode của DeepSeek trả 400 cho tool call bắt buộc -> chặn ngay khi đọc config."""
    from pydantic import ValidationError

    from src.config import Settings

    with pytest.raises(ValidationError, match="LLM_REASONING_EFFORT=none"):
        Settings(_env_file=None, llm_provider="deepseek", llm_reasoning_effort="high")


def test_deepseek_cost_uses_peak_price_as_upper_bound() -> None:
    # 1M input, trong đó 400k cache hit; 100k output — giá cao điểm deepseek-flash.
    cost = token_cost_usd("deepseek-flash", input_tokens=1_000_000, cached_input_tokens=400_000, output_tokens=100_000)
    assert cost == pytest.approx(0.6 * 0.30 + 0.4 * 0.006 + 0.1 * 1.20)
