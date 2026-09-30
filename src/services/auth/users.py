"""Truy cập ``users`` / ``roles`` / ``user_roles`` của schema MySQL VehicSim.

Nguồn sự thật của schema là ``database/mysql/01_schema.sql``. Ba ``Table`` dưới
đây chỉ mô tả lại **đúng các cột code này đọc/ghi**, để SQLAlchemy Core sinh câu
lệnh có tham số (không ghép chuỗi SQL). Không gọi ``metadata.create_all`` lên
MySQL — bảng do file SQL dựng; ``create_all`` chỉ dùng cho SQLite trong test.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache

from sqlalchemy import (
    BigInteger,
    Boolean,
    Column,
    DateTime,
    Engine,
    ForeignKey,
    Integer,
    MetaData,
    SmallInteger,
    String,
    Table,
    create_engine,
    insert,
    select,
    update,
)
from sqlalchemy.exc import IntegrityError

from src.config import get_settings

DEFAULT_ROLE_CODE = "ENGINEER"
"""Vai trò của người tự đăng ký. ADMIN chỉ được gán tay."""

# SQLite chỉ tự tăng với INTEGER PRIMARY KEY; MySQL dùng BIGINT như file SQL.
_BigId = BigInteger().with_variant(Integer, "sqlite")
_SmallId = SmallInteger().with_variant(Integer, "sqlite")

metadata = MetaData()

users_table = Table(
    "users",
    metadata,
    Column("id", _BigId, primary_key=True, autoincrement=True),
    Column("email", String(255), nullable=False, unique=True),
    Column("password_hash", String(255), nullable=False),
    Column("full_name", String(150), nullable=False),
    Column("is_active", Boolean, nullable=False, default=True),
    Column("last_login_at", DateTime, nullable=True),
    Column("created_at", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
)

roles_table = Table(
    "roles",
    metadata,
    Column("id", _SmallId, primary_key=True, autoincrement=True),
    Column("code", String(50), nullable=False, unique=True),
    Column("name", String(100), nullable=False),
    Column("description", String(255), nullable=True),
    Column("created_at", DateTime, nullable=False),
)

user_roles_table = Table(
    "user_roles",
    metadata,
    Column("user_id", _BigId, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
    Column("role_id", _SmallId, ForeignKey("roles.id"), primary_key=True),
    Column("assigned_at", DateTime, nullable=False),
)


class EmailAlreadyRegisteredError(Exception):
    """``uq_users_email`` chặn lần tạo thứ hai — kể cả khi hai request chạy song song."""


@dataclass(frozen=True)
class User:
    id: int
    email: str
    password_hash: str
    full_name: str
    is_active: bool
    roles: tuple[str, ...]

    def public(self) -> dict:
        """Dạng trả cho client. Không bao giờ chứa ``password_hash``."""
        return {"id": self.id, "email": self.email, "full_name": self.full_name, "roles": list(self.roles)}


def _now() -> datetime:
    # DATETIME của MySQL không mang múi giờ: quy ước lưu UTC dạng naive.
    return datetime.now(UTC).replace(tzinfo=None)


def normalize_email(email: str) -> str:
    """Khoá tra cứu duy nhất cho email: bỏ khoảng trắng hai đầu + chữ thường.

    Cả đường ghi (đăng ký) lẫn đường đọc (đăng nhập, OTP) đều đi qua đây, nên
    ``A@x.vn`` và ``a@x.vn`` không thành hai tài khoản hay hai mã OTP khác nhau.
    """
    return email.strip().lower()


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_engine(get_settings().vehicsim_database_url, pool_pre_ping=True, future=True)


def _load(conn, user_row) -> User | None:
    if user_row is None:
        return None
    role_rows = conn.execute(
        select(roles_table.c.code)
        .join(user_roles_table, user_roles_table.c.role_id == roles_table.c.id)
        .where(user_roles_table.c.user_id == user_row.id)
        .order_by(roles_table.c.code)
    ).all()
    return User(
        id=int(user_row.id),
        email=user_row.email,
        password_hash=user_row.password_hash,
        full_name=user_row.full_name,
        is_active=bool(user_row.is_active),
        roles=tuple(r.code for r in role_rows),
    )


def get_by_email(email: str) -> User | None:
    with get_engine().connect() as conn:
        row = conn.execute(select(users_table).where(users_table.c.email == normalize_email(email))).first()
        return _load(conn, row)


def get_by_id(user_id: int) -> User | None:
    with get_engine().connect() as conn:
        row = conn.execute(select(users_table).where(users_table.c.id == user_id)).first()
        return _load(conn, row)


def create(
    email: str,
    full_name: str,
    password_hash: str,
    role_code: str = DEFAULT_ROLE_CODE,
) -> User:
    """Tạo user + gán role trong **một** transaction.

    Role phải có sẵn (seed trong ``01_schema.sql``). Thiếu role là lỗi cấu hình
    DB, không phải lỗi người dùng — ném ``LookupError`` để nó lộ ra ngay.
    """
    now = _now()
    try:
        with get_engine().begin() as conn:
            role_id = conn.execute(select(roles_table.c.id).where(roles_table.c.code == role_code)).scalar()
            if role_id is None:
                raise LookupError(f"role {role_code!r} chưa được seed trong bảng roles")
            user_id = conn.execute(
                insert(users_table).values(
                    email=normalize_email(email),
                    password_hash=password_hash,
                    full_name=full_name.strip(),
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
            ).inserted_primary_key[0]
            conn.execute(insert(user_roles_table).values(user_id=user_id, role_id=role_id, assigned_at=now))
    except IntegrityError as exc:
        raise EmailAlreadyRegisteredError(email) from exc
    user = get_by_id(int(user_id))
    assert user is not None
    return user


def set_password_hash(user_id: int, password_hash: str) -> None:
    with get_engine().begin() as conn:
        conn.execute(
            update(users_table)
            .where(users_table.c.id == user_id)
            .values(password_hash=password_hash, updated_at=_now())
        )


def grant_role(user_id: int, role_code: str) -> None:
    """Gán thêm một role (không trùng). Dùng cho script tạo ADMIN, không có API công khai."""
    with get_engine().begin() as conn:
        role_id = conn.execute(select(roles_table.c.id).where(roles_table.c.code == role_code)).scalar()
        if role_id is None:
            raise LookupError(f"role {role_code!r} chưa được seed trong bảng roles")
        already = conn.execute(
            select(user_roles_table.c.user_id).where(
                user_roles_table.c.user_id == user_id, user_roles_table.c.role_id == role_id
            )
        ).first()
        if already is None:
            conn.execute(insert(user_roles_table).values(user_id=user_id, role_id=role_id, assigned_at=_now()))


def set_full_name(user_id: int, full_name: str) -> None:
    with get_engine().begin() as conn:
        conn.execute(
            update(users_table)
            .where(users_table.c.id == user_id)
            .values(full_name=full_name.strip(), updated_at=_now())
        )


def touch_last_login(user_id: int) -> None:
    with get_engine().begin() as conn:
        conn.execute(update(users_table).where(users_table.c.id == user_id).values(last_login_at=_now()))
