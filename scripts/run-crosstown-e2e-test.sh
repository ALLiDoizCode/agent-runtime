#!/bin/bash
# Run Crosstown Comprehensive E2E Test
#
# This script:
# 1. Starts lightweight infrastructure (Anvil + TigerBeetle + Faucet)
# 2. Runs comprehensive E2E test with two connectors from npm
# 3. Validates complete payment flow: SPSP, routing, claims, balances
# 4. Cleans up
#
# NO DOCKER IMAGE BUILDING REQUIRED!
#
# Usage:
#   ./scripts/run-crosstown-e2e-test.sh
#   ./scripts/run-crosstown-e2e-test.sh --no-cleanup

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

COMPOSE_FILE="docker-compose-base-e2e-lite.yml"
CLEANUP=true

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-cleanup)
      CLEANUP=false
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--no-cleanup]"
      exit 1
      ;;
  esac
done

cd "$REPO_ROOT"

echo "🚀 Crosstown Comprehensive E2E Test"
echo "=========================================="
echo ""
echo "✨ No Docker image building required!"
echo "   Connectors start directly from npm"
echo ""

# Cleanup function
cleanup() {
  if [ "$CLEANUP" = true ]; then
    echo ""
    echo "🧹 Cleaning up infrastructure..."
    docker-compose -f "$COMPOSE_FILE" down -v --remove-orphans || true
    echo "✅ Cleanup complete"
  else
    echo ""
    echo "⚠️  Infrastructure still running (--no-cleanup)"
    echo "   Stop with: docker-compose -f $COMPOSE_FILE down -v"
  fi
}

trap cleanup EXIT

# Check Docker
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker not running"
  exit 1
fi

# Set E2E_TESTS environment variable
export E2E_TESTS=true

# Stop existing infrastructure
echo "🧹 Stopping any existing infrastructure..."
docker-compose -f "$COMPOSE_FILE" down -v --remove-orphans || true

# Start infrastructure only (Anvil + TigerBeetle + Contract deployer + Faucet)
echo ""
echo "🐳 Starting infrastructure..."
echo "   This is fast - no Docker images to build!"
docker-compose -f "$COMPOSE_FILE" up -d

# Wait for Anvil
echo ""
echo "⏳ Waiting for Anvil..."
MAX_WAIT=60
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  if curl -f -s -X POST http://localhost:8545 \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
    echo "✅ Anvil ready!"
    break
  fi

  sleep 2
  ELAPSED=$((ELAPSED + 2))

  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "❌ Anvil timeout"
    exit 1
  fi
done

# Wait for contracts to deploy
echo ""
echo "⏳ Waiting for contract deployment..."
sleep 10

# Wait for TigerBeetle
echo ""
echo "⏳ Waiting for TigerBeetle..."
sleep 5

# Show infrastructure status
echo ""
echo "📊 Infrastructure status:"
docker-compose -f "$COMPOSE_FILE" ps

# Run comprehensive E2E test
echo ""
echo "🧪 Running Crosstown Comprehensive E2E Test..."
echo "   (Two connectors will start from npm - fast!)"
echo "=========================================="
echo ""

npm test --workspace=packages/connector -- crosstown-comprehensive-e2e.test.ts

echo ""
echo "=========================================="
echo "✅ Test completed successfully!"
echo "=========================================="
