import { ContainerManager } from '../container-manager';
import { FlyIOService } from '../fly-io';
import { getContainerTier } from '../../config/container-security';

// Integration tests for resource limits and monitoring
// These tests require actual Fly.io credentials and should be run in a test environment

describe('Resource Limits Integration Tests', () => {
  let containerManager: ContainerManager;
  let flyService: FlyIOService;
  
  beforeAll(() => {
    // Skip if running in CI without proper credentials
    if (!process.env.FLY_API_TOKEN || process.env.NODE_ENV === 'ci') {
      console.log('Skipping integration tests - no Fly.io credentials');
      return;
    }
    
    containerManager = new ContainerManager();
    flyService = new FlyIOService(
      process.env.FLY_API_TOKEN!,
      process.env.FLY_APP_NAME || 'velocity-preview-containers'
    );
  });

  describe('Resource Limit Enforcement', () => {
    test('should create container with correct resource limits for free tier', async () => {
      if (!process.env.FLY_API_TOKEN) {
        return; // Skip if no credentials
      }

      const projectId = `test-${Date.now()}`;
      const tier = 'free';
      
      try {
        const session = await containerManager.createSession({
          userId: 'test-user',
          projectId,
          tier,
        });

        expect(session.sessionId).toBeDefined();
        expect(session.containerId).toBeDefined();

        // Verify the machine was created with correct resource limits
        const machine = await flyService.getMachine(session.containerId);
        expect(machine).toBeTruthy();
        
        if (machine) {
          const expectedConfig = getContainerTier(tier);
          expect(machine.config.guest?.cpus).toBe(expectedConfig.resources.cpu.cpus);
          expect(machine.config.guest?.memory_mb).toBe(expectedConfig.resources.memory.mb);
          expect(machine.config.guest?.cpu_kind).toBe(expectedConfig.resources.cpu.kind);
          expect(machine.metadata?.['velocity-tier']).toBe(tier);
        }

        // Clean up
        await containerManager.destroySession(session.sessionId);
        
      } catch (error) {
        console.error('Test failed:', error);
        throw error;
      }
    }, 60000); // 60 second timeout for container creation

    test('should enforce different resource limits for different tiers', async () => {
      if (!process.env.FLY_API_TOKEN) {
        return; // Skip if no credentials
      }

      const testCases = [
        { tier: 'free', expectedCpus: 1, expectedMemory: 256 },
        { tier: 'basic', expectedCpus: 2, expectedMemory: 512 },
        { tier: 'pro', expectedCpus: 4, expectedMemory: 1024 },
      ];

      for (const testCase of testCases) {
        const projectId = `test-${testCase.tier}-${Date.now()}`;
        
        try {
          const session = await containerManager.createSession({
            userId: 'test-user',
            projectId,
            tier: testCase.tier,
          });

          const machine = await flyService.getMachine(session.containerId);
          expect(machine).toBeTruthy();
          
          if (machine) {
            expect(machine.config.guest?.cpus).toBe(testCase.expectedCpus);
            expect(machine.config.guest?.memory_mb).toBe(testCase.expectedMemory);
            expect(machine.metadata?.['velocity-tier']).toBe(testCase.tier);
          }

          // Clean up
          await containerManager.destroySession(session.sessionId);
          
        } catch (error) {
          console.error(`Test failed for tier ${testCase.tier}:`, error);
          throw error;
        }
      }
    }, 180000); // 3 minute timeout for multiple container creation
  });

  describe('Security Policy Enforcement', () => {
    test('should apply security hardening to container configuration', async () => {
      if (!process.env.FLY_API_TOKEN) {
        return; // Skip if no credentials
      }

      const projectId = `security-test-${Date.now()}`;
      
      try {
        const session = await containerManager.createSession({
          userId: 'test-user',
          projectId,
          tier: 'free',
        });

        const machine = await flyService.getMachine(session.containerId);
        expect(machine).toBeTruthy();
        
        if (machine) {
          // Check that security hardening was applied
          expect(machine.config.init?.cap_drop).toContain('ALL');
          expect(machine.config.init?.no_new_privileges).toBe(true);
          expect(machine.config.init?.read_only).toBe(true);
          
          // Check that only allowed ports are configured
          const freeTier = getContainerTier('free');
          if (machine.config.services && machine.config.services.length > 0) {
            const ports = machine.config.services[0].ports?.map(p => p.port) || [];
            ports.forEach(port => {
              expect(freeTier.security.network.allowedPorts).toContain(port);
            });
          }

          // Check that health checks are configured
          expect(machine.config.checks).toBeDefined();
          expect(machine.config.checks?.length).toBeGreaterThan(0);
        }

        // Clean up
        await containerManager.destroySession(session.sessionId);
        
      } catch (error) {
        console.error('Security test failed:', error);
        throw error;
      }
    }, 60000);
  });

  describe('Resource Monitoring', () => {
    test('should monitor resource usage and detect violations', async () => {
      if (!process.env.FLY_API_TOKEN) {
        return; // Skip if no credentials
      }

      const projectId = `monitor-test-${Date.now()}`;
      
      try {
        const session = await containerManager.createSession({
          userId: 'test-user',
          projectId,
          tier: 'free',
        });

        // Wait for container to be ready
        await new Promise(resolve => setTimeout(resolve, 10000));

        // Test resource monitoring
        const metrics = await containerManager.getSessionMetrics(session.sessionId);
        expect(metrics.sessionInfo).toBeTruthy();
        expect(metrics.resourceMetrics).toBeTruthy();
        expect(metrics.monitoring).toBeTruthy();

        if (metrics.monitoring) {
          expect(['ok', 'warning', 'critical']).toContain(metrics.monitoring.status);
          expect(Array.isArray(metrics.monitoring.alerts)).toBe(true);
          expect(Array.isArray(metrics.monitoring.actions)).toBe(true);
        }

        // Test enforcement
        const enforcement = await containerManager.enforceSessionLimits(session.sessionId);
        expect(enforcement.success).toBeDefined();
        expect(Array.isArray(enforcement.actions)).toBe(true);

        // Clean up
        await containerManager.destroySession(session.sessionId);
        
      } catch (error) {
        console.error('Monitoring test failed:', error);
        throw error;
      }
    }, 90000); // 90 second timeout for monitoring tests

    test('should run monitoring job and handle multiple sessions', async () => {
      if (!process.env.FLY_API_TOKEN) {
        return; // Skip if no credentials
      }

      // Create multiple sessions
      const sessions: string[] = [];
      
      try {
        for (let i = 0; i < 2; i++) {
          const projectId = `batch-test-${i}-${Date.now()}`;
          const session = await containerManager.createSession({
            userId: 'test-user',
            projectId,
            tier: 'free',
          });
          sessions.push(session.sessionId);
        }

        // Wait for containers to be ready
        await new Promise(resolve => setTimeout(resolve, 15000));

        // Run monitoring job
        await containerManager.runMonitoringJob();

        // Test monitoring all sessions
        const monitoringResults = await containerManager.monitorAllSessions();
        expect(monitoringResults.length).toBeGreaterThanOrEqual(sessions.length);

        monitoringResults.forEach(result => {
          expect(result.sessionId).toBeDefined();
          expect(result.containerId).toBeDefined();
          expect(result.tier).toBeDefined();
          expect(['ok', 'warning', 'critical']).toContain(result.status);
        });

      } finally {
        // Clean up all sessions
        for (const sessionId of sessions) {
          try {
            await containerManager.destroySession(sessionId);
          } catch (error) {
            console.error(`Failed to clean up session ${sessionId}:`, error);
          }
        }
      }
    }, 120000); // 2 minute timeout for batch tests
  });

  describe('Duration Limits', () => {
    test('should respect tier duration limits', async () => {
      const freeTier = getContainerTier('free');
      const basicTier = getContainerTier('basic');
      const proTier = getContainerTier('pro');

      expect(freeTier.maxDurationHours).toBe(2);
      expect(basicTier.maxDurationHours).toBe(4);
      expect(proTier.maxDurationHours).toBe(8);

      // Test that sessions are created with correct expiration times
      const projectId = `duration-test-${Date.now()}`;
      
      if (!process.env.FLY_API_TOKEN) {
        return; // Skip if no credentials
      }

      try {
        const session = await containerManager.createSession({
          userId: 'test-user',
          projectId,
          tier: 'basic',
        });

        const sessionInfo = await containerManager.getSessionStatus(session.sessionId);
        expect(sessionInfo).toBeTruthy();
        
        if (sessionInfo?.expiresAt) {
          const createdAt = sessionInfo.createdAt.getTime();
          const expiresAt = sessionInfo.expiresAt.getTime();
          const durationHours = (expiresAt - createdAt) / (1000 * 60 * 60);
          
          expect(durationHours).toBeCloseTo(basicTier.maxDurationHours, 0);
        }

        // Clean up
        await containerManager.destroySession(session.sessionId);
        
      } catch (error) {
        console.error('Duration test failed:', error);
        throw error;
      }
    }, 60000);
  });
});