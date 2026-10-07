"""Truy cập ``users`` / ``roles`` của schema MySQL VehicSim (mỗi user đúng một role — ADR-035).

Nguồn sự thật của schema là ``database/mysql/01_schema.sql``. Hai ``Table`` dưới
đây chỉ mô tả lại **đúng các cột code này đọc/ghi**, để SQLAlchemy Core sinh câu
lệnh có tham số (không ghép chuỗi SQL). Không gọi ``metadata.create_all`` lên
MySQL — bảng do file SQL dựng; ``create_all`` chỉ dùng cho SQLite trong test.

Họ tên lưu tách ``last_name`` / ``middle_name`` / ``first_name`` (ADR-036); API vẫn
nhận và trả ``full_name`` một chuỗi — ``split_full_name`` / ``join_full_name`` đổi qua lại.
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
    String,
    Table,
    create_engine,
    insert,
    select,
    update,
)
from sqlalchemy.exc import IntegrityError

from src.config import get_settings

DEFAULT_ROLE_CODE = "EXPERIENCER"
"""Vai trò của người tự đăng ký. ADMIN / MANAGER / ENGINEER / REVIEWER do Admin cấp (ADR-035)."""

# SQLite chỉ tự tăng với INTEGER PRIMARY KEY; MySQL dùng BIGINT như file SQL.
_BigId = BigInteger().with_variant(Integer, "sqlite")

metadata = MetaData()

roles_table = Table(
    "roles",
    metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("code", String(20), nullable=False, unique=True),
    Column("name", String(100), nullable=False),
    Column("description", String(500), nullable=True),
    Column("created_date", DateTime, nullable=False),
)

users_table = Table(
    "users",
    metadata,
    Column("id", _BigId, primary_key=True, autoincrement=True),
    Column("email", String(255), nullable=False, unique=True),
    Column("password_hash", String(255), nullable=False),
    Column("role_id", Integer, ForeignKey("roles.id"), nullable=False),
    Column("is_active", Boolean, nullable=False, default=True),
    Column("last_login_at", DateTime, nullable=True),
    Column("last_name", String(80), nullable=False),
    Column("middle_name", String(80), nullable=True),
    Column("first_name", String(80), nullable=False),
    Column("created_date", DateTime, nullable=False),
    Column("updated_at", DateTime, nullable=False),
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
    role: str

    def public(self) -> dict:
        """Dạng trả cho client. Không bao giờ chứa ``password_hash``."""
        return {"id": self.id, "email": self.email, "full_name": self.full_name, "role": self.role}


def _now() -> datetime:
    # DATETIME của MySQL không mang múi giờ: quy ước lưu UTC dạng naive.
    return datetime.now(UTC).replace(tzinfo=None)


def split_full_name(full_name: str) -> dict:
    """``"Đàm Quang Trung"`` -> họ ``Đàm``, đệm ``Quang``, tên ``Trung`` (thứ tự tên người Việt).

    Một từ thì chỉ có tên, họ để trống. Migration 005 tách dữ liệu cũ theo đúng luật này.
    """
    words = full_name.split()
    if len(words) <= 1:
        return {"last_name": "", "middle_name": None, "first_name": (words[0] if words else "")[:80]}
    return {
        "last_name": words[0][:80],
        "middle_name": " ".join(words[1:-1])[:80] or None,
        "first_name": words[-1][:80],
    }


def join_full_name(last_name: str | None, middle_name: str | None, first_name: str | None) -> str:
    return " ".join(part for part in (last_name, middle_name, first_name) if part)


def normalize_email(email: str) -> str:
    """Khoá tra cứu duy nhất cho email: bỏ khoảng trắng hai đầu + chữ thường.

    Cả đường ghi (đăng ký) lẫn đường đọc (đăng nhập, OTP) đều đi qua đây, nên
    ``A@x.vn`` và ``a@x.vn`` không thành hai tài khoản hay hai mã OTP khác nhau.
    """
    return email.strip().lower()


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    return create_engine(get_settings().vehicsim_database_url, pool_pre_ping=True, future=True)


def _select_user():
    return select(users_table, roles_table.c.code.label("role_code")).join(
        roles_table, roles_table.c.id == users_table.c.role_id
    )


def _load(row) -> User | None:
    if row is None:
        return None
    return User(
        id=int(row.id),
        email=row.email,
        password_hash=row.password_hash,
        full_name=join_full_name(row.last_name, row.middle_name, row.first_name),
        is_active=bool(row.is_active),
        role=row.role_code,
    )


def get_by_email(email: str) -> User | None:
    with get_engine().connect() as conn:
        return _load(conn.execute(_select_user().where(users_table.c.email == normalize_email(email))).first())


def get_by_id(user_id: int) -> User | None:
    with get_engine().connect() as conn:
        return _load(conn.execute(_select_user().where(users_table.c.id == user_id)).first())


def display_names(conn, ids: set[int]) -> dict[int, str]:
    """``{user_id: "Họ Đệm Tên"}`` cho các màn hiển thị người tạo / người duyệt."""
    ids = {i for i in ids if i is not None}
    if not ids:
        return {}
    rows = conn.execute(
        select(users_table.c.id, users_table.c.last_name, users_table.c.middle_name, users_table.c.first_name).where(
            users_table.c.id.in_(ids)
        )
    )
    return {r.id: join_full_name(r.last_name, r.middle_name, r.first_name) for r in rows}


def _role_id(conn, role_code: str) -> int:
    """Role phải có sẵn (seed trong ``01_schema.sql``). Thiếu là lỗi cấu hình DB, không phải lỗi người dùng."""
    role_id = conn.execute(select(roles_table.c.id).where(roles_table.c.code == role_code)).scalar()
    if role_id is None:
        raise LookupError(f"role {role_code!r} chưa được seed trong bảng roles")
    return int(role_id)


def create(
    email: str,
    full_name: str,
    password_hash: str,
    role_code: str = DEFAULT_ROLE_CODE,
) -> User:
    """Tạo user với đúng một role."""
    now = _now()
    try:
        with get_engine().begin() as conn:
            user_id = conn.execute(
                insert(users_table).values(
                    email=normalize_email(email),
                    password_hash=password_hash,
                    role_id=_role_id(conn, role_code),
                    is_active=True,
                    created_date=now,
                    updated_at=now,
                    **split_full_name(full_name),
                )
            ).inserted_primary_key[0]
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


def set_role(user_id: int, role_code: str) -> None:
    """Đổi role (thay role cũ — mỗi người một role). Dùng cho script; API quản lý user là TD-28."""
    with get_engine().begin() as conn:
        role_id = _role_id(conn, role_code)
        conn.execute(update(users_table).where(users_table.c.id == user_id).values(role_id=role_id, updated_at=_now()))


def set_full_name(user_id: int, full_name: str) -> None:
    with get_engine().begin() as conn:
        conn.execute(
            update(users_table)
            .where(users_table.c.id == user_id)
            .values(updated_at=_now(), **split_full_name(full_name))
        )


def touch_last_login(user_id: int) -> None:
    with get_engine().begin() as conn:
        conn.execute(update(users_table).where(users_table.c.id == user_id).values(last_login_at=_now()))
