import { MonitoringService } from '../services/monitoring';

// Mock Supabase client
const mockSupabaseClient = {
  from: jest.fn(() => ({
    insert: jest.fn().mockResolvedValue({ error: null }),
  })),
};

jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => mockSupabaseClient),
}));

// Mock fetch for webhook tests
global.fetch = jest.fn();

describe('MonitoringService', () => {
  let monitoringService: MonitoringService;

  beforeEach(() => {
    jest.clearAllMocks();
    monitoringService = new MonitoringService();
    
    // Reset environment variables
    delete process.env.MONITORING_WEBHOOK_URL;
  });

  describe('Metric Recording', () => {
    it('should record metrics with timestamp', () => {
      const testMetric = 'test_metric';
      const testValue = 42;
      const testTags = { environment: 'test' };

      monitoringService.recordMetric(testMetric, testValue, testTags);

      const metrics = monitoringService.getMetrics(testMetric);
      expect(metrics).toHaveLength(1);
      expect(metrics[0]).toMatchObject({
        name: testMetric,
        value: testValue,
        tags: testTags,
      });
      expect(metrics[0].timestamp).toBeInstanceOf(Date);
    });

    it('should limit stored metrics to 1000 entries', () => {
      // Record 1100 metrics
      for (let i = 0; i < 1100; i++) {
        monitoringService.recordMetric('test_metric', i);
      }

      const metrics = monitoringService.getMetrics();
      expect(metrics.length).toBeLessThanOrEqual(1000);
      
      // Should keep the most recent metrics
      const lastMetric = metrics[metrics.length - 1];
      expect(lastMetric.value).toBe(1099); // Last metric should be preserved
    });

    it('should create alerts for high metric values', () => {
      monitoringService.recordMetric('critical_sessions', 6);

      const alerts = monitoringService.getActiveAlerts();
      expect(alerts).toHaveLength(1);
      expect(alerts[0]).toMatchObject({
        type: 'high_critical_sessions',
        severity: 'error',
        resolved: false,
      });
      expect(alerts[0].message).toContain('High critical_sessions: 6');
    });
  });

  describe('Event Recording', () => {
    it('should record events with severity levels', () => {
      const testType = 'test_event';
      const testData = { key: 'value' };
      const testSeverity = 'warning';

      monitoringService.recordEvent(testType, testData, testSeverity);

      const events = monitoringService.getEvents(testType);
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        type: testType,
        data: testData,
        severity: testSeverity,
      });
      expect(events[0].timestamp).toBeInstanceOf(Date);
    });

    it('should create alerts for error and critical events', () => {
      monitoringService.recordEvent('error_event', { error: 'test' }, 'error');
      monitoringService.recordEvent('critical_event', { critical: 'test' }, 'critical');

      const alerts = monitoringService.getActiveAlerts();
      expect(alerts).toHaveLength(2);
      
      const errorAlert = alerts.find(a => a.type === 'error_event');
      const criticalAlert = alerts.find(a => a.type === 'critical_event');
      
      expect(errorAlert).toBeDefined();
      expect(errorAlert?.severity).toBe('error');
      expect(criticalAlert).toBeDefined();
      expect(criticalAlert?.severity).toBe('critical');
    });

    it('should persist critical events to database', () => {
      monitoringService.recordEvent('critical_event', { error: 'database down' }, 'critical');

      // Should call supabase insert for critical events
      expect(mockSupabaseClient.from).toHaveBeenCalledWith('system_events');
    });

    it('should limit stored events to 500 entries', () => {
      // Record 600 events
      for (let i = 0; i < 600; i++) {
        monitoringService.recordEvent('test_event', { id: i });
      }

      const events = monitoringService.getEvents();
      expect(events.length).toBeLessThanOrEqual(500);
      
      // Should keep the most recent events
      const lastEvent = events[events.length - 1];
      expect(lastEvent.data.id).toBe(599); // Last event should be preserved
    });
  });

  describe('Alert Management', () => {
    it('should create alerts with unique IDs', () => {
      monitoringService.createAlert('test_type', 'Test message', 'warning');
      monitoringService.createAlert('test_type', 'Test message 2', 'error');

      const alerts = monitoringService.getActiveAlerts();
      expect(alerts).toHaveLength(2);
      
      const alertIds = alerts.map(a => a.id);
      expect(alertIds[0]).not.toBe(alertIds[1]); // IDs should be unique
    });

    it('should resolve alerts correctly', () => {
      monitoringService.createAlert('test_type', 'Test message', 'warning', { data: 'test' });
      
      const alerts = monitoringService.getActiveAlerts();
      expect(alerts).toHaveLength(1);
      
      const alertId = alerts[0].id;
      const resolved = monitoringService.resolveAlert(alertId, 'Manual resolution');
      
      expect(resolved).toBe(true);
      expect(monitoringService.getActiveAlerts()).toHaveLength(0);
      
      const allAlerts = monitoringService.getAllAlerts();
      expect(allAlerts[0].resolved).toBe(true);
    });

    it('should return false when resolving non-existent alert', () => {
      const resolved = monitoringService.resolveAlert('non-existent-id');
      expect(resolved).toBe(false);
    });

    it('should persist alerts to database', () => {
      monitoringService.createAlert('test_type', 'Test message', 'critical');

      expect(mockSupabaseClient.from).toHaveBeenCalledWith('system_alerts');
    });

    it('should send webhook for critical alerts when configured', async () => {
      process.env.MONITORING_WEBHOOK_URL = 'https://example.com/webhook';
      
      (fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      monitoringService.createAlert('test_critical', 'Critical issue', 'critical', { test: true });

      // Wait for async webhook call
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(fetch).toHaveBeenCalledWith(
        'https://example.com/webhook',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('"type":"alert"'),
        })
      );
    });
  });

  describe('Health Summary', () => {
    it('should return healthy status with no alerts', () => {
      const health = monitoringService.getHealthSummary();
      
      expect(health.status).toBe('healthy');
      expect(health.activeAlerts).toBe(0);
      expect(health.criticalAlerts).toBe(0);
      expect(typeof health.uptime).toBe('number');
    });

    it('should return warning status with non-critical alerts', () => {
      monitoringService.createAlert('test_warning', 'Warning message', 'warning');
      
      const health = monitoringService.getHealthSummary();
      
      expect(health.status).toBe('warning');
      expect(health.activeAlerts).toBe(1);
      expect(health.criticalAlerts).toBe(0);
    });

    it('should return critical status with critical alerts', () => {
      monitoringService.createAlert('test_critical', 'Critical message', 'critical');
      
      const health = monitoringService.getHealthSummary();
      
      expect(health.status).toBe('critical');
      expect(health.activeAlerts).toBe(1);
      expect(health.criticalAlerts).toBe(1);
    });

    it('should include recent metrics in summary', () => {
      monitoringService.recordMetric('active_sessions', 5);
      monitoringService.recordMetric('healthy_sessions', 3);
      
      const health = monitoringService.getHealthSummary();
      
      expect(health.recentMetrics.active_sessions).toBe(5);
      expect(health.recentMetrics.healthy_sessions).toBe(3);
    });
  });

  describe('Prometheus Metrics Export', () => {
    it('should export metrics in Prometheus format', () => {
      monitoringService.recordMetric('test_metric', 42);
      monitoringService.recordMetric('another_metric', 24, { tag1: 'value1' });
      
      const prometheusMetrics = monitoringService.exportPrometheusMetrics();
      
      expect(prometheusMetrics).toContain('# HELP test_metric');
      expect(prometheusMetrics).toContain('# TYPE test_metric gauge');
      expect(prometheusMetrics).toContain('test_metric 42');
      
      expect(prometheusMetrics).toContain('# HELP another_metric');
      expect(prometheusMetrics).toContain('another_metric{tag1="value1"} 24');
    });

    it('should handle empty metrics gracefully', () => {
      const prometheusMetrics = monitoringService.exportPrometheusMetrics();
      expect(prometheusMetrics).toBe('');
    });
  });

  describe('Data Cleanup', () => {
    it('should clear old data before specified date', () => {
      const oldDate = new Date();
      oldDate.setHours(oldDate.getHours() - 2);
      
      const cutoffDate = new Date();
      cutoffDate.setHours(cutoffDate.getHours() - 1);
      
      // Record some old metrics and events
      monitoringService.recordMetric('old_metric', 1);
      monitoringService.recordEvent('old_event', {});
      
      // Manually set timestamps to old values for testing
      const metrics = monitoringService.getMetrics();
      const events = monitoringService.getEvents();
      
      if (metrics.length > 0) metrics[0].timestamp = oldDate;
      if (events.length > 0) events[0].timestamp = oldDate;
      
      // Add recent data
      monitoringService.recordMetric('new_metric', 2);
      monitoringService.recordEvent('new_event', {});
      
      // Clear old data
      monitoringService.clearOldData(cutoffDate);
      
      // Should only have recent data
      const remainingMetrics = monitoringService.getMetrics();
      const remainingEvents = monitoringService.getEvents();
      
      expect(remainingMetrics.every(m => m.timestamp > cutoffDate)).toBe(true);
      expect(remainingEvents.every(e => e.timestamp > cutoffDate)).toBe(true);
    });
  });

  describe('Query Methods', () => {
    beforeEach(() => {
      // Add test data
      monitoringService.recordMetric('cpu_usage', 50);
      monitoringService.recordMetric('memory_usage', 75);
      monitoringService.recordEvent('startup', { service: 'test' });
      monitoringService.recordEvent('shutdown', { service: 'test' });
    });

    it('should filter metrics by name', () => {
      const cpuMetrics = monitoringService.getMetrics('cpu_usage');
      expect(cpuMetrics).toHaveLength(1);
      expect(cpuMetrics[0].name).toBe('cpu_usage');
    });

    it('should filter events by type', () => {
      const startupEvents = monitoringService.getEvents('startup');
      expect(startupEvents).toHaveLength(1);
      expect(startupEvents[0].type).toBe('startup');
    });

    it('should respect limit parameter', () => {
      // Add more test data
      for (let i = 0; i < 10; i++) {
        monitoringService.recordMetric('test_metric', i);
      }
      
      const limitedMetrics = monitoringService.getMetrics('test_metric', 5);
      expect(limitedMetrics).toHaveLength(5);
    });
  });
});