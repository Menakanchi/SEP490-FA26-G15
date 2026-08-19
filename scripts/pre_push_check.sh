#!/usr/bin/env bash
# Gate local trước khi push.
#
# Ba bước đầu là bản sao đúng của .github/workflows/ci.yml (ruff check, ruff
# format --check, pytest + coverage). Hai bước cuối là frontend — chưa có trong
# CI, và chỉ chạy khi frontend/ thực sự đổi.
#
# Lý do tồn tại: CI của org đang không khởi động được vì lỗi thanh toán GitHub
# Actions, nên từ 13/8 mọi PR đỏ vì cùng một nguyên nhân không liên quan tới
# code. Trong lúc chờ khôi phục, gate nằm ở máy dev. Khi CI sống lại thì file
# này vẫn có ích: bắt lỗi trước khi push rẻ hơn chờ một vòng Actions.
#
# Bỏ qua khi thật sự cần:  SKIP_CHECK=1 git push
#
# Script này được hook pre-push gọi — NẾU hook trên máy có dòng gọi nó.
#
# Sửa *nội dung* gate (phần bên dưới) thì chỉ là một commit bình thường: hook
# chỉ gọi `bash scripts/pre_push_check.sh`, còn file này được track.
#
# Nhưng sửa *cách gọi* — thêm/bớt dòng invoke trong thân hook do
# scripts/setup_hooks.sh sinh ra — thì mọi máy đã clone phải chạy lại
# `bash scripts/setup_hooks.sh`. Hook nằm ở .git/hooks/, git không track, nên
# một commit không tự cập nhật nó.
#
# Đã trả giá đúng một lần: gate được thêm vào setup_hooks.sh ở #37 (14/8)
# nhưng không ai chạy lại script, nên hook trên máy dev vẫn là bản 29/7 kết
# thúc bằng `exit 0`. Gate im lặng không chạy, và một lỗi format lọt vào
# src/services/library/retriever.py ở #52 (16/8). Kiểm nhanh xem hook có gate:
#     grep -q pre_push_check .git/hooks/pre-push || bash scripts/setup_hooks.sh

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

# ---------------------------------------------------------------------------
# Frontend
# ---------------------------------------------------------------------------
# Chưa nằm trong ci.yml. Lý do gate này có nó trước: `npm run lint` và
# `next build` lần đầu được chạy hôm 15/8, và đã có sẵn 10 lỗi eslint + 7 lỗi
# typecheck tích lại — trong đó có một race condition thật ở màn hình duyệt.
# Không ai cố tình để vậy; chỉ là không có gì chạy chúng.
#
# CHỈ chạy khi frontend/ thực sự đổi trong lần push này. Người làm backend
# không phải chờ Next.js build cho một commit không đụng tới nó.
if git diff --cached --quiet -- frontend 2>/dev/null && git diff --quiet HEAD -- frontend 2>/dev/null; then
  CHANGED_FE=""
else
  CHANGED_FE="1"
fi
# Với `git push`, thứ cần kiểm là các commit sắp đi, không phải working tree.
if [ -z "$CHANGED_FE" ] && [ -n "$(git diff --name-only @{push}..HEAD -- frontend 2>/dev/null)" ]; then
  CHANGED_FE="1"
fi

if [ -n "$CHANGED_FE" ]; then
  if ! command -v npm >/dev/null 2>&1; then
    echo "[check] frontend/ có thay đổi nhưng máy không có npm — bỏ qua phần này." >&2
  elif [ ! -d frontend/node_modules ]; then
    echo "[check] frontend/ có thay đổi nhưng chưa cài dependency — bỏ qua phần này." >&2
    echo "[check] Cài bằng: cd frontend && npm ci" >&2
  else
    echo "[check] eslint…"
    (cd frontend && npm run --silent lint) || fail "eslint đỏ — 'cd frontend && npm run lint -- --fix' sửa được phần lớn"

    echo "[check] next build (gồm cả typecheck)…"
    (cd frontend && npx --no-install next build >/dev/null) || fail "next build đỏ — chạy lại không kèm >/dev/null để xem lỗi"
  fi
fi

echo "[check] ✓ xanh"
