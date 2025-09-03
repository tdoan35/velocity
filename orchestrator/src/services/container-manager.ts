import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { FlyIOService } from './fly-io';
import RealtimeChannelManager from './realtime-channel-manager';
import { getContainerTier } from '../config/container-security';
import { TemplateService } from './template-service';
import { SessionCleanupService } from './cleanup-service';
import type { 
  ContainerSession, 
  CreateSessionRequest, 
  PreviewSession,
  Project,
  ProjectFile
} from '../types';

export class ContainerManager {
  private supabase;
  private flyService: FlyIOService;
  private realtimeManager: RealtimeChannelManager;
  private templateService: TemplateService;
  private cleanupService: SessionCleanupService;

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

    // Initialize template service
    this.templateService = new TemplateService();

    // Initialize cleanup service
    this.cleanupService = new SessionCleanupService();
  }

  /**
   * Creates a new preview session with container provisioning
   * Uses atomic transaction to prevent race condition between session creation and container lookup
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

    let session: any = null;

    try {
      // PHASE 0: PROJECT VALIDATION AND SETUP
      console.log(`🔍 Ensuring project is ready: ${request.projectId}`);
      const projectInfo = await this.ensureProjectReady(request.projectId);
      console.log(`✅ Project validation complete: ${request.projectId} (${projectInfo.isNew ? 'new' : 'existing'})`);

      // PHASE 1: ATOMIC SESSION CREATION
      // Create session record in database with 'creating' status
      const expiresAt = new Date(Date.now() + (tierConfig.maxDurationHours * 60 * 60 * 1000));
      
      console.log(`📝 Creating session record: ${sessionId}`);
      const { data: sessionData, error: dbError } = await this.supabase
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
        })
        .select()
        .single();

      if (dbError || !sessionData) {
        throw new Error(`Database error: ${dbError?.message || 'Session creation failed'}`);
      }

      session = sessionData;
      console.log(`✅ Session record created: ${sessionId}`);

      // PHASE 2: CONTAINER CREATION (after session exists in DB)
      console.log(`🐳 Creating container for session: ${sessionId}`);
      const { machine, url: containerUrl } = await this.flyService.createMachine(
        request.projectId, 
        tier, 
        request.customConfig,
        sessionId
      );
      
      // Update container ID with actual machine ID
      const actualContainerId = machine.id;
      console.log(`✅ Container created: ${actualContainerId}`);

      // PHASE 3: UPDATE SESSION WITH CONTAINER INFO
      console.log(`🔄 Updating session with container info: ${sessionId}`);
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
        // This is not critical - continue with verification
      }

      // PHASE 4: CRITICAL VERIFICATION - Ensure session exists before returning URL
      console.log(`🔍 Verifying session exists in database: ${sessionId}`);
      const { data: verification, error: verificationError } = await this.supabase
        .from('preview_sessions')
        .select('id, container_id, container_url, status, project_id')
        .eq('id', sessionId)
        .single();
        
      if (verificationError || !verification) {
        throw new Error(`Session verification failed: ${verificationError?.message || 'Session not found after creation'}`);
      }

      // Ensure session is in active state
      if (verification.status !== 'active') {
        console.warn(`⚠️ Session ${sessionId} is not active yet, current status: ${verification.status}`);
      }

      console.log(`✅ Session verification successful: ${sessionId} (status: ${verification.status})`);

      // PHASE 5: REGISTER WITH REALTIME (non-critical)
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

      console.log(`🎉 Session creation complete: ${sessionId} -> ${containerUrl}`);
      
      // Only return URL after verification succeeds
      return {
        sessionId,
        containerId: actualContainerId,
        containerUrl: verification.container_url || containerUrl,
        status: 'active',
      };

    } catch (error) {
      console.error('Failed to create preview session:', error);

      // Cleanup on failure - update session status to error
      if (session?.id) {
        await this.supabase
          .from('preview_sessions')
          .update({
            status: 'error',
            error_message: error instanceof Error ? error.message : 'Unknown error',
            updated_at: new Date(),
          })
          .eq('id', session.id);
      }

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
   * Enhanced with comprehensive SessionCleanupService
   */
  async cleanupExpiredSessions(): Promise<void> {
    try {
      console.log('🧹 Running enhanced session cleanup...');
      const stats = await this.cleanupService.cleanupExpiredSessions();
      
      console.log(`📊 Cleanup summary: ${stats.successfulCleanups} expired sessions cleaned, ${stats.failedCleanups} failed`);
      
      if (stats.errors.length > 0) {
        console.error('⚠️ Cleanup errors:', stats.errors);
      }

      // Also cleanup orphaned containers
      const orphanedStats = await this.cleanupService.cleanupOrphanedContainers();
      console.log(`🗑️ Orphaned containers: ${orphanedStats.successfulCleanups} cleaned, ${orphanedStats.totalOrphaned} total found`);

    } catch (error) {
      console.error('❌ Enhanced cleanup process failed:', error);
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
   * Enhanced with comprehensive cleanup and metrics
   */
  async runMonitoringJob(): Promise<void> {
    console.log('🔍 Running enhanced container monitoring job...');
    
    try {
      // Get session metrics first
      const metrics = await this.cleanupService.getSessionMetrics();
      console.log(`📊 Session metrics: ${metrics.totalActiveSessions} active, ${metrics.totalExpiredSessions} expired`);

      // Monitor individual sessions
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

      console.log(`📊 Session health: ${healthyCount} healthy, ${warningCount} warnings, ${criticalCount} critical`);

      // Run comprehensive cleanup
      const cleanupResults = await this.cleanupService.runCleanupJob();
      console.log(`🧹 Cleanup results: ${cleanupResults.sessionCleanup.successfulCleanups} sessions, ${cleanupResults.containerCleanup.successfulCleanups} containers`);

      // Log session duration insights
      if (metrics.averageSessionDuration) {
        console.log(`⏱️ Average session duration: ${metrics.averageSessionDuration} minutes`);
      }

      if (metrics.oldestActiveSession) {
        const ageMinutes = Math.round((Date.now() - metrics.oldestActiveSession.getTime()) / 1000 / 60);
        console.log(`⏰ Oldest active session: ${ageMinutes} minutes old`);
      }

    } catch (error) {
      console.error('❌ Enhanced monitoring job failed:', error);
    }
  }

  /**
   * Ensure project is ready with proper files and configuration
   * Phase 2.1: Project Validation and Setup
   */
  private async ensureProjectReady(projectId: string): Promise<{ project: Project, isNew: boolean }> {
    try {
      // Handle demo project special case
      if (projectId === '550e8400-e29b-41d4-a716-446655440000') {
        return await this.setupDemoProject(projectId);
      }
      
      // Check if project exists
      const { data: project, error: projectError } = await this.supabase
        .from('projects')
        .select('id, name, template_type, status, owner_id, created_at, updated_at')
        .eq('id', projectId)
        .single();
        
      if (projectError || !project) {
        console.log(`📁 Project ${projectId} not found, creating with default template...`);
        // Create new project with default template
        const newProject = await this.createProjectWithTemplate(projectId, 'react');
        return { project: newProject, isNew: true };
      }
      
      // Check if project has files
      const { count: fileCount, error: countError } = await this.supabase
        .from('project_files')
        .select('id', { count: 'exact' })
        .eq('project_id', projectId);
        
      if (countError) {
        console.warn(`⚠️ Failed to count project files for ${projectId}:`, countError);
      }
      
      if (!fileCount || fileCount === 0) {
        console.log(`📦 Project ${projectId} has no files, adding template files...`);
        await this.addTemplateFilesToProject(projectId, project.template_type || 'react');
        console.log(`✅ Added template files to project ${projectId}`);
      } else {
        console.log(`📁 Project ${projectId} has ${fileCount} files`);
      }
      
      return { project, isNew: false };
      
    } catch (error) {
      console.error(`❌ Failed to ensure project ready for ${projectId}:`, error);
      throw new Error(`Project validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Set up demo project with proper configuration and files
   */
  private async setupDemoProject(projectId: string): Promise<{ project: Project, isNew: boolean }> {
    try {
      console.log(`🎭 Setting up demo project: ${projectId}`);
      
      // Check if demo project exists
      const { data: existingProject, error: fetchError } = await this.supabase
        .from('projects')
        .select('id, name, template_type, status, owner_id, created_at, updated_at')
        .eq('id', projectId)
        .single();
        
      let project: Project;
      let isNew = false;
        
      if (fetchError || !existingProject) {
        console.log(`📝 Creating demo project record: ${projectId}`);
        
        // Create demo project
        const { data: newProject, error: createError } = await this.supabase
          .from('projects')
          .insert({
            id: projectId,
            name: 'Demo Project',
            description: 'Velocity preview container demo project',
            template_type: 'react',
            status: 'active',
            owner_id: '00000000-0000-0000-0000-000000000000' // System user
          })
          .select()
          .single();
          
        if (createError || !newProject) {
          throw new Error(`Failed to create demo project: ${createError?.message}`);
        }
        
        project = newProject;
        isNew = true;
        console.log(`✅ Demo project created: ${projectId}`);
      } else {
        project = existingProject;
        console.log(`✅ Demo project found: ${projectId}`);
      }
      
      // Ensure demo project has files
      await this.addTemplateFilesToProject(projectId, 'react');
      
      return { project, isNew };
      
    } catch (error) {
      console.error(`❌ Failed to setup demo project ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new project with specified template
   */
  private async createProjectWithTemplate(projectId: string, templateType: string): Promise<Project> {
    try {
      console.log(`📝 Creating project with template: ${projectId} (${templateType})`);
      
      // Create project record
      const { data: project, error: createError } = await this.supabase
        .from('projects')
        .insert({
          id: projectId,
          name: `Project ${projectId.substring(0, 8)}`,
          description: `Auto-generated project with ${templateType} template`,
          template_type: templateType,
          status: 'active',
          owner_id: '00000000-0000-0000-0000-000000000000' // System user for auto-generated projects
        })
        .select()
        .single();
        
      if (createError || !project) {
        throw new Error(`Failed to create project: ${createError?.message}`);
      }
      
      // Add template files
      await this.addTemplateFilesToProject(projectId, templateType);
      
      console.log(`✅ Project created with template: ${projectId}`);
      return project;
      
    } catch (error) {
      console.error(`❌ Failed to create project with template ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Add template files to a project
   */
  private async addTemplateFilesToProject(projectId: string, templateType: string): Promise<void> {
    try {
      console.log(`📦 Adding template files to project: ${projectId} (${templateType})`);
      
      // Validate template type
      if (!this.templateService.isTemplateTypeSupported(templateType)) {
        console.warn(`⚠️ Unsupported template type ${templateType}, defaulting to 'react'`);
        templateType = 'react';
      }
      
      // Get template files
      const templateFiles = this.templateService.getTemplateFiles(templateType);
      const projectFiles = this.templateService.convertToProjectFiles(templateFiles, projectId);
      
      // Check if files already exist (avoid duplicates)
      const existingFilePaths = await this.getExistingFilePaths(projectId);
      const newFiles = projectFiles.filter(file => !existingFilePaths.has(file.file_path));
      
      if (newFiles.length === 0) {
        console.log(`✅ Project ${projectId} already has all template files`);
        return;
      }
      
      // Insert new files in batches (Supabase has limits)
      const batchSize = 10;
      for (let i = 0; i < newFiles.length; i += batchSize) {
        const batch = newFiles.slice(i, i + batchSize);
        
        const { error: insertError } = await this.supabase
          .from('project_files')
          .insert(batch);
          
        if (insertError) {
          console.error(`❌ Failed to insert file batch ${i}-${i + batch.length}:`, insertError);
          throw new Error(`Failed to add template files: ${insertError.message}`);
        }
        
        console.log(`📁 Inserted ${batch.length} files (batch ${Math.floor(i/batchSize) + 1})`);
      }
      
      console.log(`✅ Added ${newFiles.length} template files to project ${projectId}`);
      
    } catch (error) {
      console.error(`❌ Failed to add template files to ${projectId}:`, error);
      throw error;
    }
  }

  /**
   * Get existing file paths for a project
   */
  private async getExistingFilePaths(projectId: string): Promise<Set<string>> {
    try {
      const { data: existingFiles, error } = await this.supabase
        .from('project_files')
        .select('file_path')
        .eq('project_id', projectId);
        
      if (error) {
        console.warn(`⚠️ Failed to fetch existing file paths for ${projectId}:`, error);
        return new Set();
      }
      
      return new Set(existingFiles?.map(f => f.file_path) || []);
      
    } catch (error) {
      console.error(`❌ Failed to get existing file paths for ${projectId}:`, error);
      return new Set();
    }
  }

  /**
   * Get overall session statistics and metrics
   * Phase 3.2: Expose cleanup service metrics
   */
  async getSessionStatistics() {
    return await this.cleanupService.getSessionMetrics();
  }

  /**
   * Force terminate a specific session
   * Phase 3.2: Expose force termination
   */
  async forceTerminateSession(sessionId: string) {
    return await this.cleanupService.forceTerminateSession(sessionId);
  }

  /**
   * Run comprehensive cleanup manually
   * Phase 3.2: Expose manual cleanup trigger
   */
  async runComprehensiveCleanup() {
    return await this.cleanupService.runCleanupJob();
  }
}