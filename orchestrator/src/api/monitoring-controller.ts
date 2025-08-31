import { Request, Response } from 'express';
import { MonitoringService } from '../services/monitoring';
import { ContainerManager } from '../services/container-manager';
import { SchedulerService } from '../services/scheduler';

const monitoringService = new MonitoringService();
const containerManager = new ContainerManager();

// Global scheduler service instance (will be initialized in index.ts)
let schedulerService: SchedulerService;

export function setSchedulerService(scheduler: SchedulerService) {
  schedulerService = scheduler;
}

/**
 * Get system health summary
 */
export async function getHealthSummary(req: Request, res: Response) {
  try {
    const health = monitoringService.getHealthSummary();
    res.json({
      success: true,
      data: health,
    });
  } catch (error) {
    console.error('Failed to get health summary:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get health summary',
    });
  }
}

/**
 * Get system metrics
 */
export async function getMetrics(req: Request, res: Response) {
  try {
    const { name, limit } = req.query;
    const metrics = monitoringService.getMetrics(
      name as string,
      limit ? parseInt(limit as string) : undefined
    );
    
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    console.error('Failed to get metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get metrics',
    });
  }
}

/**
 * Get system events
 */
export async function getEvents(req: Request, res: Response) {
  try {
    const { type, limit } = req.query;
    const events = monitoringService.getEvents(
      type as string,
      limit ? parseInt(limit as string) : undefined
    );
    
    res.json({
      success: true,
      data: events,
    });
  } catch (error) {
    console.error('Failed to get events:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get events',
    });
  }
}

/**
 * Get active alerts
 */
export async function getAlerts(req: Request, res: Response) {
  try {
    const { all } = req.query;
    const alerts = all === 'true' 
      ? monitoringService.getAllAlerts()
      : monitoringService.getActiveAlerts();
    
    res.json({
      success: true,
      data: alerts,
    });
  } catch (error) {
    console.error('Failed to get alerts:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get alerts',
    });
  }
}

/**
 * Resolve an alert
 */
export async function resolveAlert(req: Request, res: Response) {
  try {
    const { alertId } = req.params;
    const { resolution } = req.body;
    
    const resolved = monitoringService.resolveAlert(alertId, resolution);
    
    if (resolved) {
      res.json({
        success: true,
        message: 'Alert resolved successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Alert not found',
      });
    }
  } catch (error) {
    console.error('Failed to resolve alert:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to resolve alert',
    });
  }
}

/**
 * Get detailed session monitoring data
 */
export async function getSessionMonitoring(req: Request, res: Response) {
  try {
    const results = await containerManager.monitorAllSessions();
    
    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Failed to get session monitoring data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session monitoring data',
    });
  }
}

/**
 * Get metrics for a specific session
 */
export async function getSessionMetrics(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;
    const metrics = await containerManager.getSessionMetrics(sessionId);
    
    res.json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    console.error('Failed to get session metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get session metrics',
    });
  }
}

/**
 * Run cleanup job immediately
 */
export async function runCleanupJob(req: Request, res: Response) {
  try {
    await containerManager.cleanupExpiredSessions();
    
    monitoringService.recordEvent('manual_cleanup_triggered', {
      triggeredBy: 'api',
      timestamp: new Date(),
    });
    
    res.json({
      success: true,
      message: 'Cleanup job completed successfully',
    });
  } catch (error) {
    console.error('Failed to run cleanup job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run cleanup job',
    });
  }
}

/**
 * Run monitoring job immediately
 */
export async function runMonitoringJob(req: Request, res: Response) {
  try {
    await containerManager.runMonitoringJob();
    
    monitoringService.recordEvent('manual_monitoring_triggered', {
      triggeredBy: 'api',
      timestamp: new Date(),
    });
    
    res.json({
      success: true,
      message: 'Monitoring job completed successfully',
    });
  } catch (error) {
    console.error('Failed to run monitoring job:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to run monitoring job',
    });
  }
}

/**
 * Get scheduler job status
 */
export async function getJobStatus(req: Request, res: Response) {
  try {
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'Scheduler service not available',
      });
    }
    
    const status = schedulerService.getJobStatus();
    
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Failed to get job status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get job status',
    });
  }
}

/**
 * Run a specific scheduled job immediately
 */
export async function runJob(req: Request, res: Response) {
  try {
    const { jobName } = req.params;
    
    if (!schedulerService) {
      return res.status(503).json({
        success: false,
        error: 'Scheduler service not available',
      });
    }
    
    await schedulerService.runJobNow(jobName);
    
    monitoringService.recordEvent('manual_job_triggered', {
      jobName,
      triggeredBy: 'api',
      timestamp: new Date(),
    });
    
    res.json({
      success: true,
      message: `Job ${jobName} completed successfully`,
    });
  } catch (error) {
    console.error(`Failed to run job:`, error);
    res.status(500).json({
      success: false,
      error: `Failed to run job: ${error instanceof Error ? error.message : 'Unknown error'}`,
    });
  }
}

/**
 * Export metrics in Prometheus format
 */
export async function exportPrometheusMetrics(req: Request, res: Response) {
  try {
    const metrics = monitoringService.exportPrometheusMetrics();
    
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metrics);
  } catch (error) {
    console.error('Failed to export Prometheus metrics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to export metrics',
    });
  }
}

/**
 * Get comprehensive system dashboard data
 */
export async function getDashboardData(req: Request, res: Response) {
  try {
    const [
      health,
      sessionMonitoring,
      activeAlerts,
      recentEvents,
      jobStatus
    ] = await Promise.all([
      Promise.resolve(monitoringService.getHealthSummary()),
      containerManager.monitorAllSessions(),
      Promise.resolve(monitoringService.getActiveAlerts()),
      Promise.resolve(monitoringService.getEvents(undefined, 20)),
      schedulerService ? Promise.resolve(schedulerService.getJobStatus()) : Promise.resolve([])
    ]);

    // Get tier distribution
    const tierDistribution = sessionMonitoring.reduce((acc, session) => {
      acc[session.tier] = (acc[session.tier] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Get recent metrics
    const recentMetrics = {
      active_sessions: monitoringService.getMetrics('active_sessions', 10),
      healthy_sessions: monitoringService.getMetrics('healthy_sessions', 10),
      warning_sessions: monitoringService.getMetrics('warning_sessions', 10),
      critical_sessions: monitoringService.getMetrics('critical_sessions', 10),
    };

    res.json({
      success: true,
      data: {
        health,
        sessions: {
          monitoring: sessionMonitoring,
          tierDistribution,
        },
        alerts: activeAlerts,
        events: recentEvents,
        jobs: jobStatus,
        metrics: recentMetrics,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error('Failed to get dashboard data:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get dashboard data',
    });
  }
}