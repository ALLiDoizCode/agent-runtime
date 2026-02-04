#!/bin/bash
# Set blockchain network URLs based on NETWORK_MODE
#
# This script configures RPC URLs for Base, XRP, and Aptos based on NETWORK_MODE.
# Source this script before running docker-compose directly.
#
# Usage:
#   # For testnet (default)
#   source scripts/set-network-mode.sh
#   docker-compose -f docker-compose-5-peer-multihop.yml up -d
#
#   # For mainnet
#   NETWORK_MODE=mainnet source scripts/set-network-mode.sh
#   docker-compose -f docker-compose-5-peer-multihop.yml up -d
#
#   # Or set in .env file
#   echo "NETWORK_MODE=mainnet" >> .env
#   source scripts/set-network-mode.sh
#   docker-compose up -d

set -a  # Auto-export all variables

# Load .env file if it exists
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd)" || SCRIPT_DIR="."
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." 2>/dev/null && pwd)" || PROJECT_ROOT="."

if [ -f "${PROJECT_ROOT}/.env" ]; then
  source "${PROJECT_ROOT}/.env"
fi

# Default to testnet if not specified
NETWORK_MODE="${NETWORK_MODE:-testnet}"

# -----------------------------------------------------------------------------
# Network URL Mappings
# -----------------------------------------------------------------------------
#
# TESTNET:
#   Base L2:  https://sepolia.base.org (Base Sepolia)
#   XRP:      wss://s.altnet.rippletest.net:51233 (XRP Testnet)
#   Aptos:    https://fullnode.testnet.aptoslabs.com/v1 (Aptos Testnet)
#
# MAINNET:
#   Base L2:  https://mainnet.base.org (Base Mainnet)
#   XRP:      wss://xrplcluster.com (XRP Mainnet)
#   Aptos:    https://fullnode.mainnet.aptoslabs.com/v1 (Aptos Mainnet)
#
# -----------------------------------------------------------------------------

if [ "${NETWORK_MODE}" = "mainnet" ]; then
  # Mainnet URLs (only set if not already configured)
  BASE_L2_RPC_URL="${BASE_L2_RPC_URL:-https://mainnet.base.org}"
  BASE_RPC_URL="${BASE_RPC_URL:-https://mainnet.base.org}"
  XRPL_WSS_URL="${XRPL_WSS_URL:-wss://xrplcluster.com}"
  APTOS_NODE_URL="${APTOS_NODE_URL:-https://fullnode.mainnet.aptoslabs.com/v1}"

  echo "NETWORK_MODE=mainnet"
  echo "  Base L2:  ${BASE_L2_RPC_URL}"
  echo "  XRP:      ${XRPL_WSS_URL}"
  echo "  Aptos:    ${APTOS_NODE_URL}"
  echo ""
  echo "⚠️  WARNING: Mainnet mode enabled - using production networks"
else
  # Testnet URLs (default)
  BASE_L2_RPC_URL="${BASE_L2_RPC_URL:-https://sepolia.base.org}"
  BASE_RPC_URL="${BASE_RPC_URL:-https://sepolia.base.org}"
  XRPL_WSS_URL="${XRPL_WSS_URL:-wss://s.altnet.rippletest.net:51233}"
  APTOS_NODE_URL="${APTOS_NODE_URL:-https://fullnode.testnet.aptoslabs.com/v1}"

  echo "NETWORK_MODE=testnet"
  echo "  Base L2:  ${BASE_L2_RPC_URL}"
  echo "  XRP:      ${XRPL_WSS_URL}"
  echo "  Aptos:    ${APTOS_NODE_URL}"
fi

set +a  # Stop auto-exporting
