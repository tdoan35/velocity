import type { ContainerSession, CreateSessionRequest, PreviewSession } from '../types';
export declare class ContainerManager {
    private supabase;
    private flyService;
    private realtimeManager;
    constructor();
    /**
     * Creates a new preview session with container provisioning
     */
    createSession(request: CreateSessionRequest): Promise<ContainerSession>;
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
}
//# sourceMappingURL=container-manager.d.ts.map