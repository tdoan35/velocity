// Fly.io API types for machine management

export interface FlyMachine {
  id: string;
  name: string;
  state: 'created' | 'starting' | 'started' | 'stopping' | 'stopped' | 'replacing' | 'destroying' | 'destroyed' | 'failed';
  region: string;
  instance_id: string;
  private_ip: string;
  config: FlyMachineConfig;
  image_ref: {
    registry: string;
    repository: string;
    tag: string;
    digest: string;
  };
  created_at: string;
  updated_at: string;
  events?: FlyMachineEvent[];
  checks?: FlyMachineCheck[];
  metadata?: Record<string, string>;
}

export interface FlyMachineConfig {
  image: string;
  env?: Record<string, string>;
  guest?: {
    cpu_kind?: 'shared' | 'dedicated';
    cpus?: number;
    memory_mb?: number;
    gpu_kind?: string;
  };
  services?: FlyService[];
  auto_destroy?: boolean;
  restart?: {
    policy?: 'no' | 'always' | 'on-failure';
    max_retries?: number;
  };
  metadata?: Record<string, string>;
  init?: {
    exec?: string[];
    entrypoint?: string[];
    cmd?: string[];
    tty?: boolean;
    cap_drop?: string[];
    no_new_privileges?: boolean;
    read_only?: boolean;
    seccomp_profile?: string;
  };
  mounts?: FlyMount[];
  processes?: Record<string, FlyProcess>;
  checks?: Array<{
    grace_period?: string;
    interval?: string;
    method?: string;
    path?: string;
    port?: number;
    protocol?: string;
    timeout?: string;
    type?: string;
    script?: string;
  }>;
}

export interface FlyService {
  protocol: 'tcp' | 'udp';
  internal_port: number;
  ports: FlyPort[];
  force_https?: boolean;
  auto_stop_machines?: boolean;
  auto_start_machines?: boolean;
  min_machines_running?: number;
  concurrency?: {
    type: 'connections' | 'requests';
    hard_limit: number;
    soft_limit: number;
  };
}

export interface FlyPort {
  port: number;
  handlers: string[];
  force_https?: boolean;
  tls_options?: {
    alpn?: string[];
    versions?: string[];
  };
}

export interface FlyMount {
  source: string;
  destination: string;
  type?: 'volume';
  name?: string;
}

export interface FlyProcess {
  exec?: string[];
  entrypoint?: string[];
  cmd?: string[];
  env?: Record<string, string>;
}

export interface FlyMachineEvent {
  id: string;
  type: string;
  status: string;
  source: string;
  timestamp: string;
  request?: any;
}

export interface FlyMachineCheck {
  name: string;
  status: 'passing' | 'warning' | 'critical';
  output: string;
  updated_at: string;
}

export interface CreateMachineRequest {
  name?: string;
  config: FlyMachineConfig;
  region?: string;
  skip_launch?: boolean;
  skip_service_registration?: boolean;
}

export interface CreateMachineResponse {
  machine: FlyMachine;
  url: string;
}

export interface FlyAppInfo {
  id: string;
  name: string;
  machine_count: number;
  network: string;
  organization: {
    name: string;
    slug: string;
  };
  status: string;
  deployed: boolean;
  hostname: string;
  appUrl: string;
  version: number;
  release?: {
    id: string;
    version: number;
    stable: boolean;
    created_at: string;
  };
}

export interface FlyRegion {
  code: string;
  name: string;
  latitude?: number;
  longitude?: number;
}

// Error types
export interface FlyAPIError {
  error: string;
  details?: Record<string, any>;
}

// Configuration types for app-level settings
export interface FlyAppConfig {
  app_name: string;
  build?: {
    image?: string;
    dockerfile?: string;
    buildpacks?: string[];
    args?: Record<string, string>;
  };
  deploy?: {
    release_command?: string;
    strategy?: 'canary' | 'rolling' | 'immediate';
  };
  env?: Record<string, string>;
  experimental?: {
    auto_rollback?: boolean;
    enable_consul?: boolean;
  };
  http_service?: {
    internal_port?: number;
    force_https?: boolean;
    auto_stop_machines?: boolean;
    auto_start_machines?: boolean;
    min_machines_running?: number;
    processes?: string[];
  };
  console_command?: string;
}