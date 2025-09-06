import { Counter, Histogram, Gauge, Registry } from 'prom-client';
declare const previewRegistry: Registry<"text/plain; version=0.0.4; charset=utf-8">;
export declare const sessionCreatedCounter: Counter<"status" | "tier" | "routing_type">;
export declare const sessionDurationHistogram: Histogram<"tier" | "routing_type">;
export declare const activeSessionsGauge: Gauge<"tier" | "routing_type">;
export declare const containerStartupHistogram: Histogram<"status" | "routing_type">;
export declare const wsConnectionsGauge: Gauge<"routing_type" | "session_id">;
export declare const requestLatencyHistogram: Histogram<"method" | "path" | "routing_type" | "status_code">;
export declare const dnsResolutionHistogram: Histogram<"domain">;
export declare const resourceLoadFailureCounter: Counter<"routing_type" | "resource_type" | "error_code">;
export declare const routingTypeCounter: Counter<"type">;
export declare const sessionErrorCounter: Counter<"tier" | "routing_type" | "error_type">;
export declare function getRoutingType(): 'subdomain' | 'path';
export declare class SessionMetrics {
    private startTime;
    private sessionId;
    private routingType;
    private tier;
    constructor(sessionId: string, tier?: string);
    recordContainerStartup(success: boolean): void;
    recordRequest(method: string, path: string, statusCode: number, latency: number): void;
    recordResourceLoadFailure(resourceType: string, errorCode: string): void;
    recordWsConnection(connected: boolean): void;
    recordDnsResolution(domain: string, duration: number): void;
    end(reason?: 'normal' | 'error' | 'timeout'): void;
}
export { previewRegistry };
export declare function getMetricsAsJson(): Promise<{
    routingType: "path" | "subdomain";
    timestamp: number;
    metrics: import("prom-client").MetricObjectWithValues<import("prom-client").MetricValue<string>>[];
}>;
export declare function getMetricsAsText(): Promise<string>;
//# sourceMappingURL=preview-metrics.d.ts.map