import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { FlyIOService } from './fly-io';
import RealtimeChannelManager from './realtime-channel-manager';
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
    const flyAppName = process.env.FLY_APP_NAME || 'velocity-preview-containers';

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
  async createSession(request: CreateSessionRequest): Promise<ContainerSession> {
    const sessionId = uuidv4();
    const containerId = `preview-${sessionId.substring(0, 8)}`;

    try {
      // Create session record in database with 'creating' status
      const { error: dbError } = await this.supabase
        .from('preview_sessions')
        .insert({
          id: sessionId,
          user_id: request.userId,
          project_id: request.projectId,
          session_id: sessionId,
          container_id: containerId,
          status: 'creating',
          expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000), // 2 hours from now
        });

      if (dbError) {
        throw new Error(`Database error: ${dbError.message}`);
      }

      // Provision container using Fly.io Machines API
      const { machine, url: containerUrl } = await this.flyService.createMachine(request.projectId);
      
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
}