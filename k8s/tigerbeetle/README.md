# TigerBeetle Kubernetes Deployment

Production-ready 3-replica TigerBeetle cluster for the M2M ILP Connector.

## Architecture

```
                    ┌─────────────────────────────────────────────┐
                    │           tigerbeetle namespace             │
                    │                                             │
┌─────────┐         │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐
│ M2M     │         │  │tigerbeetle-0│ │tigerbeetle-1│ │tigerbeetle-2│
│Connector├────────►│  │  (replica)  │◄┼►  (replica)  │◄┼►  (replica)  │
└─────────┘         │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘
     │              │         │               │               │
     │              │         ▼               ▼               ▼
     │              │     ┌───────┐       ┌───────┐       ┌───────┐
     │              │     │ PVC-0 │       │ PVC-1 │       │ PVC-2 │
     │              │     │ 10Gi  │       │ 10Gi  │       │ 10Gi  │
     │              │     └───────┘       └───────┘       └───────┘
     │              └─────────────────────────────────────────────┘
     │
     └──► Service: tigerbeetle.tigerbeetle.svc.cluster.local:3000
```

## Features

- **High Availability**: 3 replicas with consensus (survives 1 node failure)
- **Data Durability**: Persistent volumes per replica
- **Pod Anti-Affinity**: Replicas spread across different nodes
- **PodDisruptionBudget**: Safe cluster maintenance
- **NetworkPolicy**: Restricted network access
- **Automatic Initialization**: Init container formats data files

## Prerequisites

1. Kubernetes cluster (1.24+) with at least 3 nodes
2. kubectl configured
3. Storage class that supports ReadWriteOnce PVCs
4. (Optional) CNI supporting NetworkPolicy (Calico, Cilium)

## Deployment

### Quick Deploy

```bash
# Deploy all resources
kubectl apply -k k8s/tigerbeetle/

# Watch pods start
kubectl -n tigerbeetle get pods -w

# Check cluster status
kubectl -n tigerbeetle logs -l app.kubernetes.io/name=tigerbeetle --tail=50
```

### Step-by-Step Deploy

```bash
# 1. Create namespace
kubectl apply -f k8s/tigerbeetle/namespace.yaml

# 2. Create services (must exist before StatefulSet for DNS)
kubectl apply -f k8s/tigerbeetle/headless-service.yaml
kubectl apply -f k8s/tigerbeetle/service.yaml

# 3. Deploy StatefulSet
kubectl apply -f k8s/tigerbeetle/statefulset.yaml

# 4. Apply policies
kubectl apply -f k8s/tigerbeetle/pdb.yaml
kubectl apply -f k8s/tigerbeetle/networkpolicy.yaml
```

## Verification

### Check Pod Status

```bash
# All 3 pods should be Running
kubectl -n tigerbeetle get pods

# Expected output:
# NAME            READY   STATUS    RESTARTS   AGE
# tigerbeetle-0   1/1     Running   0          5m
# tigerbeetle-1   1/1     Running   0          5m
# tigerbeetle-2   1/1     Running   0          5m
```

### Check Cluster Formation

```bash
# View logs from all replicas
kubectl -n tigerbeetle logs -l app.kubernetes.io/name=tigerbeetle --tail=20

# Look for: "listening on 0.0.0.0:3000"
```

### Test Connectivity

```bash
# Port forward to test locally
kubectl -n tigerbeetle port-forward svc/tigerbeetle 3000:3000

# From another terminal, test with tigerbeetle client
# (requires tigerbeetle-node installed locally)
```

## Connecting from M2M Connector

Configure the connector to use the Kubernetes service DNS name:

```yaml
# Connector configuration
settlement:
  tigerBeetleClusterId: 0
  tigerBeetleReplicas:
    - tigerbeetle.tigerbeetle.svc.cluster.local:3000
```

Or via environment variables:

```yaml
env:
  - name: TIGERBEETLE_CLUSTER_ID
    value: '0'
  - name: TIGERBEETLE_REPLICAS
    value: 'tigerbeetle.tigerbeetle.svc.cluster.local:3000'
```

**Note**: The client only needs one address. TigerBeetle handles routing to the appropriate replica internally.

## Operations

### Scaling

TigerBeetle cluster size is fixed at initialization time. You cannot add/remove replicas without reformatting.

### Backup

```bash
# Option 1: Volume snapshots (if supported by storage class)
kubectl -n tigerbeetle get pvc
# Create VolumeSnapshot for each PVC

# Option 2: Copy data files (requires pod restart)
for i in 0 1 2; do
  kubectl -n tigerbeetle cp tigerbeetle-$i:/data/0_$i.tigerbeetle ./backup/0_$i.tigerbeetle
done
```

### Restore

```bash
# Delete existing StatefulSet (preserves PVCs)
kubectl -n tigerbeetle delete statefulset tigerbeetle

# Copy backup files to PVCs (requires temporary pods)
# Then recreate StatefulSet
kubectl apply -f k8s/tigerbeetle/statefulset.yaml
```

### Monitoring

TigerBeetle doesn't expose metrics directly. Monitor via:

- Pod resource usage (CPU, memory)
- PVC usage
- Network traffic between replicas

```bash
# Resource usage
kubectl -n tigerbeetle top pods

# PVC usage (requires metrics-server)
kubectl -n tigerbeetle get pvc
```

## Troubleshooting

### Pods Stuck in Pending

```bash
# Check events
kubectl -n tigerbeetle describe pod tigerbeetle-0

# Common causes:
# - Insufficient resources (need 4Gi RAM per pod)
# - No nodes available (anti-affinity requires 3 nodes)
# - PVC not provisioning
```

### Pods CrashLooping

```bash
# Check logs
kubectl -n tigerbeetle logs tigerbeetle-0 -c format  # Init container
kubectl -n tigerbeetle logs tigerbeetle-0            # Main container

# Common causes:
# - seccomp/capabilities issue (check node security policies)
# - Cluster ID mismatch
# - Corrupted data file (delete PVC and let it reinitialize)
```

### Cluster Not Forming

```bash
# Check all replica logs
kubectl -n tigerbeetle logs tigerbeetle-0 --tail=100
kubectl -n tigerbeetle logs tigerbeetle-1 --tail=100
kubectl -n tigerbeetle logs tigerbeetle-2 --tail=100

# Verify DNS resolution
kubectl -n tigerbeetle exec tigerbeetle-0 -- nslookup tigerbeetle-1.tigerbeetle-headless

# Common causes:
# - DNS not resolving (headless service issue)
# - Network policy blocking inter-replica traffic
# - Firewall rules on nodes
```

### Reset Cluster (Data Loss!)

```bash
# Delete everything including data
kubectl delete -k k8s/tigerbeetle/
kubectl -n tigerbeetle delete pvc --all

# Redeploy
kubectl apply -k k8s/tigerbeetle/
```

## Resource Requirements

| Resource         | Per Replica | Total (3 replicas) |
| ---------------- | ----------- | ------------------ |
| CPU (request)    | 500m        | 1500m              |
| CPU (limit)      | 1000m       | 3000m              |
| Memory (request) | 4Gi         | 12Gi               |
| Memory (limit)   | 4Gi         | 12Gi               |
| Storage          | 10Gi        | 30Gi               |

## Security Considerations

1. **NetworkPolicy**: Restricts access to TigerBeetle pods
2. **No authentication**: TigerBeetle has no built-in auth; rely on network isolation
3. **IPC_LOCK capability**: Required for TigerBeetle; review security implications
4. **Encryption at rest**: Use encrypted storage class if required
5. **Encryption in transit**: TigerBeetle inter-replica traffic is not encrypted; use a service mesh if needed

## Version Compatibility

| Component        | Version |
| ---------------- | ------- |
| TigerBeetle      | 0.16.68 |
| tigerbeetle-node | 0.16.68 |
| Kubernetes       | 1.24+   |
