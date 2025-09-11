import type { ContainerSession, CreateSessionRequest, PreviewSession } from '../types';
export declare class ContainerManager {
    private supabase;
    private flyService;
    private realtimeManager;
    private templateService;
    private cleanupService;
    constructor();
    /**
     * Creates a new preview session with container provisioning
     * Uses atomic transaction to prevent race condition between session creation and container lookup
     * Phase 2: Enhanced with snapshot hydration and realtime token support
     */
    createSession(request: CreateSessionRequest & {
        tier?: string;
        customConfig?: any;
    }): Promise<ContainerSession>;
    /**
     * Destroys a preview session and cleans up resources with enhanced verification
     */
    destroySession(sessionId: string): Promise<void>;
    /**
     * Gets the current status of a preview session
     */
    getSessionStatus(sessionId: string): Promise<PreviewSession | null>;
    /**
     * Cleanup expired sessions (for background job)
     * Enhanced with comprehensive SessionCleanupService
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
     * Enhanced with comprehensive cleanup and metrics
     */
    runMonitoringJob(): Promise<void>;
    /**
     * Ensure project is ready with proper files and configuration
     * Phase 2.1: Project Validation and Setup
     */
    private ensureProjectReady;
    /**
     * Set up demo project with proper configuration and files
     */
    private setupDemoProject;
    /**
     * Create a new project with specified template
     */
    private createProjectWithTemplate;
    /**
     * Add template files to a project
     */
    private addTemplateFilesToProject;
    /**
     * Get existing file paths for a project
     */
    private getExistingFilePaths;
    /**
     * Get overall session statistics and metrics
     * Phase 3.2: Expose cleanup service metrics
     */
    getSessionStatistics(): Promise<import("./cleanup-service").SessionMetrics>;
    /**
     * Force terminate a specific session
     * Phase 3.2: Expose force termination
     */
    forceTerminateSession(sessionId: string): Promise<void>;
    /**
     * Run comprehensive cleanup manually
     * Phase 3.2: Expose manual cleanup trigger
     */
    runComprehensiveCleanup(): Promise<{
        sessionCleanup: import("./cleanup-service").SessionCleanupStats;
        containerCleanup: {
            totalOrphaned: number;
            successfulCleanups: number;
            errors: string[];
        };
        metrics: import("./cleanup-service").SessionMetrics;
    }>;
    /**
     * Mint ephemeral realtime token scoped to a specific project
     * Phase 2: Snapshot hydration support
     */
    private mintRealtimeToken;
}
//# sourceMappingURL=container-manager.d.ts.map