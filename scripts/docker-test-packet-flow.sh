#!/bin/bash
# Test end-to-end ILP packet flow through Docker network
#
# This script validates that packets can flow through the connector network
# by checking logs for packet forwarding events.
#
# Usage:
#   ./scripts/docker-test-packet-flow.sh [compose-file]
#
# Examples:
#   ./scripts/docker-test-packet-flow.sh                              # Default
#   ./scripts/docker-test-packet-flow.sh docker/docker-compose.mesh.yml

set -euo pipefail

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Compose file (default or provided)
COMPOSE_FILE="${1:-docker-compose.yml}"
COMPOSE_CMD="docker-compose -f ${COMPOSE_FILE}"

echo "======================================"
echo "  ILP Packet Flow Test"
echo "======================================"
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}✗ Docker is not running${NC}"
  exit 1
fi

# Check if compose file exists
if [ ! -f "${COMPOSE_FILE}" ]; then
  echo -e "${RED}✗ Compose file not found: ${COMPOSE_FILE}${NC}"
  exit 1
fi

echo -e "${BLUE}Using compose file:${NC} ${COMPOSE_FILE}"
echo ""

# Get list of running services
SERVICES=$(${COMPOSE_CMD} ps --services --filter "status=running" 2>/dev/null || echo "")

if [ -z "${SERVICES}" ]; then
  echo -e "${RED}✗ No running services found${NC}"
  echo "Start the network first: ${COMPOSE_CMD} up -d"
  exit 1
fi

echo "Running services:"
for SERVICE in ${SERVICES}; do
  echo "  - ${SERVICE}"
done
echo ""

echo "======================================"
echo "  Analyzing Logs"
echo "======================================"
echo ""

# Note: This script analyzes existing logs for packet flow patterns
# A full integration test would require a CLI tool to send test packets
# That will be implemented in Story 2.7 or later

echo -e "${YELLOW}Note: This script analyzes existing log data.${NC}"
echo -e "${YELLOW}For active packet testing, use the integration test suite.${NC}"
echo ""

# Check each service for packet-related log entries
for SERVICE in ${SERVICES}; do
  CONTAINER=$(${COMPOSE_CMD} ps -q ${SERVICE} 2>/dev/null || echo "")

  if [ -z "${CONTAINER}" ]; then
    continue
  fi

  echo -e "${BLUE}${SERVICE}:${NC}"

  # Get logs
  LOGS=$(docker logs ${CONTAINER} 2>&1 || echo "")

  # Count packet events
  PREPARE_COUNT=$(echo "${LOGS}" | grep -c "\"packetType\":\"PREPARE\"" 2>/dev/null || echo "0")
  FULFILL_COUNT=$(echo "${LOGS}" | grep -c "\"packetType\":\"FULFILL\"" 2>/dev/null || echo "0")
  REJECT_COUNT=$(echo "${LOGS}" | grep -c "\"packetType\":\"REJECT\"" 2>/dev/null || echo "0")

  # Count forwarding events
  FORWARD_COUNT=$(echo "${LOGS}" | grep -c "packet_forwarded" 2>/dev/null || echo "0")

  # Count BTP events
  BTP_SEND_COUNT=$(echo "${LOGS}" | grep -c "btp_message_sent" 2>/dev/null || echo "0")
  BTP_RECV_COUNT=$(echo "${LOGS}" | grep -c "btp_message_received" 2>/dev/null || echo "0")

  echo "  ILP PREPARE packets: ${PREPARE_COUNT}"
  echo "  ILP FULFILL packets: ${FULFILL_COUNT}"
  echo "  ILP REJECT packets: ${REJECT_COUNT}"
  echo "  Packets forwarded: ${FORWARD_COUNT}"
  echo "  BTP messages sent: ${BTP_SEND_COUNT}"
  echo "  BTP messages received: ${BTP_RECV_COUNT}"

  # Determine status
  TOTAL_PACKETS=$((PREPARE_COUNT + FULFILL_COUNT + REJECT_COUNT))

  if [ "${TOTAL_PACKETS}" -gt "0" ]; then
    echo -e "  ${GREEN}✓ Packet activity detected${NC}"
  else
    echo -e "  ${YELLOW}⚠ No packet activity${NC}"
  fi

  echo ""
done

echo "======================================"
echo "  Connection Health"
echo "======================================"
echo ""

# Check for connection errors
for SERVICE in ${SERVICES}; do
  CONTAINER=$(${COMPOSE_CMD} ps -q ${SERVICE} 2>/dev/null || echo "")

  if [ -z "${CONTAINER}" ]; then
    continue
  fi

  LOGS=$(docker logs ${CONTAINER} 2>&1 || echo "")

  # Check for errors
  CONNECTION_ERRORS=$(echo "${LOGS}" | grep -c "btp_connection_error" 2>/dev/null || echo "0")
  AUTH_ERRORS=$(echo "${LOGS}" | grep -c "btp_auth_error" 2>/dev/null || echo "0")

  if [ "${CONNECTION_ERRORS}" -gt "0" ] || [ "${AUTH_ERRORS}" -gt "0" ]; then
    echo -e "${RED}✗ ${SERVICE}${NC}"
    [ "${CONNECTION_ERRORS}" -gt "0" ] && echo "  Connection errors: ${CONNECTION_ERRORS}"
    [ "${AUTH_ERRORS}" -gt "0" ] && echo "  Auth errors: ${AUTH_ERRORS}"
  else
    echo -e "${GREEN}✓ ${SERVICE}${NC} - No errors"
  fi
done

echo ""
echo "======================================"
echo "  Summary"
echo "======================================"
echo ""

# Overall assessment
TOTAL_ERRORS=0
for SERVICE in ${SERVICES}; do
  CONTAINER=$(${COMPOSE_CMD} ps -q ${SERVICE} 2>/dev/null || echo "")
  if [ -n "${CONTAINER}" ]; then
    LOGS=$(docker logs ${CONTAINER} 2>&1 || echo "")
    ERRORS=$(echo "${LOGS}" | grep -c "\"level\":50" 2>/dev/null || echo "0")
    TOTAL_ERRORS=$((TOTAL_ERRORS + ERRORS))
  fi
done

if [ "${TOTAL_ERRORS}" -eq "0" ]; then
  echo -e "${GREEN}✓ Network is operational - No errors detected${NC}"
  echo ""
  echo "To test packet forwarding:"
  echo "1. Run integration tests: npm test --workspace=packages/connector -- multi-node-forwarding.test.ts"
  echo "2. Check logs for packet flow: ${COMPOSE_CMD} logs -f"
else
  echo -e "${YELLOW}⚠ Network has ${TOTAL_ERRORS} error(s) - Check logs for details${NC}"
  echo ""
  echo "Troubleshooting:"
  echo "1. View errors: ${COMPOSE_CMD} logs | grep '\"level\":50'"
  echo "2. Check health: ${COMPOSE_CMD} ps"
  echo "3. Restart network: ${COMPOSE_CMD} restart"
fi

echo ""
