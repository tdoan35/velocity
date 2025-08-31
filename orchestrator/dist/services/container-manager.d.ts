import type { ContainerSession, CreateSessionRequest, PreviewSession } from '../types';
export declare class ContainerManager {
    private supabase;
    private flyService;
    private realtimeManager;
    constructor();
    /**
     * Creates a new preview session with container provisioning
     */
    createSession(request: CreateSessionRequest & {
        tier?: string;
        customConfig?: any;
    }): Promise<ContainerSession>;
    /**
     * Destroys a preview session and cleans up resources
     */
    destroySession(sessionId: string): Promise<void>;
    /**
     * Gets the current status of a preview session
     */
    getSessionStatus(sessionId: string): Promise<PreviewSession | null>;
    /**
     * Cleanup expired sessions (for background job)
     */
    cleanupExpiredSessions(): Promise<void>;
    /**
     * Get machine status directly from Fly.io API
     */
    getMachineStatus(containerId: string): Promise<import("../types/fly.types").FlyMachine | null>;
    /**
     * List all active machines
     */
    listActiveMachines(): Promise<import("../types/fly.types").FlyMachine[]>;
    /**
     * Monitor resource usage across all active sessions
     */
    monitorAllSessions(): Promise<{
        sessionId: string;
        containerId: string;
        tier: string;
        status: 'ok' | 'warning' | 'critical';
        alerts: string[];
        actions: string[];
    }[]>;
    /**
     * Get detailed resource metrics for a specific session
     */
    getSessionMetrics(sessionId: string): Promise<{
        sessionInfo: PreviewSession | null;
        resourceMetrics: {
            cpu: number;
            memory: number;
            disk: number;
            network: {
                in: number;
                out: number;
            };
            uptime: number;
        } | null;
        monitoring: {
            status: 'ok' | 'warning' | 'critical';
            alerts: string[];
            actions: string[];
        } | null;
    }>;
    /**
     * Enforce resource limits on a specific session
     */
    enforceSessionLimits(sessionId: string): Promise<{
        success: boolean;
        actions: string[];
    }>;
    /**
     * Background monitoring job to be run periodically
     */
    runMonitoringJob(): Promise<void>;
}
//# sourceMappingURL=container-manager.d.ts.map