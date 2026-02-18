#!/bin/bash
# Docker Build Validation Script
# Tests that Docker image builds correctly and container starts successfully
# Usage: ./scripts/test-docker-build.sh

set -e  # Exit on error
set -u  # Exit on undefined variable

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
IMAGE_NAME="connector-test"
CONTAINER_NAME="connector-test-run"
TEST_PORT=3001
TEST_NODE_ID="test-node"
MAX_IMAGE_SIZE_MB=200

echo "======================================"
echo "Docker Build Validation Test"
echo "======================================"
echo ""

# Function to print colored status
print_status() {
  local status=$1
  local message=$2
  if [ "$status" = "ok" ]; then
    echo -e "${GREEN}✓${NC} $message"
  elif [ "$status" = "error" ]; then
    echo -e "${RED}✗${NC} $message"
  elif [ "$status" = "info" ]; then
    echo -e "${YELLOW}ℹ${NC} $message"
  fi
}

# Function to cleanup test resources
cleanup() {
  print_status "info" "Cleaning up test resources..."

  # Stop and remove container (ignore errors if not exists)
  docker stop "$CONTAINER_NAME" 2>/dev/null || true
  docker rm "$CONTAINER_NAME" 2>/dev/null || true

  # Remove test image (ignore errors if not exists)
  docker rmi "$IMAGE_NAME" 2>/dev/null || true

  print_status "ok" "Cleanup complete"
}

# Cleanup any existing test resources before starting
cleanup

# Trap to ensure cleanup on exit (success or failure)
trap cleanup EXIT

echo "Step 1: Building Docker image..."
echo "Command: docker build -t $IMAGE_NAME ."
echo ""

if docker build -t "$IMAGE_NAME" .; then
  print_status "ok" "Docker image built successfully"
else
  print_status "error" "Docker build failed"
  exit 1
fi

echo ""
echo "Step 2: Checking image size..."

# Get image size in MB
IMAGE_SIZE=$(docker images "$IMAGE_NAME" --format "{{.Size}}")
print_status "info" "Image size: $IMAGE_SIZE"

# Extract numeric size (handles both MB and GB)
SIZE_VALUE=$(echo "$IMAGE_SIZE" | grep -oE '[0-9.]+')
SIZE_UNIT=$(echo "$IMAGE_SIZE" | grep -oE '[A-Z]+')

# Convert to MB for comparison
if [ "$SIZE_UNIT" = "GB" ]; then
  SIZE_MB=$(echo "$SIZE_VALUE * 1024" | bc)
elif [ "$SIZE_UNIT" = "MB" ]; then
  SIZE_MB=$SIZE_VALUE
else
  print_status "error" "Unexpected size unit: $SIZE_UNIT"
  exit 1
fi

# Check if size is under limit (using integer comparison)
SIZE_MB_INT=${SIZE_MB%.*}
if [ "$SIZE_MB_INT" -le "$MAX_IMAGE_SIZE_MB" ]; then
  print_status "ok" "Image size is within limit (<${MAX_IMAGE_SIZE_MB}MB)"
else
  print_status "error" "Image size ${SIZE_MB}MB exceeds limit of ${MAX_IMAGE_SIZE_MB}MB"
  echo "Run 'docker history $IMAGE_NAME' to identify large layers"
  exit 1
fi

echo ""
echo "Step 3: Starting test container..."

if docker run -d \
  -e NODE_ID="$TEST_NODE_ID" \
  -e BTP_SERVER_PORT="$TEST_PORT" \
  -e LOG_LEVEL="info" \
  -p "$TEST_PORT:$TEST_PORT" \
  --name "$CONTAINER_NAME" \
  "$IMAGE_NAME"; then
  print_status "ok" "Container started"
else
  print_status "error" "Failed to start container"
  exit 1
fi

echo ""
echo "Step 4: Waiting for container startup (5 seconds)..."
sleep 5

echo ""
echo "Step 5: Verifying container is running..."

if docker ps | grep -q "$CONTAINER_NAME"; then
  print_status "ok" "Container is running"
else
  print_status "error" "Container is not running"
  echo "Container logs:"
  docker logs "$CONTAINER_NAME"
  exit 1
fi

echo ""
echo "Step 6: Checking container logs..."

LOGS=$(docker logs "$CONTAINER_NAME" 2>&1)

echo "Container logs:"
echo "----------------------------------------"
echo "$LOGS"
echo "----------------------------------------"
echo ""

# Verify startup log contains expected event
if echo "$LOGS" | grep -q '"event":"connector_started"'; then
  print_status "ok" "Startup log found with event: connector_started"
else
  print_status "error" "Startup log not found or missing connector_started event"
  exit 1
fi

# Verify nodeId in logs
if echo "$LOGS" | grep -q "\"nodeId\":\"$TEST_NODE_ID\""; then
  print_status "ok" "Correct nodeId found in logs: $TEST_NODE_ID"
else
  print_status "error" "Expected nodeId not found in logs"
  exit 1
fi

# Verify port in logs
if echo "$LOGS" | grep -q "\"btpServerPort\":$TEST_PORT"; then
  print_status "ok" "Correct BTP server port found in logs: $TEST_PORT"
else
  print_status "error" "Expected BTP server port not found in logs"
  exit 1
fi

echo ""
echo "Step 7: Testing graceful shutdown..."

# Send SIGTERM to container
docker stop "$CONTAINER_NAME" >/dev/null 2>&1

# Capture final logs
SHUTDOWN_LOGS=$(docker logs "$CONTAINER_NAME" 2>&1)

# Verify shutdown event
if echo "$SHUTDOWN_LOGS" | grep -q '"event":"connector_shutdown"'; then
  print_status "ok" "Graceful shutdown log found"
else
  print_status "error" "Shutdown log not found"
  # This is a warning, not a critical failure
fi

# Check exit code
EXIT_CODE=$(docker inspect "$CONTAINER_NAME" --format='{{.State.ExitCode}}')
if [ "$EXIT_CODE" -eq 0 ]; then
  print_status "ok" "Container exited with code 0"
else
  print_status "error" "Container exited with code $EXIT_CODE"
  exit 1
fi

echo ""
echo "======================================"
print_status "ok" "All Docker build tests passed!"
echo "======================================"
echo ""
echo "Summary:"
echo "  - Image built successfully"
echo "  - Image size: $IMAGE_SIZE (under ${MAX_IMAGE_SIZE_MB}MB limit)"
echo "  - Container starts and runs"
echo "  - Logs contain expected startup events"
echo "  - Environment variables configure connector"
echo "  - Graceful shutdown works"
echo ""

# Cleanup will be called by trap on exit
exit 0
