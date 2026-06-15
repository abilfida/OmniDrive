-include .env
export

.PHONY: help check-env dev stop logs deploy-worker deploy-web deploy-all db-migrate-local db-migrate-remote reset-local reset-remote

# Tampilkan bantuan
help:
	@echo "Omnidrive Commands"
	@echo "-----------------------------"
	@echo "make dev               - Jalankan local development (background)"
	@echo "make stop              - Stop local development (berdasarkan port di .env)"
	@echo "make logs              - Tampilkan log local development"
	@echo "make deploy-worker     - Deploy Cloudflare Worker (Backend)"
	@echo "make deploy-web        - Build & Deploy Cloudflare Pages (Frontend)"
	@echo "make deploy-all        - Deploy Backend & Frontend sekaligus"
	@echo "make db-migrate-local  - Migrate local D1 Database"
	@echo "make db-migrate-remote - Migrate remote D1 Database"

# Start Local Development
dev: stop
	@echo "=> Starting local development (Web & Worker)..."
	@nohup npm run dev > dev.log 2>&1 &
	@echo "=> Development servers started in background. Check dev.log for logs."

# View Local Development Logs
logs:
	@if [ -f dev.log ]; then \
		tail -f -n 100 dev.log; \
	else \
		echo "=> dev.log not found. Is 'make dev' running?"; \
	fi

# Check Environment Variables
check-env:
	@if [ ! -f .env ]; then \
		echo "=> [ERROR] File .env tidak ditemukan. Silakan buat dan setup env vars (WEB_PORT, WORKER_PORT) di .env"; \
		exit 1; \
	fi
	@if [ -z "$$WEB_PORT" ] && [ -z "$$PORT" ]; then \
		echo "=> [ERROR] Variabel WEB_PORT (atau PORT) belum diatur di .env"; \
		exit 1; \
	fi
	@if [ -z "$$WORKER_PORT" ]; then \
		echo "=> [ERROR] Variabel WORKER_PORT belum diatur di .env"; \
		exit 1; \
	fi
	@ln -sf ../../.env packages/worker/.dev.vars

# Stop Local Development
stop: check-env
	@echo "=> Stopping local development servers..."
	@PORTS="$$WEB_PORT $$PORT $$WORKER_PORT"; \
	for p in $$PORTS; do \
		if [ -n "$$p" ]; then \
			PIDS=$$(lsof -ti:$$p); \
			if [ -n "$$PIDS" ]; then \
				echo "Stopping processes on port $$p (PIDs: $$PIDS)..."; \
				kill -9 $$PIDS 2>/dev/null || true; \
			fi; \
		fi; \
	done
	@echo "=> Done."

# Deploy Backend
deploy-worker:
	@echo "=> Deploying Worker (Backend)..."
	cd packages/worker && npx wrangler deploy

# Deploy Frontend
deploy-web:
	@echo "=> Building & Deploying Web (Frontend)..."
	@echo "Pastikan packages/web/.env.production sudah berisi VITE_API_URL yang benar."
	cd packages/web && npx vite build && npx wrangler pages deploy dist/ --project-name omnidrive --branch main

# Deploy Keduanya
deploy-all: deploy-worker deploy-web
	@echo "=> Berhasil deploy keseluruhan aplikasi!"

# Migrate DB Local
db-migrate-local:
	@echo "=> Migrating Local D1 Database..."
	cd packages/worker && npm run db:migrate:local

# Migrate DB Remote
db-migrate-remote:
	@echo "=> Migrating Remote D1 Database..."
	cd packages/worker && npm run db:migrate:remote

# Reset Data Local
reset-local:
	@echo "=> Starting Local Factory Reset..."
	cd packages/worker && npm run db:reset:local

# Reset Data Remote
reset-remote:
	@echo "=> Starting Remote Factory Reset..."
	cd packages/worker && npm run db:reset:remote
