.PHONY: run test test-worker lint frontend check clean

# Backend một mình (Spring Boot, cổng 8001, đọc .env ở thư mục gốc). Cả hệ thống (MySQL, Redis,
# backend :8001, frontend :3000) trên Windows: scripts\dev-up.cmd.
run:
	./mvnw spring-boot:run

# Cùng ba cổng với .github/workflows/ci.yml. Test Java và worker không cần Docker.
test:
	./mvnw -B clean test

test-worker:
	python -m pytest worker/tests -q

lint:
	python -m ruff check worker

frontend:
	cd frontend && npm run lint && npx tsc --noEmit && npx next build

check: test test-worker lint frontend

clean:
	./mvnw -q clean
	find . -type d -name __pycache__ -not -path './frontend/*' -exec rm -rf {} +
	find . -type d -name .pytest_cache -exec rm -rf {} +
	find . -type d -name .ruff_cache -exec rm -rf {} +
