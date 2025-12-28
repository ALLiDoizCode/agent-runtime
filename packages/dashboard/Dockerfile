# Multi-stage build for React dashboard application
# Stage 1: Build the React application
FROM node:20-alpine AS builder

WORKDIR /app

# Copy root package files and workspace structure
COPY package.json package-lock.json ./
COPY packages/dashboard/package.json packages/dashboard/
COPY packages/shared/ packages/shared/

# Install all dependencies (including workspace dependencies)
RUN npm ci

# Copy dashboard source files and configuration
COPY packages/dashboard/ packages/dashboard/

# Build the React application
WORKDIR /app/packages/dashboard
RUN npm run build

# Stage 2: Serve the application with nginx
FROM nginx:alpine

# Copy built files from builder stage
COPY --from=builder /app/packages/dashboard/dist /usr/share/nginx/html

# Copy custom nginx configuration (optional - using default for now)
# COPY packages/dashboard/nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80
EXPOSE 80

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
