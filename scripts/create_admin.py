#!/usr/bin/env python3
"""Tạo tài khoản có role cao (mặc định ADMIN) cho backend Java và, với ``--seed``, dữ liệu mặc định.

Tự đăng ký luôn ra EXPERIENCER (ADR-035), nên script làm hai việc: đăng ký qua API (backend phải đang chạy)
rồi đổi role bằng SQL trong container ``mysql`` của docker compose. Chạy lại nhiều lần không sao: tài khoản
đã có thì chỉ đổi role. Chỉ dùng thư viện chuẩn.

    python scripts/create_admin.py --email admin@example.com --seed
    python scripts/create_admin.py --email boss@example.com --role MANAGER
"""

from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROLES = ("ADMIN", "MANAGER", "ENGINEER", "REVIEWER", "EXPERIENCER")
ROOT = Path(__file__).resolve().parents[1]
SAFE_EMAIL = re.compile(r"^[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}$")


def _post(url: str, body: dict, token: str | None = None) -> tuple[int, dict]:
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=json.dumps(body).encode(), headers=headers, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.status, json.loads(response.read() or b"{}")
    except urllib.error.HTTPError as error:
        try:
            return error.code, json.loads(error.read() or b"{}")
        except ValueError:
            return error.code, {}
    except urllib.error.URLError as error:
        sys.exit(f"Không gọi được {url}: {error.reason}. Backend đã chạy chưa? (./mvnw spring-boot:run)")


def _root_password() -> str:
    if os.environ.get("MYSQL_ROOT_PASSWORD"):
        return os.environ["MYSQL_ROOT_PASSWORD"]
    env_file = ROOT / ".env"
    if env_file.is_file():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("MYSQL_ROOT_PASSWORD="):
                return line.split("=", 1)[1].strip().strip('"')
    return "vehicsim_root"


def _set_role(email: str, role: str, service: str, database: str) -> None:
    sql = f"UPDATE users SET role_id = (SELECT id FROM roles WHERE code = '{role}') WHERE email = '{email.lower()}'; SELECT ROW_COUNT();"
    command = ["docker", "compose", "exec", "-T", "-e", f"MYSQL_PWD={_root_password()}", service, "mysql", "-uroot", "-N", database, "-e", sql]
    done = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=False)
    if done.returncode != 0:
        sys.exit(f"Đổi role thất bại: {done.stderr.strip() or done.stdout.strip()}")
    # ROW_COUNT() = 0 cũng xảy ra khi tài khoản đã đúng role; chỉ cảnh báo khi không có tài khoản.
    exists = subprocess.run(
        command[:-1] + [f"SELECT COUNT(*) FROM users WHERE email = '{email.lower()}'"],
        cwd=ROOT, capture_output=True, text=True, check=False,
    )
    if exists.stdout.strip().splitlines()[-1:] != ["1"]:
        sys.exit(f"Không thấy tài khoản {email} trong DB.")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", help="bỏ trống thì hỏi (không hiện khi gõ); 8–72 ký tự")
    parser.add_argument("--name", default="Admin VehicSim", help="họ tên; từ đầu = họ, từ cuối = tên")
    parser.add_argument("--role", choices=ROLES, default="ADMIN")
    parser.add_argument("--api", default="http://localhost:8001", help="địa chỉ backend")
    parser.add_argument("--seed", action="store_true", help="gọi POST /vehicsim/bootstrap (cần role ADMIN)")
    parser.add_argument("--compose-service", default="mysql")
    parser.add_argument("--database", default="vehicsim")
    args = parser.parse_args()

    if not SAFE_EMAIL.match(args.email):
        sys.exit("Email không hợp lệ.")
    if args.seed and args.role != "ADMIN":
        sys.exit("--seed cần --role ADMIN.")
    password = args.password or getpass.getpass("Mật khẩu (8–72 ký tự): ")
    if not 8 <= len(password.encode("utf-8")) <= 72:
        sys.exit("Mật khẩu phải từ 8 đến 72 byte.")

    parts = args.name.split()
    last, first = parts[0], parts[-1] if len(parts) > 1 else parts[0]
    api = args.api.rstrip("/")
    status, body = _post(f"{api}/api/v1/auth/register", {
        "email": args.email, "password": password, "lastName": last, "firstName": first,
    })
    if status == 200:
        print(f"Đã tạo tài khoản {args.email}.")
    elif status == 400:
        print(f"Tài khoản {args.email} đã có hoặc dữ liệu không hợp lệ ({body.get('detail', '')}) — chỉ đổi role.")
    elif status == 429:
        sys.exit("Backend đang giới hạn tần suất đăng ký; thử lại sau ít phút.")
    else:
        sys.exit(f"Đăng ký thất bại (HTTP {status}): {body}")

    _set_role(args.email, args.role, args.compose_service, args.database)
    print(f"Đã đặt role {args.role} cho {args.email}.")

    if args.seed:
        status, body = _post(f"{api}/api/v1/auth/login", {"email": args.email, "password": password})
        if status != 200:
            sys.exit(f"Đăng nhập để seed thất bại (HTTP {status}): {body}")
        status, body = _post(f"{api}/api/v1/vehicsim/bootstrap", {}, token=body["access_token"])
        if status != 200:
            sys.exit(f"Seed thất bại (HTTP {status}): {body}")
        print("Dữ liệu mặc định:", "đã tạo" if body.get("created") else "đã có sẵn", f"(project {body.get('project_id')})")


if __name__ == "__main__":
    main()
