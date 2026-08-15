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
    from src.services import db

    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}")
    get_settings.cache_clear()
    db.init_db()
    yield
    get_settings.cache_clear()


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
