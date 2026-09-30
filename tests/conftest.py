import os
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.config import get_settings
from src.main import app


@pytest.fixture(autouse=True)
def isolated_database(tmp_path, monkeypatch):
    """Mỗi test một file SQLite riêng, dựng sẵn schema.

    Autouse vì hai lý do. Một: không test nào được ghi vào `data/app.db` của bản
    dev — chạy `pytest` mà mất dữ liệu đang xem là chuyện không ai ngờ tới. Hai:
    `db.py` cố ý **không** tạo bảng lúc import (import một module không nên đẻ ra
    file trên đĩa), nên chỗ dựng schema cho test phải là đây.
    """
    from src.agents.nodes.persist_node import get_repository
    from src.services import db

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    get_settings.cache_clear()
    # `get_repository` là `@lru_cache(maxsize=1)`: nó giữ engine dựng từ
    # `database_url` của **lần gọi đầu tiên**. Không xoá thì test thứ hai trở đi
    # ghi vào file của test thứ nhất — file đã bị dọn — và persist hỏng im lặng.
    # Cùng lý do áp cho production: đổi DATABASE_URL lúc chạy sẽ không có tác dụng.
    get_repository.cache_clear()
    db.init_db()
    yield
    get_repository.cache_clear()
    get_settings.cache_clear()


TEST_JWT_SECRET = "test-only-jwt-secret-not-for-production"


@pytest.fixture(autouse=True)
def isolated_auth(monkeypatch, isolated_database):
    """Xác thực chạy trên SQLite trong RAM + fakeredis, không cần MySQL/Redis thật.

    Bảng dựng từ chính ``users.metadata`` (cùng cột với ``01_schema.sql``) và
    seed ba role như file SQL. Phụ thuộc ``isolated_database`` để chạy SAU nó —
    fixture đó xoá cache ``get_settings`` mà khoá JWT ở đây cần.
    """
    import fakeredis
    from sqlalchemy import create_engine, insert
    from sqlalchemy.pool import StaticPool

    from src.services.auth import otp, tokens, users
    from src.services.vehicsim import tables as _vehicsim_tables  # noqa: F401 — đăng ký bảng vào metadata

    monkeypatch.setenv("JWT_SECRET_KEY", TEST_JWT_SECRET)
    get_settings.cache_clear()
    tokens.secret_key.cache_clear()

    # StaticPool: một kết nối dùng chung, nếu không mỗi kết nối "sqlite://" là
    # một DB rỗng riêng. check_same_thread=False vì route auth chạy trong threadpool.
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    users.metadata.create_all(engine)
    with engine.begin() as conn:
        now = users._now()
        conn.execute(
            insert(users.roles_table),
            [
                {"code": "ADMIN", "name": "Administrator", "created_at": now},
                {"code": "ENGINEER", "name": "Engineer", "created_at": now},
                {"code": "VIEWER", "name": "Viewer", "created_at": now},
            ],
        )
    monkeypatch.setattr(users, "get_engine", lambda: engine)

    fake_redis = fakeredis.FakeRedis(decode_responses=True)
    monkeypatch.setattr(otp, "get_redis", lambda: fake_redis)
    yield fake_redis
    tokens.secret_key.cache_clear()
    engine.dispose()


@pytest.fixture(autouse=True)
def pinned_llm_provider(monkeypatch):
    """Test không được phụ thuộc ``.env`` của máy dev.

    Biến môi trường thắng ``.env`` trong pydantic-settings, nên ghim ở đây là đủ:
    một người đặt ``LLM_PROVIDER=deepseek`` trong ``.env`` để chạy local vẫn chạy
    ra cùng kết quả test như CI. Test nào cần DeepSeek tự ``setenv`` đè lên.
    """
    monkeypatch.setenv("LLM_PROVIDER", "openai")
    monkeypatch.delenv("MODEL_NAME", raising=False)
    monkeypatch.delenv("ESCALATED_MODEL", raising=False)
    monkeypatch.setenv("LLM_REASONING_EFFORT", "none")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


@pytest.fixture(autouse=True)
def no_accidental_llm_calls(monkeypatch):
    """Chặn mọi lần gọi LLM thật mà test không cố ý mock.

    Lỗi này đã lọt vào repo **ba lần** (PR #36, #42, và lúc nối graph): một test
    gọi API trả phí, người viết không nhận ra vì trên máy họ có key nên nó cứ
    xanh. Trên CI thì fail 401; trên máy dev thì lặng lẽ tiêu tiền.

    Chặn ở đây thay vì trông vào việc mỗi người nhớ mock. Test nào **cố ý** mock
    thì ``patch`` của nó vẫn đè lên được, nên lưới này không cản việc bình thường.
    Muốn gọi thật thì bật ``RUN_LLM_TESTS=1`` — cùng công tắc với các test đã gate.
    """
    if os.getenv("RUN_LLM_TESTS") == "1":
        return

    def _blocked(*_args, **_kwargs):
        raise AssertionError(
            "Test này gọi LLM thật. Mock `src.services.llm.call_with_escalation`, "
            "hoặc gate bằng RUN_LLM_TESTS=1 nếu thật sự cần gọi API."
        )

    monkeypatch.setattr("src.services.llm.call_with_escalation", _blocked)


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing API endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def mock_llm():
    """Mock LLM to avoid calling OpenAI during tests.

    Usage in test:
        def test_something(mock_llm):
            # LLM calls will return mock response instead of hitting OpenAI
            ...
    """
    mock = AsyncMock()
    mock.ainvoke.return_value = AsyncMock(content="Mocked LLM response")
    return mock
