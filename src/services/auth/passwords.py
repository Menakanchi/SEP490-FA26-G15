"""Băm và kiểm mật khẩu. Một bản duy nhất, ``services/db.py`` import lại từ đây.

Định dạng ``<salt hex>:<pbkdf2 hex>`` giữ nguyên như code Forge cũ để hash đã
có trong DB vẫn kiểm được.
"""

from __future__ import annotations

import hashlib
import os
import secrets
from functools import lru_cache

_ITERATIONS = 100_000


def hash_password(password: str, salt: bytes | None = None) -> str:
    if not salt:
        salt = os.urandom(16)
    pw_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS)
    return f"{salt.hex()}:{pw_hash.hex()}"


def verify_password(password: str, stored_hash: str) -> bool:
    if not stored_hash or ":" not in stored_hash:
        return False
    try:
        salt_hex, pw_hex = stored_hash.split(":")
        salt = bytes.fromhex(salt_hex)
        expected_hash = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, _ITERATIONS).hex()
        return secrets.compare_digest(pw_hex, expected_hash)
    except Exception:
        return False


@lru_cache(maxsize=1)
def dummy_hash() -> str:
    """Hash giả để kiểm khi email không tồn tại.

    Không có bước này thì đăng nhập email lạ trả lời nhanh hơn hẳn email có thật
    (bỏ qua 100k vòng PBKDF2), và thời gian phản hồi tự khai email nào đã đăng ký.
    """
    return hash_password(secrets.token_hex(16))
