# M2M Connector Kubernetes Deployment

Production-ready Kubernetes deployment for the M2M ILP Connector with Explorer UI, settlement support, and monitoring.

## Architecture

```
                      ┌─────────────────────────────────────────────────────┐
                      │              m2m-connector namespace                 │
                      │                                                      │
┌─────────────┐       │  ┌──────────────────────────────────────────────┐   │
│   Ingress   │       │  │              connector (Deployment)          │   │
│  Controller │──────►│  │                                              │   │
└─────────────┘       │  │  ┌────────┐  ┌────────┐  ┌─────────────────┐ │   │
       │              │  │  │ :4000  │  │ :8080  │  │     :5173       │ │   │
       │              │  │  │  BTP   │  │ Health │  │   Explorer UI   │ │   │
       │              │  │  │WebSocket│  │Metrics │  │  NOC Dashboard  │ │   │
       │              │  │  └────────┘  └────────┘  └─────────────────┘ │   │
       │              │  └──────────────────────────────────────────────┘   │
       │              │                        │                            │
       │              └────────────────────────┼────────────────────────────┘
       │                                       │
       │                                       ▼
       │              ┌─────────────────────────────────────────────────┐
       │              │           tigerbeetle namespace                  │
       │              │                                                  │
       │              │  ┌───────────────────────────────────────────┐  │
       └──────────────┼─▶│  TigerBeetle Cluster (3 replicas)         │  │
                      │  │  tigerbeetle.tigerbeetle.svc:3000         │  │
                      │  └───────────────────────────────────────────┘  │
                      └─────────────────────────────────────────────────┘
```

## Features

- **Explorer UI**: Built-in NOC dashboard on port 5173
- **Multi-chain Settlement**: EVM (Base), XRP Ledger, Aptos support
- **M2M Token Integration**: Payment channels with M2M ERC-20 token
- **TigerBeetle Accounting**: High-performance balance tracking
- **Health Checks**: Liveness, readiness, and startup probes
- **Prometheus Metrics**: Built-in metrics endpoint
- **Network Policies**: Restricted network access
- **Pod Disruption Budget**: Safe cluster maintenance

## Prerequisites

1. Kubernetes cluster (1.24+)
2. TigerBeetle deployed (see `k8s/tigerbeetle/`)
3. kubectl configured
4. Secrets configured (see [Secrets](#secrets))

## Quick Deploy

```bash
# Deploy TigerBeetle first (if not already running)
kubectl apply -k k8s/tigerbeetle/

# Deploy connector
kubectl apply -k k8s/connector/

# Watch pods start
kubectl -n m2m-connector get pods -w

# Check status
kubectl -n m2m-connector logs -l app.kubernetes.io/name=m2m-connector
```

## Configuration

### Overlays

| Overlay               | Description                                  |
| --------------------- | -------------------------------------------- |
| `base`                | Default configuration                        |
| `overlays/production` | Production with 2 replicas, mainnet RPC URLs |
| `overlays/staging`    | Staging with testnet RPC URLs, debug logging |

```bash
# Deploy production
kubectl apply -k k8s/connector/overlays/production/

# Deploy staging
kubectl apply -k k8s/connector/overlays/staging/
```

### Secrets

**IMPORTANT**: Replace placeholder values before deploying!

Option 1: Create secrets manually:

```bash
kubectl -n m2m-connector create secret generic connector-secrets \
  --from-literal=EVM_PRIVATE_KEY=0x... \
  --from-literal=M2M_TOKEN_ADDRESS=0x... \
  --from-literal=TOKEN_NETWORK_REGISTRY=0x...
```

Option 2: Use external secret management:

- [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets)
- [External Secrets Operator](https://external-secrets.io/)
- [Vault Secrets Operator](https://developer.hashicorp.com/vault/docs/platform/k8s/vso)

### ConfigMap Values

| Key                     | Default                | Description                          |
| ----------------------- | ---------------------- | ------------------------------------ |
| `NODE_ID`               | m2m-connector          | Unique node identifier               |
| `LOG_LEVEL`             | info                   | Log level (debug, info, warn, error) |
| `SETTLEMENT_PREFERENCE` | evm                    | Preferred settlement chain           |
| `SETTLEMENT_ENABLED`    | true                   | Enable automatic settlement          |
| `SETTLEMENT_THRESHOLD`  | 1000000                | Balance threshold for settlement     |
| `TIGERBEETLE_REPLICAS`  | tigerbeetle...svc:3000 | TigerBeetle service address          |

## Service Endpoints

| Service                   | Port | Description                        |
| ------------------------- | ---- | ---------------------------------- |
| `connector:4000`          | 4000 | BTP WebSocket server               |
| `connector:8080`          | 8080 | Health checks & Prometheus metrics |
| `connector-explorer:5173` | 5173 | Explorer UI (NOC Dashboard)        |

### Accessing Explorer UI

```bash
# Port forward for local access
kubectl -n m2m-connector port-forward svc/connector-explorer 5173:5173

# Open in browser
open http://localhost:5173
```

### Exposing with Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: connector-explorer
  namespace: m2m-connector
spec:
  rules:
    - host: explorer.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: connector-explorer
                port:
                  number: 5173
```

## Monitoring

### Health Endpoints

| Endpoint        | Description                          |
| --------------- | ------------------------------------ |
| `/health`       | Basic health check                   |
| `/health/live`  | Liveness probe (is process running)  |
| `/health/ready` | Readiness probe (can handle traffic) |
| `/metrics`      | Prometheus metrics                   |

### Prometheus Scraping

The deployment includes annotations for automatic Prometheus scraping:

```yaml
prometheus.io/scrape: 'true'
prometheus.io/port: '8080'
prometheus.io/path: '/metrics'
```

## Operations

### Scaling

```bash
# Scale to 3 replicas
kubectl -n m2m-connector scale deployment connector --replicas=3
```

### Rolling Update

```bash
# Update image
kubectl -n m2m-connector set image deployment/connector connector=m2m/connector:v1.2.0

# Watch rollout
kubectl -n m2m-connector rollout status deployment/connector
```

### Logs

```bash
# All connector logs
kubectl -n m2m-connector logs -l app.kubernetes.io/name=m2m-connector -f

# Specific pod
kubectl -n m2m-connector logs connector-xxxx-yyyy -f
```

## Troubleshooting

### Pod Not Starting

```bash
# Check events
kubectl -n m2m-connector describe pod -l app.kubernetes.io/name=m2m-connector

# Common causes:
# - Missing secrets (connector-secrets)
# - TigerBeetle not accessible
# - Insufficient resources
```

### Cannot Connect to TigerBeetle

```bash
# Verify TigerBeetle is running
kubectl -n tigerbeetle get pods

# Test connectivity from connector pod
kubectl -n m2m-connector exec -it deployment/connector -- \
  nc -zv tigerbeetle.tigerbeetle.svc.cluster.local 3000
```

### Settlement Not Working

```bash
# Check logs for settlement errors
kubectl -n m2m-connector logs -l app.kubernetes.io/name=m2m-connector | grep -i settlement

# Verify secrets are set
kubectl -n m2m-connector get secret connector-secrets -o jsonpath='{.data.M2M_TOKEN_ADDRESS}' | base64 -d
```

## Resource Requirements

| Resource | Request | Limit |
| -------- | ------- | ----- |
| CPU      | 250m    | 1000m |
| Memory   | 512Mi   | 1Gi   |

Production overlay increases limits to:
| Resource | Request | Limit |
|----------|---------|-------|
| CPU | 500m | 2000m |
| Memory | 1Gi | 2Gi |

## Security Considerations

1. **Secrets Management**: Never commit real secrets; use external secret management
2. **Network Policy**: Only necessary ports are exposed
3. **Service Account**: Dedicated service account with minimal permissions
4. **Non-root User**: Container runs as non-root user (UID 1000)
5. **Read-only Filesystem**: Consider enabling for extra security

## Version Compatibility

| Component     | Version |
| ------------- | ------- |
| M2M Connector | 1.0.0+  |
| TigerBeetle   | 0.16.68 |
| Kubernetes    | 1.24+   |
