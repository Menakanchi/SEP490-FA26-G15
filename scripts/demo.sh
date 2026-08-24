#!/usr/bin/env bash
# Một lệnh dựng toàn bộ demo local. Chỉ dừng những process do chính script này
# khởi động; service đã chạy từ trước được tái sử dụng và không bị đụng tới.

set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
USER_DIR="$(getent passwd "$(id -u)" | cut -d: -f6)"

MODE="full"
if [[ "${1:-}" == "--web-only" ]]; then
    MODE="web"
elif [[ "${1:-}" == "--check" ]]; then
    MODE="check"
elif [[ -n "${1:-}" && "${1:-}" != "--help" && "${1:-}" != "-h" ]]; then
    echo "Tham số không hợp lệ: $1" >&2
    exit 2
fi

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
    cat <<'EOF'
Usage:
  make demo        # backend + frontend + CARLA + camera + worker
  make demo-web    # backend + frontend, không cần GPU/CARLA
  make demo-check  # chỉ kiểm tra dependency/cấu hình

Biến môi trường tuỳ chọn:
  CARLA_ROOT, SR_ROOT, CARLA_PORT, CARLA_TM_PORT
  DEMO_CARLA_RES_X, DEMO_CARLA_RES_Y, DEMO_SEED=1, DEMO_ENV_FILE
EOF
    exit 0
fi

CARLA_ROOT="${CARLA_ROOT:-${USER_DIR}/CARLA_0.9.15}"
SR_ROOT="${SR_ROOT:-${USER_DIR}/scenario_runner}"
CARLA_PORT="${CARLA_PORT:-2000}"
CARLA_TM_PORT="${CARLA_TM_PORT:-8005}"
CARLA_RES_X="${DEMO_CARLA_RES_X:-1000}"
CARLA_RES_Y="${DEMO_CARLA_RES_Y:-700}"
BACKEND_URL="http://127.0.0.1:8000"
FRONTEND_URL="http://127.0.0.1:3000"
ENV_FILE="${DEMO_ENV_FILE:-${REPO_ROOT}/.env}"

require_command() {
    if ! command -v "$1" >/dev/null 2>&1; then
        echo "Thiếu lệnh '$1'. $2" >&2
        return 1
    fi
}

port_open() {
    local port="$1"
    timeout 1 bash -c "</dev/tcp/127.0.0.1/${port}" >/dev/null 2>&1
}

http_ready() {
    curl --max-time 2 --fail --silent "$1" >/dev/null 2>&1
}

wait_for_http() {
    local url="$1"
    local label="$2"
    local attempts="${3:-60}"
    for ((i = 1; i <= attempts; i++)); do
        if http_ready "$url"; then
            return 0
        fi
        sleep 1
    done
    echo "$label không sẵn sàng tại $url" >&2
    return 1
}

wait_for_port() {
    local port="$1"
    local label="$2"
    local attempts="${3:-60}"
    for ((i = 1; i <= attempts; i++)); do
        if port_open "$port"; then
            return 0
        fi
        sleep 1
    done
    echo "$label không mở cổng $port" >&2
    return 1
}

check_prerequisites() {
    local failed=0
    require_command uv "Cài uv trước khi chạy demo." || failed=1
    require_command node "Cài Node.js 20+." || failed=1
    require_command npm "Cài npm đi kèm Node.js." || failed=1
    require_command curl "Cài curl để kiểm health check." || failed=1
    require_command setsid "Cài util-linux để quản lý process demo." || failed=1

    if [[ ! -f "$ENV_FILE" ]]; then
        echo "Thiếu ${ENV_FILE} — chạy: cp .env.example .env rồi điền API key." >&2
        failed=1
    fi

    if [[ "$MODE" != "web" ]]; then
        if [[ ! -x "${CARLA_ROOT}/CarlaUE4.sh" ]]; then
            echo "Không tìm thấy CARLA executable: ${CARLA_ROOT}/CarlaUE4.sh" >&2
            failed=1
        fi
        if [[ ! -f "${SR_ROOT}/scenario_runner.py" ]]; then
            echo "Không tìm thấy ScenarioRunner: ${SR_ROOT}/scenario_runner.py" >&2
            failed=1
        fi
    fi

    if ((failed)); then
        return 1
    fi
    echo "✓ Dependency và đường dẫn demo hợp lệ (${MODE})."
}

check_prerequisites
if [[ "$MODE" == "check" ]]; then
    exit 0
fi

# Export .env cho worker và frontend; backend vẫn đọc cùng file qua Settings.
set -a
# shellcheck disable=SC1091
source "$ENV_FILE"
set +a

if [[ "${OPENAI_API_KEY:-}" == "sk-your-key-here" || -z "${OPENAI_API_KEY:-}" ]]; then
    echo "Cảnh báo: OPENAI_API_KEY chưa được cấu hình; thư viện vẫn xem được nhưng Generator sẽ không gọi được LLM." >&2
fi

LOG_DIR="$(mktemp -d /tmp/scenario-forge-demo.XXXXXX)"
declare -a OWNED_PIDS=()
declare -a OWNED_NAMES=()

start_service() {
    local name="$1"
    local workdir="$2"
    shift 2
    local log_file="${LOG_DIR}/${name}.log"
    setsid bash -c 'cd "$1"; shift; exec "$@"' _ "$workdir" "$@" >"$log_file" 2>&1 &
    local pid=$!
    OWNED_PIDS+=("$pid")
    OWNED_NAMES+=("$name")
    echo "  started ${name} (pid ${pid}, log ${log_file})"
}

cleanup() {
    local exit_code=$?
    trap - EXIT INT TERM
    if ((${#OWNED_PIDS[@]})); then
        echo
        echo "Đang dừng các process do demo script khởi động…"
        for ((i = ${#OWNED_PIDS[@]} - 1; i >= 0; i--)); do
            local pid="${OWNED_PIDS[$i]}"
            if kill -0 "$pid" >/dev/null 2>&1; then
                kill -TERM -- "-${pid}" >/dev/null 2>&1 || true
            fi
        done
        for pid in "${OWNED_PIDS[@]}"; do
            wait "$pid" 2>/dev/null || true
        done
    fi
    echo "Log phiên demo được giữ tại: ${LOG_DIR}"
    exit "$exit_code"
}
trap cleanup EXIT INT TERM

cd "$REPO_ROOT"

if [[ ! -x "${REPO_ROOT}/.venv/bin/python" ]]; then
    echo "Đang cài dependency backend…"
    uv sync --locked
fi
if [[ ! -d "${REPO_ROOT}/frontend/node_modules" ]]; then
    echo "Đang cài dependency frontend…"
    (cd frontend && npm ci)
fi
if [[ "$MODE" == "full" && ! -x "${REPO_ROOT}/worker/.venv/bin/python" ]]; then
    echo "Đang cài dependency worker Python 3.10…"
    uv sync --project worker --locked
fi

uv run --locked python scripts/init_db.py
if [[ "${DEMO_SEED:-0}" == "1" ]]; then
    uv run --locked python scripts/seed_db.py
fi

echo "Khởi động Scenario Forge demo (${MODE})…"

if port_open 8000; then
    if ! http_ready "${BACKEND_URL}/health"; then
        echo "Cổng 8000 đang bị process khác chiếm và không trả health của Scenario Forge." >&2
        exit 1
    fi
    echo "  reuse backend đang chạy ở ${BACKEND_URL}"
else
    start_service backend "$REPO_ROOT" \
        uv run --locked uvicorn src.main:app --host 127.0.0.1 --port 8000
    wait_for_http "${BACKEND_URL}/health" "Backend"
fi

if port_open 3000; then
    if ! http_ready "$FRONTEND_URL"; then
        echo "Cổng 3000 đang bị process khác chiếm và không trả HTTP." >&2
        exit 1
    fi
    echo "  reuse frontend đang chạy ở ${FRONTEND_URL}"
else
    start_service frontend "${REPO_ROOT}/frontend" \
        env NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-${BACKEND_URL}/api/v1}" \
        npm run dev -- --hostname 127.0.0.1 --port 3000
    wait_for_http "$FRONTEND_URL" "Frontend" 90
fi

if [[ "$MODE" == "full" ]]; then
    if port_open "$CARLA_PORT"; then
        echo "  reuse CARLA đang chạy ở 127.0.0.1:${CARLA_PORT}"
    else
        start_service carla "$CARLA_ROOT" \
            env __NV_PRIME_RENDER_OFFLOAD=1 __VK_LAYER_NV_optimus=NVIDIA_only \
            "${CARLA_ROOT}/CarlaUE4.sh" \
            -carla-rpc-port="$CARLA_PORT" -windowed \
            -ResX="$CARLA_RES_X" -ResY="$CARLA_RES_Y"
        wait_for_port "$CARLA_PORT" "CARLA" 90
    fi

    # Cổng TCP mở trước khi world thật sự sẵn sàng. Hỏi version mới là readiness
    # probe đáng tin để tránh worker nhận job rồi trả lỗi ngay lúc mở màn demo.
    echo "  đang kiểm tra CARLA RPC readiness…"
    carla_ready=0
    for ((i = 1; i <= 30; i++)); do
        if PYTHONPATH="${CARLA_ROOT}/PythonAPI/carla" \
            "${REPO_ROOT}/worker/.venv/bin/python" -c \
            "import carla; c=carla.Client('127.0.0.1', ${CARLA_PORT}); c.set_timeout(1.0); print(c.get_server_version())" \
            >/dev/null 2>&1; then
            carla_ready=1
            break
        fi
        sleep 1
    done
    if [[ "$carla_ready" != "1" ]]; then
        echo "CARLA đã mở cổng nhưng client chưa lấy được server version." >&2
        exit 1
    fi

    if pgrep -f "[w]orker/follow_hero.py" >/dev/null 2>&1; then
        echo "  reuse camera bám xe đang chạy"
    else
        start_service camera "$REPO_ROOT" \
            env PYTHONPATH="${CARLA_ROOT}/PythonAPI/carla" \
            "${REPO_ROOT}/worker/.venv/bin/python" worker/follow_hero.py
    fi

    if pgrep -f "[w]orker/runner.py" >/dev/null 2>&1; then
        echo "  reuse GPU worker đang chạy"
    else
        start_service worker "$REPO_ROOT" \
            env FORGE_BACKEND="$BACKEND_URL" CARLA_HOST=127.0.0.1 \
            CARLA_PORT="$CARLA_PORT" CARLA_TM_PORT="$CARLA_TM_PORT" \
            CARLA_NO_RENDER=0 \
            "${REPO_ROOT}/worker/.venv/bin/python" worker/runner.py
    fi
fi

echo
echo "Demo đã sẵn sàng:"
echo "  Web:      ${FRONTEND_URL}"
echo "  API docs: ${BACKEND_URL}/docs"
if [[ "$MODE" == "full" ]]; then
    echo "  CARLA:    127.0.0.1:${CARLA_PORT} (render bật)"
fi
echo "  Logs:     ${LOG_DIR}"
echo "Nhấn Ctrl+C để dừng những service do lệnh này khởi động."

while true; do
    for ((i = 0; i < ${#OWNED_PIDS[@]}; i++)); do
        pid="${OWNED_PIDS[$i]}"
        if ! kill -0 "$pid" >/dev/null 2>&1; then
            name="${OWNED_NAMES[$i]}"
            echo "Service ${name} đã dừng ngoài dự kiến. Log cuối:" >&2
            tail -n 30 "${LOG_DIR}/${name}.log" >&2 || true
            exit 1
        fi
    done
    sleep 2
done
