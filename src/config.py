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

    # Database — user · review · job · trạng thái scenario.
    # ⚠ sqlite chỉ để chạy local. Nguồn thật là PostgreSQL — chờ ADR-011.
    database_url: str = "sqlite:///./data/app.db"

    # Vector store — CHỈ phục vụ retrieval, không phải DB giao dịch (ADR-003).
    # Đã bỏ `chroma_persist_dir` của template: ADR-003 chọn Qdrant vì cần
    # payload filter kết hợp vector search, và để vector store nằm ngoài
    # process backend cho khỏi ăn vào trần 512MB RAM của Render.
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""
    qdrant_collection: str = "scenarios"


@lru_cache
def get_settings() -> Settings:
    return Settings()
