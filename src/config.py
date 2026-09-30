from functools import lru_cache
from typing import Literal

from pydantic import Field, model_validator
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

    # LLM — chọn provider bằng một biến môi trường (LLM_PROVIDER). Mọi lệnh gọi
    # đi qua src/services/llm.py nên không file nào khác phải biết provider là gì.
    llm_provider: Literal["openai", "deepseek"] = "openai"
    openai_api_key: str = ""
    # DeepSeek dùng API tương thích OpenAI. Nó KHÔNG có embeddings: retrieval
    # vẫn dùng OpenAI nếu có OPENAI_API_KEY, không có thì rơi về vector theo hash.
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    gemini_api_key: str | None = None
    google_api_key: str | None = None
    # Để trống trong .env thì lấy mặc định theo provider (xem _provider_model_defaults).
    model_name: str = "gpt-5.4-mini"
    escalated_model: str = "gpt-5.4"
    # OpenAI và DeepSeek đều nhận tham số này. Với DeepSeek, "none" = tắt thinking
    # mode — BẮT BUỘC, xem _provider_model_defaults.
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

    # Xác thực VehicSim — schema MySQL mới (database/mysql/01_schema.sql).
    # Chỉ src/services/auth đọc DB này; phần còn lại vẫn ở `database_url`.
    vehicsim_database_url: str = "mysql+pymysql://vehicsim:vehicsim@localhost:3306/vehicsim"
    redis_url: str = "redis://localhost:6379/0"
    # Rỗng ở development/test -> khoá ngẫu nhiên theo process (xem auth/tokens.py).
    # Rỗng ở production -> từ chối cấp token.
    jwt_secret_key: str = ""
    access_token_ttl_minutes: int = Field(default=60, ge=1, le=24 * 60)
    otp_ttl_seconds: int = Field(default=600, ge=60, le=3600)
    otp_max_attempts: int = Field(default=5, ge=1, le=20)
    otp_resend_cooldown_seconds: int = Field(default=60, ge=0, le=3600)
    # Chặn spam: số yêu cầu gửi mã / số lần đăng nhập tối đa từ một IP trong cửa sổ.
    otp_requests_per_ip: int = Field(default=5, ge=1)
    login_attempts_per_ip: int = Field(default=10, ge=1)
    rate_limit_window_seconds: int = Field(default=900, ge=60)

    # Vòng MVP: simulation chạy qua Celery (Redis làm broker, DB 1 để tách khỏi
    # key OTP ở DB 0). "inline" chạy ngay trong process gọi — dùng cho test và
    # khi dev không bật worker.
    vehicsim_run_mode: Literal["celery", "inline"] = "celery"
    celery_broker_url: str = "redis://localhost:6379/1"
    simulation_timeout_s: int = Field(default=120, ge=10, le=3600)

    # SMTP Email Configuration
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = Field(default=587, ge=1, le=65535)
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from_email: str = ""

    @model_validator(mode="after")
    def _provider_model_defaults(self) -> "Settings":
        """Model mặc định đi theo provider, trừ khi .env đặt rõ MODEL_NAME / ESCALATED_MODEL.

        Không có bước này thì LLM_PROVIDER=deepseek mà quên đổi MODEL_NAME sẽ gửi
        ``gpt-5.4-mini`` sang DeepSeek và mọi lệnh gọi hỏng với lỗi "model không tồn tại".
        """
        defaults = PROVIDER_DEFAULT_MODELS[self.llm_provider]
        if "model_name" not in self.model_fields_set:
            self.model_name = defaults[0]
        if "escalated_model" not in self.model_fields_set:
            self.escalated_model = defaults[1]
        # DeepSeek bật thinking mode mặc định, và ở mode đó API trả 400 cho
        # tool_choice ép một tool cụ thể — đúng cách structured output qua
        # function calling hoạt động. Để thinking bật là mọi lệnh gọi LLM hỏng.
        # (https://api-docs.deepseek.com/guides/thinking_mode, kiểm 29/09/2026)
        if self.llm_provider == "deepseek" and self.llm_reasoning_effort != "none":
            raise ValueError(
                "LLM_PROVIDER=deepseek cần LLM_REASONING_EFFORT=none: thinking mode của DeepSeek "
                "không cho ép tool call, nên structured output sẽ trả lỗi 400"
            )
        return self

    def llm_api_key(self) -> str:
        """Key của provider đang chọn."""
        return self.deepseek_api_key if self.llm_provider == "deepseek" else self.openai_api_key


PROVIDER_DEFAULT_MODELS: dict[str, tuple[str, str]] = {
    # (model bậc 1, model escalation)
    "openai": ("gpt-5.4-mini", "gpt-5.4"),
    # deepseek-chat / deepseek-reasoner đã ngừng từ 24/07/2026 (Change Log DeepSeek).
    "deepseek": ("deepseek-flash", "deepseek-v4-pro"),
}


@lru_cache
def get_settings() -> Settings:
    return Settings()
