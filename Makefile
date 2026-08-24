.PHONY: run demo demo-web demo-check test lint format format-check typecheck check clean

run:
	uv run --locked uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Pitch/demo local: full dùng CARLA GPU; web-only vẫn chạy được Generator,
# review và thư viện khi worker offline.
demo:
	bash scripts/demo.sh

demo-web:
	bash scripts/demo.sh --web-only

demo-check:
	bash scripts/demo.sh --check

# Cùng cờ với CI: coverage là gate, không phải báo cáo cho vui.
test:
	uv run --locked pytest tests/ -v --cov=src --cov-report=term-missing --cov-fail-under=60

lint:
	uv run --locked ruff check src/ tests/

# `format` SỬA file. `format-check` chỉ KIỂM — đây mới là thứ CI chạy.
format:
	uv run --locked ruff format src/ tests/

format-check:
	uv run --locked ruff format --check src/ tests/

typecheck:
	uv run --locked mypy src/

# Bản sao đúng ba bước của .github/workflows/ci.yml. `check` cũ gọi `format`
# nên nó lặng lẽ sửa file rồi báo xanh — xanh ở máy mình mà CI vẫn đỏ.
check: lint format-check test

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +
