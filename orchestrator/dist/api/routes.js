"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.apiRoutes = void 0;
const express_1 = require("express");
const session_controller_1 = require("./session-controller");
const auth_1 = require("../middleware/auth");
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
// Admin routes (should have additional admin auth in production)
router.post('/sessions/cleanup', sessionController.cleanupSessions.bind(sessionController));
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