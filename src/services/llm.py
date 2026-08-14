import logging
import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI

from src.config import get_settings

logger = logging.getLogger(__name__)


def get_llm():
    # Ép load lại biến môi trường mới nhất từ file .env
    load_dotenv(override=True)

    settings = get_settings()

    # Kiểm tra OpenAI API Key theo thứ tự ưu tiên
    api_key = os.getenv("OPENAI_API_KEY") or getattr(settings, "openai_api_key", None)

    if not api_key or not str(api_key).strip() or api_key == "mock_key":
        raise ValueError(
            "Thiếu OPENAI_API_KEY hợp lệ trong file .env! Vui lòng kiểm tra lại cấu hình."
        )

    api_key = str(api_key).strip()

    # Set trực tiếp vào os.environ để LangChain SDK đọc chuẩn
    os.environ["OPENAI_API_KEY"] = api_key

    # Model mặc định chuyển sang gpt-4o-mini hoặc gpt-4o
    model_name = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    if len(api_key) >= 9:
        masked_key = f"{api_key[:5]}...{api_key[-4:]}"
    else:
        masked_key = "***"
    logger.info(f"Loaded OPENAI_API_KEY: {masked_key} with model {model_name}")

    return ChatOpenAI(
        model=model_name,
        openai_api_key=api_key,
        temperature=0,
    )


def get_embeddings():
    """Khởi tạo OpenAIEmbeddings dùng model text-embedding-3-small (1536 chiều)."""
    load_dotenv(override=True)
    settings = get_settings()
    api_key = os.getenv("OPENAI_API_KEY") or getattr(settings, "openai_api_key", None)
    if not api_key or not str(api_key).strip() or api_key == "mock_key":
        return None
    api_key = str(api_key).strip()
    os.environ["OPENAI_API_KEY"] = api_key

    try:
        from langchain_openai import OpenAIEmbeddings

        return OpenAIEmbeddings(
            model="text-embedding-3-small",
            openai_api_key=api_key,
        )
    except Exception as exc:
        logger.warning(f"Không thể khởi tạo OpenAIEmbeddings: {exc}")
        return None