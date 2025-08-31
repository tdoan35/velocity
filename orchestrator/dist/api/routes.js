"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRoutes = void 0;
const express_1 = require("express");
const session_controller_1 = require("./session-controller");
const auth_1 = require("../middleware/auth");
const MonitoringController = __importStar(require("./monitoring-controller"));
const router = (0, express_1.Router)();
exports.apiRoutes = router;
const sessionController = new session_controller_1.SessionController();
// Apply rate limiting to all routes
router.use(auth_1.rateLimiter);
// Apply authentication to all routes
router.use(auth_1.authenticateUser);
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
//# sourceMappingURL=routes.js.map