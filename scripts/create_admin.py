"""Tạo tài khoản ADMIN, hoặc cấp quyền ADMIN cho tài khoản đã có.

Đăng ký công khai chỉ tạo ENGINEER; không có API nào tự nâng lên ADMIN, nên
tài khoản quản trị đầu tiên phải tạo từ máy chủ bằng script này:

    uv run python scripts/create_admin.py --email admin@vehicsim.vn --full-name "Quản trị viên"

Mật khẩu được hỏi qua bàn phím (không hiện, không nằm trong lịch sử shell).
Đọc ``VEHICSIM_DATABASE_URL`` từ ``.env`` như backend.
"""

from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path

from email_validator import EmailNotValidError, validate_email

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from src.services.auth import users  # noqa: E402
from src.services.auth.passwords import hash_password  # noqa: E402

MIN_PASSWORD_LENGTH = 8


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--email", required=True)
    parser.add_argument("--full-name", default="Quản trị viên")
    args = parser.parse_args()

    # Cùng luật với API đăng nhập (EmailStr): email mà API từ chối — vd. tên miền
    # dành riêng như `.local` — sẽ tạo ra một tài khoản không bao giờ đăng nhập được.
    try:
        validate_email(args.email, check_deliverability=False)
    except EmailNotValidError as exc:
        print(f"Email không hợp lệ cho đăng nhập: {exc}", file=sys.stderr)
        return 1

    existing = users.get_by_email(args.email)
    if existing is not None:
        users.grant_role(existing.id, "ADMIN")
        print(f"Đã cấp quyền ADMIN cho tài khoản có sẵn: {existing.email}")
        return 0

    password = getpass.getpass("Mật khẩu cho tài khoản ADMIN mới: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"Mật khẩu phải có ít nhất {MIN_PASSWORD_LENGTH} ký tự.", file=sys.stderr)
        return 1
    if getpass.getpass("Nhập lại mật khẩu: ") != password:
        print("Hai lần nhập mật khẩu không khớp.", file=sys.stderr)
        return 1

    user = users.create(
        email=args.email, full_name=args.full_name, password_hash=hash_password(password), role_code="ADMIN"
    )
    print(f"Đã tạo tài khoản ADMIN: {user.email}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
