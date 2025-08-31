"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.FlyIOService = void 0;
const axios_1 = __importDefault(require("axios"));
const container_security_1 = require("../config/container-security");
class FlyIOService {
    constructor(apiToken, appName) {
        this.appName = appName;
        this.client = axios_1.default.create({
            baseURL: 'https://api.machines.dev/v1',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000, // 30 second timeout
        });
    }
    /**
     * Create a new Fly machine for preview container
     */
    async createMachine(projectId, tierName = 'free', customConfig) {
        // Get the appropriate container tier configuration
        const tier = (0, container_security_1.getContainerTier)(tierName);
        console.log(`Creating machine with tier: ${tier.name} (${tierName})`);
        const baseConfig = {
            image: 'ghcr.io/velocity/preview-container:latest',
            env: {
                PROJECT_ID: projectId,
                SUPABASE_URL: process.env.SUPABASE_URL,
                SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
                NODE_ENV: 'production',
                CONTAINER_TIER: tierName,
                // Security environment variables
                SECURITY_ENABLED: 'true',
                MAX_CPU_USAGE: tier.security.monitoring.resourceAlerts.cpuThreshold.toString(),
                MAX_MEMORY_USAGE: tier.security.monitoring.resourceAlerts.memoryThreshold.toString(),
            },
            guest: {
                cpu_kind: tier.resources.cpu.kind,
                cpus: tier.resources.cpu.cpus,
                memory_mb: tier.resources.memory.mb,
            },
            services: [
                {
                    ports: tier.security.network.allowedPorts.map(port => ({
                        port,
                        handlers: port === 443 ? ['tls', 'http'] : ['http'],
                    })),
                    protocol: 'tcp',
                    internal_port: 8080,
                    concurrency: {
                        type: 'requests',
                        hard_limit: tier.resources.cpu.cpus * 50,
                        soft_limit: tier.resources.cpu.cpus * 25,
                    },
                },
            ],
            auto_destroy: true,
            restart: {
                policy: 'no',
                max_retries: 0,
            },
            metadata: {
                'velocity-project-id': projectId,
                'velocity-service': 'preview-container',
                'velocity-tier': tierName,
                'velocity-max-duration': (tier.maxDurationHours * 60 * 60 * 1000).toString(),
                'created-at': new Date().toISOString(),
            },
            // Add kill signal handling for graceful shutdown
            init: {
                cmd: ['node', 'server.js'],
                tty: false,
            },
        };
        // Merge with any custom configuration
        const mergedConfig = { ...baseConfig, ...customConfig };
        // Apply security hardening
        const secureConfig = (0, container_security_1.applySecurityHardening)(mergedConfig, tier.security);
        const createRequest = {
            name: `preview-${projectId}-${Date.now()}`,
            config: secureConfig,
            region: this.selectRegion(tier.security.network.blockedRegions),
        };
        try {
            const response = await this.client.post(`/apps/${this.appName}/machines`, createRequest);
            const machine = response.data;
            // Wait for machine to be ready
            await this.waitForMachineReady(machine.id);
            return {
                machine,
                url: `https://${machine.name}.fly.dev`,
            };
        }
        catch (error) {
            console.error('Failed to create Fly machine:', error);
            throw new Error(`Failed to create preview container: ${error}`);
        }
    }
    /**
     * Destroy a Fly machine
     */
    async destroyMachine(machineId) {
        try {
            // Stop the machine first
            await this.client.post(`/apps/${this.appName}/machines/${machineId}/stop`);
            // Wait a moment for graceful shutdown
            await new Promise(resolve => setTimeout(resolve, 2000));
            // Destroy the machine
            await this.client.delete(`/apps/${this.appName}/machines/${machineId}?force=true`);
            console.log(`Successfully destroyed machine: ${machineId}`);
        }
        catch (error) {
            console.error(`Failed to destroy machine ${machineId}:`, error);
            // Don't throw here - we want to continue cleanup even if destroy fails
        }
    }
    /**
     * Get machine status and details
     */
    async getMachine(machineId) {
        try {
            const response = await this.client.get(`/apps/${this.appName}/machines/${machineId}`);
            return response.data;
        }
        catch (error) {
            if (axios_1.default.isAxiosError(error) && error.response?.status === 404) {
                return null;
            }
            throw error;
        }
    }
    /**
     * List all machines in the app
     */
    async listMachines() {
        try {
            const response = await this.client.get(`/apps/${this.appName}/machines`);
            return response.data;
        }
        catch (error) {
            console.error('Failed to list machines:', error);
            return [];
        }
    }
    /**
     * Get app information
     */
    async getAppInfo() {
        try {
            const response = await this.client.get(`/apps/${this.appName}`);
            return response.data;
        }
        catch (error) {
            console.error('Failed to get app info:', error);
            return null;
        }
    }
    /**
     * Wait for machine to be in ready state
     */
    async waitForMachineReady(machineId, timeout = 60000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            const machine = await this.getMachine(machineId);
            if (!machine) {
                throw new Error(`Machine ${machineId} not found`);
            }
            if (machine.state === 'started' && machine.checks?.every(check => check.status === 'passing')) {
                return;
            }
            if (machine.state === 'failed' || machine.state === 'stopped') {
                throw new Error(`Machine ${machineId} failed to start: ${machine.state}`);
            }
            // Wait 2 seconds before checking again
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
        throw new Error(`Machine ${machineId} did not become ready within ${timeout}ms`);
    }
    /**
     * Start a stopped machine
     */
    async startMachine(machineId) {
        try {
            await this.client.post(`/apps/${this.appName}/machines/${machineId}/start`);
        }
        catch (error) {
            console.error(`Failed to start machine ${machineId}:`, error);
            throw new Error(`Failed to start machine: ${error}`);
        }
    }
    /**
     * Stop a running machine
     */
    async stopMachine(machineId) {
        try {
            await this.client.post(`/apps/${this.appName}/machines/${machineId}/stop`);
        }
        catch (error) {
            console.error(`Failed to stop machine ${machineId}:`, error);
            throw new Error(`Failed to stop machine: ${error}`);
        }
    }
    /**
     * Select appropriate region based on security policy
     */
    selectRegion(blockedRegions = []) {
        const preferredRegions = ['dfw', 'iad', 'lax', 'sjc']; // US regions
        for (const region of preferredRegions) {
            if (!blockedRegions.includes(region)) {
                return region;
            }
        }
        // Fallback to Dallas if all preferred regions are blocked
        return 'dfw';
    }
    /**
     * Get resource usage metrics for a machine
     */
    async getMachineMetrics(machineId) {
        try {
            const machine = await this.getMachine(machineId);
            if (!machine) {
                return null;
            }
            // Fly.io doesn't directly expose metrics through the API
            // This would need to be implemented via machine stats endpoint or monitoring service
            // For now, returning mock data structure
            return {
                cpu: 0,
                memory: 0,
                disk: 0,
                network: { in: 0, out: 0 },
                uptime: Math.floor((Date.now() - new Date(machine.created_at).getTime()) / 1000),
            };
        }
        catch (error) {
            console.error(`Failed to get metrics for machine ${machineId}:`, error);
            return null;
        }
    }
    /**
     * Monitor machine resource usage and enforce limits
     */
    async monitorMachine(machineId) {
        try {
            const machine = await this.getMachine(machineId);
            if (!machine) {
                return {
                    status: 'critical',
                    alerts: ['Machine not found'],
                    actions: ['Remove from monitoring'],
                };
            }
            const tierName = machine.metadata?.['velocity-tier'] || 'free';
            const tier = (0, container_security_1.getContainerTier)(tierName);
            const alerts = [];
            const actions = [];
            let status = 'ok';
            // Check machine age against tier limits
            const createdAt = new Date(machine.created_at).getTime();
            const maxAge = tier.maxDurationHours * 60 * 60 * 1000;
            const age = Date.now() - createdAt;
            if (age > maxAge) {
                status = 'critical';
                alerts.push(`Machine exceeded max duration: ${Math.floor(age / (60 * 60 * 1000))}h / ${tier.maxDurationHours}h`);
                actions.push('Auto-destroy machine');
            }
            else if (age > maxAge * 0.8) {
                status = 'warning';
                alerts.push(`Machine approaching max duration: ${Math.floor(age / (60 * 60 * 1000))}h / ${tier.maxDurationHours}h`);
                actions.push('Notify user of impending shutdown');
            }
            // Check machine state
            if (machine.state === 'failed') {
                status = 'critical';
                alerts.push('Machine is in failed state');
                actions.push('Restart or replace machine');
            }
            else if (machine.state === 'stopping' || machine.state === 'stopped') {
                alerts.push('Machine is stopping/stopped');
                actions.push('Check for manual intervention needed');
            }
            // Check health checks
            if (machine.checks) {
                const failedChecks = machine.checks.filter(check => check.status !== 'passing');
                if (failedChecks.length > 0) {
                    if (failedChecks.some(check => check.status === 'critical')) {
                        status = 'critical';
                    }
                    else if (status === 'ok') {
                        status = 'warning';
                    }
                    failedChecks.forEach(check => {
                        alerts.push(`Health check failed: ${check.name} - ${check.output}`);
                    });
                    actions.push('Investigate health check failures');
                }
            }
            return { status, alerts, actions };
        }
        catch (error) {
            console.error(`Failed to monitor machine ${machineId}:`, error);
            return {
                status: 'critical',
                alerts: [`Monitoring error: ${error instanceof Error ? error.message : 'Unknown error'}`],
                actions: ['Check monitoring system'],
            };
        }
    }
    /**
     * Apply resource limit enforcement to a running machine
     */
    async enforceResourceLimits(machineId) {
        try {
            const machine = await this.getMachine(machineId);
            if (!machine) {
                return false;
            }
            const tierName = machine.metadata?.['velocity-tier'] || 'free';
            const tier = (0, container_security_1.getContainerTier)(tierName);
            // Check if current machine config matches tier limits
            const currentConfig = machine.config;
            const expectedConfig = {
                cpu_kind: tier.resources.cpu.kind,
                cpus: tier.resources.cpu.cpus,
                memory_mb: tier.resources.memory.mb,
            };
            const needsUpdate = (currentConfig.guest?.cpu_kind !== expectedConfig.cpu_kind ||
                currentConfig.guest?.cpus !== expectedConfig.cpus ||
                currentConfig.guest?.memory_mb !== expectedConfig.memory_mb);
            if (needsUpdate) {
                console.log(`Machine ${machineId} config does not match tier ${tierName}, enforcement needed`);
                // In a real implementation, you would update the machine config
                // For now, we log the discrepancy
                return false;
            }
            return true;
        }
        catch (error) {
            console.error(`Failed to enforce resource limits for machine ${machineId}:`, error);
            return false;
        }
    }
    /**
     * Clean up orphaned machines (for maintenance)
     */
    async cleanupOrphanedMachines(maxAgeMinutes = 60) {
        try {
            const machines = await this.listMachines();
            const cutoffTime = Date.now() - (maxAgeMinutes * 60 * 1000);
            let cleanedCount = 0;
            for (const machine of machines) {
                if (machine.metadata?.['velocity-service'] === 'preview-container') {
                    const createdAt = new Date(machine.created_at).getTime();
                    if (createdAt < cutoffTime && machine.state !== 'destroyed') {
                        console.log(`Cleaning up orphaned machine: ${machine.id}`);
                        await this.destroyMachine(machine.id);
                        cleanedCount++;
                    }
                }
            }
            console.log(`Cleaned up ${cleanedCount} orphaned machines`);
            return cleanedCount;
        }
        catch (error) {
            console.error('Failed to cleanup orphaned machines:', error);
            return 0;
        }
    }
}
exports.FlyIOService = FlyIOService;
//# sourceMappingURL=fly-io.js.map