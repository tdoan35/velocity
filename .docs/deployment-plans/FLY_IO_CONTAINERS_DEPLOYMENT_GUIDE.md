# Fly.io Preview Containers Deployment Guide

This guide provides step-by-step instructions for deploying the Velocity preview container infrastructure on Fly.io. These containers are ephemeral environments that run user code for real-time previews.

## Overview

The preview container system consists of:
- **Container Image'**: Built via GitHub Actions, stored in GitHub Container Registry (GHCR)
- **Fly App**: `velocity-preview-containers` - manages ephemeral machines
- **Orchestrator Service**: Creates and destroys machines via Fly API

## Prerequisites

1. **Fly.io Account & CLI**
   ```bash
   # Install Fly CLI
   curl -L https://fly.io/install.sh | sh  # macOS/Linux
   # OR for Windows (PowerShell as Admin):
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   
   # Authenticate
   fly auth login
   ```

2. **GitHub Container Registry Access**
   - Repository must have GHCR write permissions
   - Personal Access Token with `packages:write` scope

3. **Required Secrets**
   - `SUPABASE_URL`: Your Supabase project URL
   - `SUPABASE_ANON_KEY`: Public anon key for Realtime
   - `FLY_API_TOKEN`: Fly.io API token for machine management

## Step 1: Create Fly App for Container Hosting

```bash
# Create the app (without deploying yet)
fly apps create velocity-preview-containers

# Or if app exists, verify:
fly apps list | grep velocity-preview-containers
```

## Step 2: Configure GitHub Actions for Container Builds

Create `.github/workflows/build-preview-container.yml`:

```yaml
name: Build and Push Preview Container

on:
  push:
    branches: [ main, master ]
    paths: 
      - 'orchestrator/preview-container/**'
      - '.github/workflows/build-preview-container.yml'
  pull_request:
    branches: [ main, master ]
    paths: 
      - 'orchestrator/preview-container/**'

env:
  REGISTRY: ghcr.io
  IMAGE_NAME: velocity/preview-container

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      packages: write

    steps:
    - name: Checkout repository
      uses: actions/checkout@v4

    - name: Log in to Container Registry
      uses: docker/login-action@v3
      with:
        registry: ${{ env.REGISTRY }}
        username: ${{ github.actor }}
        password: ${{ secrets.GHCR_TOKEN }}

    - name: Extract metadata
      id: meta
      uses: docker/metadata-action@v5
      with:
        images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
        tags: |
          type=ref,event=branch
          type=ref,event=pr
          type=sha,prefix={{branch}}-
          type=raw,value=latest,enable={{is_default_branch}}

    - name: Set up Docker Buildx
      uses: docker/setup-buildx-action@v3

    - name: Build and push Docker image
      uses: docker/build-push-action@v5
      with:
        context: orchestrator/preview-container
        push: true
        tags: ${{ steps.meta.outputs.tags }}
        labels: ${{ steps.meta.outputs.labels }}
        cache-from: type=gha
        cache-to: type=gha,mode=max
        platforms: linux/amd64

    - name: Validate container build
      run: |
        docker run --rm ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest node --version
        docker run --rm ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}:latest npm --version
```

## Step 3: Configure Container Image Access

Make the GHCR package public or configure access:

```bash
# Make package public via GitHub UI:
# 1. Go to your repository on GitHub
# 2. Click "Packages" tab
# 3. Find "preview-container" package
# 4. Go to "Package settings"
# 5. Change visibility to "Public"

# OR configure private access with token
fly secrets set GHCR_TOKEN="ghp_your_token_here" -a velocity-preview-containers
```

## Step 4: Build and Push Initial Container Image

```bash
# Navigate to preview container directory
cd orchestrator/preview-container

# Build locally for testing
docker build -t ghcr.io/velocity/preview-container:latest .

# Test the container
docker run --rm -p 8080:8080 \
  -e SUPABASE_URL="your_url" \
  -e SUPABASE_ANON_KEY="your_key" \
  -e PROJECT_ID="test" \
  ghcr.io/velocity/preview-container:latest

# Push to GHCR (if GitHub Actions isn't set up yet)
echo $GHCR_TOKEN | docker login ghcr.io -u YOUR_USERNAME --password-stdin
docker push ghcr.io/velocity/preview-container:latest
```

## Step 5: Configure Fly App for Machine Creation

The `velocity-preview-containers` app serves as a "machine pool" - it doesn't run persistent services, but provides the context for creating ephemeral machines.

Create `orchestrator/preview-container/fly.toml` for machine configuration:

```toml
# This fly.toml defines the machine configuration template
# It's not used for deployment, but as a reference for the orchestrator

app = "velocity-preview-containers"
primary_region = "ord"

[build]
  image = "ghcr.io/velocity/preview-container:latest"

[env]
  NODE_ENV = "production"
  PORT = "8080"

# Machine configuration template
[[vm]]
  memory = '512mb'
  cpu_kind = 'shared'
  cpus = 1

# Internal networking for machine-to-machine communication
[[services]]
  internal_port = 8080
  protocol = "tcp"
  auto_stop_machines = true
  auto_start_machines = true

  [[services.ports]]
    port = 80
    handlers = ["http"]
    force_https = true

  [[services.ports]]
    port = 443
    handlers = ["http", "tls"]

  [services.concurrency]
    type = "connections"
    soft_limit = 20
    hard_limit = 25

  [[services.http_checks]]
    interval = "15s"
    grace_period = "5s"
    method = "GET"
    path = "/health"
    protocol = "http"
    timeout = "10s"

# Resource limits for security
[experimental]
  cmd = ["node", "entrypoint.js"]
  entrypoint = ["node", "entrypoint.js"]

# Security: No persistent volumes
# Machines are ephemeral and stateless
```

## Step 6: Test Container Deployment via API

The orchestrator creates machines programmatically. Test this manually first:

```bash
# Set your Fly API token
export FLY_API_TOKEN="your_fly_token_here"

# Create a test machine
curl -X POST \
  -H "Authorization: Bearer $FLY_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.machines.dev/v1/apps/velocity-preview-containers/machines" \
  -d '{
    "config": {
      "image": "ghcr.io/velocity/preview-container:latest",
      "env": {
        "SUPABASE_URL": "your_supabase_url",
        "SUPABASE_ANON_KEY": "your_anon_key",
        "PROJECT_ID": "test-project"
      },
      "guest": {
        "cpu_kind": "shared",
        "cpus": 1,
        "memory_mb": 512
      },
      "services": [
        {
          "ports": [
            {
              "port": 443,
              "handlers": ["tls", "http"]
            },
            {
              "port": 80,
              "handlers": ["http"]
            }
          ],
          "protocol": "tcp",
          "internal_port": 8080
        }
      ]
    }
  }'

# List machines
curl -H "Authorization: Bearer $FLY_API_TOKEN" \
  "https://api.machines.dev/v1/apps/velocity-preview-containers/machines"

# Get specific machine status
curl -H "Authorization: Bearer $FLY_API_TOKEN" \
  "https://api.machines.dev/v1/apps/velocity-preview-containers/machines/MACHINE_ID"

# Stop and destroy machine
curl -X POST -H "Authorization: Bearer $FLY_API_TOKEN" \
  "https://api.machines.dev/v1/apps/velocity-preview-containers/machines/MACHINE_ID/stop"

curl -X DELETE -H "Authorization: Bearer $FLY_API_TOKEN" \
  "https://api.machines.dev/v1/apps/velocity-preview-containers/machines/MACHINE_ID"
```

## Step 7: Orchestrator Configuration

Update your orchestrator's `.env` file with the container configuration:

```env
# Fly.io Container Configuration
FLY_API_TOKEN="your_fly_token_here"
FLY_APP_NAME="velocity-preview-containers"
PREVIEW_CONTAINER_IMAGE="ghcr.io/velocity/preview-container:latest"

# Container Resource Limits
CONTAINER_MEMORY_MB=512
CONTAINER_CPU_COUNT=1
CONTAINER_CPU_KIND="shared"

# Container Networking
CONTAINER_INTERNAL_PORT=8080
CONTAINER_TIMEOUT_SECONDS=300

# Container Lifecycle
MAX_CONTAINERS_PER_USER=3
MAX_CONTAINER_LIFETIME_MINUTES=60
CONTAINER_CLEANUP_INTERVAL_MINUTES=5
```

## Step 8: Production Deployment Checklist

### Pre-deployment Verification

- [ ] **GitHub Actions** builds and pushes container images successfully
- [ ] **GHCR Access** container image is accessible from Fly.io
- [ ] **Fly App** `velocity-preview-containers` created and accessible
- [ ] **API Token** Fly.io token has machine creation permissions
- [ ] **Network Access** container can reach Supabase and external APIs

### Security Configuration

```bash
# Set production secrets for the container app context
fly secrets set SUPABASE_URL="your_production_url" -a velocity-preview-containers
fly secrets set SUPABASE_ANON_KEY="your_production_key" -a velocity-preview-containers

# Configure resource limits in orchestrator
fly secrets set MAX_CONTAINERS_PER_USER="3" -a velocity-orchestrator
fly secrets set CONTAINER_MEMORY_LIMIT="512" -a velocity-orchestrator
```

### Monitoring Setup

```bash
# Enable Fly.io metrics for container app
fly dashboard -a velocity-preview-containers

# Check machine creation and destruction patterns
curl -H "Authorization: Bearer $FLY_API_TOKEN" \
  "https://api.machines.dev/v1/apps/velocity-preview-containers/machines" | jq length
```

## Step 9: Testing the Complete Flow

### Automated Test Script

Create `test-container-deployment.sh`:

```bash
#!/bin/bash
set -e

echo "🧪 Testing Velocity Preview Container Deployment"

# Test 1: Container image pull
echo "1. Testing container image access..."
docker pull ghcr.io/velocity/preview-container:latest
echo "✅ Container image accessible"

# Test 2: Machine creation via API
echo "2. Testing machine creation..."
MACHINE_RESPONSE=$(curl -s -X POST \
  -H "Authorization: Bearer $FLY_API_TOKEN" \
  -H "Content-Type: application/json" \
  "https://api.machines.dev/v1/apps/velocity-preview-containers/machines" \
  -d '{
    "config": {
      "image": "ghcr.io/velocity/preview-container:latest",
      "env": {
        "SUPABASE_URL": "'$SUPABASE_URL'",
        "SUPABASE_ANON_KEY": "'$SUPABASE_ANON_KEY'",
        "PROJECT_ID": "test-deployment"
      },
      "guest": {
        "cpu_kind": "shared",
        "cpus": 1,
        "memory_mb": 256
      }
    }
  }')

MACHINE_ID=$(echo $MACHINE_RESPONSE | jq -r '.id')
echo "✅ Machine created: $MACHINE_ID"

# Test 3: Wait for machine to be ready
echo "3. Waiting for machine to be ready..."
sleep 30

MACHINE_STATUS=$(curl -s -H "Authorization: Bearer $FLY_API_TOKEN" \
  "https://api.machines.dev/v1/apps/velocity-preview-containers/machines/$MACHINE_ID" | jq -r '.state')

echo "Machine status: $MACHINE_STATUS"

# Test 4: Clean up test machine
echo "4. Cleaning up test machine..."
curl -s -X DELETE -H "Authorization: Bearer $FLY_API_TOKEN" \
  "https://api.machines.dev/v1/apps/velocity-preview-containers/machines/$MACHINE_ID"

echo "✅ Test machine destroyed"
echo "🎉 Container deployment test completed successfully!"
```

Run the test:
```bash
chmod +x test-container-deployment.sh
./test-container-deployment.sh
```

## Step 10: Production Monitoring

Set up monitoring for container lifecycle:

```bash
# Monitor active machines
watch -n 30 'curl -s -H "Authorization: Bearer $FLY_API_TOKEN" \
  "https://api.machines.dev/v1/apps/velocity-preview-containers/machines" | jq length'

# Check for stuck machines (older than 1 hour)
curl -s -H "Authorization: Bearer $FLY_API_TOKEN" \
  "https://api.machines.dev/v1/apps/velocity-preview-containers/machines" | \
  jq '.[] | select(.created_at | fromdateiso8601 < (now - 3600)) | {id, created_at, state}'

# Monitor resource usage
fly dashboard -a velocity-preview-containers
```

## Security Considerations

1. **Image Security**
   - Use minimal base images (node:alpine)
   - Scan images for vulnerabilities
   - Regular security updates

2. **Network Isolation**
   - Containers can only access whitelisted domains
   - No inter-container communication
   - Firewall rules for outbound traffic

3. **Resource Limits**
   - CPU and memory limits prevent abuse
   - Automatic termination after timeout
   - Maximum containers per user

4. **Access Control**
   - API tokens with minimal required permissions
   - Container images require authentication
   - User session validation

## Troubleshooting

### Common Issues

1. **Machine Creation Fails**
   ```bash
   # Check Fly.io API permissions
   curl -H "Authorization: Bearer $FLY_API_TOKEN" \
     "https://api.machines.dev/v1/apps/velocity-preview-containers"
   
   # Verify image accessibility
   docker pull ghcr.io/velocity/preview-container:latest
   ```

2. **Container Won't Start**
   ```bash
   # Check machine logs
   fly logs -a velocity-preview-containers -i $MACHINE_ID
   
   # Test container locally
   docker run --rm -p 8080:8080 \
     -e SUPABASE_URL="$SUPABASE_URL" \
     -e SUPABASE_ANON_KEY="$SUPABASE_ANON_KEY" \
     ghcr.io/velocity/preview-container:latest
   ```

3. **Networking Issues**
   ```bash
   # Check container connectivity
   fly ssh console -a velocity-preview-containers -s $MACHINE_ID
   # Inside container:
   curl -I https://api.supabase.io
   ```

## Next Steps

After successful container deployment:

1. **✅ Container Infrastructure** - Deployed and tested
2. **🔄 Orchestrator Integration** - Update orchestrator to use deployed containers
3. **📊 Monitoring Setup** - Implement comprehensive monitoring
4. **🧪 Load Testing** - Test with multiple concurrent containers
5. **🚀 Production Launch** - Enable for real users

This guide ensures your preview containers are properly deployed on Fly.io and integrated with the orchestrator service for seamless real-time preview functionality.