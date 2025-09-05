# Preview Container for Velocity Mobile App Development Platform
# Based on Node.js 18 with pre-installed development tools

FROM node:18-slim

# Set working directory
WORKDIR /app

# Install system dependencies required for development tools
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    ca-certificates \
    curl \
    procps \
    && rm -rf /var/lib/apt/lists/*

# Install global development dependencies
RUN npm install -g \
    vite@^4.4.0 \
    @expo/cli@^0.10.0 \
    nodemon@^3.0.0 \
    webpack-dev-server@^4.15.0 \
    create-react-app@^5.0.0 \
    typescript@^5.0.0 \
    ts-node@^10.9.0

# Copy container-specific package.json for internal dependencies
COPY package.json ./

# Install container-specific dependencies
RUN npm install

# Copy the entrypoint scripts and supporting modules
COPY entrypoint.js ./
COPY entrypoint-subdomain.js ./
COPY detect-project-type.js ./

# Create project directory where user code will be synced
RUN mkdir -p /app/project

# Set environment variables
ENV NODE_ENV=production
ENV PORT=8080

# Expose the port that will be mapped by Fly.io
EXPOSE 8080

# Set up proper permissions
RUN chown -R node:node /app
USER node

# Health check to verify container is ready
HEALTHCHECK --interval=15s --timeout=10s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Start the appropriate entrypoint script based on USE_SUBDOMAIN env var
CMD ["npm", "start"]