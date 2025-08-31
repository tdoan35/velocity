# Deployment Plan: Real-Time Preview Architecture

**Date:** August 31, 2025  
**Status:** Implementation Ready  
**Dependencies:** Real-Time Preview Implementation Plan

## 1. Overview

This deployment guide covers the production deployment of three critical components:

1. **Orchestrator Service** - Container lifecycle management service on Fly.io
2. **Preview Containers** - Ephemeral development environments as Fly Machines  
3. **Real-Time Communication Layer** - Supabase Realtime integration

## 2. Prerequisites

### 2.1 Platform Accounts & Access
- [ ] **Fly.io Account** with billing configured
- [ ] **GitHub Container Registry (GHCR)** access configured
- [ ] **Supabase Project** with Realtime enabled
- [ ] **Domain/Subdomain** for orchestrator service (optional but recommended)

### 2.2 Required Credentials
- [ ] `FLY_API_TOKEN` - For Fly.io API access
- [ ] `GITHUB_TOKEN` - For GHCR access (in CI/CD)
- [ ] `SUPABASE_URL` and `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` - For backend operations

### 2.3 Development Environment
- [ ] Fly CLI installed (`flyctl`)
- [ ] Docker installed for local container builds
- [ ] Node.js 18+ for local development

## 3. Component 1: Preview Container Deployment

### 3.1 Container Image Build & Registry Setup

The Preview Container needs to be built as a Docker image and pushed to GitHub Container Registry for Fly.io to pull.

#### 3.1.1 GitHub Actions Workflow Setup

Create `.github/workflows/build-preview-container.yml`:

```yaml
name: Build Preview Container

on:
  push:
    branches: [main]
    paths: 
      - 'orchestrator/preview-container/**'
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write
      
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        
      - name: Login to GHCR
        uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Build and push
        uses: docker/build-push-action@v5
        with:
          context: ./orchestrator/preview-container
          push: true
          tags: |
            ghcr.io/${{ github.repository_owner }}/velocity-preview-container:latest
            ghcr.io/${{ github.repository_owner }}/velocity-preview-container:${{ github.sha }}
```

#### 3.1.2 Manual Build & Push Commands

For development/testing:

```bash
# Build the container locally
cd orchestrator/preview-container
docker build -t ghcr.io/your-org/velocity-preview-container:latest .

# Push to GHCR (requires authentication)
docker push ghcr.io/your-org/velocity-preview-container:latest
```

### 3.2 Preview Container Dockerfile Optimization

```dockerfile
FROM node:18-slim

# Install system dependencies
RUN apt-get update && apt-get install -y \
    git \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Install global dev tools
RUN npm install -g \
    vite@latest \
    @expo/cli@latest \
    nodemon@latest \
    create-react-app \
    next@latest

# Create app directory
WORKDIR /app

# Copy container logic
COPY package.json .
COPY entrypoint.js .

# Install container dependencies
RUN npm install --production

# Create project directory
RUN mkdir -p /app/project

# Expose port for Fly.io
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8080/health || exit 1

# Run entrypoint
CMD ["node", "entrypoint.js"]
```

## 4. Component 2: Orchestrator Service Deployment

### 4.1 Fly.io App Configuration

#### 4.1.1 Create `orchestrator/fly.toml`

```toml
app = "velocity-orchestrator"
primary_region = "iad"  # Choose region closest to Supabase

[build]

[env]
  NODE_ENV = "production"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  auto_start_machines = true
  min_machines_running = 1
  
[http_service.concurrency]
  type = "connections"
  hard_limit = 25
  soft_limit = 20

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512

[metrics]
  port = 9091
  path = "/metrics"
```

#### 4.1.2 Environment Variables Configuration

```bash
# Set secrets in Fly.io
flyctl secrets set \
  SUPABASE_URL="https://your-project.supabase.co" \
  SUPABASE_SERVICE_ROLE_KEY="your-service-role-key" \
  FLY_API_TOKEN="your-fly-token" \
  PREVIEW_CONTAINER_IMAGE="ghcr.io/your-org/velocity-preview-container:latest"
```

### 4.2 Orchestrator Service Dockerfile

Create `orchestrator/Dockerfile`:

```dockerfile
FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 orchestrator
USER orchestrator

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start server
CMD ["node", "src/index.js"]
```

### 4.3 Deployment Commands

```bash
# Initial deployment
cd orchestrator
flyctl apps create velocity-orchestrator
flyctl deploy

# Subsequent deployments
flyctl deploy

# Monitor deployment
flyctl logs
flyctl status
```

### 4.4 Production Considerations

#### 4.4.1 Scaling Configuration
```bash
# Auto-scaling configuration
flyctl scale count 2  # Minimum 2 instances for HA
flyctl scale vm shared-cpu-1x  # Appropriate instance size
```

#### 4.4.2 Monitoring & Observability
```bash
# Set up metrics and logging
flyctl secrets set \
  PROMETHEUS_ENABLED="true" \
  LOG_LEVEL="info"
```

## 5. Component 3: Real-Time Communication Layer Setup

### 5.1 Supabase Realtime Configuration

#### 5.1.1 Enable Realtime on Required Tables

```sql
-- Enable Realtime on preview_sessions table
ALTER PUBLICATION supabase_realtime ADD TABLE public.preview_sessions;

-- Create function to handle session cleanup
CREATE OR REPLACE FUNCTION public.cleanup_expired_sessions()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.preview_sessions 
  SET status = 'ended', 
      ended_at = NOW(),
      updated_at = NOW()
  WHERE status IN ('creating', 'active') 
    AND (expires_at IS NOT NULL AND expires_at < NOW());
END;
$$;

-- Create cron job for cleanup (requires pg_cron extension)
SELECT cron.schedule('cleanup-preview-sessions', '*/5 * * * *', 'SELECT public.cleanup_expired_sessions();');
```

#### 5.1.2 Row Level Security (RLS) Policies

```sql
-- Enable RLS on preview_sessions
ALTER TABLE public.preview_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own sessions
CREATE POLICY "Users can access own sessions" ON public.preview_sessions
    FOR ALL USING (auth.uid() = user_id);

-- Policy: Orchestrator service can manage all sessions (using service role)
CREATE POLICY "Service role can manage sessions" ON public.preview_sessions
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
```

### 5.2 Realtime Channel Configuration

#### 5.2.1 Frontend Channel Setup
```typescript
// In ProjectEditor component
const channelName = `project:${projectId}`;
const channel = supabase
  .channel(channelName)
  .on('broadcast', { event: 'file:update' }, (payload) => {
    // Handle file updates
  })
  .subscribe();
```

#### 5.2.2 Container Channel Setup
```javascript
// In entrypoint.js
const channelName = `project:${projectId}`;
const channel = supabase
  .channel(channelName)
  .on('broadcast', { event: 'file:update' }, async (payload) => {
    await writeFileToProject(payload.filePath, payload.content);
  })
  .subscribe();
```

## 6. Security & Network Configuration

### 6.1 Fly.io Network Security

#### 6.1.1 Private Network Setup
```bash
# Create private network
flyctl wireguard create personal velocity-network

# Connect orchestrator to network
flyctl ips private -a velocity-orchestrator
```

#### 6.1.2 Firewall Rules
```toml
# In fly.toml
[[services.ports]]
  port = 80
  handlers = ["http"]
  force_https = true

[[services.ports]]
  port = 443
  handlers = ["tls", "http"]

[services.concurrency]
  type = "connections"
  hard_limit = 100
  soft_limit = 80
```

### 6.2 Container Resource Limits

Set in Orchestrator service when creating Fly Machines:

```javascript
const machineConfig = {
  image: process.env.PREVIEW_CONTAINER_IMAGE,
  guest: {
    cpu_kind: "shared",
    cpus: 1,
    memory_mb: 512
  },
  services: [{
    ports: [{
      port: 8080,
      handlers: ["http"]
    }],
    protocol: "tcp",
    internal_port: 8080
  }],
  auto_destroy: true,
  restart: {
    policy: "on-failure",
    max_retries: 3
  }
};
```

## 7. Monitoring & Observability

### 7.1 Health Checks

#### 7.1.1 Orchestrator Health Check
```javascript
// src/routes/health.js
app.get('/health', (req, res) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version
  };
  
  res.status(200).json(health);
});
```

#### 7.1.2 Container Health Check
```javascript
// In entrypoint.js
const express = require('express');
const app = express();

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok',
    devServer: devServerRunning,
    supabaseConnected: realtimeConnected
  });
});

app.listen(8080);
```

### 7.2 Logging Strategy

#### 7.2.1 Structured Logging
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console()
  ]
});

// Log container lifecycle events
logger.info('Container created', { 
  sessionId, 
  projectId, 
  containerId 
});
```

## 8. Deployment Checklist

### 8.1 Pre-Deployment
- [ ] All environment variables configured
- [ ] Database migrations executed
- [ ] Preview container image built and pushed to GHCR
- [ ] Fly.io apps created and configured
- [ ] DNS records configured (if using custom domain)

### 8.2 Deployment Steps
1. [ ] Deploy Preview Container image to GHCR
2. [ ] Deploy Orchestrator Service to Fly.io
3. [ ] Configure Supabase Realtime channels
4. [ ] Update frontend to use new endpoints
5. [ ] Execute database migration
6. [ ] Test end-to-end functionality

### 8.3 Post-Deployment
- [ ] Monitor application logs
- [ ] Verify container creation/destruction
- [ ] Test real-time file synchronization
- [ ] Monitor resource usage and costs
- [ ] Set up alerting for failures

### 8.4 Rollback Plan
- [ ] Keep previous Appetize.io integration active during transition
- [ ] Database migration rollback scripts prepared
- [ ] Feature flag to switch between old/new systems
- [ ] Monitoring for success/failure metrics

## 9. Cost Optimization

### 9.1 Fly.io Resource Management
```javascript
// Implement container auto-shutdown after inactivity
const INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes

setTimeout(async () => {
  if (!hasRecentActivity) {
    await shutdownContainer();
  }
}, INACTIVITY_TIMEOUT);
```

### 9.2 Container Lifecycle Optimization
- Implement container warm pools for faster startup
- Set appropriate `expires_at` values for cleanup
- Monitor and optimize container resource usage

## 10. Troubleshooting Guide

### 10.1 Common Issues
- **Container fails to start**: Check image availability and resource limits
- **Real-time connection issues**: Verify Supabase configuration and network connectivity  
- **File sync delays**: Monitor WebSocket connection health and message delivery
- **Resource exhaustion**: Review container resource limits and scaling policies

### 10.2 Debug Commands
```bash
# Check Orchestrator logs
flyctl logs -a velocity-orchestrator

# List running machines
flyctl machines list

# Connect to container for debugging
flyctl ssh console -a machine-id

# Monitor real-time connections
# Check Supabase dashboard for active connections
```

## 11. Success Metrics

### 11.1 Performance Targets
- **Container startup time**: < 30 seconds
- **File sync latency**: < 2 seconds
- **System availability**: > 99.5%
- **Container resource utilization**: < 80% CPU/Memory

### 11.2 Monitoring Dashboards
- Container creation/destruction rates
- Real-time message throughput
- Error rates and response times
- Resource usage and costs

---

**Next Steps**: Execute this deployment plan following the phased approach outlined in the implementation plan, with careful monitoring at each stage to ensure system reliability and performance.