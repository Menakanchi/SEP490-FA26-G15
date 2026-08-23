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
    cors_origins: str = "http://localhost:3000"

    # LLM
    openai_api_key: str = ""
    gemini_api_key: str | None = None
    google_api_key: str | None = None
    model_name: str = "gpt-5.4-mini"
    escalated_model: str = "gpt-5.4"

    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # Transactional store — user · review · job · trạng thái scenario.
    # MVP dùng SQLite. Chỉ đổi DATABASE_URL sang PostgreSQL khi deployment
    # cần durable storage ngoài process hoặc phải xử lý concurrent writes.
    database_url: str = "sqlite:///./data/app.db"

    # Không có setting nào cho vector store, và đó là quyết định chứ không phải
    # thiếu sót: ADR-013 chốt embedding nằm cùng `database_url` dưới dạng BLOB,
    # xếp hạng bằng cosine của numpy. Không có service riêng để cấu hình.
    # SMTP Email
    smtp_host: str = "localhost"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_name: str = "Scenario Forge ADAS"
    smtp_from_email: str = "noreply@scenarioforge.ai"
    smtp_use_tls: bool = True


@lru_cache
def get_settings() -> Settings:
    return Settings()
