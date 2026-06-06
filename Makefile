.PHONY: dev dev-api dev-agent dev-web setup check test-go test-ts lint-go lint-ts db-up db-down db-migrate test-harness scenario

# ── Dev ──────────────────────────────────────────────────────────

dev:
	@make -j3 dev-api dev-agent dev-web

dev-api:
	cd apps/api && go run ./cmd/server

dev-agent:
	cd apps/agent && npm run dev

dev-web:
	cd apps/web && npm run dev

# ── Setup ────────────────────────────────────────────────────────

setup:
	@echo "→ Installing frontend dependencies..."
	pnpm install
	@echo "→ Downloading Go modules..."
	cd apps/api && go mod tidy
	@echo "→ Starting database..."
	make db-up
	@echo "→ Running migrations..."
	make db-migrate
	@echo "✓ Setup complete. Run 'make dev' to start."

# ── Database ─────────────────────────────────────────────────────

db-up:
	docker compose up -d postgres
	@echo "Waiting for postgres to be ready..."
	@until docker compose exec postgres pg_isready -U forge -q; do sleep 1; done
	@echo "✓ Postgres is ready"

db-down:
	docker compose down

db-logs:
	docker compose logs -f postgres

db-migrate:
	cd apps/api && go run ./cmd/migrate

db-reset:
	docker compose down -v
	docker compose up -d postgres
	@until docker compose exec postgres pg_isready -U forge -q; do sleep 1; done
	cd apps/api && go run ./cmd/migrate

db-psql:
	docker compose exec postgres psql -U forge

# ── Tests ────────────────────────────────────────────────────────

test:
	@make test-go test-ts

test-go:
	cd apps/api && go test ./...

test-go-integration:
	cd apps/api && go test -tags integration ./...

test-ts:
	pnpm --filter @forge/core test
	pnpm --filter @forge/agent-service test

test-e2e:
	pnpm exec playwright test

test-harness:
	pnpm test:harness

scenario:
	FORGE_USE_STUB=true pnpm scenario $(name)

verify-sandbox:
	cd apps/agent && npm run verify:sandbox

# ── Lint / Check ─────────────────────────────────────────────────

lint:
	@make lint-go lint-ts

lint-go:
	cd apps/api && golangci-lint run

lint-ts:
	pnpm exec eslint packages/ apps/web/src --config .eslintrc-layers.js

typecheck:
	pnpm --filter @forge/core exec tsc --noEmit
	pnpm --filter @forge/ui exec tsc --noEmit
	pnpm --filter @forge/web exec tsc --noEmit

check:
	@make lint typecheck test
	@echo "✓ All checks passed"

# ── Build ────────────────────────────────────────────────────────

build:
	pnpm --filter @forge/web build
	pnpm --filter @forge/agent-service build
	cd apps/api && go build -o bin/server ./cmd/server
