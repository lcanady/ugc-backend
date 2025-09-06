# UGC Ad Creator API - Docker Development Environment
.PHONY: help dev up down restart logs shell test clean reset

# Default target
help: ## Show this help message
	@echo "UGC Ad Creator API - Docker Commands"
	@echo "===================================="
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

dev: up ## Start development environment (alias for up)

up: ## Start the development environment
	@echo "🚀 Starting development environment..."
	@./scripts/docker/dev-up.sh

down: ## Stop the development environment
	@echo "🛑 Stopping development environment..."
	@./scripts/docker/dev-down.sh

restart: ## Restart the application service
	@echo "🔄 Restarting application..."
	@docker-compose restart app

logs: ## View application logs
	@./scripts/docker/logs.sh app

logs-all: ## View all service logs
	@docker-compose logs -f

shell: ## Open shell in application container
	@./scripts/docker/shell.sh app

shell-redis: ## Open Redis CLI
	@./scripts/docker/shell.sh redis

shell-postgres: ## Open PostgreSQL CLI
	@./scripts/docker/shell.sh postgres

test: ## Run all tests
	@./scripts/docker/test.sh all

test-unit: ## Run unit tests
	@./scripts/docker/test.sh unit

test-integration: ## Run integration tests
	@./scripts/docker/test.sh integration

test-coverage: ## Run tests with coverage
	@./scripts/docker/test.sh coverage

clean: ## Remove stopped containers and unused images
	@echo "🧹 Cleaning up Docker resources..."
	@docker system prune -f

reset: ## Reset development environment (removes all data)
	@./scripts/docker/dev-reset.sh

status: ## Show status of all services
	@docker-compose ps

build: ## Rebuild all services
	@echo "🔨 Rebuilding services..."
	@docker-compose build

pull: ## Pull latest images
	@echo "📥 Pulling latest images..."
	@docker-compose pull

# Production targets
prod-up: ## Start production environment
	@echo "🚀 Starting production environment..."
	@docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d

prod-down: ## Stop production environment
	@echo "🛑 Stopping production environment..."
	@docker-compose -f docker-compose.yml -f docker-compose.prod.yml down

prod-logs: ## View production logs
	@docker-compose -f docker-compose.yml -f docker-compose.prod.yml logs -f