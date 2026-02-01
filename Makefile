# Development workflow commands for M2M project
# Run 'make help' to see all available commands

.PHONY: help dev-up dev-up-dashboard dev-up-auto-ledger dev-up-all dev-down dev-reset dev-logs dev-logs-connector-alice dev-logs-connector-bob dev-test dev-clean dev-status aptos-up aptos-down aptos-init aptos-deploy aptos-fund aptos-logs

# Default target - show help
help:
	@echo "M2M Development Workflow Commands"
	@echo "=================================="
	@echo ""
	@echo "Starting Services:"
	@echo "  make dev-up               Start all development services (Anvil, rippled, TigerBeetle, connectors)"
	@echo "  make dev-up-dashboard     Start all services including optional dashboard"
	@echo "  make dev-up-auto-ledger   Start all services with automated rippled ledger advancement"
	@echo "  make dev-up-all           Start all services with all optional profiles (dashboard + auto-ledger)"
	@echo ""
	@echo "Stopping Services:"
	@echo "  make dev-down             Stop all development services (preserves volumes)"
	@echo "  make dev-reset            Reset all services to clean state (WARNING: deletes all data volumes)"
	@echo ""
	@echo "Monitoring:"
	@echo "  make dev-logs             View logs from all services (follow mode)"
	@echo "  make dev-logs-alice       View logs from connector-alice"
	@echo "  make dev-logs-bob         View logs from connector-bob"
	@echo "  make dev-status           Show status of all development services"
	@echo ""
	@echo "Testing:"
	@echo "  make dev-test             Run integration tests against development environment"
	@echo ""
	@echo "Maintenance:"
	@echo "  make dev-clean            Deep clean: remove all containers, volumes, and unused Docker resources"
	@echo ""
	@echo "Aptos Local Testnet:"
	@echo "  make aptos-up             Start Aptos local testnet"
	@echo "  make aptos-down           Stop Aptos local testnet"
	@echo "  make aptos-init           Initialize testnet (wait for health, display info)"
	@echo "  make aptos-deploy         Deploy payment_channel Move module"
	@echo "  make aptos-fund ACCOUNT=0x...  Fund an account via faucet"
	@echo "  make aptos-logs           View Aptos container logs"
	@echo ""
	@echo "Examples:"
	@echo "  make dev-up                           # Start core development environment"
	@echo "  make dev-up-dashboard                 # Start with dashboard for network visualization"
	@echo "  make dev-logs                         # Watch logs from all services"
	@echo "  make dev-reset                        # Reset to clean state (fresh blockchain data)"
	@echo "  make dev-down                         # Stop all services when done"
	@echo "  make aptos-up && make aptos-init      # Start and initialize Aptos testnet"

# Start all development services
dev-up:
	@echo "Starting development environment..."
	docker-compose -f docker-compose-dev.yml up -d
	@echo "Development environment started. Run 'make dev-logs' to view logs."

# Start all services including optional dashboard
dev-up-dashboard:
	@echo "Starting development environment with dashboard..."
	docker-compose -f docker-compose-dev.yml --profile dashboard up -d
	@echo "Development environment started with dashboard at http://localhost:8080"

# Start all services with automated rippled ledger advancement
dev-up-auto-ledger:
	@echo "Starting development environment with automated rippled ledger advancement..."
	@echo "Ledgers will advance every 5 seconds automatically"
	docker-compose -f docker-compose-dev.yml --profile auto-ledger up -d
	@echo "Development environment started with auto-ledger advancement"

# Start all services with all optional profiles
dev-up-all:
	@echo "Starting development environment with all optional services (dashboard + auto-ledger)..."
	docker-compose -f docker-compose-dev.yml --profile dashboard --profile auto-ledger up -d
	@echo "Development environment started with dashboard at http://localhost:8080 and auto-ledger advancement"

# Stop all development services (preserves volumes)
dev-down:
	@echo "Stopping development environment..."
	docker-compose -f docker-compose-dev.yml down
	@echo "Development environment stopped"

# Reset all services to clean state (WARNING: deletes all data volumes)
dev-reset:
	@echo "WARNING: This will DELETE all data volumes (blockchain state, ledger data, etc.)"
	@read -p "Continue? (y/N) " confirm && [ "$$confirm" = "y" ] || (echo "Reset cancelled"; exit 1)
	@echo "Stopping and removing all services and volumes..."
	docker-compose -f docker-compose-dev.yml down -v
	@echo "Restarting with clean state..."
	docker-compose -f docker-compose-dev.yml up -d
	@echo "Development environment reset to clean state"

# View logs from all services (follow mode)
dev-logs:
	docker-compose -f docker-compose-dev.yml logs -f

# View logs from connector-alice
dev-logs-alice:
	docker-compose -f docker-compose-dev.yml logs -f connector-alice

# View logs from connector-bob
dev-logs-bob:
	docker-compose -f docker-compose-dev.yml logs -f connector-bob

# Run integration tests against development environment
dev-test:
	@echo "Running integration tests against development environment..."
	@echo "Ensure development environment is running with 'make dev-up' before running tests"
	E2E_TESTS=true npm run test:integration

# Deep clean: remove all containers, volumes, and unused Docker resources
dev-clean:
	@echo "WARNING: This will DELETE all containers, volumes, and unused Docker resources"
	@read -p "Continue? (y/N) " confirm && [ "$$confirm" = "y" ] || (echo "Clean cancelled"; exit 1)
	@echo "Removing all containers and volumes..."
	docker-compose -f docker-compose-dev.yml down -v --remove-orphans
	@echo "Cleaning unused Docker resources..."
	docker system prune -f
	@echo "Deep clean complete"

# Show status of all development services
dev-status:
	docker-compose -f docker-compose-dev.yml ps

# ===== Aptos Local Testnet Commands =====

# Start Aptos local testnet
aptos-up:
	@echo "Starting Aptos local testnet..."
	@echo "Note: First startup may take 2-3 minutes (Docker image download ~2GB)"
	docker-compose -f docker-compose-dev.yml up -d aptos-local
	@echo "Aptos local testnet starting. Run 'make aptos-logs' to view logs."
	@echo "Health check will pass in ~60 seconds."

# Stop Aptos local testnet
aptos-down:
	@echo "Stopping Aptos local testnet..."
	docker-compose -f docker-compose-dev.yml stop aptos-local
	@echo "Aptos local testnet stopped"

# Initialize Aptos local testnet (wait for health, display info)
aptos-init:
	@echo "Initializing Aptos local testnet..."
	./scripts/init-aptos-local.sh

# Deploy payment_channel Move module
aptos-deploy:
	@echo "Deploying Move module to Aptos local testnet..."
	./scripts/aptos-deploy-module.sh

# Fund an Aptos account via faucet
# Usage: make aptos-fund ACCOUNT=0x1234...
aptos-fund:
	@if [ -z "$(ACCOUNT)" ]; then \
		echo "Usage: make aptos-fund ACCOUNT=0x<address>"; \
		echo "Example: make aptos-fund ACCOUNT=0x1234567890abcdef..."; \
		exit 1; \
	fi
	./scripts/aptos-fund-account.sh $(ACCOUNT)

# View Aptos local testnet logs
aptos-logs:
	docker-compose -f docker-compose-dev.yml logs -f aptos-local
