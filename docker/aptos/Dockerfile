# Multi-stage Dockerfile for building Aptos from source
# Supports both ARM64 (Apple Silicon) and AMD64 architectures
#
# Build: docker build -t aptos-local .
# Build with specific version: docker build --build-arg APTOS_VERSION=aptos-node-v1.40.1 -t aptos-local .

# =============================================================================
# Stage 1: Builder - Compile Aptos from source
# =============================================================================
FROM rust:1.75-bookworm AS builder

# Install build dependencies
# libudev-dev is required for hidapi (Ledger hardware wallet support)
RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake \
    clang \
    lld \
    libssl-dev \
    pkg-config \
    libpq-dev \
    libudev-dev \
    git \
    && rm -rf /var/lib/apt/lists/*

# Aptos version to build - use a stable release tag for reproducibility
# Check https://github.com/aptos-labs/aptos-core/releases for available tags
ARG APTOS_VERSION=aptos-node-v1.40.1

# Clone aptos-core at specified tag with minimal depth
RUN git clone --depth 1 --branch ${APTOS_VERSION} \
    https://github.com/aptos-labs/aptos-core.git /aptos

WORKDIR /aptos

# Enable thin LTO for optimized binary size while maintaining reasonable build time
ENV CARGO_PROFILE_RELEASE_LTO=thin

# Limit parallel compilation to prevent OOM on systems with limited memory
# Default to 4 jobs; increase if you have 16GB+ RAM available to Docker
ARG CARGO_BUILD_JOBS=4
ENV CARGO_BUILD_JOBS=${CARGO_BUILD_JOBS}

# Build only required binaries with release optimizations
# --locked ensures Cargo.lock is respected for reproducible builds
# Using cache mounts for cargo registry and git dependencies
RUN --mount=type=cache,target=/usr/local/cargo/registry \
    --mount=type=cache,target=/usr/local/cargo/git \
    --mount=type=cache,target=/aptos/target \
    cargo build --release --locked -j ${CARGO_BUILD_JOBS} -p aptos -p aptos-node && \
    # Copy binaries out of cache mount before it disappears
    cp /aptos/target/release/aptos /aptos/aptos-bin && \
    cp /aptos/target/release/aptos-node /aptos/aptos-node-bin

# Strip debug symbols to reduce binary size
RUN strip /aptos/aptos-bin /aptos/aptos-node-bin

# =============================================================================
# Stage 2: Runtime - Minimal image for running Aptos
# =============================================================================
FROM debian:bookworm-slim AS runtime

# Install only required runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    libssl3 \
    libpq5 \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Copy compiled and stripped binaries from builder
COPY --from=builder /aptos/aptos-bin /usr/local/bin/aptos
COPY --from=builder /aptos/aptos-node-bin /usr/local/bin/aptos-node

# Verify binaries are executable
RUN chmod +x /usr/local/bin/aptos /usr/local/bin/aptos-node

# Verify aptos CLI works
RUN aptos --version

# Create non-root user for running aptos
RUN useradd --create-home --shell /bin/bash aptos
USER aptos
WORKDIR /home/aptos

# Expose default ports
# 8080: REST API
# 8081: Admin API
# 9101: Metrics
EXPOSE 8080 8081 9101

# Health check for container orchestration
# Checks if the aptos CLI responds to version command
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD aptos --version || exit 1

# Default entrypoint is the aptos CLI
ENTRYPOINT ["/usr/local/bin/aptos"]

# Default command shows help
CMD ["--help"]
