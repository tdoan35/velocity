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
export declare const CONTAINER_TIERS: Record<string, ContainerTier>;
export declare const DEFAULT_SECURITY_CONFIG: SecurityPolicy;
export declare function getContainerTier(tierName: string): ContainerTier;
export declare function validateResourceLimits(resources: ResourceLimits): boolean;
export declare function applySecurityHardening(config: any, security: SecurityPolicy): any;
//# sourceMappingURL=container-security.d.ts.map