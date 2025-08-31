"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setSchedulerService = setSchedulerService;
exports.getHealthSummary = getHealthSummary;
exports.getMetrics = getMetrics;
exports.getEvents = getEvents;
exports.getAlerts = getAlerts;
exports.resolveAlert = resolveAlert;
exports.getSessionMonitoring = getSessionMonitoring;
exports.getSessionMetrics = getSessionMetrics;
exports.runCleanupJob = runCleanupJob;
exports.runMonitoringJob = runMonitoringJob;
exports.getJobStatus = getJobStatus;
exports.runJob = runJob;
exports.exportPrometheusMetrics = exportPrometheusMetrics;
exports.getDashboardData = getDashboardData;
const monitoring_1 = require("../services/monitoring");
const container_manager_1 = require("../services/container-manager");
const monitoringService = new monitoring_1.MonitoringService();
const containerManager = new container_manager_1.ContainerManager();
// Global scheduler service instance (will be initialized in index.ts)
let schedulerService;
function setSchedulerService(scheduler) {
    schedulerService = scheduler;
}
/**
 * Get system health summary
 */
async function getHealthSummary(req, res) {
    try {
        const health = monitoringService.getHealthSummary();
        res.json({
            success: true,
            data: health,
        });
    }
    catch (error) {
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
async function getMetrics(req, res) {
    try {
        const { name, limit } = req.query;
        const metrics = monitoringService.getMetrics(name, limit ? parseInt(limit) : undefined);
        res.json({
            success: true,
            data: metrics,
        });
    }
    catch (error) {
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
async function getEvents(req, res) {
    try {
        const { type, limit } = req.query;
        const events = monitoringService.getEvents(type, limit ? parseInt(limit) : undefined);
        res.json({
            success: true,
            data: events,
        });
    }
    catch (error) {
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
async function getAlerts(req, res) {
    try {
        const { all } = req.query;
        const alerts = all === 'true'
            ? monitoringService.getAllAlerts()
            : monitoringService.getActiveAlerts();
        res.json({
            success: true,
            data: alerts,
        });
    }
    catch (error) {
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
async function resolveAlert(req, res) {
    try {
        const { alertId } = req.params;
        const { resolution } = req.body;
        const resolved = monitoringService.resolveAlert(alertId, resolution);
        if (resolved) {
            res.json({
                success: true,
                message: 'Alert resolved successfully',
            });
        }
        else {
            res.status(404).json({
                success: false,
                error: 'Alert not found',
            });
        }
    }
    catch (error) {
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
async function getSessionMonitoring(req, res) {
    try {
        const results = await containerManager.monitorAllSessions();
        res.json({
            success: true,
            data: results,
        });
    }
    catch (error) {
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
async function getSessionMetrics(req, res) {
    try {
        const { sessionId } = req.params;
        const metrics = await containerManager.getSessionMetrics(sessionId);
        res.json({
            success: true,
            data: metrics,
        });
    }
    catch (error) {
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
async function runCleanupJob(req, res) {
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
    }
    catch (error) {
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
async function runMonitoringJob(req, res) {
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
    }
    catch (error) {
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
async function getJobStatus(req, res) {
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
    }
    catch (error) {
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
async function runJob(req, res) {
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
    }
    catch (error) {
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
async function exportPrometheusMetrics(req, res) {
    try {
        const metrics = monitoringService.exportPrometheusMetrics();
        res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
        res.send(metrics);
    }
    catch (error) {
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
async function getDashboardData(req, res) {
    try {
        const [health, sessionMonitoring, activeAlerts, recentEvents, jobStatus] = await Promise.all([
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
        }, {});
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
    }
    catch (error) {
        console.error('Failed to get dashboard data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get dashboard data',
        });
    }
}
//# sourceMappingURL=monitoring-controller.js.map