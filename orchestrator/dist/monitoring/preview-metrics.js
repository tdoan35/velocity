"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.previewRegistry = exports.SessionMetrics = exports.sessionErrorCounter = exports.routingTypeCounter = exports.resourceLoadFailureCounter = exports.dnsResolutionHistogram = exports.requestLatencyHistogram = exports.wsConnectionsGauge = exports.containerStartupHistogram = exports.activeSessionsGauge = exports.sessionDurationHistogram = exports.sessionCreatedCounter = void 0;
exports.getRoutingType = getRoutingType;
exports.getMetricsAsJson = getMetricsAsJson;
exports.getMetricsAsText = getMetricsAsText;
const prom_client_1 = require("prom-client");
// Create a registry for preview metrics
const previewRegistry = new prom_client_1.Registry();
exports.previewRegistry = previewRegistry;
// Session creation metrics
exports.sessionCreatedCounter = new prom_client_1.Counter({
    name: 'preview_session_created_total',
    help: 'Total number of preview sessions created',
    labelNames: ['routing_type', 'status', 'tier'],
    registers: [previewRegistry],
});
// Session duration metrics
exports.sessionDurationHistogram = new prom_client_1.Histogram({
    name: 'preview_session_duration_seconds',
    help: 'Duration of preview sessions in seconds',
    labelNames: ['routing_type', 'tier'],
    buckets: [30, 60, 120, 300, 600, 1800, 3600], // 30s, 1m, 2m, 5m, 10m, 30m, 1h
    registers: [previewRegistry],
});
// Active sessions gauge
exports.activeSessionsGauge = new prom_client_1.Gauge({
    name: 'preview_active_sessions',
    help: 'Number of currently active preview sessions',
    labelNames: ['routing_type', 'tier'],
    registers: [previewRegistry],
});
// Container startup time
exports.containerStartupHistogram = new prom_client_1.Histogram({
    name: 'preview_container_startup_seconds',
    help: 'Time taken to start a preview container',
    labelNames: ['routing_type', 'status'],
    buckets: [5, 10, 20, 30, 45, 60, 90, 120], // up to 2 minutes
    registers: [previewRegistry],
});
// WebSocket connection metrics
exports.wsConnectionsGauge = new prom_client_1.Gauge({
    name: 'preview_ws_connections',
    help: 'Active WebSocket connections for HMR',
    labelNames: ['routing_type', 'session_id'],
    registers: [previewRegistry],
});
// Request latency for preview routes
exports.requestLatencyHistogram = new prom_client_1.Histogram({
    name: 'preview_request_latency_ms',
    help: 'Latency of preview container requests in milliseconds',
    labelNames: ['routing_type', 'method', 'path', 'status_code'],
    buckets: [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [previewRegistry],
});
// DNS resolution time (for subdomain routing)
exports.dnsResolutionHistogram = new prom_client_1.Histogram({
    name: 'preview_dns_resolution_ms',
    help: 'DNS resolution time for subdomain routing in milliseconds',
    labelNames: ['domain'],
    buckets: [1, 5, 10, 25, 50, 100, 250],
    registers: [previewRegistry],
});
// Resource loading failures
exports.resourceLoadFailureCounter = new prom_client_1.Counter({
    name: 'preview_resource_load_failures_total',
    help: 'Total number of resource loading failures',
    labelNames: ['routing_type', 'resource_type', 'error_code'],
    registers: [previewRegistry],
});
// Routing type distribution
exports.routingTypeCounter = new prom_client_1.Counter({
    name: 'preview_routing_type_usage_total',
    help: 'Usage count by routing type',
    labelNames: ['type'],
    registers: [previewRegistry],
});
// Session errors
exports.sessionErrorCounter = new prom_client_1.Counter({
    name: 'preview_session_errors_total',
    help: 'Total number of preview session errors',
    labelNames: ['routing_type', 'error_type', 'tier'],
    registers: [previewRegistry],
});
// Helper function to determine routing type
function getRoutingType() {
    return process.env.USE_SUBDOMAIN_ROUTING === 'true' ? 'subdomain' : 'path';
}
// Helper to track session lifecycle
class SessionMetrics {
    constructor(sessionId, tier = 'free') {
        this.sessionId = sessionId;
        this.startTime = Date.now();
        this.routingType = getRoutingType();
        this.tier = tier;
        // Increment counters
        exports.sessionCreatedCounter.labels(this.routingType, 'started', this.tier).inc();
        exports.activeSessionsGauge.labels(this.routingType, this.tier).inc();
        exports.routingTypeCounter.labels(this.routingType).inc();
    }
    recordContainerStartup(success) {
        const duration = (Date.now() - this.startTime) / 1000;
        exports.containerStartupHistogram
            .labels(this.routingType, success ? 'success' : 'failure')
            .observe(duration);
        if (success) {
            exports.sessionCreatedCounter.labels(this.routingType, 'active', this.tier).inc();
        }
        else {
            exports.sessionErrorCounter.labels(this.routingType, 'startup_failure', this.tier).inc();
        }
    }
    recordRequest(method, path, statusCode, latency) {
        exports.requestLatencyHistogram
            .labels(this.routingType, method, path, statusCode.toString())
            .observe(latency);
    }
    recordResourceLoadFailure(resourceType, errorCode) {
        exports.resourceLoadFailureCounter
            .labels(this.routingType, resourceType, errorCode)
            .inc();
    }
    recordWsConnection(connected) {
        if (connected) {
            exports.wsConnectionsGauge.labels(this.routingType, this.sessionId).inc();
        }
        else {
            exports.wsConnectionsGauge.labels(this.routingType, this.sessionId).dec();
        }
    }
    recordDnsResolution(domain, duration) {
        if (this.routingType === 'subdomain') {
            exports.dnsResolutionHistogram.labels(domain).observe(duration);
        }
    }
    end(reason = 'normal') {
        const duration = (Date.now() - this.startTime) / 1000;
        exports.sessionDurationHistogram.labels(this.routingType, this.tier).observe(duration);
        exports.activeSessionsGauge.labels(this.routingType, this.tier).dec();
        if (reason === 'error') {
            exports.sessionErrorCounter.labels(this.routingType, 'session_error', this.tier).inc();
        }
        else if (reason === 'timeout') {
            exports.sessionErrorCounter.labels(this.routingType, 'session_timeout', this.tier).inc();
        }
    }
}
exports.SessionMetrics = SessionMetrics;
// Utility to get all metrics as JSON
async function getMetricsAsJson() {
    const metrics = await previewRegistry.getMetricsAsJSON();
    return {
        routingType: getRoutingType(),
        timestamp: Date.now(),
        metrics: metrics,
    };
}
// Utility to get metrics in Prometheus format
async function getMetricsAsText() {
    return previewRegistry.metrics();
}
//# sourceMappingURL=preview-metrics.js.map