export interface ResourceLimits {
  cpu: {
    kind: 'shared' | 'dedicated';
    cpus: number;
  };
  memory: {
    mb: number;
    swap_size_mb?: number;
  };
  disk?: {
    size_gb?: number;
    iops?: number;
  };
}

export interface SecurityPolicy {
  network: {
    allowedPorts: number[];
    blockedRegions?: string[];
    allowedDomains?: string[];
    enableFirewall: boolean;
  };
  isolation: {
    readOnlyRootFs: boolean;
    noNewPrivileges: boolean;
    dropCapabilities: string[];
    seccompProfile?: string;
  };
  monitoring: {
    enableMetrics: boolean;
    enableLogging: boolean;
    healthCheckInterval: number;
    resourceAlerts: {
      cpuThreshold: number;
      memoryThreshold: number;
      diskThreshold: number;
    };
  };
}

export interface ContainerTier {
  name: string;
  resources: ResourceLimits;
  security: SecurityPolicy;
  maxDurationHours: number;
  description: string;
}

export const CONTAINER_TIERS: Record<string, ContainerTier> = {
  'free': {
    name: 'Free Tier',
    description: 'Basic preview containers with limited resources',
    maxDurationHours: 2,
    resources: {
      cpu: {
        kind: 'shared',
        cpus: 1,
      },
      memory: {
        mb: 256,
        swap_size_mb: 128,
      },
      disk: {
        size_gb: 1,
      },
    },
    security: {
      network: {
        allowedPorts: [8080, 8081, 3000],
        blockedRegions: [],
        enableFirewall: true,
      },
      isolation: {
        readOnlyRootFs: true,
        noNewPrivileges: true,
        dropCapabilities: ['ALL'],
        seccompProfile: 'runtime/default',
      },
      monitoring: {
        enableMetrics: true,
        enableLogging: true,
        healthCheckInterval: 30,
        resourceAlerts: {
          cpuThreshold: 80,
          memoryThreshold: 85,
          diskThreshold: 90,
        },
      },
    },
  },
  'basic': {
    name: 'Basic Tier',
    description: 'Standard preview containers with moderate resources',
    maxDurationHours: 4,
    resources: {
      cpu: {
        kind: 'shared',
        cpus: 2,
      },
      memory: {
        mb: 512,
        swap_size_mb: 256,
      },
      disk: {
        size_gb: 2,
      },
    },
    security: {
      network: {
        allowedPorts: [8080, 8081, 3000, 3001],
        enableFirewall: true,
      },
      isolation: {
        readOnlyRootFs: true,
        noNewPrivileges: true,
        dropCapabilities: ['NET_ADMIN', 'SYS_ADMIN'],
        seccompProfile: 'runtime/default',
      },
      monitoring: {
        enableMetrics: true,
        enableLogging: true,
        healthCheckInterval: 30,
        resourceAlerts: {
          cpuThreshold: 85,
          memoryThreshold: 90,
          diskThreshold: 85,
        },
      },
    },
  },
  'pro': {
    name: 'Pro Tier',
    description: 'High-performance containers with dedicated resources',
    maxDurationHours: 8,
    resources: {
      cpu: {
        kind: 'dedicated',
        cpus: 4,
      },
      memory: {
        mb: 1024,
        swap_size_mb: 512,
      },
      disk: {
        size_gb: 4,
        iops: 3000,
      },
    },
    security: {
      network: {
        allowedPorts: [8080, 8081, 3000, 3001, 4000, 5000],
        enableFirewall: true,
      },
      isolation: {
        readOnlyRootFs: false,
        noNewPrivileges: true,
        dropCapabilities: ['NET_ADMIN'],
        seccompProfile: 'runtime/default',
      },
      monitoring: {
        enableMetrics: true,
        enableLogging: true,
        healthCheckInterval: 15,
        resourceAlerts: {
          cpuThreshold: 90,
          memoryThreshold: 95,
          diskThreshold: 80,
        },
      },
    },
  },
};

export const DEFAULT_SECURITY_CONFIG: SecurityPolicy = CONTAINER_TIERS.free.security;

export function getContainerTier(tierName: string): ContainerTier {
  const tier = CONTAINER_TIERS[tierName];
  if (!tier) {
    console.warn(`Unknown container tier: ${tierName}, falling back to free tier`);
    return CONTAINER_TIERS.free;
  }
  return tier;
}

export function validateResourceLimits(resources: ResourceLimits): boolean {
  if (resources.cpu.cpus < 1 || resources.cpu.cpus > 8) {
    return false;
  }
  
  if (resources.memory.mb < 128 || resources.memory.mb > 4096) {
    return false;
  }
  
  if (resources.disk?.size_gb && (resources.disk.size_gb < 1 || resources.disk.size_gb > 10)) {
    return false;
  }
  
  return true;
}

export function applySecurityHardening(config: any, security: SecurityPolicy): any {
  // Apply security hardening to Fly machine config
  // Note: Fly.io API doesn't support Docker-specific security settings like cap_drop, 
  // seccomp_profile, etc. Security is enforced at the platform level.
  const hardenedConfig = {
    ...config,
    // Keep the original init configuration (only valid Fly.io properties)
    init: {
      ...config.init,
      // Only use supported Fly.io init properties: cmd, entrypoint, exec
    },
    // Use a simple object format for checks as expected by Fly.io API
    checks: {
      // HTTP health check for application readiness
      'health': {
        type: 'http',
        port: 8080,
        method: 'GET',
        path: '/health',
        protocol: 'http',
        interval: `${security.monitoring.healthCheckInterval}s`,
        timeout: '10s',
        grace_period: '15s',
      },
    },
  };

  // Apply network security by filtering allowed ports
  if (security.network.enableFirewall && security.network.allowedPorts.length > 0) {
    hardenedConfig.services = hardenedConfig.services?.map((service: any) => ({
      ...service,
      ports: service.ports.filter((port: any) => 
        security.network.allowedPorts.includes(port.port)
      ),
    })) || [];
  }

  // Add security-focused metadata for monitoring and compliance
  hardenedConfig.metadata = {
    ...hardenedConfig.metadata,
    'security-tier': 'hardened',
    'monitoring-enabled': security.monitoring.enableMetrics.toString(),
    'firewall-enabled': security.network.enableFirewall.toString(),
    'allowed-ports': security.network.allowedPorts.join(','),
  };

  return hardenedConfig;
}