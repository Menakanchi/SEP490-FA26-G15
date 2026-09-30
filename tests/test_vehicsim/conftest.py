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


def _make_user(email: str, roles: tuple[str, ...]) -> dict:
    from src.services.auth import service, users
    from src.services.auth.passwords import hash_password

    user = users.create(email=email, full_name=email.split("@")[0], password_hash=hash_password("pass-12345"))
    for role in roles:
        users.grant_role(user.id, role)
    if "ENGINEER" not in roles:
        # Người tự đăng ký luôn có ENGINEER; bỏ đi để thử quyền chỉ-đọc.
        from sqlalchemy import delete, select

        with users.get_engine().begin() as conn:
            role_id = conn.execute(
                select(users.roles_table.c.id).where(users.roles_table.c.code == "ENGINEER")
            ).scalar()
            conn.execute(
                delete(users.user_roles_table).where(
                    users.user_roles_table.c.user_id == user.id, users.user_roles_table.c.role_id == role_id
                )
            )
    user = users.get_by_id(user.id)
    return {"user": user, "headers": {"Authorization": f"Bearer {service._session_for(user).access_token}"}}


@pytest.fixture
def engineer():
    from src.services.vehicsim.bootstrap import ensure_default_project

    who = _make_user("engineer@vehicsim.vn", ("ENGINEER",))
    ensure_default_project(who["user"].id)
    return who


@pytest.fixture
def viewer(engineer):
    return _make_user("viewer@vehicsim.vn", ("VIEWER",))


SMALL_FAMILY = {
    "name": "Pedestrian Crossing",
    "ego_speeds_kmh": [40, 60, 70],
    "trigger_distances_m": [20, 40],
    "pedestrian_speeds_mps": [1.5, 3.0],
    "stops_at_curb": [False, True],
    "weathers": ["CLEAR", "HEAVY_RAIN"],
    "times_of_day": ["DAY", "NIGHT"],
}
