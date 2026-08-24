from __future__ import annotations

import json
import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Any

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from openai import APITimeoutError
from pydantic import BaseModel

from src.config import get_settings

logger = logging.getLogger(__name__)


def _log_event(level: int, event: str, **fields: Any) -> None:
    """Một dòng log JSON. Bốn chỗ trong file này phát cùng một hình dạng.

    Viết ``logger.x(json.dumps({...}))`` bốn lần thì đủ để một lần quên
    ``json.dumps`` — và dòng đó vẫn ra log, chỉ là ở dạng repr của dict, nên
    thứ đọc log bằng máy bỏ qua nó **mà không báo gì**.
    """
    logger.log(level, json.dumps({"event": event, **fields}))


# Giá Standard theo 1M token, kiểm tra ngày 24/08/2026 từ trang model chính
# thức của OpenAI. Cached input được tính riêng; output gồm cả reasoning token
# mà provider báo trong ``usage_metadata``.
MODEL_COSTS = {
    "gpt-5.4-mini": {"input": 0.75, "cached_input": 0.075, "output": 4.5},
    "gpt-5.4": {"input": 2.5, "cached_input": 0.25, "output": 15.0},
}

# ADR-006. Đi kèm số chiều 1536 mà cột BLOB của ADR-013 đang giả định.
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536
EMBEDDING_COST_PER_MILLION_TOKENS = 0.02


# Mỗi request FastAPI chạy trong một asyncio task riêng. ContextVar giữ bộ thu
# metric đúng theo task đó, không trộn hai request chạy đồng thời và không buộc
# các node biết về HTTP hay database.
_PROVIDER_METRIC_SINK: ContextVar[list[dict[str, Any]] | None] = ContextVar("provider_metric_sink", default=None)


@contextmanager
def collect_provider_metrics() -> Iterator[list[dict[str, Any]]]:
    """Thu metric provider trong đúng workflow hiện tại."""
    events: list[dict[str, Any]] = []
    token = _PROVIDER_METRIC_SINK.set(events)
    try:
        yield events
    finally:
        _PROVIDER_METRIC_SINK.reset(token)


def record_provider_metric(**fields: Any) -> None:
    """Ghi một event vào collector hiện tại, nếu request đang bật collector."""
    sink = _PROVIDER_METRIC_SINK.get()
    if sink is not None:
        sink.append(dict(fields))


def token_cost_usd(
    model: str,
    *,
    input_tokens: int,
    output_tokens: int,
    cached_input_tokens: int = 0,
) -> float:
    """Tính tiền từ token usage thật theo bảng giá cấu hình.

    ``input_tokens`` do API báo đã gồm cached input. Vì vậy phần input thường
    phải trừ cached trước, nếu không cùng một token bị tính hai lần.
    """
    prices = MODEL_COSTS.get(model)
    if not prices:
        return 0.0
    uncached = max(0, input_tokens - cached_input_tokens)
    return (
        uncached * prices["input"] + cached_input_tokens * prices["cached_input"] + output_tokens * prices["output"]
    ) / 1_000_000


def summarize_provider_metrics(events: list[dict[str, Any]]) -> dict[str, Any]:
    """Gộp event LLM/embedding thành số theo một generation request."""
    return {
        "calls": len(events),
        "llm_calls": sum(event.get("kind") == "llm" for event in events),
        "embedding_calls": sum(event.get("kind") == "embedding" for event in events),
        "input_tokens": sum(int(event.get("input_tokens") or 0) for event in events),
        "cached_input_tokens": sum(int(event.get("cached_input_tokens") or 0) for event in events),
        "output_tokens": sum(int(event.get("output_tokens") or 0) for event in events),
        "latency_s": round(sum(float(event.get("latency_s") or 0.0) for event in events), 6),
        "cost_usd": round(sum(float(event.get("cost_usd") or 0.0) for event in events), 9),
        "events": events,
    }


def measure_structured_response(
    envelope: Any,
    *,
    messages: list[Any],
    model: str,
    operation: str,
    attempt: int,
    latency_s: float,
) -> tuple[Any, Exception | None, float]:
    """Tách parsed output, ghi usage và trả cost của một structured response.

    Dùng chung cho đường có escalation và fallback semantic của parse_intent.
    Mock offline trả thẳng Pydantic object; provider thật trả envelope khi
    ``include_raw=True``.
    """
    if isinstance(envelope, dict) and {"raw", "parsed", "parsing_error"}.issubset(envelope):
        raw = envelope["raw"]
        usage = getattr(raw, "usage_metadata", None) or {}
        input_tokens = int(usage.get("input_tokens") or 0)
        output_tokens = int(usage.get("output_tokens") or 0)
        input_details = usage.get("input_token_details") or {}
        cached_input_tokens = int(input_details.get("cache_read") or 0)
        result = envelope["parsed"]
        parsing_error = envelope["parsing_error"]
        token_source = "provider"
    else:

        def _content(message: Any) -> str:
            if isinstance(message, dict):
                return str(message.get("content", ""))
            return str(getattr(message, "content", ""))

        input_tokens = sum(max(1, len(_content(message)) // 4) for message in messages)
        output_tokens = 0
        cached_input_tokens = 0
        result = envelope
        parsing_error = None
        token_source = "estimated_input_only"

    cost = token_cost_usd(
        model,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cached_input_tokens=cached_input_tokens,
    )
    event = {
        "kind": "llm",
        "operation": operation,
        "model": model,
        "attempt": attempt,
        "escalated": attempt >= 2,
        "latency_s": round(latency_s, 6),
        "input_tokens": input_tokens,
        "cached_input_tokens": cached_input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": round(cost, 9),
        "token_source": token_source,
    }
    record_provider_metric(**event)
    _log_event(logging.INFO, "llm_call_success", **event)
    return result, parsing_error, cost


# =============================================================================
# Constants cho model escalation
# =============================================================================

# Số lần thử tối đa trước khi báo lỗi
MAX_RETRIES = 3

# Timeout mặc định cho LLM call (giây)
DEFAULT_TIMEOUT = 60

# Các lỗi mà model to hơn KHÔNG giúp được gì
# (lỗi hạ tầng, không phải lỗi "suy nghĩ" của LLM)
NON_ESCALATABLE_ERRORS = frozenset(
    {
        "LLM_PROVIDER_ERROR",
        "BUDGET_EXCEEDED",
    }
)


# =============================================================================
# Model configuration - đọc từ config
# =============================================================================


def _get_primary_model() -> str:
    """Lấy model bậc 1 từ config (env). Mặc định: gpt-5.4-mini"""
    return get_settings().model_name


def _get_escalated_model() -> str:
    """Lấy model bậc 2 từ config (env). Mặc định: gpt-5.4"""
    return get_settings().escalated_model


# =============================================================================
# Hàm gốc - giữ nguyên vì code khác có thể dùng
# =============================================================================


def _chat_model(
    model_name: str,
    *,
    timeout: float | None = None,
    max_retries: int | None = None,
) -> ChatOpenAI:
    """Client cho một model cụ thể. **Chỗ duy nhất dựng ``ChatOpenAI``.**

    ``get_llm`` và ``call_with_escalation`` từng dựng client bằng hai đoạn code
    giống hệt nhau. Hai chỗ đọc cùng ba setting thì lệch nhau vào lần đầu ai đó
    thêm ``timeout=`` hay ``max_retries=`` ở một bên — và bên còn lại vẫn chạy,
    chỉ là với cấu hình khác, ở đúng đường escalation mà không ai test tay.
    """
    settings = get_settings()
    client_options: dict[str, Any] = {}
    if timeout is not None:
        client_options["timeout"] = timeout
    if max_retries is not None:
        client_options["max_retries"] = max_retries

    return ChatOpenAI(
        model=model_name,
        api_key=settings.openai_api_key,
        temperature=settings.llm_temperature,
        **client_options,
    )


def get_llm() -> ChatOpenAI:
    return _chat_model(_get_primary_model())


def get_embeddings() -> OpenAIEmbeddings | None:
    """Embedder cho retrieval, hoặc ``None`` khi chưa cấu hình được key.

    ADR-006 chốt ``text-embedding-3-small``; ADR-013 chốt vector sống trong cột
    BLOB của chính SQLite. Kích thước 1536 là **một phần của hợp đồng lưu trữ**,
    không phải tham số tuỳ chỉnh: đổi nó là phải re-embed toàn bộ corpus, nên nó
    nằm ở đây cùng tên model chứ không rải ra chỗ gọi.

    Trả ``None`` thay vì ném khi thiếu key. Người gọi duy nhất là
    ``retriever.generate_text_embedding``, và nó có sẵn đường lui deterministic
    theo hash để unit test chạy offline — biến "thiếu key" thành một exception ở
    đây sẽ làm hỏng đúng đường lui đó.
    """
    settings = get_settings()
    if not settings.openai_api_key.strip():
        return None
    return OpenAIEmbeddings(model=EMBEDDING_MODEL, api_key=settings.openai_api_key)


# Model Escalation
def _extract_error_code(exception: Exception) -> str:
    """
    Trích xuất error code từ exception để phân loại escalation.

    Các loại lỗi có thể gặp:
    - LLM trả về không parse được JSON → LLM_OUTPUT_NOT_JSON
    - JSON parse được nhưng Pydantic từ chối → SCHEMA_INVALID / SCHEMA_EXTRA_FIELD
    - Rate limit / timeout / 5xx → LLM_PROVIDER_ERROR
    - Hết budget → BUDGET_EXCEEDED
    """
    error_message = str(exception).lower()

    if "json" in error_message and (
        "decode" in error_message or "parse" in error_message or "invalid" in error_message
    ):
        return "LLM_OUTPUT_NOT_JSON"

    if "validation error" in error_message or "field required" in error_message:
        return "SCHEMA_INVALID"

    if "extra fields not permitted" in error_message or "extra_field" in error_message:
        return "SCHEMA_EXTRA_FIELD"

    if any(keyword in error_message for keyword in ["rate limit", "timeout", "429", "500", "502", "503", "504"]):
        return "LLM_PROVIDER_ERROR"

    if "budget" in error_message or "quota" in error_message or "insufficient" in error_message:
        return "BUDGET_EXCEEDED"

    return "LLM_PROVIDER_ERROR"


def call_with_escalation(
    messages: list[dict[str, Any]],
    structured_output_schema: type[BaseModel] | dict[str, Any],
    timeout: int = DEFAULT_TIMEOUT,
    *,
    operation: str = "llm",
) -> BaseModel | dict[str, Any]:
    """
    Gọi LLM với automatic model escalation và timeout.

    Flow:
        Attempt 0, 1: Dùng primary model (gpt-5.4-mini)
        Attempt 2: Dùng escalated model (gpt-5.4)
        Fail 3 lần → trả lỗi có cấu trúc

    Args:
        messages: Danh sách messages theo format LangChain
        structured_output_schema: Pydantic model hoặc JSON Schema cho structured output.
            JSON Schema được dùng khi caller cần giữ output thô để validation/
            repair ở tầng workflow xử lý các invariant liên trường.
        timeout: Số giây tối đa cho mỗi lần gọi (mặc định 60s)

    Returns:
        Structured output đã được parse thành object
    """
    last_error: Exception | None = None
    total_latency = 0.0
    total_cost = 0.0

    for attempt in range(MAX_RETRIES):
        # attempt < 2: dùng primary model (đọc từ config)
        # attempt >= 2: dùng escalated model (đọc từ config)
        model_to_use = _get_escalated_model() if attempt >= 2 else _get_primary_model()
        start_time = time.time()

        try:
            # Timeout phải ở tầng HTTP. Bọc ``invoke`` trong thread rồi chờ
            # Future không thể huỷ request nền vẫn có thể treo khi executor
            # shutdown. Tắt retry nội bộ của OpenAI để MAX_RETRIES ở đây
            # là trần duy nhất, quan sát được.
            runnable = _chat_model(model_to_use, timeout=timeout, max_retries=0).with_structured_output(
                structured_output_schema, include_raw=True
            )
            envelope = runnable.invoke(messages)

            latency = time.time() - start_time
            total_latency += latency
            result, parsing_error, cost = measure_structured_response(
                envelope,
                messages=messages,
                model=model_to_use,
                operation=operation,
                attempt=attempt,
                latency_s=latency,
            )
            total_cost += cost

            if parsing_error is not None:
                raise parsing_error

            return result

        except (APITimeoutError, TimeoutError):
            latency = time.time() - start_time
            timeout_error = TimeoutError(f"LLM call timed out after {timeout}s (attempt {attempt})")
            last_error = timeout_error

            _log_event(
                logging.WARNING,
                "llm_call_timeout",
                model=model_to_use,
                latency=round(latency, 3),
                timeout_seconds=timeout,
                attempt=attempt,
            )
            continue

        except Exception as e:
            latency = time.time() - start_time
            error_code = _extract_error_code(e)
            last_error = e

            if error_code in NON_ESCALATABLE_ERRORS:
                _log_event(
                    logging.ERROR,
                    "llm_call_failed",
                    model=model_to_use,
                    latency=round(latency, 3),
                    error_code=error_code,
                    escalatable=False,
                )
                raise

            _log_event(
                logging.WARNING,
                "llm_call_retry",
                model=model_to_use,
                latency=round(latency, 3),
                error_code=error_code,
                attempt=attempt,
            )
            continue

    # Hết MAX_RETRIES mà vẫn fail. Ném lại đúng exception của lần cuối: nuốt nó
    # rồi raise NotImplementedError thì caller mất sạch thông tin chẩn đoán —
    # repair_draft và failure analysis không còn gì để bám vào.
    _log_event(
        logging.ERROR,
        "llm_call_exhausted",
        total_latency=round(total_latency, 3),
        total_cost=round(total_cost, 6),
        last_error=str(last_error) if last_error else None,
    )
    if last_error is not None:
        raise last_error
    raise RuntimeError("call_with_escalation kết thúc mà không có kết quả lẫn lỗi")
