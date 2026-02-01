#!/bin/bash
# Docker Agent Society Integration Test Runner
#
# This script builds and runs the Docker-based agent society test.
# It starts multiple agent containers and orchestrates them through
# the test phases using HTTP API calls.
#
# The test connects to public testnets:
#   - Aptos Testnet (https://fullnode.testnet.aptoslabs.com)
#   - XRP Testnet (wss://s.altnet.rippletest.net)
#   - Base Sepolia (https://sepolia.base.org) - optional, requires pre-deployed contracts
#
# Usage:
#   ./scripts/run-docker-agent-test.sh
#   AGENT_COUNT=3 ./scripts/run-docker-agent-test.sh
#   LOG_LEVEL=debug ./scripts/run-docker-agent-test.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
AGENT_COUNT=${AGENT_COUNT:-5}
LOG_LEVEL=${LOG_LEVEL:-info}
COMPOSE_FILE="docker-compose-agent-test.yml"
TEST_TIMEOUT=${TEST_TIMEOUT:-300}  # 5 minutes

# Always use public testnets
export NETWORK_MODE="testnet"

# Public testnet URLs
export APTOS_NODE_URL="${APTOS_TESTNET_NODE_URL:-https://fullnode.testnet.aptoslabs.com/v1}"
export APTOS_FAUCET_URL="${APTOS_TESTNET_FAUCET_URL:-https://faucet.testnet.aptoslabs.com}"
export XRPL_WSS_URL="${XRP_TESTNET_WSS_URL:-wss://s.altnet.rippletest.net:51233}"
export XRPL_RPC_URL="${XRP_TESTNET_RPC_URL:-https://s.altnet.rippletest.net:51234}"
export XRPL_NETWORK="testnet"
export ANVIL_RPC_URL="${BASE_SEPOLIA_RPC_URL:-https://sepolia.base.org}"

# Pre-deployed contracts on Base Sepolia (all 3 required for EVM testnet)
export BASE_REGISTRY_ADDRESS="${BASE_REGISTRY_ADDRESS:-}"
export BASE_TOKEN_ADDRESS="${BASE_TOKEN_ADDRESS:-}"
export BASE_TOKEN_NETWORK_ADDRESS="${BASE_TOKEN_NETWORK_ADDRESS:-}"

# Enable chains
export APTOS_ENABLED="true"
export XRP_ENABLED="true"

# Check if EVM contracts are configured
if [ -n "$BASE_REGISTRY_ADDRESS" ] && [ -n "$BASE_TOKEN_ADDRESS" ] && [ -n "$BASE_TOKEN_NETWORK_ADDRESS" ]; then
    export EVM_ENABLED="true"
else
    export EVM_ENABLED="${EVM_ENABLED:-false}"
fi

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Docker Agent Society Integration Test${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo "Configuration:"
echo "  Agent Count: $AGENT_COUNT"
echo "  Log Level: $LOG_LEVEL"
echo "  Timeout: ${TEST_TIMEOUT}s"
echo ""
echo "Public Testnets:"
echo "  Aptos: $APTOS_NODE_URL"
echo "  XRP: $XRPL_WSS_URL"
echo "  EVM: $ANVIL_RPC_URL"
echo ""
echo "Chain Status:"
echo "  Aptos: ${GREEN}enabled${NC}"
echo "  XRP: ${GREEN}enabled${NC}"
if [ "$EVM_ENABLED" = "true" ]; then
    echo -e "  EVM: ${GREEN}enabled${NC} (contracts configured)"
else
    echo -e "  EVM: ${YELLOW}disabled${NC} (no contracts configured)"
fi
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Error: Docker is not running${NC}"
    exit 1
fi

# Navigate to project root
cd "$(dirname "$0")/.."

# Step 1: Build all agent images
echo -e "${YELLOW}[Step 1/4] Building agent Docker images...${NC}"
AGENTS_TO_BUILD=""
for i in $(seq 0 $((AGENT_COUNT - 1))); do
    AGENTS_TO_BUILD="$AGENTS_TO_BUILD agent-$i"
done
docker compose -f "$COMPOSE_FILE" build $AGENTS_TO_BUILD

# Step 2: Stop any existing containers
echo -e "${YELLOW}[Step 2/4] Stopping existing containers...${NC}"
docker compose -f "$COMPOSE_FILE" down -v 2>/dev/null || true

# Step 3: Verify testnet connectivity
echo -e "${YELLOW}[Step 3/4] Verifying testnet connectivity...${NC}"

echo -n "  Aptos testnet: "
if curl -sf "$APTOS_NODE_URL" > /dev/null 2>&1; then
    echo -e "${GREEN}reachable${NC}"
else
    echo -e "${RED}unreachable${NC}"
    echo -e "${RED}Error: Cannot reach Aptos testnet at $APTOS_NODE_URL${NC}"
    exit 1
fi

echo -n "  XRP testnet: "
# WebSocket check is harder, just verify DNS resolves
if host s.altnet.rippletest.net > /dev/null 2>&1 || ping -c 1 s.altnet.rippletest.net > /dev/null 2>&1; then
    echo -e "${GREEN}configured${NC}"
else
    echo -e "${YELLOW}DNS check failed (may still work)${NC}"
fi

echo -n "  Base Sepolia: "
if curl -sf "$ANVIL_RPC_URL" -X POST -H 'Content-Type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' > /dev/null 2>&1; then
    echo -e "${GREEN}reachable${NC}"
else
    echo -e "${YELLOW}unreachable (EVM tests may be skipped)${NC}"
fi

# Step 4: Start agents and run test
echo -e "${YELLOW}[Step 4/4] Starting agents and running test...${NC}"

# Start agent containers
docker compose -f "$COMPOSE_FILE" up -d agent-0 agent-1 agent-2 agent-3 agent-4

# Wait for all agents to be healthy
echo "  Waiting for agents to be healthy..."
for i in $(seq 0 $((AGENT_COUNT - 1))); do
    echo -n "    agent-$i: "
    for j in {1..60}; do
        if curl -sf "http://localhost:$((8100 + i))/health" > /dev/null 2>&1; then
            echo "ready"
            break
        fi
        if [ $j -eq 60 ]; then
            echo "TIMEOUT"
            echo -e "${RED}Error: agent-$i failed to start${NC}"
            docker compose -f "$COMPOSE_FILE" logs "agent-$i"
            exit 1
        fi
        sleep 1
    done
done

# Build TypeScript if needed
if [ ! -f "packages/connector/dist/test/docker-agent-test-runner.js" ]; then
    echo "  Building TypeScript..."
    npm run build:connector-only -w @m2m/connector
fi

# Run the test from host
export AGENT_COUNT="$AGENT_COUNT"
export LOG_LEVEL="$LOG_LEVEL"
export RUNNING_IN_DOCKER="false"

echo ""
echo "Running test orchestrator..."
echo ""

# Run the test (timeout command not available on macOS, use perl or skip)
if command -v timeout &> /dev/null; then
    timeout "$TEST_TIMEOUT" node packages/connector/dist/test/docker-agent-test-runner.js
    TEST_EXIT_CODE=$?
else
    # macOS fallback - run without timeout
    node packages/connector/dist/test/docker-agent-test-runner.js
    TEST_EXIT_CODE=$?
fi

# Print container logs if test failed
if [ $TEST_EXIT_CODE -ne 0 ]; then
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}Test Failed - Container Logs${NC}"
    echo -e "${RED}========================================${NC}"

    for i in $(seq 0 $((AGENT_COUNT - 1))); do
        echo ""
        echo "=== agent-$i logs ==="
        docker compose -f "$COMPOSE_FILE" logs --tail=50 "agent-$i" 2>/dev/null || true
    done
fi

# Cleanup
echo ""
echo -e "${YELLOW}Cleaning up containers...${NC}"
docker compose -f "$COMPOSE_FILE" down -v

# Exit with test result
if [ $TEST_EXIT_CODE -eq 0 ]; then
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}Test Passed!${NC}"
    echo -e "${GREEN}========================================${NC}"
else
    echo ""
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}Test Failed (exit code: $TEST_EXIT_CODE)${NC}"
    echo -e "${RED}========================================${NC}"
fi

exit $TEST_EXIT_CODE
