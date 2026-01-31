#!/bin/bash
# Payment Channel Module Deployment Script
#
# Usage:
#   ./deploy.sh testnet   # Deploy to Aptos testnet
#   ./deploy.sh mainnet   # Deploy to Aptos mainnet
#   ./deploy.sh devnet    # Deploy to Aptos devnet

set -e

NETWORK=${1:-testnet}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "================================================"
echo "Payment Channel Module Deployment"
echo "================================================"
echo "Network: $NETWORK"
echo "Project: $PROJECT_DIR"
echo ""

# Validate network
if [[ "$NETWORK" != "testnet" && "$NETWORK" != "mainnet" && "$NETWORK" != "devnet" ]]; then
    echo "Error: Invalid network. Use 'testnet', 'mainnet', or 'devnet'"
    exit 1
fi

# Check Aptos CLI is installed
if ! command -v aptos &> /dev/null; then
    echo "Error: Aptos CLI not found. Install with:"
    echo "  curl -fsSL \"https://aptos.dev/scripts/install_cli.py\" | python3"
    exit 1
fi

echo "Aptos CLI version: $(aptos --version)"
echo ""

# Compile first
echo "Compiling Move modules..."
cd "$PROJECT_DIR"
aptos move compile --named-addresses payment_channel=default

echo ""
echo "Compilation successful!"
echo ""

# Confirm deployment
if [[ "$NETWORK" == "mainnet" ]]; then
    echo "WARNING: You are about to deploy to MAINNET!"
    echo "This will consume real APT for gas fees."
    read -p "Are you sure you want to continue? (yes/no): " confirm
    if [[ "$confirm" != "yes" ]]; then
        echo "Deployment cancelled."
        exit 0
    fi
fi

# Deploy
echo "Deploying to $NETWORK..."
aptos move publish \
    --named-addresses payment_channel=default \
    --network "$NETWORK" \
    --assume-yes

echo ""
echo "================================================"
echo "Deployment Complete!"
echo "================================================"
echo ""
echo "Module deployed to: payment_channel::channel"
echo "Network: $NETWORK"
echo ""
echo "View functions available:"
echo "  - get_channel(owner: address)"
echo "  - channel_exists(owner: address)"
echo "  - get_destination_pubkey(owner: address)"
echo ""
echo "Entry functions available:"
echo "  - open_channel(destination, pubkey, amount, settle_delay)"
echo "  - deposit(amount)"
echo "  - claim(owner, amount, nonce, signature)"
echo "  - request_close(channel_owner)"
echo "  - finalize_close(channel_owner)"
echo ""
