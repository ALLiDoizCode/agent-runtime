# Aptos ARM64 Docker Image

Multi-stage Dockerfile for building Aptos from source, supporting both ARM64 (Apple Silicon) and AMD64 architectures.

## Pre-Built Images

Multi-architecture images are available on Docker Hub:

```bash
# Pull latest image (auto-selects architecture)
docker pull m2mproject/aptos-tools:latest

# Run local testnet
docker run --rm -it -p 8080:8080 -p 8081:8081 m2mproject/aptos-tools:latest \
  node run-local-testnet --force-restart --assume-yes
```

**Available Architectures:**

- `linux/amd64` - Intel/AMD systems
- `linux/arm64` - Apple Silicon, ARM servers

**Image Tags:**

- `latest` - Most recent stable build
- `aptos-node-v1.40.1` - Specific version tag

**Alternative Registry (GHCR):**

```bash
docker pull ghcr.io/m2mproject/aptos-tools:latest
```

## Purpose

The official `aptoslabs/tools` Docker image only provides AMD64 builds, which run under slow QEMU emulation on Apple Silicon Macs. This Dockerfile builds Aptos natively for ARM64, providing significantly better performance for local development.

## Build Instructions

### Basic Build

```bash
# From the docker/aptos directory
cd docker/aptos
docker build -t aptos-local .
```

### Build with Specific Version

```bash
# Check available versions at:
# https://github.com/aptos-labs/aptos-core/releases
docker build --build-arg APTOS_VERSION=aptos-node-v1.40.1 -t aptos-local .
```

### Build with Docker Buildx (Recommended)

For better caching and multi-platform support:

```bash
docker buildx build -t aptos-local .
```

## Build Arguments

| Argument           | Default              | Description                                            |
| ------------------ | -------------------- | ------------------------------------------------------ |
| `APTOS_VERSION`    | `aptos-node-v1.40.1` | Git tag from aptos-core releases to build              |
| `CARGO_BUILD_JOBS` | `4`                  | Number of parallel rustc jobs (increase with more RAM) |

### Memory-Constrained Builds

If Docker is configured with limited memory (8GB or less), use the default settings:

```bash
docker build -t aptos-local .
```

If Docker has 16GB+ RAM, you can speed up builds with more parallel jobs:

```bash
docker build --build-arg CARGO_BUILD_JOBS=8 -t aptos-local .
```

## Expected Build Time

| Scenario                 | ARM64 (Apple Silicon) | AMD64         |
| ------------------------ | --------------------- | ------------- |
| Initial build (no cache) | 30-90 minutes         | 20-60 minutes |
| Subsequent cached builds | 5-15 minutes          | 5-10 minutes  |

Build times vary based on:

- CPU cores and speed
- Available RAM
- Network speed for downloading dependencies
- Docker cache state

## Resource Requirements

### Minimum (with CARGO_BUILD_JOBS=4)

- **RAM:** 12GB available to Docker
- **Disk:** 20GB free space (for build artifacts)
- **CPU:** 4 cores recommended

### Recommended

- **RAM:** 16GB+ available to Docker
- **Disk:** 40GB free space
- **CPU:** 8+ cores for faster compilation

### Docker Desktop Settings (macOS)

**IMPORTANT:** The default Docker Desktop memory allocation (8GB) may not be sufficient. You must increase memory to at least 12GB.

1. Open Docker Desktop > Settings > Resources
2. **Set Memory to at least 12GB (16GB recommended)**
3. Set CPUs to at least 4 (8 recommended)
4. Set Disk image size to at least 60GB
5. Apply & Restart Docker Desktop

## Usage

### Check Version

```bash
docker run --rm aptos-local --version
```

### Run Local Testnet

```bash
docker run --rm -it \
  -p 8080:8080 \
  -p 8081:8081 \
  -p 9101:9101 \
  aptos-local node run-local-testnet --force-restart --assume-yes
```

### Interactive CLI

```bash
docker run --rm -it aptos-local
```

## Exposed Ports

| Port | Service   | Description                   |
| ---- | --------- | ----------------------------- |
| 8080 | REST API  | Node REST API endpoint        |
| 8081 | Admin API | Node administration interface |
| 9101 | Metrics   | Prometheus metrics endpoint   |

## Image Size

Target: < 500MB

The multi-stage build and binary stripping keeps the final image size minimal by:

- Using `debian:bookworm-slim` as the runtime base (~80MB)
- Including only runtime dependencies
- Stripping debug symbols from binaries

## Troubleshooting

### Build Fails with Memory Error / "Killed" / OOM

The build process requires significant RAM. If you see errors like:

- `Killed`
- `cannot allocate memory`
- `ResourceExhausted`

Solution:

1. Docker Desktop > Settings > Resources > Memory
2. **Set to at least 12GB, preferably 16GB**
3. Apply & Restart Docker Desktop
4. Retry the build

Alternatively, reduce parallel compilation (slower but uses less memory):

```bash
docker build --build-arg CARGO_BUILD_JOBS=2 -t aptos-local .
```

### Build Fails with Network Errors

The build clones from GitHub and downloads Rust crates. If you experience network issues:

- Check your internet connection
- Retry the build (cached layers will be reused)
- Consider using a VPN if GitHub is blocked

### Build Takes Too Long

- Ensure Docker has enough CPU cores allocated
- Use Docker Buildx for better caching: `docker buildx build -t aptos-local .`
- Cached builds are much faster; only the first build is slow

### Container Exits Immediately

The default command is `--help`. For long-running operations, use:

```bash
docker run --rm -it aptos-local node run-local-testnet --force-restart --assume-yes
```

## Known Limitations

1. **First build is slow:** Building Rust from source with all dependencies takes significant time
2. **Large build cache:** The build cache can consume 10-20GB of disk space
3. **Version pinning:** Only tested with `aptos-node-v1.40.1`; other versions may require adjustments
4. **Additional dependencies:** The `libudev-dev` package is required for Ledger hardware wallet support (hidapi crate) - this is included in the Dockerfile but not documented in the original Aptos build instructions

## Architecture Support

| Architecture | Status    | Notes                          |
| ------------ | --------- | ------------------------------ |
| ARM64        | Supported | Primary target (Apple Silicon) |
| AMD64        | Supported | Works on Intel/AMD systems     |

## Related Files

- `Dockerfile` - Multi-stage build configuration
- `.dockerignore` - Build context exclusions
