.PHONY: run test lint format format-check typecheck check clean

run:
	uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# Cùng cờ với CI: coverage là gate, không phải báo cáo cho vui.
test:
	pytest tests/ -v --cov=src --cov-report=term-missing --cov-fail-under=60

lint:
	ruff check src/ tests/

# `format` SỬA file. `format-check` chỉ KIỂM — đây mới là thứ CI chạy.
format:
	ruff format src/ tests/

format-check:
	ruff format --check src/ tests/

typecheck:
	mypy src/

# Bản sao đúng ba bước của .github/workflows/ci.yml. `check` cũ gọi `format`
# nên nó lặng lẽ sửa file rồi báo xanh — xanh ở máy mình mà CI vẫn đỏ.
check: lint format-check test

clean:
	find . -type d -name __pycache__ -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +
