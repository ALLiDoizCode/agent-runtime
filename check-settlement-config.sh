#!/bin/bash
# Diagnostic script to check settlement infrastructure configuration

echo "=== Settlement Infrastructure Configuration Check ==="
echo ""

# Check environment variables
echo "Environment Variables:"
echo "  SETTLEMENT_ENABLED=${SETTLEMENT_ENABLED:-<not set>}"
echo "  BASE_L2_RPC_URL=${BASE_L2_RPC_URL:-<not set>}"
echo "  TOKEN_NETWORK_REGISTRY=${TOKEN_NETWORK_REGISTRY:-<not set>}"
echo "  M2M_TOKEN_ADDRESS=${M2M_TOKEN_ADDRESS:-<not set>}"
echo "  TREASURY_EVM_PRIVATE_KEY=${TREASURY_EVM_PRIVATE_KEY:+<set (hidden)>}${TREASURY_EVM_PRIVATE_KEY:-<not set>}"
echo ""

# Check config file if it exists
CONFIG_FILE="${1:-config/connector-config.yaml}"
if [ -f "$CONFIG_FILE" ]; then
  echo "Config File: $CONFIG_FILE"
  echo "  settlementInfra.enabled: $(yq '.settlementInfra.enabled // "<not set>"' "$CONFIG_FILE" 2>/dev/null || echo '<yq not installed>')"
  echo "  settlementInfra.rpcUrl: $(yq '.settlementInfra.rpcUrl // "<not set>"' "$CONFIG_FILE" 2>/dev/null || echo '<yq not installed>')"
  echo "  settlementInfra.registryAddress: $(yq '.settlementInfra.registryAddress // "<not set>"' "$CONFIG_FILE" 2>/dev/null || echo '<yq not installed>')"
  echo "  settlementInfra.tokenAddress: $(yq '.settlementInfra.tokenAddress // "<not set>"' "$CONFIG_FILE" 2>/dev/null || echo '<yq not installed>')"
  echo "  settlementInfra.privateKey: $(yq '.settlementInfra.privateKey // "<not set>"' "$CONFIG_FILE" 2>/dev/null | sed 's/.*/\<set (hidden)\>/' || echo '<yq not installed>')"
  echo ""
else
  echo "Config file not found: $CONFIG_FILE"
  echo ""
fi

# Determine effective values (config takes precedence over env)
echo "Effective Values (config takes precedence over env):"

# Check what will actually be used
if [ -f "$CONFIG_FILE" ] && command -v yq &> /dev/null; then
  ENABLED=$(yq '.settlementInfra.enabled // ""' "$CONFIG_FILE")
  RPC_URL=$(yq '.settlementInfra.rpcUrl // ""' "$CONFIG_FILE")
  REGISTRY=$(yq '.settlementInfra.registryAddress // ""' "$CONFIG_FILE")
  TOKEN=$(yq '.settlementInfra.tokenAddress // ""' "$CONFIG_FILE")
  PRIVATE_KEY=$(yq '.settlementInfra.privateKey // ""' "$CONFIG_FILE")

  ENABLED="${ENABLED:-${SETTLEMENT_ENABLED}}"
  RPC_URL="${RPC_URL:-${BASE_L2_RPC_URL}}"
  REGISTRY="${REGISTRY:-${TOKEN_NETWORK_REGISTRY}}"
  TOKEN="${TOKEN:-${M2M_TOKEN_ADDRESS}}"
  PRIVATE_KEY="${PRIVATE_KEY:-${TREASURY_EVM_PRIVATE_KEY}}"
else
  ENABLED="${SETTLEMENT_ENABLED}"
  RPC_URL="${BASE_L2_RPC_URL}"
  REGISTRY="${TOKEN_NETWORK_REGISTRY}"
  TOKEN="${M2M_TOKEN_ADDRESS}"
  PRIVATE_KEY="${TREASURY_EVM_PRIVATE_KEY}"
fi

echo "  ✓ enabled: ${ENABLED:-❌ MISSING}"
echo "  ✓ rpcUrl: ${RPC_URL:-❌ MISSING}"
echo "  ✓ registryAddress: ${REGISTRY:-❌ MISSING}"
echo "  ✓ tokenAddress: ${TOKEN:-❌ MISSING}"
echo "  ✓ privateKey: ${PRIVATE_KEY:+✓ SET}${PRIVATE_KEY:-❌ MISSING}"
echo ""

# Final verdict
if [ "$ENABLED" = "true" ] && [ -n "$RPC_URL" ] && [ -n "$REGISTRY" ] && [ -n "$TOKEN" ] && [ -n "$PRIVATE_KEY" ]; then
  echo "✅ Settlement infrastructure should be ENABLED"
  exit 0
else
  echo "❌ Settlement infrastructure will be DISABLED"
  echo ""
  echo "Missing values:"
  [ "$ENABLED" != "true" ] && echo "  - enabled must be 'true' (currently: ${ENABLED:-<empty>})"
  [ -z "$RPC_URL" ] && echo "  - rpcUrl (BASE_L2_RPC_URL)"
  [ -z "$REGISTRY" ] && echo "  - registryAddress (TOKEN_NETWORK_REGISTRY)"
  [ -z "$TOKEN" ] && echo "  - tokenAddress (M2M_TOKEN_ADDRESS)"
  [ -z "$PRIVATE_KEY" ] && echo "  - privateKey (TREASURY_EVM_PRIVATE_KEY)"
  exit 1
fi
