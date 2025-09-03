export interface SessionCleanupStats {
    totalExpired: number;
    successfulCleanups: number;
    failedCleanups: number;
    errors: string[];
}
export interface SessionMetrics {
    totalActiveSessions: number;
    totalExpiredSessions: number;
    sessionsByStatus: Record<string, number>;
    oldestActiveSession?: Date;
    newestActiveSession?: Date;
    averageSessionDuration?: number;
}
export declare class SessionCleanupService {
    private supabase;
    private flyService;
    constructor();
    /**
     * Clean up expired sessions and their associated containers
     * Phase 3.2: Session Cleanup and Monitoring
     */
    cleanupExpiredSessions(): Promise<SessionCleanupStats>;
    /**
     * Terminate a specific session and its container
     */
    terminateSession(session: {
        id: string;
        container_id?: string;
        project_id?: string;
    }): Promise<void>;
    /**
     * Force terminate a session (for manual cleanup)
     */
    forceTerminateSession(sessionId: string): Promise<void>;
    /**
     * Get session metrics and statistics
     */
    getSessionMetrics(): Promise<SessionMetrics>;
    /**
     * Clean up orphaned containers (containers that exist in Fly.io but not in database)
     */
    cleanupOrphanedContainers(): Promise<{
        totalOrphaned: number;
        successfulCleanups: number;
        errors: string[];
    }>;
    /**
     * Run comprehensive cleanup job (both expired sessions and orphaned containers)
     */
    runCleanupJob(): Promise<{
        sessionCleanup: SessionCleanupStats;
        containerCleanup: {
            totalOrphaned: number;
            successfulCleanups: number;
            errors: string[];
        };
        metrics: SessionMetrics;
    }>;
}
//# sourceMappingURL=cleanup-service.d.ts.map