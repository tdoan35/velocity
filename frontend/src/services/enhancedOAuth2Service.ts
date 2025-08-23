/**
 * Enhanced OAuth2 Service
 * High-level service that combines OAuth2 operations with token management and error handling
 */

import { supabase } from '@/lib/supabase'
import { supabaseOAuth2Service } from './supabaseOAuth2Service'
import { oauth2TokenManager } from './oauth2TokenManager'
import type { 
  SupabaseOrganization, 
  SupabaseProject, 
  CreateSupabaseProjectRequest,
  OAuth2Tokens,
  OAuthInitiateRequest,
  OAuthInitiateResponse,
  OAuthCallbackRequest
} from '@/types/supabase-oauth'

export interface EnhancedOAuth2ServiceResult<T = any> {
  success: boolean
  data?: T
  error?: string
  rateLimited?: boolean
  retryAfter?: number
}

export interface OAuth2ConnectionInfo {
  id: string
  velocityProjectId: string
  supabaseProjectId?: string
  supabaseProjectRef?: string
  organizationId: string
  organizationName?: string
  projectName?: string
  region?: string
  isActive: boolean
  lastUsed?: string
  createdAt: string
  expiresAt: string
}

class EnhancedOAuth2Service {
  /**
   * Initiate OAuth2 authorization flow
   */
  public async initiateFlow(request: OAuthInitiateRequest): Promise<EnhancedOAuth2ServiceResult<OAuthInitiateResponse>> {
    try {
      const result = await supabaseOAuth2Service.initiateOAuth2Flow({
        velocityProjectId: request.project_id,
        redirectUri: request.redirect_uri
      })

      return {
        success: result.success,
        data: result.success ? {
          auth_url: result.authUrl!,
          state: result.state!
        } : undefined,
        error: result.error
      }
    } catch (error) {
      console.error('Error initiating OAuth2 flow:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to initiate OAuth2 flow'
      }
    }
  }

  /**
   * Handle OAuth2 callback and exchange code for tokens
   */
  public async handleCallback(request: OAuthCallbackRequest): Promise<EnhancedOAuth2ServiceResult<OAuth2Tokens>> {
    try {
      const tokens = await supabaseOAuth2Service.handleOAuth2Callback(request)
      
      return {
        success: true,
        data: tokens
      }
    } catch (error) {
      console.error('Error handling OAuth2 callback:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to handle OAuth2 callback'
      }
    }
  }

  /**
   * Get organizations for a connection with automatic token refresh
   */
  public async getOrganizations(connectionId: string): Promise<EnhancedOAuth2ServiceResult<SupabaseOrganization[]>> {
    try {
      const { tokens, error: tokenError } = await oauth2TokenManager.getValidTokens(connectionId)
      
      if (tokenError || !tokens) {
        return {
          success: false,
          error: tokenError || 'Failed to get valid tokens'
        }
      }

      const organizations = await supabaseOAuth2Service.getOrganizations(tokens.access_token, connectionId)
      
      // Update last used timestamp
      await this.updateLastUsed(connectionId)
      
      return {
        success: true,
        data: organizations
      }
    } catch (error) {
      console.error('Error getting organizations:', error)
      
      // Check if it's a rate limit error
      if (this.isRateLimitError(error)) {
        return {
          success: false,
          error: 'Rate limit exceeded',
          rateLimited: true,
          retryAfter: this.extractRetryAfter(error)
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get organizations'
      }
    }
  }

  /**
   * Get projects for an organization with automatic token refresh
   */
  public async getProjects(connectionId: string, organizationId: string): Promise<EnhancedOAuth2ServiceResult<SupabaseProject[]>> {
    try {
      const { tokens, error: tokenError } = await oauth2TokenManager.getValidTokens(connectionId)
      
      if (tokenError || !tokens) {
        return {
          success: false,
          error: tokenError || 'Failed to get valid tokens'
        }
      }

      const projects = await supabaseOAuth2Service.getProjects(tokens.access_token, organizationId, connectionId)
      
      // Update last used timestamp
      await this.updateLastUsed(connectionId)
      
      return {
        success: true,
        data: projects
      }
    } catch (error) {
      console.error('Error getting projects:', error)
      
      if (this.isRateLimitError(error)) {
        return {
          success: false,
          error: 'Rate limit exceeded',
          rateLimited: true,
          retryAfter: this.extractRetryAfter(error)
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get projects'
      }
    }
  }

  /**
   * Create a new Supabase project with automatic token refresh
   */
  public async createProject(connectionId: string, request: CreateSupabaseProjectRequest): Promise<EnhancedOAuth2ServiceResult<SupabaseProject>> {
    try {
      const { tokens, error: tokenError } = await oauth2TokenManager.getValidTokens(connectionId)
      
      if (tokenError || !tokens) {
        return {
          success: false,
          error: tokenError || 'Failed to get valid tokens'
        }
      }

      const project = await supabaseOAuth2Service.createProject(tokens.access_token, request, connectionId)
      
      // Update last used timestamp
      await this.updateLastUsed(connectionId)
      
      return {
        success: true,
        data: project
      }
    } catch (error) {
      console.error('Error creating project:', error)
      
      if (this.isRateLimitError(error)) {
        return {
          success: false,
          error: 'Rate limit exceeded',
          rateLimited: true,
          retryAfter: this.extractRetryAfter(error)
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create project'
      }
    }
  }

  /**
   * Connect a Velocity project to a Supabase project via OAuth2
   */
  public async connectProject(
    velocityProjectId: string,
    connectionId: string,
    supabaseProjectId: string,
    supabaseProjectRef: string,
    metadata?: any
  ): Promise<EnhancedOAuth2ServiceResult<void>> {
    try {
      // Update the OAuth2 connection with project details
      const { error } = await supabase
        .from('oauth2_connections')
        .update({
          supabase_project_id: supabaseProjectId,
          supabase_project_ref: supabaseProjectRef,
          last_used: new Date().toISOString(),
          metadata: metadata ? JSON.stringify(metadata) : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', connectionId)
        .eq('velocity_project_id', velocityProjectId)

      if (error) {
        throw new Error(`Failed to update connection: ${error.message}`)
      }

      // Also update the project's backend configuration
      const { error: configError } = await supabase
        .from('projects')
        .update({
          backend_config: {
            type: 'supabase',
            connection_method: 'oauth2',
            connection_id: connectionId,
            project_ref: supabaseProjectRef,
            project_id: supabaseProjectId,
            connected_at: new Date().toISOString()
          }
        })
        .eq('id', velocityProjectId)

      if (configError) {
        console.warn('Failed to update project backend config:', configError)
      }

      return { success: true }
    } catch (error) {
      console.error('Error connecting project:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to connect project'
      }
    }
  }

  /**
   * Disconnect an OAuth2 connection
   */
  public async disconnectProject(velocityProjectId: string, connectionId: string): Promise<EnhancedOAuth2ServiceResult<void>> {
    try {
      // Deactivate the OAuth2 connection
      const { error } = await supabase
        .from('oauth2_connections')
        .update({
          is_active: false,
          updated_at: new Date().toISOString()
        })
        .eq('id', connectionId)
        .eq('velocity_project_id', velocityProjectId)

      if (error) {
        throw new Error(`Failed to deactivate connection: ${error.message}`)
      }

      // Clear the project's backend configuration
      const { error: configError } = await supabase
        .from('projects')
        .update({
          backend_config: {
            type: 'none',
            connection_method: null,
            connection_id: null,
            disconnected_at: new Date().toISOString()
          }
        })
        .eq('id', velocityProjectId)

      if (configError) {
        console.warn('Failed to clear project backend config:', configError)
      }

      // Clear cached tokens
      oauth2TokenManager.invalidateTokens(connectionId)

      return { success: true }
    } catch (error) {
      console.error('Error disconnecting project:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to disconnect project'
      }
    }
  }

  /**
   * Get connection information for a Velocity project
   */
  public async getConnectionInfo(velocityProjectId: string): Promise<EnhancedOAuth2ServiceResult<OAuth2ConnectionInfo | null>> {
    try {
      const { data: connection, error } = await supabase
        .from('oauth2_connections')
        .select(`
          id,
          velocity_project_id,
          supabase_project_id,
          supabase_project_ref,
          organization_id,
          is_active,
          last_used,
          created_at,
          expires_at,
          metadata
        `)
        .eq('velocity_project_id', velocityProjectId)
        .eq('is_active', true)
        .single()

      if (error) {
        if (error.code === 'PGRST116') {
          // No connection found
          return { success: true, data: null }
        }
        throw new Error(`Failed to get connection info: ${error.message}`)
      }

      const metadata = connection.metadata ? JSON.parse(connection.metadata) : {}

      const connectionInfo: OAuth2ConnectionInfo = {
        id: connection.id,
        velocityProjectId: connection.velocity_project_id,
        supabaseProjectId: connection.supabase_project_id,
        supabaseProjectRef: connection.supabase_project_ref,
        organizationId: connection.organization_id,
        organizationName: metadata.organizationName,
        projectName: metadata.projectName,
        region: metadata.region,
        isActive: connection.is_active,
        lastUsed: connection.last_used,
        createdAt: connection.created_at,
        expiresAt: connection.expires_at
      }

      return { success: true, data: connectionInfo }
    } catch (error) {
      console.error('Error getting connection info:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get connection info'
      }
    }
  }

  /**
   * Test an OAuth2 connection health
   */
  public async testConnection(connectionId: string): Promise<EnhancedOAuth2ServiceResult<{ healthy: boolean; details: any }>> {
    try {
      const { tokens, error: tokenError } = await oauth2TokenManager.getValidTokens(connectionId)
      
      if (tokenError || !tokens) {
        return {
          success: true,
          data: {
            healthy: false,
            details: { error: tokenError || 'No valid tokens' }
          }
        }
      }

      // Try to fetch organizations to test the connection
      const organizations = await supabaseOAuth2Service.getOrganizations(tokens.access_token, connectionId)
      
      // Update last used timestamp
      await this.updateLastUsed(connectionId)
      
      return {
        success: true,
        data: {
          healthy: true,
          details: {
            organizationCount: organizations.length,
            tokenExpiresIn: tokens.expires_in,
            lastTested: new Date().toISOString()
          }
        }
      }
    } catch (error) {
      console.error('Error testing connection:', error)
      return {
        success: true,
        data: {
          healthy: false,
          details: { error: error instanceof Error ? error.message : 'Connection test failed' }
        }
      }
    }
  }

  /**
   * Update last used timestamp for a connection
   */
  private async updateLastUsed(connectionId: string): Promise<void> {
    try {
      await supabase
        .from('oauth2_connections')
        .update({ last_used: new Date().toISOString() })
        .eq('id', connectionId)
    } catch (error) {
      console.warn('Failed to update last used timestamp:', error)
    }
  }

  /**
   * Check if an error is a rate limit error
   */
  private isRateLimitError(error: any): boolean {
    return (
      error?.status === 429 ||
      error?.code === 'RATE_LIMITED' ||
      (error?.message && error.message.toLowerCase().includes('rate limit'))
    )
  }

  /**
   * Extract retry-after value from rate limit error
   */
  private extractRetryAfter(error: any): number {
    if (error?.headers?.['retry-after']) {
      return parseInt(error.headers['retry-after'], 10)
    }
    if (error?.retryAfter) {
      return error.retryAfter
    }
    return 60 // Default to 60 seconds
  }

  /**
   * Get rate limit status for a connection
   */
  public getRateLimitStatus(connectionId: string) {
    return oauth2TokenManager.getRateLimitStatus(connectionId)
  }
}

export const enhancedOAuth2Service = new EnhancedOAuth2Service()