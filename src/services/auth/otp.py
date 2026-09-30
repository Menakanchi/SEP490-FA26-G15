"""Mã OTP 6 số gửi qua email, lưu trong Redis.

Mã 6 số chỉ có 10^6 khả năng, nên **phải** có trạng thái để đếm số lần nhập
sai — đó là lý do mã này nằm trong Redis thay vì là một token ký số. Không có
bảng MySQL nào cho OTP: mọi key đều tự hết hạn.

Key (``purpose`` = ``register`` | ``reset``):

- ``otp:{purpose}:{email}``           hash ``{h, attempts}``, TTL = ``otp_ttl_seconds``
- ``otp_cooldown:{purpose}:{email}``  chặn gửi lại liên tục, TTL = cooldown
- ``ratelimit:{bucket}:{key}``        bộ đếm theo cửa sổ thời gian (IP)

Chỉ lưu **HMAC** của mã, không lưu mã gốc: ai đọc được Redis cũng không dùng
lại được mã. HMAC gắn cả ``purpose`` và email, nên mã đăng ký không thể dùng
để đặt lại mật khẩu và ngược lại.
"""

from __future__ import annotations

import hmac
import secrets
from enum import StrEnum
from functools import lru_cache

import redis

from src.config import get_settings
from src.services.auth.tokens import keyed_digest


class OtpPurpose(StrEnum):
    REGISTER = "register"
    RESET = "reset"


@lru_cache(maxsize=1)
def get_redis() -> redis.Redis:
    return redis.Redis.from_url(get_settings().redis_url, decode_responses=True)


def _otp_key(purpose: OtpPurpose, email: str) -> str:
    return f"otp:{purpose.value}:{email}"


def _cooldown_key(purpose: OtpPurpose, email: str) -> str:
    return f"otp_cooldown:{purpose.value}:{email}"


def _code_digest(purpose: OtpPurpose, email: str, code: str) -> str:
    return keyed_digest(f"otp:{purpose.value}:{email}:{code}")


def issue(purpose: OtpPurpose, email: str) -> str | None:
    """Sinh mã mới và lưu hash của nó. ``None`` nếu email còn trong thời gian chờ.

    Mã mới **thay** mã cũ và đặt lại bộ đếm nhập sai. Người gọi không được báo
    cho client biết nhánh ``None`` — phản hồi phải giống hệt khi đã gửi mã.
    """
    settings = get_settings()
    r = get_redis()
    cooldown = settings.otp_resend_cooldown_seconds
    if cooldown and not r.set(_cooldown_key(purpose, email), "1", nx=True, ex=cooldown):
        return None

    code = f"{secrets.randbelow(10**6):06d}"
    key = _otp_key(purpose, email)
    with r.pipeline() as pipe:
        pipe.delete(key)
        pipe.hset(key, mapping={"h": _code_digest(purpose, email, code), "attempts": 0})
        pipe.expire(key, settings.otp_ttl_seconds)
        pipe.execute()
    return code


def verify(purpose: OtpPurpose, email: str, code: str) -> bool:
    """Đúng mã -> ``True`` và mã bị xoá ngay (dùng một lần).

    Sai mã -> tăng bộ đếm; chạm ``otp_max_attempts`` thì xoá mã, người dùng
    phải xin mã mới. Hai request cùng gửi đúng mã cùng lúc: chỉ request xoá
    được key (``DELETE`` trả 1) mới thắng.
    """
    settings = get_settings()
    r = get_redis()
    key = _otp_key(purpose, email)
    stored = r.hgetall(key)
    if not stored or not code.isdigit() or len(code) != 6:
        return False

    if hmac.compare_digest(stored.get("h", ""), _code_digest(purpose, email, code)):
        return r.delete(key) == 1

    attempts = r.hincrby(key, "attempts", 1)
    if attempts >= settings.otp_max_attempts:
        r.delete(key)
    return False


def hit_rate_limit(bucket: str, key: str, limit: int) -> bool:
    """Đếm một lượt trong cửa sổ ``rate_limit_window_seconds``. ``True`` = đã vượt ``limit``."""
    r = get_redis()
    counter = f"ratelimit:{bucket}:{key}"
    with r.pipeline() as pipe:
        pipe.incr(counter)
        pipe.expire(counter, get_settings().rate_limit_window_seconds, nx=True)
        count, _ = pipe.execute()
    return int(count) > limit
