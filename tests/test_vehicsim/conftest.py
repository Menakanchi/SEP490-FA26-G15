from __future__ import annotations

import pytest

from src.config import get_settings


@pytest.fixture(autouse=True)
def inline_runs(monkeypatch):
    """Test chạy mô phỏng ngay trong process — không cần Celery/Redis."""
    monkeypatch.setenv("VEHICSIM_RUN_MODE", "inline")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _make_user(email: str, role: str) -> dict:
    from src.services.auth import service, users
    from src.services.auth.passwords import hash_password

    user = users.create(
        email=email, full_name=email.split("@")[0], password_hash=hash_password("pass-12345"), role_code=role
    )
    return {"user": user, "headers": {"Authorization": f"Bearer {service._session_for(user).access_token}"}}


@pytest.fixture
def engineer():
    """Người làm việc trên project: tài khoản tự đăng ký (role EXPERIENCER) — tạo, chạy, candidate, regression."""
    from src.services.vehicsim.bootstrap import ensure_default_project

    who = _make_user("engineer@vehicsim.vn", "EXPERIENCER")
    ensure_default_project(who["user"].id)
    return who


@pytest.fixture
def reviewer(engineer):
    """REVIEWER (Admin cấp): đọc và Accept / Reject recommendation, không chạy mô phỏng (ADR-035)."""
    return _make_user("reviewer@vehicsim.vn", "REVIEWER")


@pytest.fixture
def viewer(engineer):
    """Tài khoản chỉ đọc: MANAGER không làm engineering và không duyệt."""
    return _make_user("viewer@vehicsim.vn", "MANAGER")


@pytest.fixture
def manager(engineer):
    """MANAGER (Admin cấp): quản lý workspace, không chạy mô phỏng."""
    return _make_user("manager@vehicsim.vn", "MANAGER")


SMALL_FAMILY = {
    "name": "Pedestrian Crossing",
    "ego_speeds_kmh": [40, 60, 70],
    "trigger_distances_m": [20, 40],
    "pedestrian_speeds_mps": [1.5, 3.0],
    "stops_at_curb": [False, True],
    "weathers": ["CLEAR", "HEAVY_RAIN"],
    "times_of_day": ["DAY", "NIGHT"],
}
