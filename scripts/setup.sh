#!/bin/bash
# Cài môi trường VehicSim lần đầu (Linux/macOS/Git Bash). Windows: scripts\dev-up.cmd để chạy.

set -e

echo "=== VehicSim setup ==="

if ! command -v java >/dev/null 2>&1; then
    echo "Cần JDK 21: https://adoptium.net/" >&2
    exit 1
fi
if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then
    echo "Cần Python >= 3.10 cho worker mô phỏng (VEHICSIM_WORKER_PYTHON)." >&2
    exit 1
fi

if [ ! -f .env ]; then
    cp .env.example .env
    echo "Created .env — điền khoá LLM, SMTP; đặt JWT_SECRET (bắt buộc ở production)."
fi

mkdir -p data/vehicsim

if command -v npm >/dev/null 2>&1; then
    (cd frontend && npm ci)
fi

echo "Xong. Bật MySQL + Redis: docker compose up -d mysql redis"
echo "Backend:  ./mvnw spring-boot:run          (Swagger: http://localhost:8001/swagger-ui.html)"
echo "Frontend: cd frontend && NEXT_PUBLIC_API_URL=http://localhost:8001 npm run dev"
echo "Admin:    java -cp target/classes scripts/CreateAdmin.java --email admin@example.com --seed"
