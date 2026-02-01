#!/bin/bash
# Initialize Aptos local testnet for M2M development
# This script waits for services to be ready and sets up the local development environment
#
# Usage: ./scripts/init-aptos-local.sh
#
# Prerequisites:
#   - Docker running with aptos-local service started
#   - Aptos CLI installed (optional, for module deployment)

set -e

# Configuration
APTOS_NODE_URL="${APTOS_NODE_URL:-http://localhost:8080/v1}"
APTOS_FAUCET_URL="${APTOS_FAUCET_URL:-http://localhost:8081}"
MAX_RETRIES=30
RETRY_INTERVAL=5

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "============================================"
echo "Initializing Aptos Local Testnet"
echo "============================================"
echo ""

# Function to wait for Aptos node to be ready
wait_for_node() {
    echo -e "${YELLOW}⏳ Waiting for Aptos node REST API at ${APTOS_NODE_URL}...${NC}"

    for i in $(seq 1 $MAX_RETRIES); do
        if curl -sf "${APTOS_NODE_URL}" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Aptos node is ready!${NC}"
            return 0
        fi
        echo "  Attempt $i/$MAX_RETRIES - Node not ready yet, retrying in ${RETRY_INTERVAL}s..."
        sleep $RETRY_INTERVAL
    done

    echo -e "${RED}✗ Aptos node did not become ready within $((MAX_RETRIES * RETRY_INTERVAL)) seconds${NC}"
    echo "  Make sure to start the aptos-local service:"
    echo "    docker-compose -f docker-compose-dev.yml up -d aptos-local"
    return 1
}

# Function to wait for Faucet to be ready
wait_for_faucet() {
    echo -e "${YELLOW}⏳ Waiting for Aptos faucet at ${APTOS_FAUCET_URL}...${NC}"

    for i in $(seq 1 $MAX_RETRIES); do
        if curl -sf "${APTOS_FAUCET_URL}/health" > /dev/null 2>&1 || curl -sf "${APTOS_FAUCET_URL}" > /dev/null 2>&1; then
            echo -e "${GREEN}✓ Aptos faucet is ready!${NC}"
            return 0
        fi
        echo "  Attempt $i/$MAX_RETRIES - Faucet not ready yet, retrying in ${RETRY_INTERVAL}s..."
        sleep $RETRY_INTERVAL
    done

    echo -e "${RED}✗ Aptos faucet did not become ready within $((MAX_RETRIES * RETRY_INTERVAL)) seconds${NC}"
    return 1
}

# Function to get node info
get_node_info() {
    echo ""
    echo -e "${YELLOW}📊 Aptos Node Information:${NC}"

    local node_info=$(curl -sf "${APTOS_NODE_URL}" 2>/dev/null)
    if [ -n "$node_info" ]; then
        echo "  Chain ID: $(echo "$node_info" | jq -r '.chain_id // "unknown"')"
        echo "  Block Height: $(echo "$node_info" | jq -r '.block_height // "unknown"')"
        echo "  Ledger Version: $(echo "$node_info" | jq -r '.ledger_version // "unknown"')"
        echo "  Node Role: $(echo "$node_info" | jq -r '.node_role // "unknown"')"
    else
        echo "  Unable to fetch node info"
    fi
}

# Function to output environment variables for connector configuration
output_env_vars() {
    echo ""
    echo -e "${GREEN}============================================${NC}"
    echo -e "${GREEN}Environment Variables for Connector${NC}"
    echo -e "${GREEN}============================================${NC}"
    echo ""
    echo "# Add these to your .env file or export in shell:"
    echo ""
    echo "# For host machine access:"
    echo "export APTOS_NODE_URL=http://localhost:8080/v1"
    echo "export APTOS_FAUCET_URL=http://localhost:8081"
    echo ""
    echo "# For Docker container access:"
    echo "export APTOS_NODE_URL=http://aptos-local:8080/v1"
    echo "export APTOS_FAUCET_URL=http://aptos-local:8081"
    echo ""
}

# Function to check if Move contracts exist and deploy them
deploy_contracts() {
    local contracts_dir="$(dirname "$0")/../packages/contracts-aptos"

    if [ -d "$contracts_dir" ] && [ -f "$contracts_dir/Move.toml" ]; then
        echo ""
        echo -e "${YELLOW}📦 Move contracts found at packages/contracts-aptos${NC}"

        # Check if Aptos CLI is available
        if command -v aptos &> /dev/null; then
            echo "  Aptos CLI is installed. You can deploy the module with:"
            echo "    ./scripts/aptos-deploy-module.sh"
        else
            echo -e "  ${YELLOW}⚠ Aptos CLI not installed. Install with: brew install aptos${NC}"
            echo "  To deploy the payment_channel module, install Aptos CLI and run:"
            echo "    ./scripts/aptos-deploy-module.sh"
        fi
    else
        echo ""
        echo -e "${YELLOW}📦 No Move contracts found at packages/contracts-aptos${NC}"
    fi
}

# Main execution
main() {
    # Wait for services to be ready
    wait_for_node || exit 1
    wait_for_faucet || exit 1

    # Get node information
    get_node_info

    # Check for contracts and provide deployment instructions
    deploy_contracts

    # Output environment variables
    output_env_vars

    echo -e "${GREEN}✓ Aptos local testnet initialization complete!${NC}"
    echo ""
    echo "Quick Start:"
    echo "  - Fund an account: ./scripts/aptos-fund-account.sh <address>"
    echo "  - Deploy module:   ./scripts/aptos-deploy-module.sh"
    echo "  - View logs:       docker-compose -f docker-compose-dev.yml logs -f aptos-local"
    echo ""
}

main "$@"
