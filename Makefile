DB_URI ?= postgresql://osm:osm@localhost:5433/osm

.PHONY: up down logs psql \
        web-dev backend-dev \
        tegola-regen \
        gem-import \
        imposm-mapping \
        help

help: ## Показати цю довідку
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
	  awk 'BEGIN{FS=":.*?## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'

# ── Docker stack ─────────────────────────────────────────────────────────────

up: ## Запустити всі сервіси
	docker compose up -d

down: ## Зупинити всі сервіси
	docker compose down

logs: ## Стежити за логами (Ctrl+C для виходу)
	docker compose logs -f

# ── Database ─────────────────────────────────────────────────────────────────

psql: ## Відкрити psql консоль
	docker compose exec db psql -U osm osm

sql: ## Виконати SQL файл: make sql FILE=schema/gem.sql
	docker compose exec -T db psql -U osm osm < $(FILE)

# ── Local dev servers ─────────────────────────────────────────────────────────

web-dev: ## Запустити web frontend в dev-режимі (hot reload)
	cd web && npm run dev

backend-dev: ## Запустити web-backend локально (потрібен запущений Docker DB)
	cd web-backend && \
	  DATABASE_URL=$(DB_URI) DEBUG=true \
	  ~/.local/bin/uv run uvicorn main:app --reload --port 8000

# ── Tegola ───────────────────────────────────────────────────────────────────

tegola-regen: ## Перегенерувати конфіг Tegola і перезапустити контейнер
	docker compose build tegola
	docker compose up -d tegola

# ── GEM import ───────────────────────────────────────────────────────────────

gem-import: ## Імпортувати всі файли з gem-data/ (./gem_import.sh)
	./gem_import.sh

# ── imposm mapping ───────────────────────────────────────────────────────────

imposm-mapping: ## Згенерувати mapping.json (без запуску imposm)
	cd imposm && python3 main.py > ../mapping.json
	@echo "mapping.json оновлено"
