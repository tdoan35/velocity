"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SessionController = void 0;
const container_manager_1 = require("../services/container-manager");
class SessionController {
    constructor() {
        /**
         * POST /sessions/start
         * Creates a new preview session
         */
        this.startSession = async (req, res) => {
            try {
                const { projectId, deviceType, options } = req.body;
                // Validate required fields
                if (!projectId) {
                    res.status(400).json({
                        success: false,
                        error: 'Missing required field: projectId'
                    });
                    return;
                }
                if (!req.user?.id) {
                    res.status(401).json({
                        success: false,
                        error: 'User not authenticated'
                    });
                    return;
                }
                // Create the preview session
                const session = await this.containerManager.createSession({
                    projectId,
                    userId: req.user.id,
                    deviceType,
                    options,
                    tier: req.body.tier || 'free', // Allow tier selection
                    customConfig: req.body.customConfig,
                });
                res.status(200).json({
                    success: true,
                    data: {
                        sessionId: session.sessionId,
                        containerUrl: session.containerUrl,
                        status: session.status === 'active' || session.status === 'creating' ? session.status : 'creating',
                    }
                });
            }
            catch (error) {
                console.error('Failed to start session:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal server error'
                });
            }
        };
        /**
         * POST /sessions/stop
         * Terminates a preview session
         */
        this.stopSession = async (req, res) => {
            try {
                const { sessionId } = req.body;
                if (!sessionId) {
                    res.status(400).json({
                        success: false,
                        error: 'Missing required field: sessionId'
                    });
                    return;
                }
                // Verify session ownership
                const sessionStatus = await this.containerManager.getSessionStatus(sessionId);
                if (!sessionStatus) {
                    res.status(404).json({
                        success: false,
                        error: 'Session not found'
                    });
                    return;
                }
                if (sessionStatus.userId !== req.user?.id) {
                    res.status(403).json({
                        success: false,
                        error: 'Unauthorized to stop this session'
                    });
                    return;
                }
                // Stop the session
                await this.containerManager.destroySession(sessionId);
                res.status(200).json({
                    success: true,
                    message: 'Session stopped successfully'
                });
            }
            catch (error) {
                console.error('Failed to stop session:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal server error'
                });
            }
        };
        /**
         * GET /sessions/:sessionId/status
         * Gets the status of a preview session
         */
        this.getSessionStatus = async (req, res) => {
            try {
                const { sessionId } = req.params;
                if (!sessionId) {
                    res.status(400).json({
                        success: false,
                        error: 'Missing sessionId parameter'
                    });
                    return;
                }
                // Get session status
                const session = await this.containerManager.getSessionStatus(sessionId);
                if (!session) {
                    res.status(404).json({
                        success: false,
                        error: 'Session not found'
                    });
                    return;
                }
                // Verify session ownership
                if (session.userId !== req.user?.id) {
                    res.status(403).json({
                        success: false,
                        error: 'Unauthorized to view this session'
                    });
                    return;
                }
                res.status(200).json({
                    success: true,
                    data: {
                        sessionId: session.id,
                        status: session.status,
                        containerUrl: session.containerUrl,
                        containerId: session.containerId,
                        errorMessage: session.errorMessage,
                    }
                });
            }
            catch (error) {
                console.error('Failed to get session status:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal server error'
                });
            }
        };
        /**
         * GET /sessions
         * Lists all active sessions for the authenticated user
         */
        this.listSessions = async (req, res) => {
            try {
                if (!req.user?.id) {
                    res.status(401).json({
                        success: false,
                        error: 'User not authenticated'
                    });
                    return;
                }
                // This would require a method in ContainerManager to list sessions by user
                // For now, return empty array
                res.status(200).json({
                    success: true,
                    data: []
                });
            }
            catch (error) {
                console.error('Failed to list sessions:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal server error'
                });
            }
        };
        /**
         * POST /sessions/cleanup
         * Cleanup expired sessions (admin endpoint)
         */
        this.cleanupSessions = async (req, res) => {
            try {
                // This should be an admin-only endpoint in production
                await this.containerManager.cleanupExpiredSessions();
                res.status(200).json({
                    success: true,
                    message: 'Cleanup completed successfully'
                });
            }
            catch (error) {
                console.error('Failed to cleanup sessions:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal server error'
                });
            }
        };
        /**
         * GET /machines/:machineId/status
         * Get machine status directly from Fly.io
         */
        this.getMachineStatus = async (req, res) => {
            try {
                const { machineId } = req.params;
                if (!machineId) {
                    res.status(400).json({
                        success: false,
                        error: 'Machine ID is required'
                    });
                    return;
                }
                const machine = await this.containerManager.getMachineStatus(machineId);
                if (!machine) {
                    res.status(404).json({
                        success: false,
                        error: 'Machine not found'
                    });
                    return;
                }
                res.json({
                    success: true,
                    data: {
                        machineId: machine.id,
                        name: machine.name,
                        state: machine.state,
                        region: machine.region,
                        created_at: machine.created_at,
                        updated_at: machine.updated_at,
                        checks: machine.checks,
                        metadata: machine.metadata,
                    }
                });
            }
            catch (error) {
                console.error('Failed to get machine status:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to get machine status',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        /**
         * GET /machines
         * List all active machines (admin only)
         */
        this.listMachines = async (req, res) => {
            try {
                // This endpoint could be admin-only in production
                const machines = await this.containerManager.listActiveMachines();
                res.json({
                    success: true,
                    data: {
                        machines: machines.map(machine => ({
                            id: machine.id,
                            name: machine.name,
                            state: machine.state,
                            region: machine.region,
                            created_at: machine.created_at,
                            metadata: machine.metadata,
                        })),
                        total: machines.length,
                    }
                });
            }
            catch (error) {
                console.error('Failed to list machines:', error);
                res.status(500).json({
                    success: false,
                    error: 'Failed to list machines',
                    details: error instanceof Error ? error.message : 'Unknown error'
                });
            }
        };
        /**
         * GET /sessions/:sessionId/metrics
         * Get detailed resource metrics for a session
         */
        this.getSessionMetrics = async (req, res) => {
            try {
                const { sessionId } = req.params;
                if (!sessionId) {
                    res.status(400).json({
                        success: false,
                        error: 'Missing sessionId parameter'
                    });
                    return;
                }
                // Get session status first to verify ownership
                const sessionStatus = await this.containerManager.getSessionStatus(sessionId);
                if (!sessionStatus) {
                    res.status(404).json({
                        success: false,
                        error: 'Session not found'
                    });
                    return;
                }
                if (sessionStatus.userId !== req.user?.id) {
                    res.status(403).json({
                        success: false,
                        error: 'Unauthorized to view this session'
                    });
                    return;
                }
                // Get detailed metrics
                const metrics = await this.containerManager.getSessionMetrics(sessionId);
                res.status(200).json({
                    success: true,
                    data: metrics
                });
            }
            catch (error) {
                console.error('Failed to get session metrics:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal server error'
                });
            }
        };
        /**
         * POST /sessions/:sessionId/enforce-limits
         * Enforce resource limits on a specific session
         */
        this.enforceSessionLimits = async (req, res) => {
            try {
                const { sessionId } = req.params;
                if (!sessionId) {
                    res.status(400).json({
                        success: false,
                        error: 'Missing sessionId parameter'
                    });
                    return;
                }
                // Get session status first to verify ownership
                const sessionStatus = await this.containerManager.getSessionStatus(sessionId);
                if (!sessionStatus) {
                    res.status(404).json({
                        success: false,
                        error: 'Session not found'
                    });
                    return;
                }
                if (sessionStatus.userId !== req.user?.id) {
                    res.status(403).json({
                        success: false,
                        error: 'Unauthorized to enforce limits on this session'
                    });
                    return;
                }
                // Enforce limits
                const enforcement = await this.containerManager.enforceSessionLimits(sessionId);
                res.status(200).json({
                    success: true,
                    data: enforcement
                });
            }
            catch (error) {
                console.error('Failed to enforce session limits:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal server error'
                });
            }
        };
        /**
         * GET /monitoring/status
         * Get monitoring status for all user sessions
         */
        this.getMonitoringStatus = async (req, res) => {
            try {
                if (!req.user?.id) {
                    res.status(401).json({
                        success: false,
                        error: 'User not authenticated'
                    });
                    return;
                }
                // Get monitoring status for all sessions
                const allMonitoring = await this.containerManager.monitorAllSessions();
                // Filter to only user's sessions (in production, you'd want to filter by user ID)
                // For now, returning all monitoring data but this should be filtered by user
                res.status(200).json({
                    success: true,
                    data: {
                        sessions: allMonitoring,
                        summary: {
                            total: allMonitoring.length,
                            healthy: allMonitoring.filter(s => s.status === 'ok').length,
                            warnings: allMonitoring.filter(s => s.status === 'warning').length,
                            critical: allMonitoring.filter(s => s.status === 'critical').length,
                        }
                    }
                });
            }
            catch (error) {
                console.error('Failed to get monitoring status:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal server error'
                });
            }
        };
        /**
         * POST /monitoring/run
         * Run monitoring job (admin endpoint)
         */
        this.runMonitoringJob = async (req, res) => {
            try {
                // This should be an admin-only endpoint in production
                await this.containerManager.runMonitoringJob();
                res.status(200).json({
                    success: true,
                    message: 'Monitoring job completed successfully'
                });
            }
            catch (error) {
                console.error('Failed to run monitoring job:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal server error'
                });
            }
        };
        /**
         * GET /sessions/statistics
         * Get overall session statistics and metrics (admin endpoint)
         * Phase 3.2: Session statistics endpoint
         */
        this.getSessionStatistics = async (req, res) => {
            try {
                const statistics = await this.containerManager.getSessionStatistics();
                res.status(200).json({
                    success: true,
                    data: {
                        totalActiveSessions: statistics.totalActiveSessions,
                        totalExpiredSessions: statistics.totalExpiredSessions,
                        sessionsByStatus: statistics.sessionsByStatus,
                        oldestActiveSession: statistics.oldestActiveSession,
                        newestActiveSession: statistics.newestActiveSession,
                        averageSessionDuration: statistics.averageSessionDuration,
                        timestamp: new Date().toISOString()
                    }
                });
            }
            catch (error) {
                console.error('Failed to get session statistics:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal server error'
                });
            }
        };
        /**
         * POST /sessions/:sessionId/terminate
         * Force terminate a specific session (admin endpoint)
         * Phase 3.2: Force termination endpoint
         */
        this.forceTerminateSession = async (req, res) => {
            try {
                const { sessionId } = req.params;
                if (!sessionId) {
                    res.status(400).json({
                        success: false,
                        error: 'Session ID is required'
                    });
                    return;
                }
                await this.containerManager.forceTerminateSession(sessionId);
                res.status(200).json({
                    success: true,
                    message: `Session ${sessionId} terminated successfully`
                });
            }
            catch (error) {
                console.error('Failed to force terminate session:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal server error'
                });
            }
        };
        /**
         * POST /sessions/cleanup/comprehensive
         * Run comprehensive cleanup job (admin endpoint)
         * Phase 3.2: Comprehensive cleanup endpoint
         */
        this.runComprehensiveCleanup = async (req, res) => {
            try {
                const results = await this.containerManager.runComprehensiveCleanup();
                res.status(200).json({
                    success: true,
                    data: {
                        sessionCleanup: {
                            totalExpired: results.sessionCleanup.totalExpired,
                            successfulCleanups: results.sessionCleanup.successfulCleanups,
                            failedCleanups: results.sessionCleanup.failedCleanups,
                            errors: results.sessionCleanup.errors
                        },
                        containerCleanup: {
                            totalOrphaned: results.containerCleanup.totalOrphaned,
                            successfulCleanups: results.containerCleanup.successfulCleanups,
                            errors: results.containerCleanup.errors
                        },
                        metrics: {
                            totalActiveSessions: results.metrics.totalActiveSessions,
                            totalExpiredSessions: results.metrics.totalExpiredSessions,
                            averageSessionDuration: results.metrics.averageSessionDuration
                        },
                        timestamp: new Date().toISOString()
                    },
                    message: 'Comprehensive cleanup completed successfully'
                });
            }
            catch (error) {
                console.error('Failed to run comprehensive cleanup:', error);
                res.status(500).json({
                    success: false,
                    error: error instanceof Error ? error.message : 'Internal server error'
                });
            }
        };
        this.containerManager = new container_manager_1.ContainerManager();
    }
}
exports.SessionController = SessionController;
//# sourceMappingURL=session-controller.js.map