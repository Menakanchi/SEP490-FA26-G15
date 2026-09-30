"""JWT đăng nhập và khoá bí mật dùng chung cho phần xác thực.

Token đăng nhập **không** lưu ở đâu cả (stateless). Để đổi/đặt lại mật khẩu vẫn
đá được các phiên cũ mà không cần bảng thu hồi, token mang ``pwv`` — một dấu
vân tay ngắn của ``password_hash`` lúc cấp. Mật khẩu đổi thì hash đổi, ``pwv``
không còn khớp, và mọi token cấp trước đó bị ``get_current_user`` từ chối.
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
from datetime import UTC, datetime, timedelta
from functools import lru_cache

import jwt

from src.config import get_settings

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
ACCESS_TOKEN_TYPE = "access"


class InvalidTokenError(Exception):
    """Token sai chữ ký, hết hạn, sai loại, hoặc không còn khớp với user."""


@lru_cache(maxsize=1)
def secret_key() -> str:
    """Khoá ký JWT và băm mã OTP.

    Production mà thiếu ``JWT_SECRET_KEY`` thì dừng hẳn: một khoá ngẫu nhiên
    theo process ở đó nghĩa là mỗi instance ký một kiểu, và mọi phiên mất sau
    mỗi lần deploy — hỏng theo cách khó nhận ra.
    """
    settings = get_settings()
    if settings.jwt_secret_key:
        return settings.jwt_secret_key
    if settings.app_env == "production":
        raise RuntimeError("JWT_SECRET_KEY chưa được cấu hình — bắt buộc ở production")
    logger.warning("JWT_SECRET_KEY trống: dùng khoá ngẫu nhiên cho process này (phiên đăng nhập mất khi restart)")
    return secrets.token_urlsafe(48)


def keyed_digest(message: str, length: int = 64) -> str:
    """HMAC-SHA256 bằng khoá bí mật của server, cắt còn ``length`` ký tự hex."""
    return hmac.new(secret_key().encode(), message.encode(), hashlib.sha256).hexdigest()[:length]


def password_fingerprint(password_hash: str) -> str:
    return keyed_digest(f"pwv:{password_hash}", length=16)


def create_access_token(user_id: int, password_hash: str) -> tuple[str, int]:
    """Trả ``(token, expires_in_giây)``."""
    ttl = timedelta(minutes=get_settings().access_token_ttl_minutes)
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "type": ACCESS_TOKEN_TYPE,
        "pwv": password_fingerprint(password_hash),
        "iat": now,
        "exp": now + ttl,
    }
    return jwt.encode(payload, secret_key(), algorithm=ALGORITHM), int(ttl.total_seconds())


def decode_access_token(token: str) -> dict:
    """Kiểm chữ ký, hạn dùng và loại token. **Chưa** kiểm ``pwv`` — việc của chỗ đã nạp user."""
    try:
        payload = jwt.decode(
            token,
            secret_key(),
            algorithms=[ALGORITHM],
            options={"require": ["sub", "exp", "type", "pwv"]},
        )
    except jwt.PyJWTError as exc:
        raise InvalidTokenError(str(exc)) from exc
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise InvalidTokenError("sai loại token")
    return payload
