import type { FlyMachine, FlyMachineConfig, CreateMachineResponse, FlyAppInfo } from '@/types/fly.types';
export declare class FlyIOService {
    private client;
    private appName;
    constructor(apiToken: string, appName: string);
    /**
     * Create a new Fly machine for preview container
     */
    createMachine(projectId: string, tierName?: string, customConfig?: Partial<FlyMachineConfig>): Promise<CreateMachineResponse>;
    /**
     * Destroy a Fly machine
     */
    destroyMachine(machineId: string): Promise<void>;
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
     * Clean up orphaned machines (for maintenance)
     */
    cleanupOrphanedMachines(maxAgeMinutes?: number): Promise<number>;
}
//# sourceMappingURL=fly-io.d.ts.map