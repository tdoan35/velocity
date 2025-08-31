import { Response } from 'express';
import type { AuthenticatedRequest, ApiResponse, CreateSessionResponse, SessionStatusResponse } from '../types';
export declare class SessionController {
    private containerManager;
    constructor();
    /**
     * POST /sessions/start
     * Creates a new preview session
     */
    startSession: (req: AuthenticatedRequest, res: Response<ApiResponse<CreateSessionResponse>>) => Promise<void>;
    /**
     * POST /sessions/stop
     * Terminates a preview session
     */
    stopSession: (req: AuthenticatedRequest, res: Response<ApiResponse>) => Promise<void>;
    /**
     * GET /sessions/:sessionId/status
     * Gets the status of a preview session
     */
    getSessionStatus: (req: AuthenticatedRequest, res: Response<ApiResponse<SessionStatusResponse>>) => Promise<void>;
    /**
     * GET /sessions
     * Lists all active sessions for the authenticated user
     */
    listSessions: (req: AuthenticatedRequest, res: Response<ApiResponse<SessionStatusResponse[]>>) => Promise<void>;
    /**
     * POST /sessions/cleanup
     * Cleanup expired sessions (admin endpoint)
     */
    cleanupSessions: (req: AuthenticatedRequest, res: Response<ApiResponse>) => Promise<void>;
    /**
     * GET /machines/:machineId/status
     * Get machine status directly from Fly.io
     */
    getMachineStatus: (req: AuthenticatedRequest, res: Response) => Promise<void>;
    /**
     * GET /machines
     * List all active machines (admin only)
     */
    listMachines: (req: AuthenticatedRequest, res: Response) => Promise<void>;
    /**
     * GET /sessions/:sessionId/metrics
     * Get detailed resource metrics for a session
     */
    getSessionMetrics: (req: AuthenticatedRequest, res: Response) => Promise<void>;
    /**
     * POST /sessions/:sessionId/enforce-limits
     * Enforce resource limits on a specific session
     */
    enforceSessionLimits: (req: AuthenticatedRequest, res: Response) => Promise<void>;
    /**
     * GET /monitoring/status
     * Get monitoring status for all user sessions
     */
    getMonitoringStatus: (req: AuthenticatedRequest, res: Response) => Promise<void>;
    /**
     * POST /monitoring/run
     * Run monitoring job (admin endpoint)
     */
    runMonitoringJob: (req: AuthenticatedRequest, res: Response) => Promise<void>;
}
//# sourceMappingURL=session-controller.d.ts.map