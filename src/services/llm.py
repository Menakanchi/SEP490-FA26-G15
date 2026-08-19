from __future__ import annotations

import json
import logging
import time
from typing import Any

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
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


# Chi phí theo 1M tokens (estimate, cập nhật theo bảng giá OpenAI)
# Chỉ 2 model đang dùng: gpt-5.4-mini (primary) và gpt-5.4 (escalated)
MODEL_COSTS = {
    "gpt-5.4-mini": {"input": 0.15, "output": 0.6},
    "gpt-5.4": {"input": 2.5, "output": 10.0},
}

# ADR-006. Đi kèm số chiều 1536 mà cột BLOB của ADR-013 đang giả định.
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536

# =============================================================================
# Constants cho model escalation
# =============================================================================

# Số lần thử tối đa trước khi báo lỗi
MAX_RETRIES = 3

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


def _chat_model(model_name: str) -> ChatOpenAI:
    """Client cho một model cụ thể. **Chỗ duy nhất dựng ``ChatOpenAI``.**

    ``get_llm`` và ``call_with_escalation`` từng dựng client bằng hai đoạn code
    giống hệt nhau. Hai chỗ đọc cùng ba setting thì lệch nhau vào lần đầu ai đó
    thêm ``timeout=`` hay ``max_retries=`` ở một bên — và bên còn lại vẫn chạy,
    chỉ là với cấu hình khác, ở đúng đường escalation mà không ai test tay.
    """
    settings = get_settings()
    return ChatOpenAI(
        model=model_name,
        api_key=settings.openai_api_key,
        temperature=settings.llm_temperature,
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
    structured_output_schema: type[BaseModel],
) -> BaseModel:
    """
    Gọi LLM với automatic model escalation.

    Flow:
        Attempt 0, 1: Dùng primary model (gpt-5.4-mini)
        Attempt 2: Dùng escalated model (gpt-5.4)
        Fail 3 lần → trả lỗi có cấu trúc

    Args:
        messages: Danh sách messages theo format LangChain
        structured_output_schema: Pydantic schema cho structured output

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
            runnable = _chat_model(model_to_use).with_structured_output(structured_output_schema)
            result = runnable.invoke(messages)

            # Tính latency và cost
            latency = time.time() - start_time
            total_latency += latency

            # Ước tính cost dựa trên token count (LangChain không trả token count trực tiếp)
            # Sử dụng estimate dựa trên số tin nhắn
            estimated_tokens = sum(len(str(msg.get("content", ""))) // 4 for msg in messages)
            cost_info = MODEL_COSTS.get(model_to_use, {"input": 0.0, "output": 0.0})
            estimated_cost = (estimated_tokens / 1_000_000) * cost_info["input"]
            total_cost += estimated_cost

            _log_event(
                logging.INFO,
                "llm_call_success",
                model=model_to_use,
                latency=round(latency, 3),
                cost=round(estimated_cost, 6),
                attempt=attempt,
                escalated=attempt >= 2,
            )

            return result

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
