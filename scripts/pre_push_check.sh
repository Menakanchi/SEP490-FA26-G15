#!/usr/bin/env bash
# Gate local — chạy đúng ba bước mà .github/workflows/ci.yml chạy.
#
# Lý do tồn tại: CI của org đang không khởi động được vì lỗi thanh toán GitHub
# Actions, nên từ 13/8 mọi PR đỏ vì cùng một nguyên nhân không liên quan tới
# code. Trong lúc chờ khôi phục, gate nằm ở máy dev. Khi CI sống lại thì file
# này vẫn có ích: bắt lỗi trước khi push rẻ hơn chờ một vòng Actions.
#
# Bỏ qua khi thật sự cần:  SKIP_CHECK=1 git push
#
# Script này được hook pre-push gọi. Nó nằm trong repo (scripts/ được track)
# nên sửa nội dung gate về sau chỉ là một commit bình thường — không ai phải
# chạy lại scripts/setup_hooks.sh.

set -u

if [ "${SKIP_CHECK:-0}" = "1" ]; then
  echo "[check] SKIP_CHECK=1 — bỏ qua gate."
  exit 0
fi

# Ưu tiên venv của repo: ruff/pytest được ghim ở requirements.txt nằm trong đó.
# Python trên PATH có thể là bản hệ thống, không có sẵn hai công cụ này.
if [ -x .venv/bin/python ]; then
  PY=.venv/bin/python
elif [ -x .venv/Scripts/python.exe ]; then
  PY=.venv/Scripts/python.exe
elif command -v python3 >/dev/null 2>&1; then
  PY=python3
elif command -v python >/dev/null 2>&1; then
  PY=python
else
  echo "[check] Không tìm thấy Python — bỏ qua gate." >&2
  exit 0
fi

# Chưa cài ruff/pytest thì đây là máy chưa setup xong, không phải code sai.
# Chặn push vì lý do đó chỉ gây bực, không bắt được lỗi nào.
if ! "$PY" -m ruff --version >/dev/null 2>&1; then
  echo "[check] Chưa có ruff trong môi trường — bỏ qua gate." >&2
  echo "[check] Cài bằng: pip install -r requirements.txt" >&2
  exit 0
fi

fail() {
  echo >&2
  echo "[check] ✗ $1" >&2
  echo "[check] Sửa rồi push lại. Cần push gấp thì: SKIP_CHECK=1 git push" >&2
  exit 1
}

echo "[check] ruff check…"
"$PY" -m ruff check src/ tests/ || fail "ruff check đỏ"

echo "[check] ruff format --check…"
"$PY" -m ruff format --check src/ tests/ || fail "format lệch — chạy 'make format' rồi commit lại"

echo "[check] pytest + coverage…"
"$PY" -m pytest tests/ -q --cov=src --cov-report=term-missing --cov-fail-under=60 \
  || fail "test đỏ hoặc coverage dưới 60%"

echo "[check] ✓ xanh — giống hệt ba bước của CI"
