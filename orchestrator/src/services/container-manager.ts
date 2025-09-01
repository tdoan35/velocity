import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { FlyIOService } from './fly-io';
import RealtimeChannelManager from './realtime-channel-manager';
import { getContainerTier } from '../config/container-security';
import type { 
  ContainerSession, 
  CreateSessionRequest, 
  PreviewSession
} from '../types';

export class ContainerManager {
  private supabase;
  private flyService: FlyIOService;
  private realtimeManager: RealtimeChannelManager;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    
    const flyApiToken = process.env.FLY_API_TOKEN!;
    // Temporarily hardcode the correct app name to test
    const flyAppName = 'velocity-preview-containers';
    
    console.log(`🔧 ContainerManager initialized with:`);
    console.log(`   FLY_APP_NAME (env): "${process.env.FLY_APP_NAME}"`);
    console.log(`   flyAppName (final): "${flyAppName}"`);

    if (!flyApiToken) {
      throw new Error('FLY_API_TOKEN environment variable is required');
    }

    this.flyService = new FlyIOService(flyApiToken, flyAppName);
    
    // Initialize realtime channel manager
    this.realtimeManager = new RealtimeChannelManager(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
  }

  /**
   * Creates a new preview session with container provisioning
   */
  async createSession(
    request: CreateSessionRequest & { 
      tier?: string;
      customConfig?: any;
    }
  ): Promise<ContainerSession> {
    const sessionId = uuidv4();
    const containerId = `preview-${sessionId.substring(0, 8)}`;
    const tier = request.tier || 'free';

    // Validate tier and get configuration
    const tierConfig = getContainerTier(tier);
    console.log(`Creating session with tier: ${tierConfig.name} for user: ${request.userId}`);

    try {
      // Create session record in database with 'creating' status
      const expiresAt = new Date(Date.now() + (tierConfig.maxDurationHours * 60 * 60 * 1000));
      
      const { error: dbError } = await this.supabase
        .from('preview_sessions')
        .insert({
          id: sessionId,
          user_id: request.userId,
          project_id: request.projectId,
          session_id: sessionId,
          container_id: containerId,
          status: 'creating',
          expires_at: expiresAt,
          tier: tier,
          resource_limits: {
            cpu_cores: tierConfig.resources.cpu.cpus,
            memory_mb: tierConfig.resources.memory.mb,
            max_duration_hours: tierConfig.maxDurationHours,
          },
        });

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      // Provision container using Fly.io Machines API with security hardening
      const { machine, url: containerUrl } = await this.flyService.createMachine(
        request.projectId, 
        tier, 
        request.customConfig,
        sessionId
      );
      
      // Update container ID with actual machine ID
      const actualContainerId = machine.id;

      // Update session with container URL and active status
      const { error: updateError } = await this.supabase
        .from('preview_sessions')
        .update({
          container_id: actualContainerId,
          container_url: containerUrl,
          status: 'active',
          updated_at: new Date(),
        })
        .eq('id', sessionId);

      if (updateError) {
        console.error('Failed to update session status:', updateError);
        // Continue anyway - container is created
      }

      // Register container with realtime channel manager
      try {
        const realtimeInfo = await this.realtimeManager.registerContainer(
          request.projectId,
          actualContainerId,
          containerUrl
        );
        console.log('✅ Container registered with realtime channels:', realtimeInfo);
      } catch (realtimeError) {
        console.error('⚠️ Failed to register container with realtime:', realtimeError);
        // Continue anyway - core functionality still works
      }

      return {
        sessionId,
        containerId: actualContainerId,
        containerUrl,
        status: 'active',
      };

    } catch (error) {
      console.error('Failed to create preview session:', error);

      // Update session status to error
      await this.supabase
        .from('preview_sessions')
        .update({
          status: 'error',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          updated_at: new Date(),
        })
        .eq('id', sessionId);

      throw new Error(`Failed to create preview session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Destroys a preview session and cleans up resources
   */
  async destroySession(sessionId: string): Promise<void> {
    try {
      // Get session details from database
      const { data: session, error: fetchError } = await this.supabase
        .from('preview_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (fetchError || !session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (session.container_id) {
        // Unregister from realtime channels first
        try {
          await this.realtimeManager.unregisterContainer(session.project_id, session.container_id);
          console.log('✅ Container unregistered from realtime channels');
        } catch (realtimeError) {
          console.error('⚠️ Failed to unregister container from realtime:', realtimeError);
          // Continue with machine destruction
        }

        // Destroy the Fly.io machine
        await this.flyService.destroyMachine(session.container_id);
      }

      // Update session status to ended
      const { error: updateError } = await this.supabase
        .from('preview_sessions')
        .update({
          status: 'ended',
          ended_at: new Date(),
          updated_at: new Date(),
        })
        .eq('id', sessionId);

      if (updateError) {
        console.error('Failed to update session status:', updateError);
        throw new Error(`Failed to update session: ${updateError.message}`);
      }

    } catch (error) {
      console.error('Failed to destroy preview session:', error);
      throw new Error(`Failed to destroy session: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Gets the current status of a preview session
   */
  async getSessionStatus(sessionId: string): Promise<PreviewSession | null> {
    const { data: session, error } = await this.supabase
      .from('preview_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (error) {
      console.error('Failed to fetch session:', error);
      return null;
    }

    return {
      id: session.id,
      userId: session.user_id,
      projectId: session.project_id,
      sessionId: session.session_id,
      containerId: session.container_id,
      containerUrl: session.container_url,
      status: session.status,
      errorMessage: session.error_message,
      expiresAt: session.expires_at ? new Date(session.expires_at) : undefined,
      createdAt: new Date(session.created_at),
      endedAt: session.ended_at ? new Date(session.ended_at) : undefined,
      updatedAt: new Date(session.updated_at),
    };
  }


  /**
   * Cleanup expired sessions (for background job)
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      const { data: expiredSessions, error } = await this.supabase
        .from('preview_sessions')
        .select('*')
        .lt('expires_at', new Date().toISOString())
        .in('status', ['creating', 'active']);

      if (error) {
        console.error('Failed to fetch expired sessions:', error);
        return;
      }

      for (const session of expiredSessions || []) {
        try {
          await this.destroySession(session.id);
          console.log(`Cleaned up expired session: ${session.id}`);
        } catch (error) {
          console.error(`Failed to cleanup session ${session.id}:`, error);
        }
      }

      // Also cleanup any orphaned machines at the Fly.io level
      const orphanedCount = await this.flyService.cleanupOrphanedMachines(60); // 60 minutes max age
      console.log(`Cleaned up ${orphanedCount} orphaned machines`);

    } catch (error) {
      console.error('Cleanup process failed:', error);
    }
  }

  /**
   * Get machine status directly from Fly.io API
   */
  async getMachineStatus(containerId: string) {
    return await this.flyService.getMachine(containerId);
  }

  /**
   * List all active machines
   */
  async listActiveMachines() {
    return await this.flyService.listMachines();
  }

  /**
   * Monitor resource usage across all active sessions
   */
  async monitorAllSessions(): Promise<{
    sessionId: string;
    containerId: string;
    tier: string;
    status: 'ok' | 'warning' | 'critical';
    alerts: string[];
    actions: string[];
  }[]> {
    try {
      const { data: activeSessions, error } = await this.supabase
        .from('preview_sessions')
        .select('*')
        .in('status', ['creating', 'active']);

      if (error) {
        console.error('Failed to fetch active sessions for monitoring:', error);
        return [];
      }

      const monitoringResults = [];

      for (const session of activeSessions || []) {
        if (session.container_id) {
          try {
            const monitoring = await this.flyService.monitorMachine(session.container_id);
            
            // Check for tier violations
            if (monitoring.status === 'critical' && 
                monitoring.actions.includes('Auto-destroy machine')) {
              // Auto-cleanup expired sessions
              console.log(`Auto-destroying expired session: ${session.id}`);
              await this.destroySession(session.id);
            }

            monitoringResults.push({
              sessionId: session.id,
              containerId: session.container_id,
              tier: session.tier || 'free',
              ...monitoring,
            });
          } catch (error) {
            console.error(`Failed to monitor session ${session.id}:`, error);
            monitoringResults.push({
              sessionId: session.id,
              containerId: session.container_id || 'unknown',
              tier: session.tier || 'free',
              status: 'critical' as const,
              alerts: ['Monitoring failed'],
              actions: ['Check monitoring system'],
            });
          }
        }
      }

      return monitoringResults;
    } catch (error) {
      console.error('Failed to monitor all sessions:', error);
      return [];
    }
  }

  /**
   * Get detailed resource metrics for a specific session
   */
  async getSessionMetrics(sessionId: string): Promise<{
    sessionInfo: PreviewSession | null;
    resourceMetrics: {
      cpu: number;
      memory: number;
      disk: number;
      network: { in: number; out: number };
      uptime: number;
    } | null;
    monitoring: {
      status: 'ok' | 'warning' | 'critical';
      alerts: string[];
      actions: string[];
    } | null;
  }> {
    const sessionInfo = await this.getSessionStatus(sessionId);
    
    if (!sessionInfo || !sessionInfo.containerId) {
      return {
        sessionInfo,
        resourceMetrics: null,
        monitoring: null,
      };
    }

    const [resourceMetrics, monitoring] = await Promise.all([
      this.flyService.getMachineMetrics(sessionInfo.containerId),
      this.flyService.monitorMachine(sessionInfo.containerId),
    ]);

    return {
      sessionInfo,
      resourceMetrics,
      monitoring,
    };
  }

  /**
   * Enforce resource limits on a specific session
   */
  async enforceSessionLimits(sessionId: string): Promise<{
    success: boolean;
    actions: string[];
  }> {
    try {
      const session = await this.getSessionStatus(sessionId);
      if (!session || !session.containerId) {
        return {
          success: false,
          actions: ['Session not found or has no container'],
        };
      }

      const actions: string[] = [];
      
      // Check if machine exists and enforce resource limits
      const limitsEnforced = await this.flyService.enforceResourceLimits(session.containerId);
      if (!limitsEnforced) {
        actions.push('Resource limits enforcement failed - may need container restart');
      } else {
        actions.push('Resource limits validated and enforced');
      }

      // Monitor the session
      const monitoring = await this.flyService.monitorMachine(session.containerId);
      if (monitoring.status === 'critical') {
        actions.push('Critical issues detected');
        actions.push(...monitoring.actions);
        
        // If the session has exceeded duration, destroy it
        if (monitoring.actions.includes('Auto-destroy machine')) {
          await this.destroySession(sessionId);
          actions.push('Session automatically destroyed due to policy violation');
        }
      }

      return {
        success: limitsEnforced && monitoring.status !== 'critical',
        actions,
      };

    } catch (error) {
      console.error(`Failed to enforce session limits for ${sessionId}:`, error);
      return {
        success: false,
        actions: [`Enforcement failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Background monitoring job to be run periodically
   */
  async runMonitoringJob(): Promise<void> {
    console.log('🔍 Running container monitoring job...');
    
    try {
      const results = await this.monitorAllSessions();
      
      let healthyCount = 0;
      let warningCount = 0;
      let criticalCount = 0;

      for (const result of results) {
        switch (result.status) {
          case 'ok':
            healthyCount++;
            break;
          case 'warning':
            warningCount++;
            console.warn(`⚠️ Session ${result.sessionId} has warnings:`, result.alerts);
            break;
          case 'critical':
            criticalCount++;
            console.error(`🚨 Session ${result.sessionId} is critical:`, result.alerts);
            break;
        }
      }

      console.log(`📊 Monitoring complete: ${healthyCount} healthy, ${warningCount} warnings, ${criticalCount} critical`);

      // Clean up expired sessions
      await this.cleanupExpiredSessions();

    } catch (error) {
      console.error('❌ Monitoring job failed:', error);
    }
  }
}