import { Router } from 'express';
import { SessionController } from './session-controller';
import { authenticateUser, rateLimiter } from '../middleware/auth';

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

export { router as apiRoutes };