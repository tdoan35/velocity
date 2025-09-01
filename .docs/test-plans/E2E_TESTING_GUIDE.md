# End-to-End Testing Guide for Velocity Preview Orchestration Service

This guide provides comprehensive instructions for testing the real-time preview orchestration system end-to-end.

## Overview

The Velocity preview system consists of multiple components that must work together:

1. **Frontend React App** (Port 5173) - User interface
2. **Orchestrator Service** (Port 8080) - Container management API  
3. **Supabase** - Database and Realtime channels
4. **Fly.io** - Container hosting platform
5. **Preview Containers** - Dynamic port assignment

## Prerequisites

### Required Services
- ✅ Supabase project with preview_sessions tables
- ✅ Fly.io account with API token
- ✅ Docker for local container testing
- ✅ Node.js 18+ for running services

### Environment Setup
```bash
# Frontend (.env)
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_ORCHESTRATOR_URL=http://localhost:8080

# Orchestrator (.env)
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
FLY_API_TOKEN=your_fly_api_token
FLY_APP_NAME=velocity-preview-containers
MONITORING_WEBHOOK_URL=https://your-webhook-url.com/alerts
```

## Testing Phases

### Phase 1: Component Testing
 
#### 1.1 Orchestrator Service Health
```bash
# Start orchestrator
cd orchestrator
npm run dev

# Test health endpoint
curl http://localhost:8080/api/health

# Expected response:
{
  "success": true,
  "data": {
    "status": "healthy",
    "timestamp": "2025-08-31T...",
    "version": "1.0.0"
  }
}
```

#### 1.2 Database Connection
```bash
# Test monitoring dashboard
curl -H "Authorization: Bearer your_jwt_token" \
  http://localhost:8080/api/monitoring/health

# Expected response:
{
  "success": true,
  "data": {
    "status": "healthy",
    "activeAlerts": 0,
    "criticalAlerts": 0,
    "recentMetrics": {...},
    "uptime": 123.456
  }
}
```

#### 1.3 Frontend Connection
```bash
# Start frontend
cd frontend
npm run dev

# Visit http://localhost:5173
# Check browser console for connection errors
# Verify Supabase client initialization
```

### Phase 2: API Integration Testing

#### 2.1 Session Creation API
```bash
# Create a preview session
curl -X POST http://localhost:8080/api/sessions/start \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-project-123",
    "userId": "test-user-456",
    "tier": "free"
  }'

# Expected response:
{
  "success": true,
  "data": {
    "sessionId": "uuid-here",
    "containerId": "preview-abc12345",
    "containerUrl": "https://preview-abc12345.fly.dev",
    "status": "active"
  }
}
```

#### 2.2 Session Status Monitoring
```bash
# Check session status
curl -H "Authorization: Bearer your_jwt_token" \
  http://localhost:8080/api/sessions/SESSION_ID/status

# Monitor machine status
curl -H "Authorization: Bearer your_jwt_token" \
  http://localhost:8080/api/machines/MACHINE_ID/status
```

#### 2.3 Session Cleanup
```bash
# Stop session
curl -X POST http://localhost:8080/api/sessions/stop \
  -H "Authorization: Bearer your_jwt_token" \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "SESSION_ID"}'
```

### Phase 3: Real-Time Communication Testing

#### 3.1 WebSocket Connection Test

Create `test-websocket.js`:
```javascript
const WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function testRealtimeChannels() {
  const sessionId = 'test-session-123';
  
  // Subscribe to preview updates
  const channel = supabase
    .channel(`preview:${sessionId}`)
    .on('*', (payload) => {
      console.log('Received update:', payload);
    })
    .subscribe();

  // Simulate code change broadcast
  await supabase
    .channel(`code:${sessionId}`)
    .send({
      type: 'broadcast',
      event: 'file_change',
      payload: {
        file: 'App.tsx',
        content: 'export default function App() { return <Text>Hello</Text>; }',
        timestamp: new Date().toISOString()
      }
    });

  setTimeout(() => channel.unsubscribe(), 5000);
}

testRealtimeChannels();
```

Run test:
```bash
node test-websocket.js
```

#### 3.2 Code Change Propagation Test

1. **Start preview session** through frontend
2. **Edit code** in Monaco editor
3. **Verify WebSocket message** sent to container
4. **Check container logs** for file update
5. **Confirm preview reload** in iframe

### Phase 4: Container Lifecycle Testing

#### 4.1 Container Creation Test
```bash
# Monitor container creation
curl -H "Authorization: Bearer your_jwt_token" \
  http://localhost:8080/api/monitoring/sessions

# Check Fly.io machines
fly machines list -a velocity-preview-containers
```

#### 4.2 Container Health Monitoring
```bash
# Check container metrics
curl -H "Authorization: Bearer your_jwt_token" \
  http://localhost:8080/api/monitoring/sessions/SESSION_ID/metrics

# Expected response includes:
# - sessionInfo
# - resourceMetrics (CPU, memory, disk, network)
# - monitoring status
```

#### 4.3 Automated Cleanup Test
```bash
# Trigger manual cleanup
curl -X POST http://localhost:8080/api/monitoring/cleanup \
  -H "Authorization: Bearer your_jwt_token"

# Check orphaned machine cleanup
curl -X POST http://localhost:8080/api/monitoring/jobs/orphan-cleanup/run \
  -H "Authorization: Bearer your_jwt_token"
```

### Phase 5: Frontend Integration Testing

#### 5.1 Project Design Page Integration

1. **Navigate to Project Design page**
   - URL: `http://localhost:5173/project/PROJECT_ID/design`
   - Verify page loads without errors

2. **Preview Panel Integration**
   - Check preview panel in sidebar
   - Verify "Start Preview" button appears
   - Test device selection dropdown

3. **Session Creation Flow**
   - Click "Start Preview" 
   - Monitor network requests in DevTools
   - Verify loading states and progress indicators
   - Check iframe src updates with container URL

4. **Real-Time Code Updates**
   - Edit code in Monaco editor
   - Verify WebSocket messages in Network tab
   - Check preview updates in iframe
   - Test multiple rapid changes

#### 5.2 Error Handling Tests

1. **Network Failures**
   - Disconnect internet during session creation
   - Verify error messages and retry logic
   - Test fallback states

2. **Container Failures**  
   - Simulate container crash (manual termination)
   - Verify reconnection attempts
   - Check error notifications to user

3. **Resource Limits**
   - Create multiple sessions to hit limits
   - Verify tier-based restrictions
   - Test queue and waiting states

### Phase 6: Performance Testing

#### 6.1 Load Testing
```bash
# Install load testing tool
npm install -g artillery

# Create load test config
cat > load-test.yml << EOF
config:
  target: 'http://localhost:8080'
  phases:
    - duration: 60
      arrivalRate: 5
  defaults:
    headers:
      Authorization: 'Bearer your_jwt_token'

scenarios:
  - name: 'Create and destroy sessions'
    flow:
      - post:
          url: '/api/sessions/start'
          json:
            projectId: 'load-test-project'
            userId: 'load-test-user'
            tier: 'free'
      - think: 30
      - post:
          url: '/api/sessions/stop'
          json:
            sessionId: '{{ sessionId }}'
EOF

# Run load test
artillery run load-test.yml
```

#### 6.2 Memory Leak Detection
```bash
# Monitor orchestrator memory usage
while true; do
  ps aux | grep "node.*orchestrator" | awk '{print $6}' 
  sleep 30
done

# Monitor container resource usage
curl -H "Authorization: Bearer your_jwt_token" \
  http://localhost:8080/api/metrics | grep memory
```

### Phase 7: Production Validation

#### 7.1 Deployment Health Check
```bash
# Check production orchestrator
curl https://your-orchestrator.fly.dev/api/health

# Verify monitoring dashboard
curl -H "Authorization: Bearer your_jwt_token" \
  https://your-orchestrator.fly.dev/api/monitoring/dashboard
```

#### 7.2 End-to-End User Journey

**Complete User Flow Test:**

1. **User Registration/Login**
   - Create account in frontend
   - Verify JWT token generation
   - Check Supabase auth integration

2. **Project Creation** 
   - Create new mobile app project
   - Verify project data in database
   - Check project listing

3. **Code Editing**
   - Open Project Design page
   - Add/edit React Native components
   - Verify code persistence

4. **Preview Session**
   - Start preview session
   - Wait for container provisioning
   - Verify preview loads in iframe

5. **Real-Time Updates**
   - Edit code in multiple files
   - Confirm instant preview updates
   - Test hot-reloading performance

6. **Session Management**
   - Check session timeout handling
   - Test manual session termination
   - Verify resource cleanup

## Automated E2E Test Suite

Create automated tests using Playwright:

```bash
# Install Playwright
npm install -D @playwright/test

# Create E2E test
cat > e2e/preview-system.spec.ts << 'EOF'
import { test, expect } from '@playwright/test';

test.describe('Preview Orchestration System', () => {
  test('complete preview session lifecycle', async ({ page, context }) => {
    // Navigate to project design
    await page.goto('/project/test-project/design');
    
    // Start preview session
    await page.click('[data-testid="start-preview-btn"]');
    await expect(page.locator('[data-testid="preview-loading"]')).toBeVisible();
    
    // Wait for container to be ready
    await page.waitForSelector('[data-testid="preview-iframe"]', { timeout: 60000 });
    
    // Test code editing and real-time updates
    await page.fill('[data-testid="code-editor"]', 'export default function App() { return <Text>Test</Text>; }');
    
    // Verify preview updates (would require iframe access or API checks)
    // This is complex due to iframe security restrictions
    
    // Stop session
    await page.click('[data-testid="stop-preview-btn"]');
    await expect(page.locator('[data-testid="preview-iframe"]')).not.toBeVisible();
  });
  
  test('error handling for failed sessions', async ({ page }) => {
    // Test with invalid configuration to trigger errors
    // Verify error states and retry mechanisms
  });
});
EOF
```

## Manual Testing Checklist

### ✅ Pre-flight Checks
- [ ] All services running (Frontend, Orchestrator, Supabase)
- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] Fly.io authentication working

### ✅ Basic Functionality
- [ ] Health endpoints responding
- [ ] User authentication working
- [ ] Project creation/loading
- [ ] Code editor functional

### ✅ Preview System
- [ ] Session creation through UI
- [ ] Container provisioning (check Fly.io dashboard)
- [ ] Preview iframe loading
- [ ] Real-time code updates
- [ ] Session termination and cleanup

### ✅ Error Scenarios
- [ ] Network interruptions
- [ ] Container failures
- [ ] Resource exhaustion
- [ ] Invalid authentication
- [ ] Database connection issues

### ✅ Performance
- [ ] Session startup time < 30 seconds
- [ ] Code change latency < 2 seconds
- [ ] Memory usage stable over time
- [ ] No resource leaks

### ✅ Monitoring
- [ ] Metrics collection working
- [ ] Alerts triggering appropriately  
- [ ] Dashboard data accurate
- [ ] Cleanup jobs running

## Troubleshooting Common Issues

### Container Won't Start
```bash
# Check Fly.io machine logs
fly logs -a velocity-preview-containers

# Check orchestrator logs
docker logs velocity-orchestrator

# Verify machine creation API
curl -H "Authorization: Bearer $FLY_API_TOKEN" \
  https://api.machines.dev/v1/apps/velocity-preview-containers/machines
```

### WebSocket Connection Fails
```bash
# Test Supabase Realtime directly
curl -H "Authorization: Bearer $SUPABASE_ANON_KEY" \
  "$SUPABASE_URL/rest/v1/rpc/test"

# Check browser console for WebSocket errors
# Verify CORS configuration in orchestrator
```

### Preview Not Updating
```bash
# Check container WebSocket connection
fly ssh console -a velocity-preview-containers
# Inside container: check WebSocket client logs

# Verify file change detection
# Check Monaco editor change events
```

This comprehensive testing approach ensures all components of the preview orchestration system work correctly together, providing confidence for production deployment.