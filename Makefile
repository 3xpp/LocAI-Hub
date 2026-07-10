.PHONY: install dev dev-api dev-web test test-e2e test-web lint typecheck format build db-upgrade

install:
	cd backend && uv sync
	cd web && pnpm install

dev:
	@printf '%s\n' "Start the API in one terminal: make dev-api"
	@printf '%s\n' "Start the web app in another: make dev-web"

dev-api:
	cd backend && uv run fastapi dev src/local_ai_hub/api/main.py

dev-web:
	cd web && pnpm dev

test:
	cd backend && uv run pytest

test-e2e:
	cd backend && uv run pytest tests/e2e

test-web:
	cd web && pnpm test

lint:
	cd backend && uv run ruff check .
	cd web && pnpm lint

typecheck:
	cd backend && uv run mypy src
	cd web && pnpm typecheck

format:
	cd backend && uv run ruff format . && uv run ruff check . --fix

build:
	docker compose build
	cd web && pnpm build

db-upgrade:
	cd backend && uv run alembic upgrade head
