"""Nghiệp vụ xác thực: đăng ký và quên mật khẩu bằng mã OTP 6 số, đăng nhập JWT.

Tầng HTTP (``src/api/auth_routes.py``) chỉ đổi lỗi ở đây thành mã HTTP; mọi
quy tắc nằm trong file này để test được mà không cần dựng request.

Hai quy tắc chống dò email xuyên suốt:

- Bước xin mã (đăng ký / quên mật khẩu) trả lời **giống hệt nhau** dù email có
  tồn tại hay không. Hàm chỉ trả ``OtpDelivery`` cho route gửi mail ở nền, nên
  thời gian phản hồi cũng không phụ thuộc vào việc có gửi hay không.
- Đăng nhập sai email hay sai mật khẩu đều là ``InvalidCredentialsError``, và email
  lạ vẫn tốn đủ một lần PBKDF2 (``dummy_hash``).
"""

from __future__ import annotations

from dataclasses import dataclass

from src.config import get_settings
from src.services.auth import otp, users
from src.services.auth.otp import OtpPurpose
from src.services.auth.passwords import dummy_hash, hash_password, verify_password
from src.services.auth.tokens import InvalidTokenError, create_access_token, decode_access_token, password_fingerprint


class RateLimitedError(Exception):
    """Quá nhiều yêu cầu từ một IP trong cửa sổ thời gian."""


class InvalidOtpError(Exception):
    """Mã sai, hết hạn, đã dùng, hoặc đã bị xoá vì nhập sai quá số lần."""


class InvalidCredentialsError(Exception):
    """Sai email hoặc mật khẩu — cố ý không nói cái nào sai."""


class AccountDisabledError(Exception):
    """Đúng mật khẩu nhưng tài khoản đã bị khoá (``is_active = 0``)."""


@dataclass(frozen=True)
class OtpDelivery:
    """Mã cần gửi qua email. Route gửi nó trong background task."""

    email: str
    code: str
    purpose: OtpPurpose


@dataclass(frozen=True)
class Session:
    user: users.User
    access_token: str
    expires_in: int


def _check_otp_request_rate(client_ip: str) -> None:
    if otp.hit_rate_limit("otp_ip", client_ip, get_settings().otp_requests_per_ip):
        raise RateLimitedError


def _session_for(user: users.User) -> Session:
    token, expires_in = create_access_token(user.id, user.password_hash)
    return Session(user=user, access_token=token, expires_in=expires_in)


# ---------------------------------------------------------------------------
# Đăng ký: email -> mã 6 số -> (mã + họ tên + mật khẩu) -> tài khoản
# ---------------------------------------------------------------------------


def request_registration(email: str, client_ip: str) -> OtpDelivery | None:
    """Chỉ gửi mã khi email **chưa** có tài khoản. Không gửi thì vẫn trả như đã gửi."""
    _check_otp_request_rate(client_ip)
    email = users.normalize_email(email)
    if users.get_by_email(email) is not None:
        return None
    code = otp.issue(OtpPurpose.REGISTER, email)
    return OtpDelivery(email, code, OtpPurpose.REGISTER) if code else None


def complete_registration(email: str, code: str, full_name: str, password: str) -> Session:
    """Mã đúng mới tạo tài khoản — nên chỉ email chứng minh được là của mình mới vào được DB.

    Kiểm mã **trước** khi tra email: chưa có mã hợp lệ thì không ai biết được
    email đã có tài khoản hay chưa.
    """
    email = users.normalize_email(email)
    if not otp.verify(OtpPurpose.REGISTER, email, code):
        raise InvalidOtpError
    user = users.create(email=email, full_name=full_name, password_hash=hash_password(password))
    users.touch_last_login(user.id)
    return _session_for(user)


# ---------------------------------------------------------------------------
# Quên mật khẩu: email -> mã 6 số -> (mã + mật khẩu mới)
# ---------------------------------------------------------------------------


def request_password_reset(email: str, client_ip: str) -> OtpDelivery | None:
    _check_otp_request_rate(client_ip)
    email = users.normalize_email(email)
    user = users.get_by_email(email)
    if user is None or not user.is_active:
        return None
    code = otp.issue(OtpPurpose.RESET, email)
    return OtpDelivery(email, code, OtpPurpose.RESET) if code else None


def reset_password(email: str, code: str, new_password: str) -> None:
    """Đổi hash mật khẩu -> ``pwv`` đổi -> mọi JWT cấp trước đó hết hiệu lực."""
    email = users.normalize_email(email)
    if not otp.verify(OtpPurpose.RESET, email, code):
        raise InvalidOtpError
    user = users.get_by_email(email)
    if user is None or not user.is_active:
        raise InvalidOtpError
    users.set_password_hash(user.id, hash_password(new_password))


# ---------------------------------------------------------------------------
# Đăng nhập và kiểm token
# ---------------------------------------------------------------------------


def login(email: str, password: str, client_ip: str) -> Session:
    if otp.hit_rate_limit("login_ip", client_ip, get_settings().login_attempts_per_ip):
        raise RateLimitedError
    user = users.get_by_email(email)
    if user is None:
        verify_password(password, dummy_hash())
        raise InvalidCredentialsError
    if not verify_password(password, user.password_hash):
        raise InvalidCredentialsError
    if not user.is_active:
        raise AccountDisabledError
    users.touch_last_login(user.id)
    return _session_for(user)


def change_password(user: users.User, old_password: str, new_password: str) -> Session:
    """Đổi mật khẩu khi đang đăng nhập. Trả **phiên mới**.

    Đổi hash làm ``pwv`` của token hiện tại hết khớp — đúng ý đồ (các thiết bị
    khác bị đăng xuất), nhưng chính người vừa đổi cũng mất phiên nếu không được
    cấp token mới ngay tại đây.
    """
    if not verify_password(old_password, user.password_hash):
        raise InvalidCredentialsError
    users.set_password_hash(user.id, hash_password(new_password))
    fresh = users.get_by_id(user.id)
    assert fresh is not None
    return _session_for(fresh)


def update_profile(user: users.User, full_name: str) -> users.User:
    users.set_full_name(user.id, full_name)
    fresh = users.get_by_id(user.id)
    assert fresh is not None
    return fresh


def authenticate(access_token: str) -> users.User:
    """Token -> user đang hoạt động. Ném ``InvalidTokenError`` cho mọi trường hợp không hợp lệ."""
    payload = decode_access_token(access_token)
    try:
        user_id = int(payload["sub"])
    except (TypeError, ValueError) as exc:
        raise InvalidTokenError("sub không hợp lệ") from exc
    user = users.get_by_id(user_id)
    if user is None or not user.is_active:
        raise InvalidTokenError("user không tồn tại hoặc đã bị khoá")
    if payload["pwv"] != password_fingerprint(user.password_hash):
        raise InvalidTokenError("mật khẩu đã đổi sau khi cấp token")
    return user
