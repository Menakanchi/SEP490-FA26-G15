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
