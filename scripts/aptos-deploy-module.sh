#!/bin/bash
# Deploy Aptos Move module to local testnet
#
# Usage: ./scripts/aptos-deploy-module.sh [profile]
#
# Arguments:
#   profile   - Optional Aptos CLI profile name (default: local)
#
# Prerequisites:
#   - Aptos CLI installed (brew install aptos)
#   - Aptos local testnet running
#   - Move module compiled at packages/contracts-aptos

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTRACTS_DIR="${SCRIPT_DIR}/../packages/contracts-aptos"
APTOS_NODE_URL="${APTOS_NODE_URL:-http://localhost:8080/v1}"
APTOS_FAUCET_URL="${APTOS_FAUCET_URL:-http://localhost:8081}"
PROFILE="${1:-local}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "============================================"
echo "Deploying Move Module to Aptos Local Testnet"
echo "============================================"
echo ""

# Check if Aptos CLI is installed
if ! command -v aptos &> /dev/null; then
    echo -e "${RED}✗ Aptos CLI is not installed${NC}"
    echo ""
    echo "Install with:"
    echo "  macOS:   brew install aptos"
    echo "  Linux:   pip3 install aptos-cli"
    echo "  Manual:  https://github.com/aptos-labs/aptos-core/releases"
    exit 1
fi
echo -e "${GREEN}✓ Aptos CLI found: $(aptos --version)${NC}"

# Check if contracts directory exists
if [ ! -d "$CONTRACTS_DIR" ]; then
    echo -e "${RED}✗ Contracts directory not found: ${CONTRACTS_DIR}${NC}"
    exit 1
fi

if [ ! -f "$CONTRACTS_DIR/Move.toml" ]; then
    echo -e "${RED}✗ Move.toml not found in ${CONTRACTS_DIR}${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Move project found at ${CONTRACTS_DIR}${NC}"

# Check if local testnet is running
echo ""
echo -e "${YELLOW}⏳ Checking if Aptos local testnet is running...${NC}"
if ! curl -sf "${APTOS_NODE_URL}" > /dev/null 2>&1; then
    echo -e "${RED}✗ Aptos local testnet is not running${NC}"
    echo ""
    echo "Start it with:"
    echo "  docker-compose -f docker-compose-dev.yml up -d aptos-local"
    echo "  ./scripts/init-aptos-local.sh"
    exit 1
fi
echo -e "${GREEN}✓ Aptos local testnet is running${NC}"

# Navigate to contracts directory
cd "$CONTRACTS_DIR"

# Check if local profile exists, if not create it
echo ""
echo -e "${YELLOW}⏳ Setting up Aptos CLI profile for local testnet...${NC}"

APTOS_CONFIG_DIR="${HOME}/.aptos"
APTOS_CONFIG_FILE="${APTOS_CONFIG_DIR}/config.yaml"

# Create or update local profile
if [ ! -f "$APTOS_CONFIG_FILE" ] || ! grep -q "^${PROFILE}:" "$APTOS_CONFIG_FILE" 2>/dev/null; then
    echo "Creating new '${PROFILE}' profile..."

    # Initialize a new profile for local testnet
    aptos init \
        --profile "${PROFILE}" \
        --rest-url "${APTOS_NODE_URL}" \
        --faucet-url "${APTOS_FAUCET_URL}" \
        --network local \
        --assume-yes 2>/dev/null || {
            echo -e "${RED}✗ Failed to initialize Aptos profile${NC}"
            echo "You may need to initialize manually with: aptos init --profile ${PROFILE}"
            exit 1
        }
    echo -e "${GREEN}✓ Created new profile '${PROFILE}'${NC}"
else
    echo -e "${GREEN}✓ Profile '${PROFILE}' already exists${NC}"
fi

# Fund the account (in case it's a new account)
echo ""
echo -e "${YELLOW}⏳ Funding deployment account via faucet...${NC}"
aptos account fund-with-faucet --profile "${PROFILE}" --amount 500000000 2>/dev/null || {
    echo -e "${YELLOW}⚠ Faucet funding skipped (may already be funded)${NC}"
}

# Compile the module
echo ""
echo -e "${YELLOW}⏳ Compiling Move module...${NC}"
aptos move compile --profile "${PROFILE}" || {
    echo -e "${RED}✗ Compilation failed${NC}"
    exit 1
}
echo -e "${GREEN}✓ Module compiled successfully${NC}"

# Deploy/publish the module
echo ""
echo -e "${YELLOW}⏳ Publishing Move module to local testnet...${NC}"
aptos move publish \
    --profile "${PROFILE}" \
    --assume-yes || {
        echo -e "${RED}✗ Module deployment failed${NC}"
        exit 1
    }

echo ""
echo -e "${GREEN}============================================${NC}"
echo -e "${GREEN}✓ Move module deployed successfully!${NC}"
echo -e "${GREEN}============================================${NC}"
echo ""

# Get the account address for the deployed module
ACCOUNT_ADDRESS=$(aptos config show-profiles --profile "${PROFILE}" 2>/dev/null | grep "account:" | head -1 | awk '{print $2}')

if [ -n "$ACCOUNT_ADDRESS" ]; then
    echo "Module Address: ${ACCOUNT_ADDRESS}"
    echo ""
    echo "Add to your .env file:"
    echo "  APTOS_MODULE_ADDRESS=${ACCOUNT_ADDRESS}"
    echo ""
    echo "Verify deployment:"
    echo "  aptos move view \\"
    echo "    --function-id ${ACCOUNT_ADDRESS}::payment_channel::get_channel \\"
    echo "    --args address:${ACCOUNT_ADDRESS} \\"
    echo "    --profile ${PROFILE}"
fi

echo ""
echo "Done!"
