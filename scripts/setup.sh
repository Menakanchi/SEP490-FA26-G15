#!/bin/bash
# Cài môi trường VehicSim lần đầu (Linux/macOS/Git Bash). Windows: scripts\dev-up.cmd để chạy.

set -e

echo "=== VehicSim setup ==="

if ! command -v uv >/dev/null 2>&1; then
    echo "uv is required: https://docs.astral.sh/uv/getting-started/installation/" >&2
    exit 1
fi
uv sync --locked

if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env — điền khoá LLM, SMTP, JWT_SECRET_KEY trước khi chạy"
fi

mkdir -p data/vehicsim

if command -v npm >/dev/null 2>&1; then
    (cd frontend && npm ci)
fi

echo "Xong. Bật MySQL + Redis: docker compose up -d mysql redis"
echo "Backend: uv run uvicorn src.main:app --reload --port 8001"
echo "Frontend: cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev"
