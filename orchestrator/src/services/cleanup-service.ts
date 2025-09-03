import { createClient } from '@supabase/supabase-js';
import { FlyIOService } from './fly-io';
import type { PreviewSession } from '../types';

export interface SessionCleanupStats {
  totalExpired: number;
  successfulCleanups: number;
  failedCleanups: number;
  errors: string[];
}

export interface SessionMetrics {
  totalActiveSessions: number;
  totalExpiredSessions: number;
  sessionsByStatus: Record<string, number>;
  oldestActiveSession?: Date;
  newestActiveSession?: Date;
  averageSessionDuration?: number;
}

export class SessionCleanupService {
  private supabase;
  private flyService: FlyIOService;

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const flyApiToken = process.env.FLY_API_TOKEN!;
    const flyAppName = 'velocity-preview-containers';

    if (!flyApiToken) {
      throw new Error('FLY_API_TOKEN environment variable is required');
    }

    this.flyService = new FlyIOService(flyApiToken, flyAppName);
  }

  /**
   * Clean up expired sessions and their associated containers
   * Phase 3.2: Session Cleanup and Monitoring
   */
  async cleanupExpiredSessions(): Promise<SessionCleanupStats> {
    console.log('🧹 Starting expired session cleanup...');
    
    const stats: SessionCleanupStats = {
      totalExpired: 0,
      successfulCleanups: 0,
      failedCleanups: 0,
      errors: []
    };

    try {
      // Get expired sessions
      const { data: expiredSessions, error } = await this.supabase
        .from('preview_sessions')
        .select('id, container_id, project_id, created_at, expires_at, status')
        .lt('expires_at', new Date().toISOString())
        .in('status', ['creating', 'active']);

      if (error) {
        const errorMsg = `Failed to fetch expired sessions: ${error.message}`;
        console.error('❌', errorMsg);
        stats.errors.push(errorMsg);
        return stats;
      }

      if (!expiredSessions || expiredSessions.length === 0) {
        console.log('✅ No expired sessions found');
        return stats;
      }

      stats.totalExpired = expiredSessions.length;
      console.log(`📊 Found ${stats.totalExpired} expired sessions to clean up`);

      // Clean up each expired session
      for (const session of expiredSessions) {
        try {
          console.log(`🗑️ Cleaning up session: ${session.id} (expired: ${session.expires_at})`);
          await this.terminateSession({
            id: session.id,
            container_id: session.container_id,
            project_id: session.project_id
          });
          stats.successfulCleanups++;
          console.log(`✅ Successfully cleaned up session: ${session.id}`);
        } catch (error) {
          const errorMsg = `Failed to cleanup session ${session.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error('❌', errorMsg);
          stats.errors.push(errorMsg);
          stats.failedCleanups++;
        }
      }

      console.log(`🧹 Cleanup complete: ${stats.successfulCleanups} successful, ${stats.failedCleanups} failed`);
      return stats;

    } catch (error) {
      const errorMsg = `Cleanup process failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌', errorMsg);
      stats.errors.push(errorMsg);
      return stats;
    }
  }

  /**
   * Terminate a specific session and its container
   */
  async terminateSession(session: { 
    id: string; 
    container_id?: string; 
    project_id?: string;
  }): Promise<void> {
    try {
      console.log(`🔄 Terminating session: ${session.id}`);

      // Update session status to ended
      const { error: updateError } = await this.supabase
        .from('preview_sessions')
        .update({ 
          status: 'ended', 
          ended_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', session.id);

      if (updateError) {
        console.error(`⚠️ Failed to update session status for ${session.id}:`, updateError);
        // Continue with container cleanup even if database update fails
      }

      // Terminate container if exists
      if (session.container_id) {
        console.log(`🐳 Destroying container: ${session.container_id}`);
        try {
          await this.flyService.destroyMachine(session.container_id);
          console.log(`✅ Container destroyed: ${session.container_id}`);
        } catch (containerError) {
          console.error(`⚠️ Failed to destroy container ${session.container_id}:`, containerError);
          // Don't throw here - session is still marked as ended in database
        }
      }

      console.log(`✅ Session terminated: ${session.id}`);

    } catch (error) {
      console.error(`❌ Failed to terminate session ${session.id}:`, error);
      throw error;
    }
  }

  /**
   * Force terminate a session (for manual cleanup)
   */
  async forceTerminateSession(sessionId: string): Promise<void> {
    try {
      console.log(`⚡ Force terminating session: ${sessionId}`);

      // Get session details
      const { data: session, error } = await this.supabase
        .from('preview_sessions')
        .select('id, container_id, project_id, status')
        .eq('id', sessionId)
        .single();

      if (error || !session) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      if (session.status === 'ended') {
        console.log(`ℹ️ Session ${sessionId} is already ended`);
        return;
      }

      await this.terminateSession({
        id: session.id,
        container_id: session.container_id,
        project_id: session.project_id
      });

      console.log(`✅ Force termination complete: ${sessionId}`);

    } catch (error) {
      console.error(`❌ Force termination failed for ${sessionId}:`, error);
      throw error;
    }
  }

  /**
   * Get session metrics and statistics
   */
  async getSessionMetrics(): Promise<SessionMetrics> {
    try {
      console.log('📊 Gathering session metrics...');

      // Get all sessions with their status
      const { data: sessions, error } = await this.supabase
        .from('preview_sessions')
        .select('id, status, created_at, ended_at, expires_at')
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch sessions: ${error.message}`);
      }

      const now = new Date();
      const activeSessions = sessions?.filter(s => ['creating', 'active'].includes(s.status)) || [];
      const expiredSessions = sessions?.filter(s => 
        ['creating', 'active'].includes(s.status) && 
        new Date(s.expires_at) < now
      ) || [];

      // Calculate session status distribution
      const sessionsByStatus: Record<string, number> = {};
      sessions?.forEach(session => {
        sessionsByStatus[session.status] = (sessionsByStatus[session.status] || 0) + 1;
      });

      // Calculate session duration statistics for ended sessions
      const endedSessions = sessions?.filter(s => s.status === 'ended' && s.ended_at) || [];
      let averageSessionDuration: number | undefined;
      
      if (endedSessions.length > 0) {
        const totalDuration = endedSessions.reduce((sum, session) => {
          const created = new Date(session.created_at);
          const ended = new Date(session.ended_at!);
          return sum + (ended.getTime() - created.getTime());
        }, 0);
        averageSessionDuration = Math.round(totalDuration / endedSessions.length / 1000 / 60); // minutes
      }

      // Find oldest and newest active sessions
      const oldestActiveSession = activeSessions.length > 0 
        ? new Date(Math.min(...activeSessions.map(s => new Date(s.created_at).getTime())))
        : undefined;
      const newestActiveSession = activeSessions.length > 0
        ? new Date(Math.max(...activeSessions.map(s => new Date(s.created_at).getTime())))
        : undefined;

      const metrics: SessionMetrics = {
        totalActiveSessions: activeSessions.length,
        totalExpiredSessions: expiredSessions.length,
        sessionsByStatus,
        oldestActiveSession,
        newestActiveSession,
        averageSessionDuration
      };

      console.log('📊 Session metrics:', {
        active: metrics.totalActiveSessions,
        expired: metrics.totalExpiredSessions,
        avgDuration: metrics.averageSessionDuration ? `${metrics.averageSessionDuration}min` : 'N/A'
      });

      return metrics;

    } catch (error) {
      console.error('❌ Failed to gather session metrics:', error);
      throw error;
    }
  }

  /**
   * Clean up orphaned containers (containers that exist in Fly.io but not in database)
   */
  async cleanupOrphanedContainers(): Promise<{
    totalOrphaned: number;
    successfulCleanups: number;
    errors: string[];
  }> {
    console.log('🔍 Checking for orphaned containers...');
    
    const stats = {
      totalOrphaned: 0,
      successfulCleanups: 0,
      errors: [] as string[]
    };

    try {
      // Get all machines from Fly.io
      const flyMachines = await this.flyService.listMachines();
      
      // Get all active container IDs from database
      const { data: activeSessions, error } = await this.supabase
        .from('preview_sessions')
        .select('container_id')
        .in('status', ['creating', 'active'])
        .not('container_id', 'is', null);

      if (error) {
        const errorMsg = `Failed to fetch active sessions: ${error.message}`;
        stats.errors.push(errorMsg);
        return stats;
      }

      const activeContainerIds = new Set(
        activeSessions?.map(s => s.container_id).filter(Boolean) || []
      );

      // Find orphaned machines
      const orphanedMachines = flyMachines.filter(machine => 
        !activeContainerIds.has(machine.id) &&
        machine.created_at &&
        (Date.now() - new Date(machine.created_at).getTime()) > (60 * 60 * 1000) // Older than 1 hour
      );

      stats.totalOrphaned = orphanedMachines.length;

      if (orphanedMachines.length === 0) {
        console.log('✅ No orphaned containers found');
        return stats;
      }

      console.log(`🗑️ Found ${orphanedMachines.length} orphaned containers`);

      // Clean up orphaned machines
      for (const machine of orphanedMachines) {
        try {
          console.log(`🗑️ Destroying orphaned container: ${machine.id}`);
          await this.flyService.destroyMachine(machine.id);
          stats.successfulCleanups++;
          console.log(`✅ Orphaned container destroyed: ${machine.id}`);
        } catch (error) {
          const errorMsg = `Failed to destroy orphaned container ${machine.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error('❌', errorMsg);
          stats.errors.push(errorMsg);
        }
      }

      console.log(`🧹 Orphaned container cleanup complete: ${stats.successfulCleanups} successful`);
      return stats;

    } catch (error) {
      const errorMsg = `Orphaned container cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error('❌', errorMsg);
      stats.errors.push(errorMsg);
      return stats;
    }
  }

  /**
   * Run comprehensive cleanup job (both expired sessions and orphaned containers)
   */
  async runCleanupJob(): Promise<{
    sessionCleanup: SessionCleanupStats;
    containerCleanup: { totalOrphaned: number; successfulCleanups: number; errors: string[] };
    metrics: SessionMetrics;
  }> {
    console.log('🚀 Starting comprehensive cleanup job...');
    
    const [sessionCleanup, containerCleanup, metrics] = await Promise.all([
      this.cleanupExpiredSessions(),
      this.cleanupOrphanedContainers(),
      this.getSessionMetrics()
    ]);

    console.log('📊 Cleanup job summary:', {
      expiredSessions: sessionCleanup.successfulCleanups,
      orphanedContainers: containerCleanup.successfulCleanups,
      activeSessions: metrics.totalActiveSessions,
      totalErrors: sessionCleanup.errors.length + containerCleanup.errors.length
    });

    return {
      sessionCleanup,
      containerCleanup,
      metrics
    };
  }
}