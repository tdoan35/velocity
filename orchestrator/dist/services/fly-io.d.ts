import type { FlyMachine, CreateMachineResponse, FlyAppInfo } from '@/types/fly.types';
export declare class FlyIOService {
    private client;
    private appName;
    constructor(apiToken: string, appName: string);
    /**
     * Create a new Fly machine for preview container
     */
    createMachine(projectId: string): Promise<CreateMachineResponse>;
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
     * Clean up orphaned machines (for maintenance)
     */
    cleanupOrphanedMachines(maxAgeMinutes?: number): Promise<number>;
}
//# sourceMappingURL=fly-io.d.ts.map