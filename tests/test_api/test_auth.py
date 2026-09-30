"""Xác thực VehicSim: đăng ký / quên mật khẩu bằng OTP email 6 số, đăng nhập JWT.

Mỗi test chạy trên SQLite trong RAM + fakeredis (fixture ``isolated_auth`` ở
conftest). Mail không gửi thật: ``outbox`` bắt mọi lần gọi ``send_otp_email``.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

import jwt
import pytest

from src.config import get_settings
from src.services.auth import otp, service, tokens, users
from src.services.auth.otp import OtpPurpose
from tests.conftest import TEST_JWT_SECRET

API = "/api/v1/auth"
PASSWORD = "correct-horse-9"


@pytest.fixture
def outbox(monkeypatch):
    sent: list[dict] = []

    def _fake_send(to_email, code, purpose, ttl_minutes):
        sent.append({"to": to_email, "code": code, "purpose": purpose})
        return True

    monkeypatch.setattr("src.api.auth_routes.send_otp_email", _fake_send)
    return sent


async def _register(client, outbox, email="kysu@vehicsim.vn", password=PASSWORD):
    res = await client.post(f"{API}/register/request", json={"email": email})
    assert res.status_code == 202
    code = outbox[-1]["code"]
    res = await client.post(
        f"{API}/register/verify",
        json={"email": email, "code": code, "full_name": "Kỹ Sư A", "password": password},
    )
    assert res.status_code == 201, res.text
    return res.json()


def _bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def _wrong(code: str) -> str:
    return f"{(int(code) + 1) % 10**6:06d}"


# ---------------------------------------------------------------------------
# Đăng ký
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_register_with_emailed_code_creates_engineer_and_logs_in(client, outbox):
    body = await _register(client, outbox)

    assert outbox[0]["purpose"] == "register"
    assert len(outbox[0]["code"]) == 6 and outbox[0]["code"].isdigit()
    assert body["token_type"] == "bearer" and body["expires_in"] > 0
    assert body["user"]["email"] == "kysu@vehicsim.vn"
    assert body["user"]["roles"] == ["ENGINEER"]
    assert "password_hash" not in body["user"]

    me = await client.get(f"{API}/me", headers=_bearer(body["access_token"]))
    assert me.status_code == 200
    assert me.json()["email"] == "kysu@vehicsim.vn"


@pytest.mark.asyncio
async def test_register_request_does_not_reveal_existing_email(client, outbox):
    await _register(client, outbox)
    sent_before = len(outbox)

    fresh = await client.post(f"{API}/register/request", json={"email": "moi@vehicsim.vn"})
    existing = await client.post(f"{API}/register/request", json={"email": "KySu@VehicSim.vn"})

    assert existing.status_code == fresh.status_code == 202
    assert existing.json() == fresh.json()
    # Chỉ email mới nhận mã; email đã có tài khoản thì không gửi gì.
    assert [m["to"] for m in outbox[sent_before:]] == ["moi@vehicsim.vn"]


@pytest.mark.asyncio
async def test_register_code_is_single_use(client, outbox):
    await client.post(f"{API}/register/request", json={"email": "a@vehicsim.vn"})
    payload = {"email": "a@vehicsim.vn", "code": outbox[-1]["code"], "full_name": "A", "password": PASSWORD}

    assert (await client.post(f"{API}/register/verify", json=payload)).status_code == 201
    again = await client.post(f"{API}/register/verify", json=payload)
    assert again.status_code == 400


@pytest.mark.asyncio
async def test_code_is_burned_after_max_wrong_attempts(client, outbox):
    await client.post(f"{API}/register/request", json={"email": "a@vehicsim.vn"})
    code = outbox[-1]["code"]
    base = {"email": "a@vehicsim.vn", "full_name": "A", "password": PASSWORD}

    for _ in range(get_settings().otp_max_attempts):
        res = await client.post(f"{API}/register/verify", json={**base, "code": _wrong(code)})
        assert res.status_code == 400

    # Hết lượt: kể cả mã đúng cũng không còn dùng được.
    res = await client.post(f"{API}/register/verify", json={**base, "code": code})
    assert res.status_code == 400
    assert users.get_by_email("a@vehicsim.vn") is None


@pytest.mark.asyncio
async def test_resend_within_cooldown_sends_nothing_new(client, outbox):
    first = await client.post(f"{API}/register/request", json={"email": "a@vehicsim.vn"})
    second = await client.post(f"{API}/register/request", json={"email": "a@vehicsim.vn"})
    assert first.json() == second.json()
    assert len(outbox) == 1


@pytest.mark.asyncio
async def test_register_rejects_weak_password_and_malformed_code(client, outbox):
    await client.post(f"{API}/register/request", json={"email": "a@vehicsim.vn"})
    code = outbox[-1]["code"]
    base = {"email": "a@vehicsim.vn", "full_name": "A"}

    short = await client.post(f"{API}/register/verify", json={**base, "code": code, "password": "1234567"})
    assert short.status_code == 422
    too_long = await client.post(f"{API}/register/verify", json={**base, "code": code, "password": "x" * 129})
    assert too_long.status_code == 422
    letters = await client.post(f"{API}/register/verify", json={**base, "code": "12ab56", "password": PASSWORD})
    assert letters.status_code == 422


# ---------------------------------------------------------------------------
# Quên mật khẩu
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_password_reset_flow_revokes_old_sessions(client, outbox):
    old_session = await _register(client, outbox)

    res = await client.post(f"{API}/password/forgot", json={"email": "kysu@vehicsim.vn"})
    assert res.status_code == 202
    assert outbox[-1]["purpose"] == "reset"

    new_password = "brand-new-pass-7"
    res = await client.post(
        f"{API}/password/reset",
        json={"email": "kysu@vehicsim.vn", "code": outbox[-1]["code"], "new_password": new_password},
    )
    assert res.status_code == 200

    # Token cấp trước khi đổi mật khẩu hết hiệu lực ngay, không cần chờ hết hạn.
    stale = await client.get(f"{API}/me", headers=_bearer(old_session["access_token"]))
    assert stale.status_code == 401

    old_login = await client.post(f"{API}/login", json={"email": "kysu@vehicsim.vn", "password": PASSWORD})
    assert old_login.status_code == 401
    new_login = await client.post(f"{API}/login", json={"email": "kysu@vehicsim.vn", "password": new_password})
    assert new_login.status_code == 200


@pytest.mark.asyncio
async def test_forgot_password_does_not_reveal_unknown_email(client, outbox):
    await _register(client, outbox)
    sent_before = len(outbox)

    unknown = await client.post(f"{API}/password/forgot", json={"email": "khongco@vehicsim.vn"})
    known = await client.post(f"{API}/password/forgot", json={"email": "kysu@vehicsim.vn"})

    assert unknown.status_code == known.status_code == 202
    assert unknown.json() == known.json()
    assert [m["to"] for m in outbox[sent_before:]] == ["kysu@vehicsim.vn"]


def test_otp_purposes_do_not_cross():
    """Cùng một email, mã đăng ký không qua được cổng đặt lại mật khẩu — và ngược lại."""
    email = "e@vehicsim.vn"
    register_code = otp.issue(OtpPurpose.REGISTER, email)
    reset_code = otp.issue(OtpPurpose.RESET, email)

    assert not otp.verify(OtpPurpose.RESET, email, register_code)
    assert not otp.verify(OtpPurpose.REGISTER, email, reset_code)
    # Lần thử sai ở trên không tiêu mất mã đúng của từng mục đích.
    assert otp.verify(OtpPurpose.REGISTER, email, register_code)
    assert otp.verify(OtpPurpose.RESET, email, reset_code)


def test_otp_is_stored_hashed_not_in_plain(isolated_auth):
    code = otp.issue(OtpPurpose.REGISTER, "f@vehicsim.vn")
    stored = isolated_auth.hgetall("otp:register:f@vehicsim.vn")
    assert stored and code not in stored["h"]
    assert isolated_auth.ttl("otp:register:f@vehicsim.vn") > 0


# ---------------------------------------------------------------------------
# Đăng nhập và token
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_login_wrong_password_and_unknown_email_look_the_same(client, outbox):
    await _register(client, outbox)

    wrong_pw = await client.post(f"{API}/login", json={"email": "kysu@vehicsim.vn", "password": "wrong-pass-1"})
    unknown = await client.post(f"{API}/login", json={"email": "ai@vehicsim.vn", "password": "wrong-pass-1"})

    assert wrong_pw.status_code == unknown.status_code == 401
    assert wrong_pw.json() == unknown.json()


@pytest.mark.asyncio
async def test_login_is_case_insensitive_on_email(client, outbox):
    await _register(client, outbox, email="KySu@VehicSim.vn")
    res = await client.post(f"{API}/login", json={"email": "kysu@vehicsim.vn", "password": PASSWORD})
    assert res.status_code == 200
    assert res.json()["user"]["email"] == "kysu@vehicsim.vn"


@pytest.mark.asyncio
async def test_disabled_account_cannot_login_or_use_token(client, outbox):
    body = await _register(client, outbox)
    with users.get_engine().begin() as conn:
        conn.execute(users.users_table.update().values(is_active=False))

    res = await client.post(f"{API}/login", json={"email": "kysu@vehicsim.vn", "password": PASSWORD})
    assert res.status_code == 403
    me = await client.get(f"{API}/me", headers=_bearer(body["access_token"]))
    assert me.status_code == 401


@pytest.mark.asyncio
async def test_me_rejects_missing_forged_and_expired_tokens(client, outbox):
    body = await _register(client, outbox)
    user_id = body["user"]["id"]
    pwv = tokens.password_fingerprint(users.get_by_id(user_id).password_hash)

    assert (await client.get(f"{API}/me")).status_code == 401
    assert (await client.get(f"{API}/me", headers=_bearer("not-a-jwt"))).status_code == 401

    forged = jwt.encode(
        {"sub": str(user_id), "type": "access", "pwv": pwv, "exp": datetime.now(UTC) + timedelta(hours=1)},
        "attacker-controlled-secret-at-least-32-bytes",
        algorithm="HS256",
    )
    assert (await client.get(f"{API}/me", headers=_bearer(forged))).status_code == 401

    expired = jwt.encode(
        {"sub": str(user_id), "type": "access", "pwv": pwv, "exp": datetime.now(UTC) - timedelta(seconds=1)},
        TEST_JWT_SECRET,
        algorithm="HS256",
    )
    res = await client.get(f"{API}/me", headers=_bearer(expired))
    assert res.status_code == 401
    assert res.headers["www-authenticate"] == "Bearer"


@pytest.mark.asyncio
async def test_otp_requests_are_rate_limited_per_ip(client, outbox):
    limit = get_settings().otp_requests_per_ip
    for i in range(limit):
        res = await client.post(f"{API}/register/request", json={"email": f"u{i}@vehicsim.vn"})
        assert res.status_code == 202
    blocked = await client.post(f"{API}/password/forgot", json={"email": "x@vehicsim.vn"})
    assert blocked.status_code == 429


# ---------------------------------------------------------------------------
# Endpoint giả của code Forge cũ đã bị gỡ
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_legacy_fake_auth_endpoints_are_gone(client):
    # Trước đây: username lạ -> tự tạo tài khoản mật khẩu 123456, role lấy từ request.
    legacy_login = await client.post(f"{API}/login", json={"username": "hacker", "role": "admin"})
    assert legacy_login.status_code == 422
    # Trước đây: /auth/me?user=<bất kỳ ai> trả về hồ sơ người đó.
    legacy_me = await client.get(f"{API}/me", params={"user": "admin"})
    assert legacy_me.status_code == 401
    legacy_register = await client.post(f"{API}/register", json={"username": "x", "name": "x", "email": "x@x.vn"})
    assert legacy_register.status_code in (404, 405)


def test_production_refuses_to_run_without_jwt_secret(monkeypatch):
    monkeypatch.setenv("JWT_SECRET_KEY", "")
    monkeypatch.setenv("APP_ENV", "production")
    get_settings.cache_clear()
    tokens.secret_key.cache_clear()
    with pytest.raises(RuntimeError, match="JWT_SECRET_KEY"):
        tokens.secret_key()


def test_session_token_carries_no_password_material():
    user = users.create(email="c@vehicsim.vn", full_name="C", password_hash="salt:hash")
    token = service._session_for(user).access_token
    payload = jwt.decode(token, TEST_JWT_SECRET, algorithms=["HS256"])
    assert set(payload) == {"sub", "type", "pwv", "iat", "exp"}
    assert "salt" not in token and "hash" not in payload["pwv"]


# ---------------------------------------------------------------------------
# Hồ sơ và đổi mật khẩu khi đang đăng nhập
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_update_profile_full_name(client, outbox):
    body = await _register(client, outbox)
    res = await client.put(f"{API}/me", json={"full_name": "  Tên Mới  "}, headers=_bearer(body["access_token"]))
    assert res.status_code == 200
    assert res.json()["full_name"] == "Tên Mới"
    blank = await client.put(f"{API}/me", json={"full_name": "   "}, headers=_bearer(body["access_token"]))
    assert blank.status_code == 422
    assert (await client.put(f"{API}/me", json={"full_name": "X"})).status_code == 401


@pytest.mark.asyncio
async def test_change_password_returns_fresh_session_and_kills_old_one(client, outbox):
    body = await _register(client, outbox)
    old_token = body["access_token"]

    wrong = await client.post(
        f"{API}/password/change",
        json={"old_password": "not-my-password", "new_password": "brand-new-pass-7"},
        headers=_bearer(old_token),
    )
    assert wrong.status_code == 400

    res = await client.post(
        f"{API}/password/change",
        json={"old_password": PASSWORD, "new_password": "brand-new-pass-7"},
        headers=_bearer(old_token),
    )
    assert res.status_code == 200
    new_token = res.json()["access_token"]

    assert (await client.get(f"{API}/me", headers=_bearer(old_token))).status_code == 401
    assert (await client.get(f"{API}/me", headers=_bearer(new_token))).status_code == 200
    relogin = await client.post(f"{API}/login", json={"email": "kysu@vehicsim.vn", "password": "brand-new-pass-7"})
    assert relogin.status_code == 200


def test_grant_admin_role_is_idempotent():
    user = users.create(email="admin@vehicsim.vn", full_name="Admin", password_hash="salt:hash")
    users.grant_role(user.id, "ADMIN")
    users.grant_role(user.id, "ADMIN")
    assert users.get_by_id(user.id).roles == ("ADMIN", "ENGINEER")
