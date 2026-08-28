from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "Scenario Forge"
    app_env: Literal["development", "production", "test"] = "development"
    app_port: int = Field(default=8000, ge=1, le=65535)
    app_host: str = "0.0.0.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # LLM
    openai_api_key: str = ""
    gemini_api_key: str | None = None
    google_api_key: str | None = None
    model_name: str = "gpt-5.4-mini"
    escalated_model: str = "gpt-5.4"
    llm_reasoning_effort: Literal["none", "low", "medium", "high", "xhigh", "max"] = "none"

    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # Transactional store — user · review · job · trạng thái scenario.
    # MVP dùng SQLite. Chỉ đổi DATABASE_URL sang PostgreSQL khi deployment
    # cần durable storage ngoài process hoặc phải xử lý concurrent writes.
    database_url: str = "sqlite:///./data/app.db"

    # Không có setting nào cho vector store, và đó là quyết định chứ không phải
    # thiếu sót: ADR-013 chốt embedding nằm cùng `database_url` dưới dạng BLOB,
    # xếp hạng bằng cosine của numpy. Không có service riêng để cấu hình.
    # (`chroma_persist_dir` của template đã bỏ từ ADR-003.)

    # Near-duplicate detection (ADR-019). Delta trigger mang cùng đơn vị với
    # trigger.type: giây cho simulation_time, mét cho hai loại khoảng cách.
    near_duplicate_trigger_delta: float = Field(default=5.0, ge=0.0)
    near_duplicate_speed_kmh: float = Field(default=5.0, ge=0.0)
    near_duplicate_distance_m: float = Field(default=5.0, ge=0.0)

    # SMTP Email Configuration
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""



@lru_cache
def get_settings() -> Settings:
    return Settings()
