import { Request, Response } from 'express';
import { SchedulerService } from '../services/scheduler';
export declare function setSchedulerService(scheduler: SchedulerService): void;
/**
 * Get system health summary
 */
export declare function getHealthSummary(req: Request, res: Response): Promise<void>;
/**
 * Get system metrics
 */
export declare function getMetrics(req: Request, res: Response): Promise<void>;
/**
 * Get system events
 */
export declare function getEvents(req: Request, res: Response): Promise<void>;
/**
 * Get active alerts
 */
export declare function getAlerts(req: Request, res: Response): Promise<void>;
/**
 * Resolve an alert
 */
export declare function resolveAlert(req: Request, res: Response): Promise<void>;
/**
 * Get detailed session monitoring data
 */
export declare function getSessionMonitoring(req: Request, res: Response): Promise<void>;
/**
 * Get metrics for a specific session
 */
export declare function getSessionMetrics(req: Request, res: Response): Promise<void>;
/**
 * Run cleanup job immediately
 */
export declare function runCleanupJob(req: Request, res: Response): Promise<void>;
/**
 * Run monitoring job immediately
 */
export declare function runMonitoringJob(req: Request, res: Response): Promise<void>;
/**
 * Get scheduler job status
 */
export declare function getJobStatus(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Run a specific scheduled job immediately
 */
export declare function runJob(req: Request, res: Response): Promise<Response<any, Record<string, any>> | undefined>;
/**
 * Export metrics in Prometheus format
 */
export declare function exportPrometheusMetrics(req: Request, res: Response): Promise<void>;
/**
 * Get comprehensive system dashboard data
 */
export declare function getDashboardData(req: Request, res: Response): Promise<void>;
//# sourceMappingURL=monitoring-controller.d.ts.map