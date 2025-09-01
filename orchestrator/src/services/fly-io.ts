import axios, { AxiosInstance } from 'axios';
import type { 
  FlyMachine, 
  FlyMachineConfig, 
  CreateMachineRequest, 
  CreateMachineResponse,
  FlyAppInfo
} from '@/types/fly.types';
import { 
  getContainerTier, 
  applySecurityHardening,
  type ContainerTier
} from '../config/container-security';

export class FlyIOService {
  private client: AxiosInstance;
  private appName: string;

  constructor(apiToken: string, appName: string) {
    this.appName = appName;
    console.log(`🛩️  FlyIOService initialized with app name: "${appName}"`);
    this.client = axios.create({
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
  async createMachine(
    projectId: string, 
    tierName: string = 'free',
    customConfig?: Partial<FlyMachineConfig>
  ): Promise<CreateMachineResponse> {
    // Get the appropriate container tier configuration
    const tier = getContainerTier(tierName);
    console.log(`Creating machine with tier: ${tier.name} (${tierName})`);

    // Machine config with HTTP service for external access
    const createRequest: CreateMachineRequest = {
      name: `preview-${projectId}-${Date.now()}`,
      region: 'ord',
      config: {
        image: 'ghcr.io/tdoan35/velocity/velocity-preview-container:latest',
        env: {
          NODE_ENV: 'development',
          PROJECT_ID: projectId,
          SUPABASE_URL: process.env.SUPABASE_URL!,
          SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!
        },
        guest: {
          cpu_kind: 'shared',
          cpus: 1,
          memory_mb: 512
        },
        services: [
          {
            protocol: 'tcp',
            internal_port: 8080,
            ports: [
              { port: 80, handlers: ['http'] },
              { port: 443, handlers: ['http', 'tls'] }
            ]
          }
        ],
        checks: {
          'http-get': {
            type: 'http',
            port: 8080,
            method: 'GET',
            path: '/',
            grace_period: '5s',
            interval: '10s',
            timeout: '2s'
          }
        }
      }
    };

    try {
      console.log('🚀 Creating machine with config:', JSON.stringify(createRequest, null, 2));
      console.log('🔑 Using app name:', this.appName);
      console.log('🔑 Request URL:', `/apps/${this.appName}/machines`);
      console.log('🔑 Full URL:', `${this.client.defaults.baseURL}/apps/${this.appName}/machines`);
      console.log('🔑 Request headers:', JSON.stringify(this.client.defaults.headers, null, 2));
      console.log('🔑 Request body:', JSON.stringify(createRequest, null, 2));
      
      const response = await this.client.post(
        `/apps/${this.appName}/machines`,
        createRequest
      );

      const machine: FlyMachine = response.data;
      
      // Wait for machine to be ready
      await this.waitForMachineReady(machine.id);

      return {
        machine,
        url: `https://${this.appName}.fly.dev`,
      };
    } catch (error) {
      console.error('❌ Failed to create Fly machine:', error);
      if (axios.isAxiosError(error)) {
        console.error('❌ Response status:', error.response?.status);
        console.error('❌ Response data:', error.response?.data);
        console.error('❌ Request config:', {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers,
          data: error.config?.data
        });
      }
      throw new Error(`Failed to create preview container: ${error}`);
    }
  }

  /**
   * Destroy a Fly machine
   */
  async destroyMachine(machineId: string): Promise<void> {
    try {
      // Stop the machine first
      await this.client.post(
        `/apps/${this.appName}/machines/${machineId}/stop`
      );

      // Wait a moment for graceful shutdown
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Destroy the machine
      await this.client.delete(
        `/apps/${this.appName}/machines/${machineId}?force=true`
      );

      console.log(`Successfully destroyed machine: ${machineId}`);
    } catch (error) {
      console.error(`Failed to destroy machine ${machineId}:`, error);
      // Don't throw here - we want to continue cleanup even if destroy fails
    }
  }

  /**
   * Get machine status and details
   */
  async getMachine(machineId: string): Promise<FlyMachine | null> {
    try {
      const response = await this.client.get(
        `/apps/${this.appName}/machines/${machineId}`
      );
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List all machines in the app
   */
  async listMachines(): Promise<FlyMachine[]> {
    try {
      const response = await this.client.get(`/apps/${this.appName}/machines`);
      return response.data;
    } catch (error) {
      console.error('Failed to list machines:', error);
      return [];
    }
  }

  /**
   * Get app information
   */
  async getAppInfo(): Promise<FlyAppInfo | null> {
    try {
      const response = await this.client.get(`/apps/${this.appName}`);
      return response.data;
    } catch (error) {
      console.error('Failed to get app info:', error);
      return null;
    }
  }

  /**
   * Wait for machine to be in ready state
   */
  private async waitForMachineReady(
    machineId: string, 
    timeout: number = 60000
  ): Promise<void> {
    const startTime = Date.now();
    console.log(`⏳ Waiting for machine ${machineId} to be ready (timeout: ${timeout}ms)`);
    
    let checkCount = 0;
    while (Date.now() - startTime < timeout) {
      checkCount++;
      const elapsed = Date.now() - startTime;
      console.log(`🔄 Check #${checkCount} for machine ${machineId} (elapsed: ${elapsed}ms)`);
      
      const machine = await this.getMachine(machineId);
      
      if (!machine) {
        console.error(`❌ Machine ${machineId} not found on check #${checkCount}`);
        throw new Error(`Machine ${machineId} not found`);
      }

      console.log(`📊 Machine ${machineId} status - State: ${machine.state}, Checks: ${machine.checks?.length || 0}`);
      
      // Log detailed check status
      if (machine.checks && machine.checks.length > 0) {
        machine.checks.forEach((check, index) => {
          console.log(`  🏥 Check ${index + 1}: name="${check.name}", status="${check.status}", output="${check.output}"`);
        });
      } else {
        console.log(`  ⚠️ No health checks found for machine ${machineId}`);
      }

      // Machine is ready if:
      // 1. State is 'started', AND
      // 2. Either no health checks configured, OR all health checks are passing
      const hasHealthChecks = machine.checks && machine.checks.length > 0;
      const allChecksPass = hasHealthChecks ? machine.checks!.every(check => check.status === 'passing') : true;
      
      if (machine.state === 'started' && allChecksPass) {
        if (hasHealthChecks) {
          console.log(`✅ Machine ${machineId} is ready! All ${machine.checks!.length} health checks passing (${elapsed}ms elapsed)`);
        } else {
          console.log(`✅ Machine ${machineId} is ready! No health checks configured, machine started successfully (${elapsed}ms elapsed)`);
        }
        return;
      }

      if (machine.state === 'failed' || machine.state === 'stopped') {
        console.error(`❌ Machine ${machineId} failed to start: ${machine.state}`);
        throw new Error(`Machine ${machineId} failed to start: ${machine.state}`);
      }

      console.log(`⏸️ Machine ${machineId} not ready yet, waiting 2s before next check...`);
      // Wait 2 seconds before checking again
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    const finalElapsed = Date.now() - startTime;
    console.error(`⏰ TIMEOUT: Machine ${machineId} did not become ready within ${timeout}ms (actual: ${finalElapsed}ms, checks: ${checkCount})`);
    throw new Error(`Machine ${machineId} did not become ready within ${timeout}ms`);
  }

  /**
   * Start a stopped machine
   */
  async startMachine(machineId: string): Promise<void> {
    try {
      await this.client.post(`/apps/${this.appName}/machines/${machineId}/start`);
    } catch (error) {
      console.error(`Failed to start machine ${machineId}:`, error);
      throw new Error(`Failed to start machine: ${error}`);
    }
  }

  /**
   * Stop a running machine
   */
  async stopMachine(machineId: string): Promise<void> {
    try {
      await this.client.post(`/apps/${this.appName}/machines/${machineId}/stop`);
    } catch (error) {
      console.error(`Failed to stop machine ${machineId}:`, error);
      throw new Error(`Failed to stop machine: ${error}`);
    }
  }

  /**
   * Select appropriate region based on security policy
   */
  private selectRegion(blockedRegions: string[] = []): string {
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
  async getMachineMetrics(machineId: string): Promise<{
    cpu: number;
    memory: number;
    disk: number;
    network: { in: number; out: number };
    uptime: number;
  } | null> {
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
    } catch (error) {
      console.error(`Failed to get metrics for machine ${machineId}:`, error);
      return null;
    }
  }

  /**
   * Monitor machine resource usage and enforce limits
   */
  async monitorMachine(machineId: string): Promise<{
    status: 'ok' | 'warning' | 'critical';
    alerts: string[];
    actions: string[];
  }> {
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
      const tier = getContainerTier(tierName);
      
      const alerts: string[] = [];
      const actions: string[] = [];
      let status: 'ok' | 'warning' | 'critical' = 'ok';

      // Check machine age against tier limits
      const createdAt = new Date(machine.created_at).getTime();
      const maxAge = tier.maxDurationHours * 60 * 60 * 1000;
      const age = Date.now() - createdAt;

      if (age > maxAge) {
        status = 'critical';
        alerts.push(`Machine exceeded max duration: ${Math.floor(age / (60 * 60 * 1000))}h / ${tier.maxDurationHours}h`);
        actions.push('Auto-destroy machine');
      } else if (age > maxAge * 0.8) {
        status = 'warning';
        alerts.push(`Machine approaching max duration: ${Math.floor(age / (60 * 60 * 1000))}h / ${tier.maxDurationHours}h`);
        actions.push('Notify user of impending shutdown');
      }

      // Check machine state
      if (machine.state === 'failed') {
        status = 'critical';
        alerts.push('Machine is in failed state');
        actions.push('Restart or replace machine');
      } else if (machine.state === 'stopping' || machine.state === 'stopped') {
        alerts.push('Machine is stopping/stopped');
        actions.push('Check for manual intervention needed');
      }

      // Check health checks
      if (machine.checks) {
        const failedChecks = machine.checks.filter(check => check.status !== 'passing');
        if (failedChecks.length > 0) {
          if (failedChecks.some(check => check.status === 'critical')) {
            status = 'critical';
          } else if (status === 'ok') {
            status = 'warning';
          }
          
          failedChecks.forEach(check => {
            alerts.push(`Health check failed: ${check.name} - ${check.output}`);
          });
          
          actions.push('Investigate health check failures');
        }
      }

      return { status, alerts, actions };

    } catch (error) {
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
  async enforceResourceLimits(machineId: string): Promise<boolean> {
    try {
      const machine = await this.getMachine(machineId);
      if (!machine) {
        return false;
      }

      const tierName = machine.metadata?.['velocity-tier'] || 'free';
      const tier = getContainerTier(tierName);

      // Check if current machine config matches tier limits
      const currentConfig = machine.config;
      const expectedConfig = {
        cpu_kind: tier.resources.cpu.kind,
        cpus: tier.resources.cpu.cpus,
        memory_mb: tier.resources.memory.mb,
      };

      const needsUpdate = (
        currentConfig.guest?.cpu_kind !== expectedConfig.cpu_kind ||
        currentConfig.guest?.cpus !== expectedConfig.cpus ||
        currentConfig.guest?.memory_mb !== expectedConfig.memory_mb
      );

      if (needsUpdate) {
        console.log(`Machine ${machineId} config does not match tier ${tierName}, enforcement needed`);
        // In a real implementation, you would update the machine config
        // For now, we log the discrepancy
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Failed to enforce resource limits for machine ${machineId}:`, error);
      return false;
    }
  }

  /**
   * Clean up orphaned machines (for maintenance)
   */
  async cleanupOrphanedMachines(maxAgeMinutes: number = 60): Promise<number> {
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
    } catch (error) {
      console.error('Failed to cleanup orphaned machines:', error);
      return 0;
    }
  }
}