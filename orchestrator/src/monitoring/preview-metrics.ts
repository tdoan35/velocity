import { Counter, Histogram, Gauge, Registry } from 'prom-client';

// Create a registry for preview metrics
const previewRegistry = new Registry();

// Session creation metrics
export const sessionCreatedCounter = new Counter({
  name: 'preview_session_created_total',
  help: 'Total number of preview sessions created',
  labelNames: ['routing_type', 'status', 'tier'],
  registers: [previewRegistry],
});

// Session duration metrics
export const sessionDurationHistogram = new Histogram({
  name: 'preview_session_duration_seconds',
  help: 'Duration of preview sessions in seconds',
  labelNames: ['routing_type', 'tier'],
  buckets: [30, 60, 120, 300, 600, 1800, 3600], // 30s, 1m, 2m, 5m, 10m, 30m, 1h
  registers: [previewRegistry],
});

// Active sessions gauge
export const activeSessionsGauge = new Gauge({
  name: 'preview_active_sessions',
  help: 'Number of currently active preview sessions',
  labelNames: ['routing_type', 'tier'],
  registers: [previewRegistry],
});

// Container startup time
export const containerStartupHistogram = new Histogram({
  name: 'preview_container_startup_seconds',
  help: 'Time taken to start a preview container',
  labelNames: ['routing_type', 'status'],
  buckets: [5, 10, 20, 30, 45, 60, 90, 120], // up to 2 minutes
  registers: [previewRegistry],
});

// WebSocket connection metrics
export const wsConnectionsGauge = new Gauge({
  name: 'preview_ws_connections',
  help: 'Active WebSocket connections for HMR',
  labelNames: ['routing_type', 'session_id'],
  registers: [previewRegistry],
});

// Request latency for preview routes
export const requestLatencyHistogram = new Histogram({
  name: 'preview_request_latency_ms',
  help: 'Latency of preview container requests in milliseconds',
  labelNames: ['routing_type', 'method', 'path', 'status_code'],
  buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [previewRegistry],
});

// DNS resolution time (for subdomain routing)
export const dnsResolutionHistogram = new Histogram({
  name: 'preview_dns_resolution_ms',
  help: 'DNS resolution time for subdomain routing in milliseconds',
  labelNames: ['domain'],
  buckets: [1, 5, 10, 25, 50, 100, 250],
  registers: [previewRegistry],
});

// Resource loading failures
export const resourceLoadFailureCounter = new Counter({
  name: 'preview_resource_load_failures_total',
  help: 'Total number of resource loading failures',
  labelNames: ['routing_type', 'resource_type', 'error_code'],
  registers: [previewRegistry],
});

// Routing type distribution
export const routingTypeCounter = new Counter({
  name: 'preview_routing_type_usage_total',
  help: 'Usage count by routing type',
  labelNames: ['type'],
  registers: [previewRegistry],
});

// Session errors
export const sessionErrorCounter = new Counter({
  name: 'preview_session_errors_total',
  help: 'Total number of preview session errors',
  labelNames: ['routing_type', 'error_type', 'tier'],
  registers: [previewRegistry],
});

// Helper function to determine routing type
export function getRoutingType(): 'subdomain' | 'path' {
  return process.env.USE_SUBDOMAIN_ROUTING === 'true' ? 'subdomain' : 'path';
}

// Helper to track session lifecycle
export class SessionMetrics {
  private startTime: number;
  private sessionId: string;
  private routingType: 'subdomain' | 'path';
  private tier: string;

  constructor(sessionId: string, tier: string = 'free') {
    this.sessionId = sessionId;
    this.startTime = Date.now();
    this.routingType = getRoutingType();
    this.tier = tier;
    
    // Increment counters
    sessionCreatedCounter.labels(this.routingType, 'started', this.tier).inc();
    activeSessionsGauge.labels(this.routingType, this.tier).inc();
    routingTypeCounter.labels(this.routingType).inc();
  }

  recordContainerStartup(success: boolean) {
    const duration = (Date.now() - this.startTime) / 1000;
    containerStartupHistogram
      .labels(this.routingType, success ? 'success' : 'failure')
      .observe(duration);
    
    if (success) {
      sessionCreatedCounter.labels(this.routingType, 'active', this.tier).inc();
    } else {
      sessionErrorCounter.labels(this.routingType, 'startup_failure', this.tier).inc();
    }
  }

  recordRequest(method: string, path: string, statusCode: number, latency: number) {
    requestLatencyHistogram
      .labels(this.routingType, method, path, statusCode.toString())
      .observe(latency);
  }

  recordResourceLoadFailure(resourceType: string, errorCode: string) {
    resourceLoadFailureCounter
      .labels(this.routingType, resourceType, errorCode)
      .inc();
  }

  recordWsConnection(connected: boolean) {
    if (connected) {
      wsConnectionsGauge.labels(this.routingType, this.sessionId).inc();
    } else {
      wsConnectionsGauge.labels(this.routingType, this.sessionId).dec();
    }
  }

  recordDnsResolution(domain: string, duration: number) {
    if (this.routingType === 'subdomain') {
      dnsResolutionHistogram.labels(domain).observe(duration);
    }
  }

  end(reason: 'normal' | 'error' | 'timeout' = 'normal') {
    const duration = (Date.now() - this.startTime) / 1000;
    sessionDurationHistogram.labels(this.routingType, this.tier).observe(duration);
    activeSessionsGauge.labels(this.routingType, this.tier).dec();
    
    if (reason === 'error') {
      sessionErrorCounter.labels(this.routingType, 'session_error', this.tier).inc();
    } else if (reason === 'timeout') {
      sessionErrorCounter.labels(this.routingType, 'session_timeout', this.tier).inc();
    }
  }
}

// Export the registry for use in metrics endpoint
export { previewRegistry };

// Utility to get all metrics as JSON
export async function getMetricsAsJson() {
  const metrics = await previewRegistry.getMetricsAsJSON();
  return {
    routingType: getRoutingType(),
    timestamp: Date.now(),
    metrics: metrics,
  };
}

// Utility to get metrics in Prometheus format
export async function getMetricsAsText() {
  return previewRegistry.metrics();
}