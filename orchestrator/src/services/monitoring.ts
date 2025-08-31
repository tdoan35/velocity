import { createClient } from '@supabase/supabase-js';

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

export class MonitoringService {
  private supabase;
  private metrics: SystemMetric[] = [];
  private events: SystemEvent[] = [];
  private alerts: Map<string, SystemAlert> = new Map();
  private webhookUrl?: string;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    this.webhookUrl = process.env.MONITORING_WEBHOOK_URL;
  }

  /**
   * Record a numeric metric
   */
  recordMetric(name: string, value: number, tags?: Record<string, string>): void {
    const metric: SystemMetric = {
      name,
      value,
      timestamp: new Date(),
      tags,
    };

    this.metrics.push(metric);
    
    // Log significant metrics
    if (this.isSignificantMetric(name, value)) {
      console.log(`📊 Metric recorded: ${name} = ${value}`, tags || '');
    }

    // Keep only last 1000 metrics in memory
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }

    // Check for alert conditions
    this.checkMetricAlerts(metric);
  }

  /**
   * Record a system event
   */
  recordEvent(type: string, data: any, severity: SystemEvent['severity'] = 'info'): void {
    const event: SystemEvent = {
      type,
      data,
      timestamp: new Date(),
      severity,
    };

    this.events.push(event);
    
    // Log all events
    const emoji = this.getSeverityEmoji(severity);
    console.log(`${emoji} Event: ${type}`, data);

    // Keep only last 500 events in memory
    if (this.events.length > 500) {
      this.events = this.events.slice(-500);
    }

    // Create alerts for error/critical events
    if (severity === 'error' || severity === 'critical') {
      this.createAlert(type, `System event: ${type}`, severity, data);
    }

    // Persist critical events to database
    if (severity === 'critical' || severity === 'error') {
      this.persistEvent(event);
    }
  }

  /**
   * Create a system alert
   */
  createAlert(type: string, message: string, severity: SystemAlert['severity'], data?: any): void {
    const alertId = `${type}-${Date.now()}`;
    
    const alert: SystemAlert = {
      id: alertId,
      type,
      message,
      severity,
      timestamp: new Date(),
      resolved: false,
      data,
    };

    this.alerts.set(alertId, alert);
    
    const emoji = severity === 'critical' ? '🚨' : severity === 'error' ? '❌' : '⚠️';
    console.log(`${emoji} ALERT [${severity.toUpperCase()}]: ${message}`);
    
    // Send webhook notification for critical alerts
    if (severity === 'critical' && this.webhookUrl) {
      this.sendWebhookAlert(alert);
    }

    // Persist to database
    this.persistAlert(alert);
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId: string, resolution?: string): boolean {
    const alert = this.alerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      console.log(`✅ Alert resolved: ${alert.type} (${alertId})`);
      
      this.recordEvent('alert_resolved', {
        alertId,
        type: alert.type,
        resolution: resolution || 'Manual resolution',
      });
      
      return true;
    }
    return false;
  }

  /**
   * Get current system metrics
   */
  getMetrics(name?: string, limit = 100): SystemMetric[] {
    let filteredMetrics = this.metrics;
    
    if (name) {
      filteredMetrics = this.metrics.filter(m => m.name === name);
    }
    
    return filteredMetrics.slice(-limit);
  }

  /**
   * Get recent system events
   */
  getEvents(type?: string, limit = 50): SystemEvent[] {
    let filteredEvents = this.events;
    
    if (type) {
      filteredEvents = this.events.filter(e => e.type === type);
    }
    
    return filteredEvents.slice(-limit);
  }

  /**
   * Get active alerts
   */
  getActiveAlerts(): SystemAlert[] {
    return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
  }

  /**
   * Get all alerts (including resolved)
   */
  getAllAlerts(limit = 100): SystemAlert[] {
    return Array.from(this.alerts.values()).slice(-limit);
  }

  /**
   * Get system health summary
   */
  getHealthSummary(): {
    status: 'healthy' | 'warning' | 'critical';
    activeAlerts: number;
    criticalAlerts: number;
    recentMetrics: Record<string, number>;
    uptime: number;
  } {
    const activeAlerts = this.getActiveAlerts();
    const criticalAlerts = activeAlerts.filter(a => a.severity === 'critical').length;
    
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (criticalAlerts > 0) {
      status = 'critical';
    } else if (activeAlerts.length > 0) {
      status = 'warning';
    }

    // Get latest metrics
    const recentMetrics: Record<string, number> = {};
    const metricNames = ['active_sessions', 'healthy_sessions', 'warning_sessions', 'critical_sessions'];
    
    for (const name of metricNames) {
      const latestMetric = this.getMetrics(name, 1)[0];
      if (latestMetric) {
        recentMetrics[name] = latestMetric.value;
      }
    }

    return {
      status,
      activeAlerts: activeAlerts.length,
      criticalAlerts,
      recentMetrics,
      uptime: process.uptime(),
    };
  }

  /**
   * Export metrics in Prometheus format
   */
  exportPrometheusMetrics(): string {
    const output: string[] = [];
    
    // Group metrics by name
    const metricGroups = this.metrics.reduce((acc, metric) => {
      if (!acc[metric.name]) acc[metric.name] = [];
      acc[metric.name].push(metric);
      return acc;
    }, {} as Record<string, SystemMetric[]>);

    for (const [name, metrics] of Object.entries(metricGroups)) {
      const latestMetric = metrics[metrics.length - 1];
      
      // Add help and type comments
      output.push(`# HELP ${name} ${this.getMetricHelp(name)}`);
      output.push(`# TYPE ${name} gauge`);
      
      // Add metric value with tags
      let line = `${name} ${latestMetric.value}`;
      if (latestMetric.tags && Object.keys(latestMetric.tags).length > 0) {
        const tagStrings = Object.entries(latestMetric.tags)
          .map(([key, value]) => `${key}="${value}"`)
          .join(',');
        line = `${name}{${tagStrings}} ${latestMetric.value}`;
      }
      
      output.push(line);
      output.push('');
    }

    return output.join('\n');
  }

  /**
   * Clear old metrics and events (for memory management)
   */
  clearOldData(olderThan: Date): void {
    const initialMetricCount = this.metrics.length;
    const initialEventCount = this.events.length;
    
    this.metrics = this.metrics.filter(m => m.timestamp > olderThan);
    this.events = this.events.filter(e => e.timestamp > olderThan);
    
    console.log(`🧹 Cleared ${initialMetricCount - this.metrics.length} old metrics, ${initialEventCount - this.events.length} old events`);
  }

  /**
   * Check if a metric value should trigger alerts
   */
  private checkMetricAlerts(metric: SystemMetric): void {
    // Define alert thresholds
    const alertThresholds = {
      critical_sessions: { threshold: 5, severity: 'error' as const },
      active_sessions: { threshold: 50, severity: 'warning' as const },
      memory_usage_percent: { threshold: 90, severity: 'critical' as const },
      cpu_usage_percent: { threshold: 85, severity: 'warning' as const },
    };

    const config = alertThresholds[metric.name as keyof typeof alertThresholds];
    if (config && metric.value >= config.threshold) {
      this.createAlert(
        `high_${metric.name}`,
        `High ${metric.name}: ${metric.value} (threshold: ${config.threshold})`,
        config.severity,
        { metric }
      );
    }
  }

  /**
   * Check if a metric is significant enough to log
   */
  private isSignificantMetric(name: string, value: number): boolean {
    const significantMetrics = [
      'active_sessions', 'critical_sessions', 'orphaned_machines_cleaned'
    ];
    return significantMetrics.includes(name) || value > 0;
  }

  /**
   * Get emoji for severity level
   */
  private getSeverityEmoji(severity: SystemEvent['severity']): string {
    switch (severity) {
      case 'critical': return '🚨';
      case 'error': return '❌';
      case 'warning': return '⚠️';
      default: return 'ℹ️';
    }
  }

  /**
   * Get help text for Prometheus metrics
   */
  private getMetricHelp(name: string): string {
    const helpTexts: Record<string, string> = {
      active_sessions: 'Number of active preview sessions',
      healthy_sessions: 'Number of healthy preview sessions',
      warning_sessions: 'Number of sessions with warnings',
      critical_sessions: 'Number of sessions in critical state',
      orphaned_machines_cleaned: 'Number of orphaned machines cleaned up',
    };
    
    return helpTexts[name] || `System metric: ${name}`;
  }

  /**
   * Persist event to database
   */
  private async persistEvent(event: SystemEvent): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('system_events')
        .insert({
          type: event.type,
          data: event.data,
          severity: event.severity,
          timestamp: event.timestamp.toISOString(),
        });

      if (error) {
        console.error('Failed to persist event to database:', error);
      }
    } catch (error) {
      console.error('Failed to persist event:', error);
    }
  }

  /**
   * Persist alert to database
   */
  private async persistAlert(alert: SystemAlert): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('system_alerts')
        .insert({
          id: alert.id,
          type: alert.type,
          message: alert.message,
          severity: alert.severity,
          timestamp: alert.timestamp.toISOString(),
          resolved: alert.resolved,
          data: alert.data,
        });

      if (error) {
        console.error('Failed to persist alert to database:', error);
      }
    } catch (error) {
      console.error('Failed to persist alert:', error);
    }
  }

  /**
   * Send webhook notification for critical alerts
   */
  private async sendWebhookAlert(alert: SystemAlert): Promise<void> {
    if (!this.webhookUrl) return;

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'alert',
          alert: {
            id: alert.id,
            type: alert.type,
            message: alert.message,
            severity: alert.severity,
            timestamp: alert.timestamp,
            data: alert.data,
          },
          service: 'velocity-orchestrator',
        }),
      });

      if (!response.ok) {
        throw new Error(`Webhook failed with status ${response.status}`);
      }

      console.log('📞 Webhook alert sent successfully');
    } catch (error) {
      console.error('Failed to send webhook alert:', error);
    }
  }
}