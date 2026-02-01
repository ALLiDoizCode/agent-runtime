#!/bin/bash
# Fund an Aptos account via the local testnet faucet
#
# Usage: ./scripts/aptos-fund-account.sh <account_address> [amount_in_octas]
#
# Arguments:
#   account_address   - The Aptos account address to fund (0x-prefixed hex)
#   amount_in_octas   - Optional amount in octas (default: 100000000 = 1 APT)
#
# Examples:
#   ./scripts/aptos-fund-account.sh 0x1234...abcd
#   ./scripts/aptos-fund-account.sh 0x1234...abcd 500000000  # Fund 5 APT

set -e

# Configuration
APTOS_FAUCET_URL="${APTOS_FAUCET_URL:-http://localhost:8081}"
DEFAULT_AMOUNT=100000000  # 1 APT = 100,000,000 octas

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Parse arguments
ACCOUNT_ADDRESS="$1"
AMOUNT="${2:-$DEFAULT_AMOUNT}"

# Validate arguments
if [ -z "$ACCOUNT_ADDRESS" ]; then
    echo -e "${RED}Error: Account address is required${NC}"
    echo ""
    echo "Usage: $0 <account_address> [amount_in_octas]"
    echo ""
    echo "Arguments:"
    echo "  account_address   The Aptos account address to fund (0x-prefixed hex)"
    echo "  amount_in_octas   Optional amount in octas (default: 100000000 = 1 APT)"
    echo ""
    echo "Examples:"
    echo "  $0 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef"
    echo "  $0 0x1234... 500000000  # Fund 5 APT"
    exit 1
fi

# Validate address format (should be 0x followed by hex characters)
if [[ ! "$ACCOUNT_ADDRESS" =~ ^0x[0-9a-fA-F]+$ ]]; then
    echo -e "${RED}Error: Invalid account address format${NC}"
    echo "  Expected: 0x-prefixed hexadecimal address"
    echo "  Got: $ACCOUNT_ADDRESS"
    exit 1
fi

# Calculate APT equivalent for display
APT_AMOUNT=$(echo "scale=8; $AMOUNT / 100000000" | bc)

echo "============================================"
echo "Funding Aptos Account via Local Faucet"
echo "============================================"
echo ""
echo "Account:  $ACCOUNT_ADDRESS"
echo "Amount:   $AMOUNT octas ($APT_AMOUNT APT)"
echo "Faucet:   $APTOS_FAUCET_URL"
echo ""

# Check if faucet is reachable
echo -e "${YELLOW}⏳ Checking faucet availability...${NC}"
if ! curl -sf "${APTOS_FAUCET_URL}" > /dev/null 2>&1 && ! curl -sf "${APTOS_FAUCET_URL}/health" > /dev/null 2>&1; then
    echo -e "${RED}✗ Faucet is not reachable at ${APTOS_FAUCET_URL}${NC}"
    echo ""
    echo "Make sure the Aptos local testnet is running:"
    echo "  docker-compose -f docker-compose-dev.yml up -d aptos-local"
    echo "  ./scripts/init-aptos-local.sh"
    exit 1
fi
echo -e "${GREEN}✓ Faucet is available${NC}"
echo ""

# Fund the account
echo -e "${YELLOW}⏳ Funding account...${NC}"

# The local faucet uses POST to /mint endpoint
RESPONSE=$(curl -sf -X POST "${APTOS_FAUCET_URL}/mint" \
    -H "Content-Type: application/json" \
    -d "{\"address\":\"${ACCOUNT_ADDRESS}\",\"amount\":${AMOUNT}}" 2>&1)

if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Account funded successfully!${NC}"
    echo ""
    echo "Response: $RESPONSE"
    echo ""

    # Try to get the new balance from the node
    APTOS_NODE_URL="${APTOS_NODE_URL:-http://localhost:8080/v1}"
    echo -e "${YELLOW}⏳ Checking new balance...${NC}"

    # Query account balance (may need to wait for transaction)
    sleep 2
    BALANCE_RESPONSE=$(curl -sf "${APTOS_NODE_URL}/accounts/${ACCOUNT_ADDRESS}/resources" 2>&1 | \
        jq -r '.[] | select(.type == "0x1::coin::CoinStore<0x1::aptos_coin::AptosCoin>") | .data.coin.value' 2>/dev/null)

    if [ -n "$BALANCE_RESPONSE" ]; then
        BALANCE_APT=$(echo "scale=8; $BALANCE_RESPONSE / 100000000" | bc)
        echo -e "${GREEN}✓ New balance: $BALANCE_RESPONSE octas ($BALANCE_APT APT)${NC}"
    else
        echo "  Unable to query balance (account may need a few seconds to appear on chain)"
    fi
else
    echo -e "${RED}✗ Failed to fund account${NC}"
    echo "Response: $RESPONSE"
    exit 1
fi

echo ""
echo "Done!"
