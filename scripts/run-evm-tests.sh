#!/usr/bin/env bash
#
# Run EVM integration tests against local Anvil + Faucet infrastructure
#
# Usage:
#   ./scripts/run-evm-tests.sh              # Run tests with cleanup
#   ./scripts/run-evm-tests.sh --no-cleanup # Keep infrastructure running after tests
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose-evm-test.yml"
CLEANUP=true

# Parse arguments
for arg in "$@"; do
  case $arg in
    --no-cleanup)
      CLEANUP=false
      shift
      ;;
    *)
      echo "Unknown option: $arg"
      echo "Usage: $0 [--no-cleanup]"
      exit 1
      ;;
  esac
done

# Cleanup function
cleanup() {
  if [ "$CLEANUP" = true ]; then
    echo -e "${BLUE}🧹 Stopping infrastructure...${NC}"
    docker compose -f "$COMPOSE_FILE" down -v
    echo -e "${GREEN}✅ Infrastructure stopped${NC}"
  else
    echo -e "${YELLOW}⚠️  Infrastructure left running (--no-cleanup)${NC}"
    echo -e "${BLUE}ℹ️  To stop: docker compose -f $COMPOSE_FILE down -v${NC}"
  fi
}

# Set up trap to cleanup on exit
trap cleanup EXIT

# Start infrastructure
echo -e "${BLUE}🚀 Starting EVM test infrastructure...${NC}"
docker compose -f "$COMPOSE_FILE" up -d

# Wait for Anvil health check
echo -e "${BLUE}⏳ Waiting for Anvil to become healthy...${NC}"
MAX_WAIT=60
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  if docker compose -f "$COMPOSE_FILE" ps anvil | grep -q "healthy"; then
    echo -e "${GREEN}✅ Anvil is healthy${NC}"
    break
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo -e "${RED}❌ Anvil failed to become healthy within ${MAX_WAIT}s${NC}"
  docker compose -f "$COMPOSE_FILE" logs anvil
  exit 1
fi

# Wait for faucet health check
echo -e "${BLUE}⏳ Waiting for faucet to become healthy...${NC}"
MAX_WAIT=30
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
  if docker compose -f "$COMPOSE_FILE" ps faucet | grep -q "healthy"; then
    echo -e "${GREEN}✅ Faucet is healthy${NC}"
    break
  fi
  sleep 1
  ELAPSED=$((ELAPSED + 1))
done

if [ $ELAPSED -ge $MAX_WAIT ]; then
  echo -e "${RED}❌ Faucet failed to become healthy within ${MAX_WAIT}s${NC}"
  docker compose -f "$COMPOSE_FILE" logs faucet
  exit 1
fi

# Verify infrastructure connectivity
echo -e "${BLUE}🔍 Verifying infrastructure connectivity...${NC}"

# Check Anvil RPC
if curl -s -X POST -H "Content-Type: application/json" \
  --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
  http://localhost:8545 | grep -q "0x7a69"; then
  echo -e "${GREEN}✅ Anvil RPC responding (chain-id 31337)${NC}"
else
  echo -e "${RED}❌ Anvil RPC not responding correctly${NC}"
  exit 1
fi

# Check faucet API and verify token is ready
if curl -s http://localhost:3500/health | grep -q '"tokenReady":true'; then
  echo -e "${GREEN}✅ Faucet API responding and token ready${NC}"
else
  echo -e "${RED}❌ Faucet API not responding correctly or token not ready${NC}"
  exit 1
fi

# Run tests
echo -e "${BLUE}🧪 Running EVM integration tests...${NC}"
echo ""

# Run tests and capture exit code
set +e
npm run test:integration -- --testPathPattern="base-payment-channel"
TEST_EXIT_CODE=$?
set -e

echo ""

# Report results
if [ $TEST_EXIT_CODE -eq 0 ]; then
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}✅ All EVM tests passed!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  exit 0
else
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${RED}❌ EVM tests failed${NC}"
  echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo -e "${YELLOW}📋 Infrastructure logs:${NC}"
  docker compose -f "$COMPOSE_FILE" logs --tail=50
  exit $TEST_EXIT_CODE
fi
