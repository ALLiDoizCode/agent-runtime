#!/bin/bash
# Display status of Docker Compose ILP network
#
# This script provides a comprehensive overview of the connector network:
# - Container health status (color-coded)
# - BTP connection status (from logs)
# - Resource usage (CPU, memory)
#
# Usage:
#   ./scripts/docker-network-status.sh [compose-file]
#
# Examples:
#   ./scripts/docker-network-status.sh                              # Default docker-compose.yml
#   ./scripts/docker-network-status.sh docker/docker-compose.mesh.yml

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
echo "  ILP Network Status"
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

# Get list of services
SERVICES=$(${COMPOSE_CMD} config --services)

if [ -z "${SERVICES}" ]; then
  echo -e "${YELLOW}⚠ No services defined in compose file${NC}"
  exit 0
fi

echo "======================================"
echo "  Container Status"
echo "======================================"
echo ""

# Display status for each service
for SERVICE in ${SERVICES}; do
  # Get container name
  CONTAINER=$(${COMPOSE_CMD} ps -q ${SERVICE} 2>/dev/null || echo "")

  if [ -z "${CONTAINER}" ]; then
    echo -e "${RED}✗ ${SERVICE}${NC} - Not running"
    continue
  fi

  # Get container status
  STATUS=$(docker inspect --format='{{.State.Status}}' ${CONTAINER} 2>/dev/null || echo "unknown")
  HEALTH=$(docker inspect --format='{{.State.Health.Status}}' ${CONTAINER} 2>/dev/null || echo "none")

  # Color-code based on status
  if [ "${STATUS}" = "running" ]; then
    if [ "${HEALTH}" = "healthy" ]; then
      echo -e "${GREEN}✓ ${SERVICE}${NC} - Running (Healthy)"
    elif [ "${HEALTH}" = "unhealthy" ]; then
      echo -e "${RED}✗ ${SERVICE}${NC} - Running (Unhealthy)"
    elif [ "${HEALTH}" = "starting" ]; then
      echo -e "${YELLOW}⚠ ${SERVICE}${NC} - Running (Starting)"
    else
      echo -e "${YELLOW}⚠ ${SERVICE}${NC} - Running (No health check)"
    fi
  else
    echo -e "${RED}✗ ${SERVICE}${NC} - ${STATUS}"
  fi

  # Get resource usage
  STATS=$(docker stats ${CONTAINER} --no-stream --format "table {{.CPUPerc}}\t{{.MemUsage}}" 2>/dev/null | tail -n 1 || echo "N/A")
  echo "  Resources: ${STATS}"
  echo ""
done

echo "======================================"
echo "  BTP Connection Status"
echo "======================================"
echo ""

# Parse logs for BTP connection status
for SERVICE in ${SERVICES}; do
  CONTAINER=$(${COMPOSE_CMD} ps -q ${SERVICE} 2>/dev/null || echo "")

  if [ -z "${CONTAINER}" ]; then
    continue
  fi

  echo -e "${BLUE}${SERVICE}:${NC}"

  # Check for BTP connection events in logs
  LOGS=$(docker logs ${CONTAINER} 2>&1 || echo "")

  # Count successful connections
  CONNECTED=$(echo "${LOGS}" | grep -c "btp_client_connected" 2>/dev/null || echo "0")
  # Count failed connections
  FAILED=$(echo "${LOGS}" | grep -c "btp_connection_error" 2>/dev/null || echo "0")
  # Count auth errors
  AUTH_ERRORS=$(echo "${LOGS}" | grep -c "btp_auth_error" 2>/dev/null || echo "0")

  echo "  Connected peers: ${CONNECTED}"

  if [ "${FAILED}" -gt "0" ]; then
    echo -e "  ${RED}Connection errors: ${FAILED}${NC}"
  fi

  if [ "${AUTH_ERRORS}" -gt "0" ]; then
    echo -e "  ${RED}Auth errors: ${AUTH_ERRORS}${NC}"
  fi

  echo ""
done

echo "======================================"
echo "  Network Information"
echo "======================================"
echo ""

# Get network name
NETWORK=$(${COMPOSE_CMD} config | grep -A 1 "networks:" | tail -n 1 | awk '{print $1}' | tr -d ':')

if [ -n "${NETWORK}" ]; then
  NETWORK_NAME="${NETWORK}"

  # Get network details
  NETWORK_ID=$(docker network ls --filter "name=${NETWORK_NAME}" --format "{{.ID}}" 2>/dev/null | head -n 1 || echo "")

  if [ -n "${NETWORK_ID}" ]; then
    DRIVER=$(docker network inspect ${NETWORK_ID} --format '{{.Driver}}' 2>/dev/null || echo "unknown")
    CONTAINERS=$(docker network inspect ${NETWORK_ID} --format '{{len .Containers}}' 2>/dev/null || echo "0")

    echo "Network: ${NETWORK_NAME}"
    echo "Driver: ${DRIVER}"
    echo "Connected containers: ${CONTAINERS}"
  else
    echo -e "${YELLOW}⚠ Network not found: ${NETWORK_NAME}${NC}"
  fi
else
  echo -e "${YELLOW}⚠ No network defined${NC}"
fi

echo ""
echo "======================================"
echo "  Quick Commands"
echo "======================================"
echo ""
echo "View logs:       ${COMPOSE_CMD} logs -f"
echo "Stop network:    ${COMPOSE_CMD} down"
echo "Restart network: ${COMPOSE_CMD} restart"
echo ""
