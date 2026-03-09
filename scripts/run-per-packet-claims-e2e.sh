#!/bin/bash
# Run Per-Packet Claims E2E Test
#
# This script:
# 1. Starts infrastructure (Anvil only, or full stack with --docker)
# 2. Runs per-packet claims E2E test
# 3. Validates claims travel with ILP packets via BTP protocolData
# 4. Cleans up
#
# Usage:
#   ./scripts/run-per-packet-claims-e2e.sh                  # In-process mode
#   ./scripts/run-per-packet-claims-e2e.sh --docker         # Docker mode
#   ./scripts/run-per-packet-claims-e2e.sh --no-cleanup     # Keep infra running

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

COMPOSE_FILE="docker-compose-base-e2e-test.yml"
CLEANUP=true
DOCKER_MODE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --no-cleanup)
      CLEANUP=false
      shift
      ;;
    --docker)
      DOCKER_MODE=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      echo "Usage: $0 [--docker] [--no-cleanup]"
      exit 1
      ;;
  esac
done

cd "$REPO_ROOT"

echo "Per-Packet Claims E2E Test"
echo "=========================================="
if [ "$DOCKER_MODE" = true ]; then
  echo "Mode: Docker (TigerBeetle + Docker connectors)"
else
  echo "Mode: In-Process (in-memory ledger)"
fi
echo ""

# Cleanup function
cleanup() {
  if [ "$CLEANUP" = true ]; then
    echo ""
    echo "Cleaning up infrastructure..."
    docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true
    echo "Cleanup complete"
  else
    echo ""
    echo "Infrastructure still running (--no-cleanup)"
    echo "Stop with: docker compose -f $COMPOSE_FILE down -v"
  fi
}

trap cleanup EXIT

# Check Docker
if ! docker info > /dev/null 2>&1; then
  echo "Docker not running"
  exit 1
fi

# Stop existing infrastructure
echo "Stopping any existing infrastructure..."
docker compose -f "$COMPOSE_FILE" down -v --remove-orphans 2>/dev/null || true

if [ "$DOCKER_MODE" = true ]; then
  # Docker mode: start full stack
  echo ""
  echo "Starting full stack (Anvil + TigerBeetle + Connectors)..."
  docker compose -f "$COMPOSE_FILE" up -d --build

  # Wait for Anvil with preloaded contracts
  echo ""
  echo "Waiting for Anvil (contracts preloaded via state snapshot)..."
  MAX_WAIT=30
  ELAPSED=0
  while [ $ELAPSED -lt $MAX_WAIT ]; do
    if curl -f -s -X POST http://localhost:8545 \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["0x5FbDB2315678afecb367f032d93F642f64180aa3","latest"],"id":1}' 2>/dev/null | grep -q '0x60'; then
      echo "Anvil ready with contracts!"
      break
    fi

    sleep 1
    ELAPSED=$((ELAPSED + 1))

    if [ $ELAPSED -ge $MAX_WAIT ]; then
      echo "Anvil timeout"
      exit 1
    fi
  done

  # Wait for connectors to become healthy
  echo ""
  echo "Waiting for Docker connectors to become healthy..."
  MAX_WAIT=120
  ELAPSED=0
  while [ $ELAPSED -lt $MAX_WAIT ]; do
    HEALTH_A=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8080/health 2>/dev/null || echo "000")
    HEALTH_B=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8090/health 2>/dev/null || echo "000")

    if [ "$HEALTH_A" = "200" ] && [ "$HEALTH_B" = "200" ]; then
      echo "Both connectors are healthy!"
      break
    fi

    sleep 2
    ELAPSED=$((ELAPSED + 2))

    if [ $ELAPSED -ge $MAX_WAIT ]; then
      echo "Connector health check timeout (A: $HEALTH_A, B: $HEALTH_B)"
      echo "Connector A logs:"
      docker compose -f "$COMPOSE_FILE" logs connector_a --tail=20 2>/dev/null || true
      echo "Connector B logs:"
      docker compose -f "$COMPOSE_FILE" logs connector_b --tail=20 2>/dev/null || true
      exit 1
    fi
  done

  export E2E_DOCKER_TESTS=true
else
  # In-process mode: start only Anvil
  echo ""
  echo "Starting Anvil (contracts preloaded via state snapshot)..."
  docker compose -f "$COMPOSE_FILE" up -d anvil_base_e2e

  # Wait for Anvil with preloaded contracts
  echo ""
  echo "Waiting for Anvil (contracts preloaded via state snapshot)..."
  MAX_WAIT=30
  ELAPSED=0
  while [ $ELAPSED -lt $MAX_WAIT ]; do
    if curl -f -s -X POST http://localhost:8545 \
      -H "Content-Type: application/json" \
      -d '{"jsonrpc":"2.0","method":"eth_getCode","params":["0x5FbDB2315678afecb367f032d93F642f64180aa3","latest"],"id":1}' 2>/dev/null | grep -q '0x60'; then
      echo "Anvil ready with contracts!"
      break
    fi

    sleep 1
    ELAPSED=$((ELAPSED + 1))

    if [ $ELAPSED -ge $MAX_WAIT ]; then
      echo "Anvil timeout"
      exit 1
    fi
  done

  export E2E_TESTS=true
fi

# Show infrastructure status
echo ""
echo "Infrastructure status:"
docker compose -f "$COMPOSE_FILE" ps

# Run per-packet claims E2E test
echo ""
echo "Running Per-Packet Claims E2E Test..."
echo "=========================================="
echo ""

npm test --workspace=packages/connector -- --forceExit per-packet-claims-e2e.test.ts

echo ""
echo "=========================================="
echo "Test completed successfully!"
echo "=========================================="
