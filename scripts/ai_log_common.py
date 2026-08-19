#!/usr/bin/env python3
"""Phần dùng chung của ba script ghi log AI.

``log_hook.py`` (hook tự động), ``log_manual.py`` (gõ tay) và
``log_antigravity.py`` (quét transcript của Antigravity) đều phải: đọc danh
tính từ git, đóng dấu thời gian theo giờ VN, và nối một dòng JSON vào
``.ai-log/session.jsonl``.

Ba bản sao đã lệch nhau thật:

- ``git()`` ở ``log_hook`` chạy ``shell=True`` còn hai file kia ``shell=False``;
- tên repo được bóc bằng hai công thức khác nhau, nên cùng một remote có thể ra
  hai chuỗi khác nhau tuỳ script nào ghi dòng đó — và server chấm bài nhóm theo
  đúng trường ``repo``.

Chỉ thư viện chuẩn, và **không được ném exception ra ngoài**: hook chạy trong
luồng của công cụ AI, một traceback ở đây là chặn công cụ của người dùng.
"""

import json
import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path

VN_TZ = timezone(timedelta(hours=7))

LOG_DIR = Path(os.environ.get("AI_LOG_DIR", ".ai-log"))


def git(cmd: str) -> str:
    """Chạy một lệnh git, trả stdout đã strip, hoặc chuỗi rỗng nếu hỏng.

    ``shell=False`` + ``cmd.split()``: mọi chỗ gọi đều truyền lệnh git thuần
    không có metacharacter, nên shell không thêm gì ngoài một lớp rủi ro.
    """
    try:
        return subprocess.check_output(cmd.split(), shell=False, text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:
        return ""


def repo_name() -> str:
    """Tên repo suy từ ``origin``, hoặc chuỗi rỗng nếu cwd không phải working tree.

    Bóc hậu tố ``.git`` bằng ``endswith`` chứ không ``replace``: một repo tên
    ``foo.github`` sẽ bị ``replace`` cắt nhầm thành ``foohub``.
    """
    origin = git("git remote get-url origin")
    if not origin:
        return ""
    name = origin.rstrip("/").split("/")[-1]
    return name[:-4] if name.endswith(".git") else name


def git_identity() -> dict:
    """``repo`` / ``branch`` / ``commit`` / ``student`` — bốn trường server chấm theo."""
    return {
        "repo": repo_name(),
        "branch": git("git rev-parse --abbrev-ref HEAD"),
        "commit": git("git rev-parse --short HEAD"),
        "student": git("git config user.email"),
    }


def now_iso() -> str:
    return datetime.now(VN_TZ).isoformat()


def entry_id(prefix: str) -> str:
    return f"{prefix}-{datetime.now(VN_TZ).strftime('%Y%m%d-%H%M%S')}"


def append_entry(entry: dict) -> Path:
    """Nối một dòng JSON vào ``session.jsonl``, trả về đường dẫn file."""
    LOG_DIR.mkdir(exist_ok=True)
    log_file = LOG_DIR / "session.jsonl"
    with open(log_file, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(entry, ensure_ascii=False) + "\n")
    return log_file
