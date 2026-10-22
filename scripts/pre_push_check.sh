#!/usr/bin/env bash
# Gate local trước khi push — bản sao các cổng của .github/workflows/ci.yml:
#   1. backend  (Java 21):  ./mvnw clean test
#   2. worker   (Python):   ruff check worker + pytest worker/tests
#   3. frontend (Next.js):  eslint + next build (gồm typecheck) — CHỈ khi frontend/ có đổi
#
# Lý do tồn tại: bắt lỗi trước khi push rẻ hơn chờ một vòng Actions (CI của org từng không khởi động
# được vì lỗi thanh toán, và khi đó gate nằm ở máy dev).
#
# Bỏ qua khi thật sự cần:  SKIP_CHECK=1 git push
#
# Hook pre-push (nếu có) chỉ gọi `bash scripts/pre_push_check.sh`; file này được git track nên sửa
# nội dung gate chỉ là một commit bình thường.

set -u

if [ "${SKIP_CHECK:-0}" = "1" ]; then
  echo "[check] SKIP_CHECK=1 — bỏ qua gate."
  exit 0
fi

fail() {
  echo >&2
  echo "[check] ✗ $1" >&2
  echo "[check] Sửa rồi push lại. Cần push gấp thì: SKIP_CHECK=1 git push" >&2
  exit 1
}

PY="${PYTHON:-python}"
command -v "$PY" >/dev/null 2>&1 || PY=python3

echo "[check] backend: ./mvnw clean test…"
./mvnw -B -q clean test || fail "test Java đỏ — chạy './mvnw clean test' để xem chi tiết"

echo "[check] worker: ruff…"
if "$PY" -m ruff --version >/dev/null 2>&1; then
  "$PY" -m ruff check worker || fail "ruff đỏ — 'python -m ruff check worker --fix' sửa được phần lớn"
else
  echo "[check] chưa có ruff (pip install ruff==0.16.0) — bỏ qua lint worker." >&2
fi

echo "[check] worker: pytest…"
"$PY" -m pytest worker/tests -q || fail "test worker đỏ"

# ---------------------------------------------------------------------------
# Frontend — CHỈ chạy khi frontend/ thực sự đổi (người làm backend không phải chờ Next.js build).
# ---------------------------------------------------------------------------
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
    echo "[check] frontend: eslint…"
    (cd frontend && npm run --silent lint) || fail "eslint đỏ — 'cd frontend && npm run lint -- --fix' sửa được phần lớn"

    echo "[check] frontend: next build (gồm cả typecheck)…"
    (cd frontend && npx --no-install next build >/dev/null) || fail "next build đỏ — chạy lại không kèm >/dev/null để xem lỗi"
  fi
fi

echo "[check] ✓ xanh"
