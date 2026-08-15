from __future__ import annotations

from typing import Any

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from pydantic import BaseModel

from src.config import get_settings

# ADR-006. Đi kèm số chiều 1536 mà cột BLOB của ADR-013 đang giả định.
EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIM = 1536

# =============================================================================
# Constants cho model escalation
# =============================================================================

# Số lần thử tối đa trước khi báo lỗi
MAX_RETRIES = 3

# Các lỗi mà model to hơn CÓ THỂ cứu được
# (output không parse được, thiếu trường, sai kiểu)
ESCALATABLE_ERRORS = frozenset(
    {
        "LLM_OUTPUT_NOT_JSON",
        "SCHEMA_INVALID",
        "SCHEMA_EXTRA_FIELD",
    }
)

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


def get_llm() -> ChatOpenAI:
    settings = get_settings()
    return ChatOpenAI(
        model=settings.model_name,
        api_key=settings.openai_api_key,
        temperature=settings.llm_temperature,
    )


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
        Fail lần 1 (attempt=0) → retry cùng model (gpt-5.4-mini)
        Fail lần 2 (attempt=1) → chuyển sang model to (gpt-5.4)
        Fail lần 3 (attempt=2) → trả lỗi có cấu trúc

    Args:
        messages: Danh sách messages theo format LangChain
        structured_output_schema: Pydantic schema cho structured output

    Returns:
        Structured output đã được parse thành object
    """
    last_error: Exception | None = None

    for attempt in range(MAX_RETRIES):
        # attempt < 2: dùng primary model (đọc từ config)
        # attempt >= 2: dùng escalated model (đọc từ config)
        model_to_use = _get_escalated_model() if attempt >= 2 else _get_primary_model()

        try:
            llm = ChatOpenAI(
                model=model_to_use,
                api_key=get_settings().openai_api_key,
                temperature=get_settings().llm_temperature,
            )
            runnable = llm.with_structured_output(structured_output_schema)
            result = runnable.invoke(messages)

            return result

        except Exception as e:
            error_code = _extract_error_code(e)
            last_error = e

            if error_code in NON_ESCALATABLE_ERRORS:
                raise
            continue

    # Hết MAX_RETRIES mà vẫn fail. Ném lại đúng exception của lần cuối: nuốt nó
    # rồi raise NotImplementedError thì caller mất sạch thông tin chẩn đoán —
    # repair_draft và failure analysis không còn gì để bám vào.
    if last_error is not None:
        raise last_error
    raise RuntimeError("call_with_escalation kết thúc mà không có kết quả lẫn lỗi")
