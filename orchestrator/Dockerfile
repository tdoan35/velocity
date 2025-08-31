# Multi-stage build for Velocity Orchestrator Service
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm ci && npm cache clean --force

# Copy source code and build
COPY . .

# Build TypeScript
RUN npm run build

# Production stage
FROM node:18-alpine AS production

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S orchestrator -u 1001

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production && npm cache clean --force

# Copy built application from builder stage
COPY --from=builder --chown=orchestrator:nodejs /app/dist ./dist

# Copy config files if they exist
COPY --chown=orchestrator:nodejs config ./config

# Switch to non-root user
USER orchestrator

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "const http=require('http');const options={host:'localhost',port:8080,timeout:2000};const request=http.request(options,(res)=>{if(res.statusCode==200)process.exit(0);else process.exit(1);});request.on('error',()=>process.exit(1));request.end();"

# Start the application
CMD ["node", "dist/index.js"]