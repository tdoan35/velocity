import { 
  getContainerTier, 
  validateResourceLimits, 
  applySecurityHardening,
  CONTAINER_TIERS 
} from '../../config/container-security';

describe('Container Security Configuration', () => {
  describe('getContainerTier', () => {
    test('should return correct tier for valid tier names', () => {
      const freeTier = getContainerTier('free');
      expect(freeTier.name).toBe('Free Tier');
      expect(freeTier.resources.cpu.cpus).toBe(1);
      expect(freeTier.resources.memory.mb).toBe(256);

      const basicTier = getContainerTier('basic');
      expect(basicTier.name).toBe('Basic Tier');
      expect(basicTier.resources.cpu.cpus).toBe(2);
      expect(basicTier.resources.memory.mb).toBe(512);

      const proTier = getContainerTier('pro');
      expect(proTier.name).toBe('Pro Tier');
      expect(proTier.resources.cpu.cpus).toBe(4);
      expect(proTier.resources.memory.mb).toBe(1024);
    });

    test('should fallback to free tier for invalid tier names', () => {
      const invalidTier = getContainerTier('invalid-tier');
      expect(invalidTier).toEqual(CONTAINER_TIERS.free);
    });
  });

  describe('validateResourceLimits', () => {
    test('should validate valid resource limits', () => {
      const validLimits = {
        cpu: { kind: 'shared' as const, cpus: 2 },
        memory: { mb: 512 },
        disk: { size_gb: 2 },
      };
      
      expect(validateResourceLimits(validLimits)).toBe(true);
    });

    test('should reject invalid CPU limits', () => {
      const invalidCpuLimits = {
        cpu: { kind: 'shared' as const, cpus: 10 }, // Too high
        memory: { mb: 512 },
      };
      
      expect(validateResourceLimits(invalidCpuLimits)).toBe(false);
    });

    test('should reject invalid memory limits', () => {
      const invalidMemoryLimits = {
        cpu: { kind: 'shared' as const, cpus: 2 },
        memory: { mb: 8192 }, // Too high
      };
      
      expect(validateResourceLimits(invalidMemoryLimits)).toBe(false);
    });

    test('should reject invalid disk limits', () => {
      const invalidDiskLimits = {
        cpu: { kind: 'shared' as const, cpus: 2 },
        memory: { mb: 512 },
        disk: { size_gb: 20 }, // Too high
      };
      
      expect(validateResourceLimits(invalidDiskLimits)).toBe(false);
    });
  });

  describe('applySecurityHardening', () => {
    test('should apply security hardening to machine config', () => {
      const baseConfig = {
        image: 'test:latest',
        services: [
          {
            ports: [
              { port: 80, handlers: ['http'] },
              { port: 443, handlers: ['tls', 'http'] },
              { port: 8080, handlers: ['http'] },
              { port: 9000, handlers: ['http'] }, // Should be filtered out
            ],
            protocol: 'tcp',
            internal_port: 8080,
          },
        ],
      };

      const security = CONTAINER_TIERS.free.security;
      const hardenedConfig = applySecurityHardening(baseConfig, security);

      // Check that security settings are applied
      expect(hardenedConfig.init.cap_drop).toEqual(['ALL']);
      expect(hardenedConfig.init.no_new_privileges).toBe(true);
      expect(hardenedConfig.init.read_only).toBe(true);
      expect(hardenedConfig.init.seccomp_profile).toBe('runtime/default');

      // Check that only allowed ports are kept
      const allowedPorts = hardenedConfig.services[0].ports.map((p: any) => p.port);
      expect(allowedPorts).toEqual([8080]); // Only port 8080 from the original config is in the allowed list
      expect(allowedPorts).not.toContain(9000);

      // Check that health checks are added
      expect(hardenedConfig.checks).toBeDefined();
      expect(hardenedConfig.checks).toHaveLength(2);
      expect(hardenedConfig.checks[0].type).toBe('http');
      expect(hardenedConfig.checks[1].type).toBe('script');
    });

    test('should handle empty services array', () => {
      const baseConfig = {
        image: 'test:latest',
        services: [],
      };

      const security = CONTAINER_TIERS.basic.security;
      const hardenedConfig = applySecurityHardening(baseConfig, security);

      expect(hardenedConfig.services).toEqual([]);
      expect(hardenedConfig.init).toBeDefined();
      expect(hardenedConfig.checks).toBeDefined();
    });

    test('should preserve existing init settings while adding security', () => {
      const baseConfig = {
        image: 'test:latest',
        init: {
          cmd: ['node', 'server.js'],
          entrypoint: ['/bin/sh'],
          tty: false,
        },
      };

      const security = CONTAINER_TIERS.pro.security;
      const hardenedConfig = applySecurityHardening(baseConfig, security);

      // Check that existing init settings are preserved
      expect(hardenedConfig.init.cmd).toEqual(['node', 'server.js']);
      expect(hardenedConfig.init.entrypoint).toEqual(['/bin/sh']);
      expect(hardenedConfig.init.tty).toBe(false);

      // Check that security settings are added
      expect(hardenedConfig.init.cap_drop).toEqual(['NET_ADMIN']);
      expect(hardenedConfig.init.no_new_privileges).toBe(true);
      expect(hardenedConfig.init.read_only).toBe(false); // Pro tier allows read-write
    });
  });

  describe('Container Tier Configurations', () => {
    test('should have consistent tier structure', () => {
      Object.values(CONTAINER_TIERS).forEach(tier => {
        expect(tier.name).toBeDefined();
        expect(tier.description).toBeDefined();
        expect(tier.maxDurationHours).toBeGreaterThan(0);
        
        expect(tier.resources.cpu.kind).toMatch(/^(shared|dedicated)$/);
        expect(tier.resources.cpu.cpus).toBeGreaterThan(0);
        expect(tier.resources.memory.mb).toBeGreaterThan(0);
        
        expect(tier.security.network.allowedPorts).toBeDefined();
        expect(Array.isArray(tier.security.network.allowedPorts)).toBe(true);
        expect(tier.security.network.enableFirewall).toBeDefined();
        
        expect(tier.security.isolation.dropCapabilities).toBeDefined();
        expect(Array.isArray(tier.security.isolation.dropCapabilities)).toBe(true);
        
        expect(tier.security.monitoring.enableMetrics).toBe(true);
        expect(tier.security.monitoring.enableLogging).toBe(true);
        expect(tier.security.monitoring.healthCheckInterval).toBeGreaterThan(0);
      });
    });

    test('should have escalating resource limits across tiers', () => {
      const free = CONTAINER_TIERS.free;
      const basic = CONTAINER_TIERS.basic;
      const pro = CONTAINER_TIERS.pro;

      // CPU should increase across tiers
      expect(basic.resources.cpu.cpus).toBeGreaterThan(free.resources.cpu.cpus);
      expect(pro.resources.cpu.cpus).toBeGreaterThan(basic.resources.cpu.cpus);

      // Memory should increase across tiers
      expect(basic.resources.memory.mb).toBeGreaterThan(free.resources.memory.mb);
      expect(pro.resources.memory.mb).toBeGreaterThan(basic.resources.memory.mb);

      // Duration should increase across tiers
      expect(basic.maxDurationHours).toBeGreaterThan(free.maxDurationHours);
      expect(pro.maxDurationHours).toBeGreaterThan(basic.maxDurationHours);
    });

    test('should have appropriate security restrictions for free tier', () => {
      const free = CONTAINER_TIERS.free;
      
      // Free tier should have strictest security
      expect(free.security.isolation.readOnlyRootFs).toBe(true);
      expect(free.security.isolation.dropCapabilities).toContain('ALL');
      expect(free.resources.memory.mb).toBe(256); // Minimal resources
      expect(free.maxDurationHours).toBe(2); // Short duration
    });

    test('should have relaxed security for pro tier', () => {
      const pro = CONTAINER_TIERS.pro;
      
      // Pro tier should have more relaxed security
      expect(pro.security.isolation.readOnlyRootFs).toBe(false);
      expect(pro.security.isolation.dropCapabilities).not.toContain('ALL');
      expect(pro.resources.cpu.kind).toBe('dedicated');
      expect(pro.maxDurationHours).toBe(8); // Longer duration
    });
  });
});