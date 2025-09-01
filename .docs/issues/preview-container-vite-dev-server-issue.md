# Preview Container Vite Development Server Issue

## Current Problem

The Velocity preview container system is not serving Vite development server assets properly. While containers are accessible via HTTP, they return 404 errors for essential Vite dev server assets like `/@vite/client`, `/src/main.jsx`, and `/@react-refresh`, preventing proper React app loading in iframes.

## Issue Timeline

1. **Initial CSP Violation**: Fixed by adding `https://*.fly.dev` to Content Security Policy directives
2. **Assumed DNS Resolution Failure**: Initially believed container URLs were not resolving
3. **Multiple URL Pattern Attempts**: Tried various URL generation patterns without success
4. **Actual Issue Identified**: Container accessible but not serving Vite dev server properly

## Root Cause Analysis

### Architecture Issue
The `velocity-preview-containers` Fly.io app exists but lacks proper HTTP service configuration for external access to individual machines. Currently:
- Machines are created successfully and run the container code
- Machines have internal networking but no external HTTP routing
- URLs like `preview-{id}.fly.dev` or `velocity-preview-containers.fly.dev` do not resolve

### Technical Details
- **App Name**: `velocity-preview-containers`
- **Machine Creation**: Working via Fly.io Machines API
- **Container Health**: Containers start and pass health checks
- **Missing Component**: External HTTP service configuration

## Current Configuration

### Machine Creation (fly-io.ts)
```typescript
services: [
  {
    protocol: 'tcp',
    internal_port: 8080,
    ports: [
      { port: 80, handlers: ['http'] },
      { port: 443, handlers: ['http', 'tls'] }
    ]
  }
],
checks: [
  {
    type: 'http',
    port: 8080,
    method: 'get',
    path: '/health',
    grace_period: '5s',
    interval: '10s',
    timeout: '2s'
  }
]
```

### App Configuration (fly.toml)
```toml
app = 'velocity-preview-containers'
primary_region = 'ord'

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = true
  auto_start_machines = true
  min_machines_running = 0
```

## Research Findings

From Fly.io documentation:
- Individual machines in a shared app cannot be accessed via direct subdomains
- External HTTP access requires proper HTTP service routing configuration
- The pattern `{machine-id}.vm.{app-name}.fly.dev` is for internal networking only

## Potential Solutions

### Option 1: Shared App with Routing
- Configure the `velocity-preview-containers` app to route requests to specific machines
- Use URL paths or headers to identify target machines
- Example: `velocity-preview-containers.fly.dev/preview/{project-id}`

### Option 2: Individual Apps per Preview
- Create separate Fly apps for each preview container
- Each gets its own subdomain: `{project-id}.fly.dev`
- Higher resource overhead but simpler routing

### Option 3: Proxy Service
- Create a dedicated proxy/router service
- Route requests to appropriate machines based on URL patterns
- Maintain centralized control over preview routing

## Files Modified

- `frontend/index.html` - Updated CSP directives
- `frontend/vite.config.ts` - Updated CSP headers
- `orchestrator/src/services/fly-io.ts` - Machine creation configuration
- `orchestrator/preview-container/fly.toml` - App HTTP service config

## Next Steps

1. **Deploy Updated Configuration**: Deploy orchestrator with HTTP service changes
2. **Test Current Setup**: Verify if shared app routing works
3. **Implement Alternative**: If routing fails, implement Option 1 or 2 above
4. **Update URL Generation**: Modify URL pattern based on chosen solution

## Latest Reproduction (2025-09-01)

### Test Environment
- **URL**: http://localhost:5173/demo/container-preview
- **Project ID**: 550e8400-e29b-41d4-a716-446655440000
- **Session ID**: f4ad9137-91ac-419c-b430-ff00f6f290...
- **Container URL**: https://velocity-preview-containers.fly.dev

### Findings
✅ **Session Creation**: Successfully created preview session  
✅ **Container Access**: Container URL returns HTTP 200 - **Container is accessible!**  
❌ **Asset Loading**: 404 errors for Vite development server assets:
- `/@vite/client` → 404
- `/src/main.jsx` → 404  
- `/@react-refresh` → 404

### Root Cause Identified
**The issue is NOT DNS resolution failure**. The container URL resolves correctly and returns HTTP 200. The actual problem is:

**Container serves static files but not Vite development server assets**

The iframe expects a live Vite development server with hot module replacement, but the container is serving a static build or missing the development server entirely.

### Network Analysis
```
POST https://velocity-orchestrator.fly.dev/api/sessions/start → 200 ✅
GET https://velocity-preview-containers.fly.dev/ → 200 ✅
GET https://velocity-preview-containers.fly.dev/@vite/client → 404 ❌
GET https://velocity-preview-containers.fly.dev/src/main.jsx → 404 ❌
GET https://velocity-preview-containers.fly.dev/@react-refresh → 404 ❌
```

## Revised Architecture Issue

### Current Problem
The preview container is not running a proper Vite development server. Instead, it appears to be serving static files or an incomplete build.

### Expected Behavior
1. Container should run `npm run dev` or equivalent
2. Vite dev server should serve on port 8080 (internal container port)
3. Hot module replacement assets should be available
4. Real-time code changes should reflect in the preview

### Container Configuration Issues
1. **Entrypoint Issue**: Container may not be starting Vite dev server
2. **Port Mapping**: Development server may not be properly exposed
3. **Build vs Dev**: Container might be serving a build instead of dev server

## Status

- **Severity**: High - Blocks preview functionality
- **Impact**: Container accessible but not serving development server
- **Root Cause**: Container configuration issue, not DNS resolution
- **Next Step**: Fix container entrypoint to serve Vite dev server

## Related Documentation

- [Fly.io Preview Containers Deployment Guide](.docs/deployment-plans/FLY_IO_CONTAINERS_DEPLOYMENT_GUIDE.md)
- Fly.io Machines API documentation
- Container entrypoint configuration
- `orchestrator/preview-container/entrypoint.js` - Container startup script