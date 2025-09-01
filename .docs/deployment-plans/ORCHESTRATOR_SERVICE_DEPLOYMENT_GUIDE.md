# Orchestrator Service Deployment Guide

This guide provides step-by-step instructions for deploying the Velocity Orchestrator Service to Fly.io.

## Prerequisites

1. **Fly CLI Installation**
   ```bash
   # Install Fly CLI (choose your platform)
   # Windows (PowerShell as Administrator)
   powershell -Command "iwr https://fly.io/install.ps1 -useb | iex"
   
   # macOS/Linux
   curl -L https://fly.io/install.sh | sh
   
   # Verify installation
   fly version
   ```

2. **Fly.io Account Setup**
   ```bash
   # Sign up or log in to Fly.io
   fly auth signup  # or fly auth login
   
   # Verify authentication
   fly auth whoami
   ```

3. **Required Environment Variables**
   Create a `.env` file in the orchestrator directory with the following variables:
   ```env
   # Supabase Configuration
   SUPABASE_URL=your_supabase_url_here
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key_here
   SUPABASE_ANON_KEY=your_supabase_anon_key_here
   
   # Fly.io Configuration
   FLY_API_TOKEN="FlyV1 fm2_lJPECAAAAAAACfEixBCKKPUJJZ8vbfFDHM8bM5VjwrVodHRwczovL2FwaS5mbHkuaW8vdjGUAJLOABMrVx8Lk7lodHRwczovL2FwaS5mbHkuaW8vYWFhL3YxxDxFFz9r159B4LyqcXtx+hM6bkKY6PY/hy01GOfm9ifSrJ6aWLM60Vtgb1mZo04k0vOXbCWbslVeTjnfCYnETliLglj/fkUOVOaXh+MjFvdi/Vz4jQoLF+iJjrDbzhtouPkGf3zDRlqbeEN7qjG5ApgtbGwXhANL9mTK3QpJmwv2RwfFXryPQ0t9Q/rupMQgGMkXgyNZKTyqBKxY6w17sa6B0Ow8UjHyMpGsKXj9dLM=,fm2_lJPETliLglj/fkUOVOaXh+MjFvdi/Vz4jQoLF+iJjrDbzhtouPkGf3zDRlqbeEN7qjG5ApgtbGwXhANL9mTK3QpJmwv2RwfFXryPQ0t9Q/rupMQQvEKS0pRayGRTV4ClXVnRVcO5aHR0cHM6Ly9hcGkuZmx5LmlvL2FhYS92MZgEks5os9UKzwAAAAEkq/MoF84AEmxlCpHOABJsZQzEEGtVaQY/ZvqqTYrHH7hn1/7EIH5SM0JYmDEGSsLpgXG6dUWP3FSTHLEJiI136OPW10MW"
   FLY_APP_NAME=velocity-preview-containers
   PREVIEW_CONTAINER_IMAGE=ghcr.io/velocity/preview-container:latest
   
   # Server Configuration
   PORT=8080
   NODE_ENV=production
   ADMIN_TOKEN=generate_secure_random_token_here
   
   # CORS Configuration
   ALLOWED_ORIGINS=https://your-frontend-domain.com,https://velocity-app.vercel.app
   ```

## Deployment Steps

### Step 1: Build and Test Locally

```bash
cd orchestrator

# Install dependencies
npm install

# Build TypeScript
npm run build

# Test the build
npm start

# Run tests
npm test
```

### Step 2: Initialize Fly App

```bash
# Navigate to orchestrator directory
cd orchestrator

# Initialize Fly app (this will use the existing fly.toml)
fly apps create velocity-orchestrator

# Alternatively, if the app already exists:
fly apps list | grep velocity-orchestrator
```

### Step 3: Configure Secrets

```bash
# Set required environment variables as secrets
fly secrets set SUPABASE_URL="your_supabase_url_here"
fly secrets set SUPABASE_SERVICE_ROLE_KEY="your_supabase_service_role_key_here"
fly secrets set SUPABASE_ANON_KEY="your_supabase_anon_key_here"
fly secrets set FLY_API_TOKEN="your_fly_api_token_here"
fly secrets set ADMIN_TOKEN="generate_secure_random_token_here"
fly secrets set ALLOWED_ORIGINS="https://your-frontend-domain.com,https://velocity-app.vercel.app"

# Verify secrets are set
fly secrets list
```

### Step 4: Deploy the Application

```bash
# Build and deploy
fly deploy

# Monitor deployment
fly logs

# Check app status
fly status

# Test health endpoint
fly open
```

### Step 5: Verify Deployment

1. **Health Check**
   ```bash
   curl https://velocity-orchestrator.fly.dev/
   ```
   Should return:
   ```json
   {
     "success": true,
     "message": "Velocity Orchestrator Service",
     "version": "1.0.0",
     "environment": "production"
   }
   ```

2. **API Endpoints**
   Test the main API endpoints:
   ```bash
   # Health endpoint
   curl https://velocity-orchestrator.fly.dev/api/health
   
   # Sessions endpoint (requires authentication)
   curl -X POST https://velocity-orchestrator.fly.dev/api/sessions/start \
     -H "Content-Type: application/json" \
     -H "Authorization: Bearer your_admin_token" \
     -d '{"projectId": "test-project-id"}'
   ```

## Configuration Details

### Fly.toml Configuration

The `fly.toml` file is already configured with:
- **App Name**: `velocity-orchestrator`
- **Primary Region**: `ord` (Chicago)
- **VM Configuration**: 1 CPU, 512MB RAM
- **Port Configuration**: Internal port 8080, external ports 80/443
- **Auto-scaling**: Minimum 1 machine, auto-start enabled

### Dockerfile

The Dockerfile implements:
- **Multi-stage build** for optimized production image
- **Security**: Non-root user (orchestrator:nodejs)
- **Health checks** for monitoring
- **Production optimizations**: Alpine Linux, minimal dependencies

### Security Configuration

1. **Authentication**: Admin token required for API access
2. **CORS**: Configured for specific frontend origins
3. **Security Headers**: Helmet middleware with CSP
4. **Rate Limiting**: Trust proxy configuration for accurate client IPs
5. **Container Isolation**: Non-root user, minimal attack surface

## Monitoring and Maintenance

### Logs and Monitoring

```bash
# View live logs
fly logs

# View logs for specific instance
fly logs -a velocity-orchestrator

# Check app metrics
fly metrics

# Check app status
fly status
```

### Scaling

```bash
# Scale up/down
fly scale count 2  # Run 2 instances
fly scale count 1  # Back to 1 instance

# Scale memory
fly scale memory 1024  # 1GB RAM
```

### Updates and Rollbacks

```bash
# Deploy new version
fly deploy

# View deployment history
fly releases

# Rollback if needed
fly releases rollback <release_number>
```

## Troubleshooting

### Common Issues

1. **App fails to start**
   - Check logs: `fly logs`
   - Verify environment variables: `fly secrets list`
   - Test locally: `npm start`

2. **Database connection issues**
   - Verify Supabase credentials
   - Check firewall/network settings
   - Test connection from local environment

3. **Container provisioning fails**
   - Check Fly.io API token permissions
   - Verify GHCR image is accessible
   - Test Fly.io API endpoints

### Health Checks

The service includes built-in health checks:
- **Startup probe**: 5s initial delay, 3 retries
- **Liveness probe**: 30s interval, 3s timeout
- **Readiness probe**: HTTP GET to localhost:8080

### Resource Limits

Current configuration:
- **CPU**: 1 shared CPU
- **Memory**: 512MB RAM
- **Concurrent connections**: 20 soft limit, 25 hard limit

## Post-Deployment Tasks

1. **Update Frontend Configuration**
   Update your frontend environment variables to point to the deployed orchestrator:
   ```env
   NEXT_PUBLIC_ORCHESTRATOR_URL=https://velocity-orchestrator.fly.dev
   ```

2. **Test End-to-End Flow**
   - Create a preview session from the frontend
   - Verify container provisioning
   - Test real-time communication
   - Verify container cleanup

3. **Set up Monitoring**
   - Configure log aggregation
   - Set up alerts for service failures
   - Monitor resource usage and scaling needs

## Security Considerations

1. **API Token Rotation**
   - Regularly rotate the admin token
   - Use different tokens for different environments

2. **CORS Configuration**
   - Restrict origins to your production domains
   - Remove localhost origins from production

3. **Resource Monitoring**
   - Monitor for suspicious resource usage
   - Set up alerts for unusual container creation patterns

## Next Steps

After successful deployment:
1. ✅ Orchestrator service deployed and running
2. 🔄 Test integration with frontend
3. 📊 Set up monitoring and alerting
4. 🔧 Configure GitHub Actions for CI/CD (Task 29.12)
5. 🚀 Remove legacy Appetize.io integration (Task 29.13)