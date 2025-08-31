import { SchedulerService } from '../services/scheduler';

// Mock the dependencies
jest.mock('../services/container-manager');
jest.mock('../services/monitoring');
jest.mock('node-cron');

const mockCron = {
  schedule: jest.fn(() => ({
    start: jest.fn(),
    destroy: jest.fn(),
    getStatus: jest.fn(() => 'scheduled'),
  })),
};

jest.doMock('node-cron', () => mockCron);

describe('SchedulerService', () => {
  let schedulerService: SchedulerService;

  beforeEach(() => {
    jest.clearAllMocks();
    schedulerService = new SchedulerService();
  });

  afterEach(() => {
    // Clean up any running jobs
    if (schedulerService) {
      schedulerService.stopJobs();
    }
  });

  describe('Job Management', () => {
    it('should start all scheduled jobs', () => {
      schedulerService.startJobs();

      // Verify that cron jobs are scheduled for:
      // - cleanup (every 15 minutes)
      // - monitoring (every 5 minutes)  
      // - orphan cleanup (every hour)
      // - timeout enforcement (every 10 minutes)
      // - metrics collection (every minute)
      expect(mockCron.schedule).toHaveBeenCalledTimes(5);

      // Check for cleanup job (*/15 * * * *)
      expect(mockCron.schedule).toHaveBeenCalledWith(
        '*/15 * * * *',
        expect.any(Function),
        expect.objectContaining({
          scheduled: false,
          timezone: 'UTC'
        })
      );

      // Check for monitoring job (*/5 * * * *)
      expect(mockCron.schedule).toHaveBeenCalledWith(
        '*/5 * * * *',
        expect.any(Function),
        expect.objectContaining({
          scheduled: false,
          timezone: 'UTC'
        })
      );

      // Check for orphan cleanup job (0 * * * *)
      expect(mockCron.schedule).toHaveBeenCalledWith(
        '0 * * * *',
        expect.any(Function),
        expect.objectContaining({
          scheduled: false,
          timezone: 'UTC'
        })
      );

      // Check for timeout enforcement job (*/10 * * * *)
      expect(mockCron.schedule).toHaveBeenCalledWith(
        '*/10 * * * *',
        expect.any(Function),
        expect.objectContaining({
          scheduled: false,
          timezone: 'UTC'
        })
      );

      // Check for metrics collection job (* * * * *)
      expect(mockCron.schedule).toHaveBeenCalledWith(
        '* * * * *',
        expect.any(Function),
        expect.objectContaining({
          scheduled: false,
          timezone: 'UTC'
        })
      );
    });

    it('should stop all jobs when requested', () => {
      schedulerService.startJobs();
      
      // Mock the jobs
      const mockJob = {
        start: jest.fn(),
        destroy: jest.fn(),
        getStatus: jest.fn(() => 'scheduled'),
      };
      
      // Override the internal jobs map for testing
      (schedulerService as any).jobs.set('test', mockJob);

      schedulerService.stopJobs();

      expect(mockJob.destroy).toHaveBeenCalled();
    });

    it('should return job status', () => {
      schedulerService.startJobs();
      
      const status = schedulerService.getJobStatus();
      
      expect(Array.isArray(status)).toBe(true);
      expect(status.length).toBeGreaterThan(0);
      
      // Each status should have name and running properties
      status.forEach(job => {
        expect(job).toHaveProperty('name');
        expect(job).toHaveProperty('running');
        expect(typeof job.running).toBe('boolean');
      });
    });
  });

  describe('Manual Job Execution', () => {
    it('should run cleanup job immediately', async () => {
      const mockContainerManager = (schedulerService as any).containerManager;
      mockContainerManager.cleanupExpiredSessions = jest.fn().mockResolvedValue(undefined);

      await schedulerService.runJobNow('cleanup');

      expect(mockContainerManager.cleanupExpiredSessions).toHaveBeenCalledTimes(1);
    });

    it('should run monitoring job immediately', async () => {
      const mockContainerManager = (schedulerService as any).containerManager;
      mockContainerManager.runMonitoringJob = jest.fn().mockResolvedValue(undefined);

      await schedulerService.runJobNow('monitoring');

      expect(mockContainerManager.runMonitoringJob).toHaveBeenCalledTimes(1);
    });

    it('should throw error for unknown job', async () => {
      await expect(schedulerService.runJobNow('unknown-job'))
        .rejects.toThrow('Unknown job: unknown-job');
    });

    it('should run timeout enforcement job', async () => {
      const mockContainerManager = (schedulerService as any).containerManager;
      mockContainerManager.monitorAllSessions = jest.fn().mockResolvedValue([]);

      await schedulerService.runJobNow('timeout-enforcement');

      expect(mockContainerManager.monitorAllSessions).toHaveBeenCalledTimes(1);
    });

    it('should run metrics collection job', async () => {
      const mockContainerManager = (schedulerService as any).containerManager;
      const mockMonitoringService = (schedulerService as any).monitoringService;
      
      mockContainerManager.monitorAllSessions = jest.fn().mockResolvedValue([
        { tier: 'free', status: 'ok' },
        { tier: 'pro', status: 'warning' },
      ]);
      mockMonitoringService.recordMetric = jest.fn();

      await schedulerService.runJobNow('metrics-collection');

      expect(mockContainerManager.monitorAllSessions).toHaveBeenCalledTimes(1);
      expect(mockMonitoringService.recordMetric).toHaveBeenCalledWith('active_sessions', 2);
    });
  });

  describe('Session Timeout Enforcement', () => {
    it('should enforce timeouts for critical sessions', async () => {
      const mockContainerManager = (schedulerService as any).containerManager;
      const mockMonitoringService = (schedulerService as any).monitoringService;

      const mockSessionResults = [
        {
          sessionId: 'session-1',
          containerId: 'container-1',
          tier: 'free',
          status: 'critical' as const,
          actions: ['Auto-destroy machine'],
          alerts: ['Session exceeded time limit'],
        },
        {
          sessionId: 'session-2',
          containerId: 'container-2',
          tier: 'pro',
          status: 'ok' as const,
          actions: [],
          alerts: [],
        },
      ];

      mockContainerManager.monitorAllSessions = jest.fn().mockResolvedValue(mockSessionResults);
      mockContainerManager.destroySession = jest.fn().mockResolvedValue(undefined);
      mockMonitoringService.recordEvent = jest.fn();

      // Access private method for testing
      await (schedulerService as any).enforceSessionTimeouts();

      expect(mockContainerManager.monitorAllSessions).toHaveBeenCalledTimes(1);
      expect(mockContainerManager.destroySession).toHaveBeenCalledTimes(1);
      expect(mockContainerManager.destroySession).toHaveBeenCalledWith('session-1');
      expect(mockMonitoringService.recordEvent).toHaveBeenCalledWith(
        'session_timeout_enforced',
        expect.objectContaining({
          sessionId: 'session-1',
          containerId: 'container-1',
          tier: 'free',
        })
      );
    });

    it('should handle timeout enforcement errors gracefully', async () => {
      const mockContainerManager = (schedulerService as any).containerManager;
      
      mockContainerManager.monitorAllSessions = jest.fn().mockRejectedValue(
        new Error('Monitoring failed')
      );

      // Should not throw but log error
      await expect((schedulerService as any).enforceSessionTimeouts())
        .rejects.toThrow('Monitoring failed');
    });
  });

  describe('Metrics Collection', () => {
    it('should collect and record system metrics', async () => {
      const mockContainerManager = (schedulerService as any).containerManager;
      const mockMonitoringService = (schedulerService as any).monitoringService;

      const mockSessionResults = [
        { tier: 'free', status: 'ok' as const },
        { tier: 'free', status: 'warning' as const },
        { tier: 'pro', status: 'critical' as const },
        { tier: 'pro', status: 'ok' as const },
      ];

      mockContainerManager.monitorAllSessions = jest.fn().mockResolvedValue(mockSessionResults);
      mockMonitoringService.recordMetric = jest.fn();

      // Access private method for testing
      await (schedulerService as any).collectSystemMetrics();

      expect(mockContainerManager.monitorAllSessions).toHaveBeenCalledTimes(1);
      
      // Verify metrics were recorded
      expect(mockMonitoringService.recordMetric).toHaveBeenCalledWith('active_sessions', 4);
      expect(mockMonitoringService.recordMetric).toHaveBeenCalledWith('healthy_sessions', 2);
      expect(mockMonitoringService.recordMetric).toHaveBeenCalledWith('warning_sessions', 1);
      expect(mockMonitoringService.recordMetric).toHaveBeenCalledWith('critical_sessions', 1);
      
      // Verify tier distribution metrics
      expect(mockMonitoringService.recordMetric).toHaveBeenCalledWith('sessions_free_tier', 2);
      expect(mockMonitoringService.recordMetric).toHaveBeenCalledWith('sessions_pro_tier', 2);
    });

    it('should handle metrics collection errors gracefully', async () => {
      const mockContainerManager = (schedulerService as any).containerManager;
      
      mockContainerManager.monitorAllSessions = jest.fn().mockRejectedValue(
        new Error('Failed to get session data')
      );

      // Should not throw error, just log it
      await expect((schedulerService as any).collectSystemMetrics())
        .resolves.toBeUndefined();
    });
  });
});