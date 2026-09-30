"""HTTP cho xác thực: ``/api/v1/auth/*``.

Mọi quy tắc nằm ở ``src/services/auth/service.py``; file này chỉ nhận request,
đổi lỗi nghiệp vụ thành mã HTTP và gửi mail OTP ở nền.

Route cần đăng nhập dùng ``Depends(get_current_user)``. Token đi trong header
``Authorization: Bearer <token>`` — không bao giờ qua query string như code cũ
(``?user=``), vì ai cũng tự điền được username của người khác vào đó.
"""

from __future__ import annotations

from typing import Annotated

import redis
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr, Field

from src.config import get_settings
from src.services.auth import service
from src.services.auth.service import OtpDelivery, Session
from src.services.auth.tokens import InvalidTokenError
from src.services.auth.users import EmailAlreadyRegisteredError, User
from src.services.email import send_otp_email

router = APIRouter(prefix="/auth", tags=["auth"])

OTP_SENT_MESSAGE = "Nếu email hợp lệ, mã xác minh 6 số đã được gửi. Mã có hiệu lực trong ít phút."
"""Cùng một câu cho mọi nhánh của bước xin mã — không để lộ email nào đã đăng ký."""

Password = Annotated[str, Field(min_length=8, max_length=128)]
"""Trần 128 ký tự chặn DoS: PBKDF2 trên chuỗi dài hàng MB tốn CPU thật."""
OtpCode = Annotated[str, Field(pattern=r"^\d{6}$")]


class EmailRequest(BaseModel):
    email: EmailStr


class RegisterVerifyRequest(BaseModel):
    email: EmailStr
    code: OtpCode
    full_name: str = Field(min_length=1, max_length=150)
    password: Password


class PasswordResetRequest(BaseModel):
    email: EmailStr
    code: OtpCode
    new_password: Password


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class PasswordChangeRequest(BaseModel):
    old_password: str = Field(min_length=1, max_length=128)
    new_password: Password


class ProfileUpdateRequest(BaseModel):
    full_name: str = Field(min_length=1, max_length=150)


# ---------------------------------------------------------------------------
# Dependency
# ---------------------------------------------------------------------------

_bearer = HTTPBearer(auto_error=False)


def _unauthorized(detail: str = "Chưa đăng nhập hoặc phiên đăng nhập đã hết hạn") -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=detail, headers={"WWW-Authenticate": "Bearer"})


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise _unauthorized()
    try:
        return service.authenticate(credentials.credentials)
    except InvalidTokenError as exc:
        raise _unauthorized() from exc


CurrentUser = Annotated[User, Depends(get_current_user)]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _client_ip(request: Request) -> str:
    # Sau reverse proxy / Cloudflare phải đọc header của proxy tin cậy thay vì
    # request.client — chưa làm vì hiện chưa có proxy nào trước backend.
    return request.client.host if request.client else "unknown"


def _send_otp(background: BackgroundTasks, delivery: OtpDelivery | None) -> dict:
    if delivery is not None:
        ttl_minutes = max(1, get_settings().otp_ttl_seconds // 60)
        background.add_task(send_otp_email, delivery.email, delivery.code, delivery.purpose.value, ttl_minutes)
    return {"message_vi": OTP_SENT_MESSAGE}


def _session_body(session: Session) -> dict:
    return {
        "access_token": session.access_token,
        "token_type": "bearer",
        "expires_in": session.expires_in,
        "user": session.user.public(),
    }


def _call(fn, *args):
    """Gọi nghiệp vụ và đổi lỗi dùng chung (rate limit, Redis sập) thành HTTP."""
    try:
        return fn(*args)
    except service.RateLimitedError as exc:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, detail="Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút."
        ) from exc
    except redis.RedisError as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, detail="Dịch vụ xác thực tạm thời không khả dụng."
        ) from exc


_INVALID_OTP = "Mã xác minh không đúng hoặc đã hết hạn. Vui lòng yêu cầu mã mới."


# ---------------------------------------------------------------------------
# Đăng ký
# ---------------------------------------------------------------------------


@router.post("/register/request", status_code=status.HTTP_202_ACCEPTED)
def register_request(body: EmailRequest, request: Request, background: BackgroundTasks) -> dict:
    return _send_otp(background, _call(service.request_registration, body.email, _client_ip(request)))


@router.post("/register/verify", status_code=status.HTTP_201_CREATED)
def register_verify(body: RegisterVerifyRequest) -> dict:
    try:
        session = _call(service.complete_registration, body.email, body.code, body.full_name, body.password)
    except service.InvalidOtpError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=_INVALID_OTP) from exc
    except EmailAlreadyRegisteredError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, detail="Email này đã có tài khoản. Hãy đăng nhập.") from exc
    return _session_body(session)


# ---------------------------------------------------------------------------
# Quên mật khẩu
# ---------------------------------------------------------------------------


@router.post("/password/forgot", status_code=status.HTTP_202_ACCEPTED)
def password_forgot(body: EmailRequest, request: Request, background: BackgroundTasks) -> dict:
    return _send_otp(background, _call(service.request_password_reset, body.email, _client_ip(request)))


@router.post("/password/reset")
def password_reset(body: PasswordResetRequest) -> dict:
    try:
        _call(service.reset_password, body.email, body.code, body.new_password)
    except service.InvalidOtpError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail=_INVALID_OTP) from exc
    return {"ok": True, "message_vi": "Đã đặt lại mật khẩu. Hãy đăng nhập bằng mật khẩu mới."}


# ---------------------------------------------------------------------------
# Đăng nhập
# ---------------------------------------------------------------------------


@router.post("/login")
def login(body: LoginRequest, request: Request) -> dict:
    try:
        session = _call(service.login, body.email, body.password, _client_ip(request))
    except service.InvalidCredentialsError as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail="Email hoặc mật khẩu không đúng") from exc
    except service.AccountDisabledError as exc:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, detail="Tài khoản đã bị khoá. Vui lòng liên hệ quản trị viên."
        ) from exc
    return _session_body(session)


@router.get("/me")
def me(user: CurrentUser) -> dict:
    return user.public()


@router.put("/me")
def update_me(body: ProfileUpdateRequest, user: CurrentUser) -> dict:
    if not body.full_name.strip():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Họ và tên không được để trống")
    return service.update_profile(user, body.full_name).public()


@router.post("/password/change")
def password_change(body: PasswordChangeRequest, user: CurrentUser) -> dict:
    """Trả phiên mới: token cũ (kể cả của chính request này) hết hiệu lực khi mật khẩu đổi."""
    try:
        session = service.change_password(user, body.old_password, body.new_password)
    except service.InvalidCredentialsError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, detail="Mật khẩu hiện tại không đúng") from exc
    return _session_body(session)
