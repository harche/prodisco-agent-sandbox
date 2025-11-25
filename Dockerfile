# Multi-stage build for smaller final image
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci

# Copy source code
COPY src/ ./src/

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

# Install dumb-init for proper signal handling and bash for Claude Code SDK
RUN apk add --no-cache dumb-init bash

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production && \
    npm cache clean --force

# Copy built application from builder
COPY --from=builder /app/dist ./dist

# Create home directory structure for MCP server cache
RUN mkdir -p /home/nodejs/.prodisco/scripts/cache && \
    chown -R nodejs:nodejs /home/nodejs

# Set ownership to non-root user
RUN chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Add node_modules/.bin to PATH for MCP server binary
ENV PATH="/app/node_modules/.bin:$PATH"

# Set HOME to a writable location (mounted as emptyDir in k8s)
ENV HOME="/app/.cache"

# Set SHELL to bash for Claude Code SDK
ENV SHELL="/bin/bash"

# Disable Node.js output buffering for real-time streaming
ENV NODE_OPTIONS="--no-warnings"
ENV PYTHONUNBUFFERED="1"

# Environment variables with defaults
ENV NODE_ENV=production \
    AGENT_MODE=single-task \
    LOG_LEVEL=info \
    ANTHROPIC_MODEL=claude-sonnet-4-5-20250514 \
    MAX_ITERATIONS=10 \
    K8S_NAMESPACE=default

# Health check (if running in daemon mode with a health endpoint)
# HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
#   CMD node -e "console.log('healthy')" || exit 1

# Use dumb-init to properly handle signals
ENTRYPOINT ["dumb-init", "--"]

# Run the agent
CMD ["node", "dist/agent.js"]

