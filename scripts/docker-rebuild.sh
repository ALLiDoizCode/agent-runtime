#!/bin/bash
# Rebuild connector image and restart Docker Compose network
#
# This script automates the process of rebuilding the connector Docker image
# and restarting the network with the updated image.
#
# Usage:
#   ./scripts/docker-rebuild.sh [compose-file]
#
# Examples:
#   ./scripts/docker-rebuild.sh                              # Default
#   ./scripts/docker-rebuild.sh docker/docker-compose.mesh.yml

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
echo "  ILP Connector Rebuild & Restart"
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

# Step 1: Stop existing containers
echo "======================================"
echo "  Step 1: Stopping containers"
echo "======================================"
echo ""

if ${COMPOSE_CMD} ps -q > /dev/null 2>&1 && [ -n "$(${COMPOSE_CMD} ps -q)" ]; then
  echo "Stopping running containers..."
  ${COMPOSE_CMD} down
  echo -e "${GREEN}✓ Containers stopped${NC}"
else
  echo "No running containers to stop"
fi

echo ""

# Step 2: Rebuild connector image
echo "======================================"
echo "  Step 2: Building connector image"
echo "======================================"
echo ""

echo "Building agent-runtime image..."
echo ""

if docker build -t agent-runtime . ; then
  echo ""
  echo -e "${GREEN}✓ Image built successfully${NC}"

  # Show image size
  IMAGE_SIZE=$(docker images agent-runtime:latest --format "{{.Size}}" 2>/dev/null || echo "unknown")
  echo "Image size: ${IMAGE_SIZE}"
else
  echo ""
  echo -e "${RED}✗ Image build failed${NC}"
  exit 1
fi

echo ""

# Step 3: Start network
echo "======================================"
echo "  Step 3: Starting network"
echo "======================================"
echo ""

echo "Starting connector network..."
${COMPOSE_CMD} up -d

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Network started${NC}"
else
  echo -e "${RED}✗ Failed to start network${NC}"
  exit 1
fi

echo ""

# Step 4: Wait for health checks
echo "======================================"
echo "  Step 4: Waiting for health checks"
echo "======================================"
echo ""

echo "Waiting for containers to become healthy (max 60 seconds)..."
echo ""

TIMEOUT=60
ELAPSED=0
INTERVAL=5

while [ ${ELAPSED} -lt ${TIMEOUT} ]; do
  # Get container status
  STATUS=$(${COMPOSE_CMD} ps --format json 2>/dev/null || echo "[]")

  # Count total containers
  TOTAL=$(echo "${STATUS}" | jq -s 'length' 2>/dev/null || echo "0")

  if [ "${TOTAL}" -eq "0" ]; then
    echo "No containers found"
    break
  fi

  # Count healthy containers
  HEALTHY=0
  UNHEALTHY=0
  STARTING=0

  # Check each container
  for SERVICE in $(${COMPOSE_CMD} config --services); do
    CONTAINER=$(${COMPOSE_CMD} ps -q ${SERVICE} 2>/dev/null || echo "")

    if [ -n "${CONTAINER}" ]; then
      HEALTH=$(docker inspect --format='{{.State.Health.Status}}' ${CONTAINER} 2>/dev/null || echo "none")

      case "${HEALTH}" in
        healthy)
          HEALTHY=$((HEALTHY + 1))
          ;;
        unhealthy)
          UNHEALTHY=$((UNHEALTHY + 1))
          ;;
        starting|none)
          STARTING=$((STARTING + 1))
          ;;
      esac
    fi
  done

  echo "Status: ${HEALTHY} healthy, ${STARTING} starting, ${UNHEALTHY} unhealthy"

  # Check if all are healthy
  if [ "${HEALTHY}" -eq "${TOTAL}" ]; then
    echo -e "${GREEN}✓ All containers healthy${NC}"
    break
  fi

  # Check if any are unhealthy
  if [ "${UNHEALTHY}" -gt "0" ]; then
    echo -e "${RED}✗ Some containers are unhealthy${NC}"
    break
  fi

  sleep ${INTERVAL}
  ELAPSED=$((ELAPSED + INTERVAL))
done

if [ ${ELAPSED} -ge ${TIMEOUT} ]; then
  echo -e "${YELLOW}⚠ Health check timeout - some containers may still be starting${NC}"
fi

echo ""

# Step 5: Display final status
echo "======================================"
echo "  Final Status"
echo "======================================"
echo ""

${COMPOSE_CMD} ps

echo ""
echo "======================================"
echo "  Rebuild Complete"
echo "======================================"
echo ""

echo "Next steps:"
echo "  View logs:       ${COMPOSE_CMD} logs -f"
echo "  Check status:    ./scripts/docker-network-status.sh ${COMPOSE_FILE}"
echo "  Test packets:    ./scripts/docker-test-packet-flow.sh ${COMPOSE_FILE}"
echo "  Stop network:    ${COMPOSE_CMD} down"
echo ""
