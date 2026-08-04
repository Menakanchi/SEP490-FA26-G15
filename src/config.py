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
    model_name: str = "gpt-4o-mini"
    llm_temperature: float = Field(default=0.7, ge=0.0, le=2.0)

    # Transactional store — user · review · job · trạng thái scenario.
    # MVP dùng SQLite. Chỉ đổi DATABASE_URL sang PostgreSQL khi deployment
    # cần durable storage ngoài process hoặc phải xử lý concurrent writes.
    database_url: str = "sqlite:///./data/app.db"

    # Không có setting nào cho vector store, và đó là quyết định chứ không phải
    # thiếu sót: ADR-013 chốt embedding nằm cùng `database_url` dưới dạng BLOB,
    # xếp hạng bằng cosine của numpy. Không có service riêng để cấu hình.
    # (`chroma_persist_dir` của template đã bỏ từ ADR-003.)


@lru_cache
def get_settings() -> Settings:
    return Settings()
