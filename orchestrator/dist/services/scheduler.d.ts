export declare class SchedulerService {
    private containerManager;
    private monitoringService;
    private jobs;
    constructor();
    /**
     * Start all scheduled jobs
     */
    startJobs(): void;
    /**
     * Stop all scheduled jobs
     */
    stopJobs(): void;
    /**
     * Get status of all scheduled jobs
     */
    getJobStatus(): {
        name: string;
        running: boolean;
    }[];
    /**
     * Enforce session timeouts based on tier limits
     */
    private enforceSessionTimeouts;
    /**
     * Collect system-wide metrics for monitoring
     */
    private collectSystemMetrics;
    /**
     * Run a specific job immediately (for testing/debugging)
     */
    runJobNow(jobName: string): Promise<void>;
}
//# sourceMappingURL=scheduler.d.ts.map