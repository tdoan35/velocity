import type { FlyMachine, FlyMachineConfig, CreateMachineResponse, FlyAppInfo } from '@/types/fly.types';
export declare class FlyIOService {
    private client;
    private appName;
    constructor(apiToken: string, appName: string);
    /**
     * Create a new Fly machine for preview container
     */
    createMachine(projectId: string, tierName?: string, customConfig?: Partial<FlyMachineConfig>, sessionId?: string): Promise<CreateMachineResponse>;
    /**
     * Destroy a Fly machine with retry logic and verification
     */
    destroyMachine(machineId: string): Promise<void>;
    /**
     * Verify that a machine has been destroyed
     */
    verifyMachineDestroyed(machineId: string): Promise<boolean>;
    /**
     * Check health of a container
     */
    checkContainerHealth(containerId: string): Promise<{
        isHealthy: boolean;
        state: string | null;
        checks: Array<{
            name: string;
            status: string;
            output: string;
        }>;
        error?: string;
    }>;
    /**
     * Get machine status and details
     */
    getMachine(machineId: string): Promise<FlyMachine | null>;
    /**
     * List all machines in the app
     */
    listMachines(): Promise<FlyMachine[]>;
    /**
     * Get app information
     */
    getAppInfo(): Promise<FlyAppInfo | null>;
    /**
     * Wait for machine to be in ready state
     */
    private waitForMachineReady;
    /**
     * Start a stopped machine
     */
    startMachine(machineId: string): Promise<void>;
    /**
     * Stop a running machine
     */
    stopMachine(machineId: string): Promise<void>;
    /**
     * Select appropriate region based on security policy
     */
    private selectRegion;
    /**
     * Get resource usage metrics for a machine
     */
    getMachineMetrics(machineId: string): Promise<{
        cpu: number;
        memory: number;
        disk: number;
        network: {
            in: number;
            out: number;
        };
        uptime: number;
    } | null>;
    /**
     * Monitor machine resource usage and enforce limits
     */
    monitorMachine(machineId: string): Promise<{
        status: 'ok' | 'warning' | 'critical';
        alerts: string[];
        actions: string[];
    }>;
    /**
     * Apply resource limit enforcement to a running machine
     */
    enforceResourceLimits(machineId: string): Promise<boolean>;
    /**
     * Find all containers for a specific project/session
     */
    findContainersForProject(projectId: string): Promise<FlyMachine[]>;
    /**
     * Clean up stale containers for a project before creating a new one
     */
    cleanupProjectContainers(projectId: string): Promise<number>;
    /**
     * Clean up orphaned machines (for maintenance)
     */
    cleanupOrphanedMachines(maxAgeMinutes?: number): Promise<number>;
}
//# sourceMappingURL=fly-io.d.ts.map