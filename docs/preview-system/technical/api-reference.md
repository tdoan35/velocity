# Preview System API Reference

## Overview

The Velocity Preview System API provides programmatic access to mobile preview functionality through a RESTful interface. All endpoints are implemented as Supabase Edge Functions and require authentication.

## Base URL

```
https://[project-id].supabase.co/functions/v1
```

## Authentication

All API requests require authentication using a Supabase JWT token:

```typescript
headers: {
  'Authorization': 'Bearer YOUR_JWT_TOKEN',
  'Content-Type': 'application/json'
}
```

## Rate Limiting

- **Default**: 100 requests per minute per user
- **Burst**: Up to 20 requests per second
- **Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

## Endpoints

### Preview Session Management

#### Create Preview Session

Creates a new preview session for mobile app testing.

```http
POST /preview-session/create
```

**Request Body:**
```typescript
{
  projectId: string;      // Required: Project UUID
  deviceType?: string;    // Optional: Device model (default: "iphone15pro")
  osType?: 'ios' | 'android'; // Optional: OS type
  orientation?: 'portrait' | 'landscape'; // Optional: Initial orientation
  locale?: string;        // Optional: Device locale (e.g., "en-US")
  params?: Record<string, any>; // Optional: Custom parameters
}
```

**Response:**
```typescript
{
  success: boolean;
  session: {
    id: string;           // Session UUID
    publicId: string;     // Public session identifier
    appetizeUrl: string;  // Iframe URL for embedding
    websocketUrl: string; // WebSocket connection URL
    expiresAt: string;    // ISO 8601 timestamp
    device: {
      type: string;
      os: string;
      version: string;
      screenSize: { width: number; height: number };
    };
  };
  usage: {
    minutesUsed: number;
    minutesRemaining: number;
  };
}
```

**Error Responses:**
- `400` - Invalid request parameters
- `401` - Authentication required
- `403` - Quota exceeded
- `429` - Rate limit exceeded
- `503` - Service temporarily unavailable

---

#### Get Session Status

Retrieves current status and metadata for a preview session.

```http
GET /preview-session/{sessionId}
```

**Response:**
```typescript
{
  session: {
    id: string;
    status: 'initializing' | 'active' | 'idle' | 'terminated' | 'error';
    device: DeviceInfo;
    createdAt: string;
    lastActivityAt: string;
    metrics: {
      cpuUsage: number;
      memoryUsage: number;
      networkLatency: number;
      fps: number;
    };
  };
}
```

---

#### Update Session

Updates session configuration or sends commands.

```http
PUT /preview-session/{sessionId}/update
```

**Request Body:**
```typescript
{
  action: 'rotate' | 'screenshot' | 'reload' | 'terminate' | 'keep-alive';
  params?: {
    orientation?: 'portrait' | 'landscape';
    locale?: string;
    location?: { latitude: number; longitude: number };
    network?: 'wifi' | '4g' | '3g' | 'offline';
  };
}
```

---

#### Terminate Session

Gracefully terminates a preview session.

```http
DELETE /preview-session/{sessionId}
```

**Response:**
```typescript
{
  success: boolean;
  message: string;
  usage: {
    sessionDuration: number; // minutes
    totalMinutesUsed: number;
  };
}
```

### Build Management

#### Initiate Build

Starts building the React Native application.

```http
POST /build-preview/build
```

**Request Body:**
```typescript
{
  projectId: string;
  platform: 'ios' | 'android' | 'both';
  variant?: 'debug' | 'release';
  env?: Record<string, string>;
  dependencies?: {
    npm?: Record<string, string>;
    pods?: string[];
  };
}
```

**Response:**
```typescript
{
  buildId: string;
  status: 'queued' | 'building' | 'completed' | 'failed';
  estimatedTime: number; // seconds
  queuePosition?: number;
}
```

---

#### Get Build Status

Monitors build progress and retrieves results.

```http
GET /build-preview/status/{buildId}
```

**Response:**
```typescript
{
  buildId: string;
  status: BuildStatus;
  progress: number; // 0-100
  logs: string[];
  artifacts?: {
    ios?: { url: string; size: number; checksum: string };
    android?: { url: string; size: number; checksum: string };
  };
  errors?: Array<{
    code: string;
    message: string;
    file?: string;
    line?: number;
  }>;
}
```

---

#### Hot Reload Update

Applies incremental code changes without full rebuild.

```http
POST /build-preview/hot-reload
```

**Request Body:**
```typescript
{
  sessionId: string;
  changes: Array<{
    file: string;
    content: string;
    checksum: string;
  }>;
  sourceMap?: string;
}
```

### Performance Optimization

#### Warm Session Pool

Pre-allocates sessions for instant access.

```http
POST /preview-optimizer/warm-sessions
```

**Request Body:**
```typescript
{
  projectId: string;
  devices: Array<{
    type: string;
    count: number;
    priority: 'high' | 'medium' | 'low';
  }>;
  schedule?: {
    days: string[]; // ["monday", "tuesday", ...]
    hours: number[]; // [9, 10, 11, ...]
    timezone: string;
  };
}
```

---

#### Optimize Build

Optimizes build configuration for faster processing.

```http
POST /preview-optimizer/optimize-build
```

**Request Body:**
```typescript
{
  projectId: string;
  targetMetrics: {
    buildTime?: number; // max seconds
    bundleSize?: number; // max MB
    startupTime?: number; // max ms
  };
  allowedOptimizations: string[]; // ["tree-shaking", "minification", ...]
}
```

---

#### Adaptive Quality

Dynamically adjusts preview quality based on conditions.

```http
POST /preview-optimizer/adaptive-quality
```

**Request Body:**
```typescript
{
  sessionId: string;
  networkQuality: 'excellent' | 'good' | 'fair' | 'poor';
  clientCapabilities: {
    cpu: number; // 0-100
    memory: number; // MB available
    gpu: boolean;
  };
}
```

### Diagnostics & Monitoring

#### Report Error

Reports errors with diagnostic information.

```http
POST /preview-diagnostics/report-error
```

**Request Body:**
```typescript
{
  errorCode: string;
  message: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  context: {
    sessionId?: string;
    projectId?: string;
    userId?: string;
    timestamp: string;
    userAgent: string;
    stack?: string;
  };
  diagnostics?: any;
}
```

**Response:**
```typescript
{
  errorId: string;
  tracked: boolean;
  pattern?: {
    isRecurring: boolean;
    occurrences: number;
    suggestion?: string;
  };
}
```

---

#### Health Check

Performs system health verification.

```http
GET /preview-diagnostics/health-check
```

**Response:**
```typescript
{
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  checks: {
    database: HealthCheckResult;
    appetize: HealthCheckResult;
    sessionPool: HealthCheckResult & { availableSessions: number };
    errorRate: HealthCheckResult & { criticalErrors: number };
  };
}

interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  error?: string;
}
```

---

#### Generate Diagnostic Report

Creates comprehensive diagnostic report.

```http
GET /preview-diagnostics/diagnostic-report
```

**Query Parameters:**
- `session_id` (optional): Specific session to diagnose
- `include_system` (optional): Include system diagnostics

**Response:**
```typescript
{
  reportId: string;
  report: {
    timestamp: string;
    diagnostics: any;
    errorAnalytics: any;
    systemHealth: any;
    recommendations: string[];
  };
}
```

## WebSocket API

### Connection

```typescript
const ws = new WebSocket('wss://[project-id].supabase.co/realtime/v1/websocket?vsn=1.0.0');

// Authenticate
ws.send(JSON.stringify({
  topic: 'preview:' + sessionId,
  event: 'phx_join',
  payload: { token: jwtToken },
  ref: '1'
}));
```

### Events

#### Inbound Events (Client → Server)

```typescript
// User interaction
{
  event: 'interaction',
  payload: {
    type: 'tap' | 'swipe' | 'pinch' | 'rotate' | 'key';
    coordinates?: { x: number; y: number };
    gesture?: GestureData;
    key?: string;
  }
}

// Hot reload
{
  event: 'hot_reload',
  payload: {
    files: FileChange[];
  }
}

// Control command
{
  event: 'control',
  payload: {
    action: 'rotate' | 'screenshot' | 'reload';
  }
}
```

#### Outbound Events (Server → Client)

```typescript
// Frame update
{
  event: 'frame',
  payload: {
    data: string; // base64 encoded frame
    timestamp: number;
    metrics: FrameMetrics;
  }
}

// Console output
{
  event: 'console',
  payload: {
    level: 'log' | 'warn' | 'error';
    message: string;
    timestamp: number;
    source?: string;
  }
}

// Status update
{
  event: 'status',
  payload: {
    state: SessionState;
    metrics?: PerformanceMetrics;
  }
}

// Error
{
  event: 'error',
  payload: {
    code: string;
    message: string;
    recoverable: boolean;
  }
}
```

## SDK Examples

### JavaScript/TypeScript

```typescript
import { VelocityPreview } from '@velocity/preview-sdk';

const preview = new VelocityPreview({
  apiKey: 'your-api-key',
  projectId: 'your-project-id'
});

// Create session
const session = await preview.createSession({
  device: 'iphone15pro',
  orientation: 'portrait'
});

// Subscribe to events
session.on('ready', () => {
  console.log('Preview ready');
});

session.on('console', (log) => {
  console.log(`[${log.level}]`, log.message);
});

// Interact with preview
await session.tap({ x: 100, y: 200 });
await session.rotate('landscape');
await session.screenshot('screenshot.png');

// Hot reload
await session.hotReload({
  'src/App.tsx': updatedContent
});

// Cleanup
await session.terminate();
```

### React Hook

```typescript
import { useVelocityPreview } from '@velocity/preview-react';

function MyComponent() {
  const {
    session,
    status,
    error,
    createSession,
    terminateSession,
    sendInteraction
  } = useVelocityPreview({
    projectId: 'your-project-id',
    device: 'iphone15pro'
  });

  return (
    <div>
      {status === 'ready' && (
        <iframe src={session.iframeUrl} />
      )}
    </div>
  );
}
```

## Error Codes

See the [Error Reference](../troubleshooting/error-reference.md) for a complete list of error codes and their meanings.

## Best Practices

1. **Session Management**
   - Always terminate sessions when done
   - Implement proper error handling
   - Use session pooling for better performance

2. **Performance**
   - Batch hot reload updates
   - Use appropriate quality settings
   - Monitor resource usage

3. **Security**
   - Never expose API keys in client code
   - Validate all inputs
   - Use HTTPS for all communications

4. **Rate Limiting**
   - Implement exponential backoff
   - Cache responses when possible
   - Use webhooks for async operations

## Webhooks

Configure webhooks to receive async notifications:

```typescript
POST /settings/webhooks
{
  url: 'https://your-domain.com/webhook',
  events: ['session.created', 'session.terminated', 'build.completed', 'error.critical'],
  secret: 'your-webhook-secret'
}
```

## API Versioning

The API uses URL versioning. Current version: `v1`

Breaking changes will result in a new version. Deprecated versions will be supported for 6 months.

## Support

- Documentation: https://docs.velocity.dev
- API Status: https://status.velocity.dev
- Support: api-support@velocity.dev