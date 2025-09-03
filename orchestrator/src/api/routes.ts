import { Router } from 'express';
import { SessionController } from './session-controller';
import { authenticateUser, rateLimiter } from '../middleware/auth';
import * as MonitoringController from './monitoring-controller';

const router = Router();
const sessionController = new SessionController();

// Apply rate limiting to all routes
router.use(rateLimiter);

// Apply authentication to all routes
router.use(authenticateUser);

// Session management routes
router.post('/sessions/start', sessionController.startSession.bind(sessionController));
router.post('/sessions/stop', sessionController.stopSession.bind(sessionController));
router.get('/sessions/:sessionId/status', sessionController.getSessionStatus.bind(sessionController));
router.get('/sessions', sessionController.listSessions.bind(sessionController));

// Machine management routes
router.get('/machines/:machineId/status', sessionController.getMachineStatus.bind(sessionController));
router.get('/machines', sessionController.listMachines.bind(sessionController));

// Resource monitoring and security routes
router.get('/sessions/:sessionId/metrics', sessionController.getSessionMetrics.bind(sessionController));
router.post('/sessions/:sessionId/enforce-limits', sessionController.enforceSessionLimits.bind(sessionController));
router.get('/monitoring/status', sessionController.getMonitoringStatus.bind(sessionController));

// Admin routes (should have additional admin auth in production)
router.post('/sessions/cleanup', sessionController.cleanupSessions.bind(sessionController));
router.post('/monitoring/run', sessionController.runMonitoringJob.bind(sessionController));

// Phase 3.2: Enhanced cleanup and monitoring routes
router.get('/sessions/statistics', sessionController.getSessionStatistics.bind(sessionController));
router.post('/sessions/:sessionId/terminate', sessionController.forceTerminateSession.bind(sessionController));
router.post('/sessions/cleanup/comprehensive', sessionController.runComprehensiveCleanup.bind(sessionController));

// Monitoring endpoints
router.get('/monitoring/health', MonitoringController.getHealthSummary);
router.get('/monitoring/metrics', MonitoringController.getMetrics);
router.get('/monitoring/events', MonitoringController.getEvents);
router.get('/monitoring/alerts', MonitoringController.getAlerts);
router.post('/monitoring/alerts/:alertId/resolve', MonitoringController.resolveAlert);
router.get('/monitoring/sessions', MonitoringController.getSessionMonitoring);
router.get('/monitoring/sessions/:sessionId/metrics', MonitoringController.getSessionMetrics);
router.get('/monitoring/dashboard', MonitoringController.getDashboardData);

// Admin monitoring operations
router.post('/monitoring/cleanup', MonitoringController.runCleanupJob);
router.post('/monitoring/monitor', MonitoringController.runMonitoringJob);
router.get('/monitoring/jobs', MonitoringController.getJobStatus);
router.post('/monitoring/jobs/:jobName/run', MonitoringController.runJob);

// Prometheus metrics export (no auth required)
router.get('/metrics', MonitoringController.exportPrometheusMetrics);

// Health check endpoint (no auth required)
router.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    }
  });
});

export { router as apiRoutes };