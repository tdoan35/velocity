export interface SystemMetric {
    name: string;
    value: number;
    timestamp: Date;
    tags?: Record<string, string>;
}
export interface SystemEvent {
    type: string;
    data: any;
    timestamp: Date;
    severity?: 'info' | 'warning' | 'error' | 'critical';
}
export interface SystemAlert {
    id: string;
    type: string;
    message: string;
    severity: 'warning' | 'error' | 'critical';
    timestamp: Date;
    resolved: boolean;
    data?: any;
}
export declare class MonitoringService {
    private supabase;
    private metrics;
    private events;
    private alerts;
    private webhookUrl?;
    constructor();
    /**
     * Record a numeric metric
     */
    recordMetric(name: string, value: number, tags?: Record<string, string>): void;
    /**
     * Record a system event
     */
    recordEvent(type: string, data: any, severity?: SystemEvent['severity']): void;
    /**
     * Create a system alert
     */
    createAlert(type: string, message: string, severity: SystemAlert['severity'], data?: any): void;
    /**
     * Resolve an alert
     */
    resolveAlert(alertId: string, resolution?: string): boolean;
    /**
     * Get current system metrics
     */
    getMetrics(name?: string, limit?: number): SystemMetric[];
    /**
     * Get recent system events
     */
    getEvents(type?: string, limit?: number): SystemEvent[];
    /**
     * Get active alerts
     */
    getActiveAlerts(): SystemAlert[];
    /**
     * Get all alerts (including resolved)
     */
    getAllAlerts(limit?: number): SystemAlert[];
    /**
     * Get system health summary
     */
    getHealthSummary(): {
        status: 'healthy' | 'warning' | 'critical';
        activeAlerts: number;
        criticalAlerts: number;
        recentMetrics: Record<string, number>;
        uptime: number;
    };
    /**
     * Export metrics in Prometheus format
     */
    exportPrometheusMetrics(): string;
    /**
     * Clear old metrics and events (for memory management)
     */
    clearOldData(olderThan: Date): void;
    /**
     * Check if a metric value should trigger alerts
     */
    private checkMetricAlerts;
    /**
     * Check if a metric is significant enough to log
     */
    private isSignificantMetric;
    /**
     * Get emoji for severity level
     */
    private getSeverityEmoji;
    /**
     * Get help text for Prometheus metrics
     */
    private getMetricHelp;
    /**
     * Persist event to database
     */
    private persistEvent;
    /**
     * Persist alert to database
     */
    private persistAlert;
    /**
     * Send webhook notification for critical alerts
     */
    private sendWebhookAlert;
}
//# sourceMappingURL=monitoring.d.ts.map