#!/bin/bash
# =============================================================================
# Deploy M2M Connector - Production Single-Node
# =============================================================================
#
# Simple production deployment script for Docker Compose.
#
# Components:
#   - TigerBeetle: High-performance accounting database (single node)
#   - Connector: ILP connector with Explorer UI and settlement
#   - Prometheus: Metrics collection
#   - Grafana: Dashboards (http://localhost:3001)
#   - Alertmanager: Alert notifications
#
# Usage:
#   ./scripts/deploy-production.sh          # Deploy all services
#   ./scripts/deploy-production.sh --tracing  # Include Jaeger tracing
#   ./scripts/deploy-production.sh --down   # Stop all services
#   ./scripts/deploy-production.sh --logs   # View logs
#
# Prerequisites:
#   1. Docker and Docker Compose installed
#   2. .env file configured (copy from .env.example)
#   3. Connector image built: docker build -t agent-runtime/connector:latest .
#
# =============================================================================

set -euo pipefail

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose-production.yml"
ENV_FILE="${PROJECT_ROOT}/.env"

# Parse arguments
TRACING=false
ACTION="up"

for arg in "$@"; do
  case $arg in
    --tracing)
      TRACING=true
      ;;
    --down)
      ACTION="down"
      ;;
    --logs)
      ACTION="logs"
      ;;
    --help|-h)
      echo "Usage: $0 [--tracing] [--down] [--logs]"
      echo ""
      echo "Options:"
      echo "  --tracing  Include Jaeger distributed tracing"
      echo "  --down     Stop all services"
      echo "  --logs     View service logs"
      echo "  --help     Show this help"
      exit 0
      ;;
  esac
done

# Handle down/logs actions
if [ "$ACTION" = "down" ]; then
  echo -e "${BLUE}Stopping production services...${NC}"
  docker compose -f "${COMPOSE_FILE}" down
  echo -e "${GREEN}✓ Services stopped${NC}"
  exit 0
fi

if [ "$ACTION" = "logs" ]; then
  docker compose -f "${COMPOSE_FILE}" logs -f
  exit 0
fi

echo "======================================"
echo "  M2M Connector - Production Deploy"
echo "======================================"
echo ""

# Step 1: Check prerequisites
echo -e "${BLUE}[1/5]${NC} Checking prerequisites..."

# Check Docker
if ! docker info > /dev/null 2>&1; then
  echo -e "${RED}✗ Docker is not running${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker is running${NC}"

# Check Docker Compose
if ! docker compose version > /dev/null 2>&1; then
  echo -e "${RED}✗ Docker Compose not found${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Docker Compose available${NC}"

# Check .env file
if [ ! -f "${ENV_FILE}" ]; then
  echo -e "${RED}✗ .env file not found${NC}"
  echo ""
  echo "Create .env from template:"
  echo "  cp .env.example .env"
  echo "  # Edit .env with your configuration"
  exit 1
fi
echo -e "${GREEN}✓ .env file exists${NC}"

# Check connector image
if ! docker images agent-runtime/connector:latest --format "{{.Repository}}" | grep -q "agent-runtime/connector"; then
  echo -e "${YELLOW}⚠ Connector image not found. Building...${NC}"
  cd "${PROJECT_ROOT}"
  docker build -t agent-runtime/connector:latest .
fi
echo -e "${GREEN}✓ Connector image available${NC}"

echo ""

# Step 2: Initialize TigerBeetle
echo -e "${BLUE}[2/5]${NC} Initializing TigerBeetle..."

# Check if TigerBeetle volume needs initialization
VOLUME_EXISTS=$(docker volume ls -q -f name=m2m_tigerbeetle-data 2>/dev/null || true)

if [ -z "$VOLUME_EXISTS" ]; then
  echo "Creating and formatting TigerBeetle data volume..."
  docker volume create m2m_tigerbeetle-data

  docker run --rm --security-opt seccomp=unconfined \
    -v m2m_tigerbeetle-data:/data \
    ghcr.io/tigerbeetle/tigerbeetle:0.16.68 \
    format --cluster=0 --replica=0 --replica-count=1 /data/0_0.tigerbeetle

  echo -e "${GREEN}✓ TigerBeetle initialized${NC}"
else
  echo -e "${GREEN}✓ TigerBeetle volume exists${NC}"
fi

echo ""

# Step 3: Start services
echo -e "${BLUE}[3/5]${NC} Starting services..."

cd "${PROJECT_ROOT}"

if [ "$TRACING" = true ]; then
  echo "Starting with Jaeger tracing enabled..."
  docker compose -f "${COMPOSE_FILE}" --profile tracing up -d
else
  docker compose -f "${COMPOSE_FILE}" up -d
fi

echo ""

# Step 4: Wait for services to be healthy
echo -e "${BLUE}[4/5]${NC} Waiting for services to become healthy..."

# Wait for TigerBeetle
echo -n "  TigerBeetle: "
for i in {1..30}; do
  if docker compose -f "${COMPOSE_FILE}" ps tigerbeetle 2>/dev/null | grep -q "running"; then
    echo -e "${GREEN}✓${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${RED}✗ Timeout${NC}"
    exit 1
  fi
  sleep 2
done

# Wait for Connector
echo -n "  Connector: "
for i in {1..30}; do
  if curl -sf http://localhost:8080/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    break
  fi
  if [ $i -eq 30 ]; then
    echo -e "${YELLOW}⚠ Still starting (check logs)${NC}"
  fi
  sleep 2
done

# Wait for Prometheus
echo -n "  Prometheus: "
for i in {1..20}; do
  if curl -sf http://localhost:9090/-/healthy > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    break
  fi
  if [ $i -eq 20 ]; then
    echo -e "${YELLOW}⚠ Still starting${NC}"
  fi
  sleep 2
done

# Wait for Grafana
echo -n "  Grafana: "
for i in {1..20}; do
  if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC}"
    break
  fi
  if [ $i -eq 20 ]; then
    echo -e "${YELLOW}⚠ Still starting${NC}"
  fi
  sleep 2
done

echo ""

# Step 5: Display summary
echo -e "${BLUE}[5/5]${NC} Deployment complete!"
echo ""
echo "======================================"
echo "  Service Endpoints"
echo "======================================"
echo ""
echo "  Connector:"
echo "    BTP WebSocket:  ws://localhost:4000"
echo "    Health Check:   http://localhost:8080/health"
echo "    Metrics:        http://localhost:8080/metrics"
echo "    Explorer UI:    http://localhost:5173"
echo ""
echo "  Monitoring:"
echo "    Prometheus:     http://localhost:9090"
echo "    Grafana:        http://localhost:3001 (admin / \$GRAFANA_PASSWORD)"
echo "    Alertmanager:   http://localhost:9093"

if [ "$TRACING" = true ]; then
  echo "    Jaeger UI:      http://localhost:16686"
fi

echo ""
echo "======================================"
echo "  Useful Commands"
echo "======================================"
echo ""
echo "  View logs:"
echo "    docker compose -f docker-compose-production.yml logs -f"
echo ""
echo "  View connector logs only:"
echo "    docker compose -f docker-compose-production.yml logs -f connector"
echo ""
echo "  Stop services:"
echo "    ./scripts/deploy-production.sh --down"
echo "    # Or: docker compose -f docker-compose-production.yml down"
echo ""
echo "  Stop and remove volumes (data loss!):"
echo "    docker compose -f docker-compose-production.yml down -v"
echo ""
