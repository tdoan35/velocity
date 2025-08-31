import axios, { AxiosInstance } from 'axios';
import type { 
  FlyMachine, 
  FlyMachineConfig, 
  CreateMachineRequest, 
  CreateMachineResponse,
  FlyAppInfo
} from '@/types/fly.types';

export class FlyIOService {
  private client: AxiosInstance;
  private appName: string;

  constructor(apiToken: string, appName: string) {
    this.appName = appName;
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
  async createMachine(projectId: string): Promise<CreateMachineResponse> {
    const machineConfig: FlyMachineConfig = {
      image: 'ghcr.io/velocity/preview-container:latest',
      env: {
        PROJECT_ID: projectId,
        SUPABASE_URL: process.env.SUPABASE_URL!,
        SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY!,
        NODE_ENV: 'production',
      },
      guest: {
        cpu_kind: 'shared',
        cpus: 1,
        memory_mb: 512,
      },
      services: [
        {
          ports: [
            {
              port: 80,
              handlers: ['http'],
            },
            {
              port: 443,
              handlers: ['tls', 'http'],
            },
          ],
          protocol: 'tcp',
          internal_port: 8080,
        },
      ],
      auto_destroy: true,
      restart: {
        policy: 'no',
      },
      metadata: {
        'velocity-project-id': projectId,
        'velocity-service': 'preview-container',
      },
    };

    const createRequest: CreateMachineRequest = {
      name: `preview-${projectId}-${Date.now()}`,
      config: machineConfig,
      region: 'dfw', // Dallas region for better latency
    };

    try {
      const response = await this.client.post(
        `/apps/${this.appName}/machines`,
        createRequest
      );

      const machine: FlyMachine = response.data;
      
      // Wait for machine to be ready
      await this.waitForMachineReady(machine.id);

      return {
        machine,
        url: `https://${machine.name}.fly.dev`,
      };
    } catch (error) {
      console.error('Failed to create Fly machine:', error);
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