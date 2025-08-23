/**
 * Supabase OAuth2 Connection Service
 * Manages OAuth2 connections alongside existing direct connections
 * Integrates with existing supabaseConnection service
 */

import { supabase } from '@/lib/supabase'
import { encryptCredentials, decryptCredentials, type DecryptedCredentials } from '@/utils/supabase/credentialSecurity'
import { secureLogger } from '@/utils/logging/supabaseConnectionLogger'
import { supabaseOAuth2Service, SupabaseOAuthError } from './supabaseOAuth2Service'
import type {
  OAuthTokens,
  SupabaseConnection,
  SupabaseProject,
  SupabaseOrganization,
  CreateSupabaseProjectRequest
} from '@/types/supabase-oauth'

export interface OAuth2ConnectionData {
  id: string
  userId: string
  projectId: string
  connectionMethod: 'oauth'
  organizationId: string
  organizationSlug: string
  supabaseProjectId: string
  supabaseProjectName: string
  supabaseProjectRegion: string
  supabaseProjectUrl: string
  anonKey: string
  serviceRoleKey: string
  connectionStatus: 'connected' | 'disconnected' | 'expired' | 'error'
  lastValidated: Date
}

export interface OAuth2ConnectionResult {
  success: boolean
  connection?: OAuth2ConnectionData
  error?: string
}

class SupabaseOAuth2ConnectionService {
  /**
   * Store OAuth2 connection after successful authorization
   */
  public async storeOAuth2Connection(
    projectId: string,
    tokens: OAuthTokens,
    supabaseProject: SupabaseProject,
    organization: SupabaseOrganization
  ): Promise<OAuth2ConnectionResult> {
    try {
      const user = (await supabase.auth.getUser()).data.user
      if (!user) {
        throw new Error('User not authenticated')
      }

      // Get project API keys
      const apiKeys = await supabaseOAuth2Service.getProjectApiKeys(
        tokens.access_token,
        supabaseProject.ref
      )

      // Encrypt sensitive tokens and keys
      const encryptedTokens = await encryptCredentials({
        oauth_access_token: tokens.access_token,
        oauth_refresh_token: tokens.refresh_token,
        supabase_anon_key: apiKeys.anonKey,
        supabase_service_role_key: apiKeys.serviceRoleKey
      })

      // Calculate token expiration
      const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000))

      // Store OAuth2 connection
      const { data: connectionData, error: insertError } = await supabase
        .from('supabase_connections')
        .upsert({
          user_id: user.id,
          project_id: projectId,
          connection_method: 'oauth',
          oauth_organization_id: organization.id,
          oauth_organization_slug: organization.slug,
          oauth_access_token: encryptedTokens.encryptedOAuthAccessToken,
          oauth_refresh_token: encryptedTokens.encryptedOAuthRefreshToken,
          encrypted_anon_key: encryptedTokens.encryptedSupabaseAnonKey,
          encryption_iv: encryptedTokens.encryptionIv,
          oauth_expires_at: expiresAt.toISOString(),
          oauth_scopes: ['auth:read', 'auth:write', 'projects:read', 'projects:write', 'organizations:read'],
          supabase_project_id: supabaseProject.id,
          supabase_project_name: supabaseProject.name,
          supabase_project_region: supabaseProject.region,
          connection_status: 'connected',
          last_validated: new Date().toISOString()
        }, {
          onConflict: 'user_id,project_id'
        })
        .select()
        .single()

      if (insertError) {
        throw insertError
      }

      // Update the projects table with Supabase connection details
      const projectUrl = `https://${supabaseProject.ref}.supabase.co`
      const { error: projectUpdateError } = await supabase
        .from('projects')
        .update({
          supabase_project_ref: supabaseProject.ref,
          supabase_project_url: projectUrl,
          supabase_anon_key: encryptedTokens.encryptedSupabaseAnonKey,
          supabase_service_role_key: encryptedTokens.encryptedSupabaseServiceRoleKey,
          backend_status: 'connected',
          backend_config: {
            connection_method: 'oauth',
            organization_id: organization.id,
            organization_name: organization.name,
            project_name: supabaseProject.name,
            region: supabaseProject.region,
            connected_at: new Date().toISOString()
          }
        })
        .eq('id', projectId)
        .eq('user_id', user.id)

      if (projectUpdateError) {
        // Rollback connection if project update fails
        await this.deleteOAuth2Connection(projectId)
        throw projectUpdateError
      }

      const connection: OAuth2ConnectionData = {
        id: connectionData.id,
        userId: user.id,
        projectId: projectId,
        connectionMethod: 'oauth',
        organizationId: organization.id,
        organizationSlug: organization.slug,
        supabaseProjectId: supabaseProject.id,
        supabaseProjectName: supabaseProject.name,
        supabaseProjectRegion: supabaseProject.region,
        supabaseProjectUrl: projectUrl,
        anonKey: apiKeys.anonKey,
        serviceRoleKey: apiKeys.serviceRoleKey,
        connectionStatus: 'connected',
        lastValidated: new Date()
      }

      secureLogger.info('OAuth2Connection', `OAuth2 connection stored successfully for project ${projectId}`)

      return {
        success: true,
        connection
      }
    } catch (error) {
      secureLogger.error('OAuth2Connection', 'Error storing OAuth2 connection:', { error: error instanceof Error ? error.message : String(error) })
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to store OAuth2 connection'
      }
    }
  }

  /**
   * Get OAuth2 connection for a project
   */
  public async getOAuth2Connection(projectId: string): Promise<OAuth2ConnectionData | null> {
    try {
      const user = (await supabase.auth.getUser()).data.user
      if (!user) {
        return null
      }

      const { data: connectionData, error } = await supabase
        .from('supabase_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .eq('connection_method', 'oauth')
        .single()

      if (error || !connectionData) {
        return null
      }

      // Decrypt credentials for use
      const decryptedCredentials = await decryptCredentials({
        encryptedSupabaseAnonKey: connectionData.encrypted_anon_key,
        encryptionIv: connectionData.encryption_iv
      }) as DecryptedCredentials

      const connection: OAuth2ConnectionData = {
        id: connectionData.id,
        userId: user.id,
        projectId: projectId,
        connectionMethod: 'oauth',
        organizationId: connectionData.oauth_organization_id,
        organizationSlug: connectionData.oauth_organization_slug,
        supabaseProjectId: connectionData.supabase_project_id,
        supabaseProjectName: connectionData.supabase_project_name,
        supabaseProjectRegion: connectionData.supabase_project_region,
        supabaseProjectUrl: `https://${connectionData.supabase_project_ref || 'unknown'}.supabase.co`,
        anonKey: decryptedCredentials.supabase_anon_key || '',
        serviceRoleKey: '', // Don't expose service role key
        connectionStatus: connectionData.connection_status,
        lastValidated: new Date(connectionData.last_validated || connectionData.updated_at)
      }

      return connection
    } catch (error) {
      secureLogger.error('OAuth2Connection', 'Error getting OAuth2 connection:', { error: error instanceof Error ? error.message : String(error) })
      return null
    }
  }

  /**
   * Refresh OAuth2 tokens if needed
   */
  public async refreshOAuth2ConnectionIfNeeded(projectId: string): Promise<boolean> {
    try {
      const user = (await supabase.auth.getUser()).data.user
      if (!user) {
        return false
      }

      const { data: connectionData, error } = await supabase
        .from('supabase_connections')
        .select('*')
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .eq('connection_method', 'oauth')
        .single()

      if (error || !connectionData) {
        return false
      }

      // Check if token needs refresh (5 minutes buffer)
      const expiresAt = new Date(connectionData.oauth_expires_at)
      const needsRefresh = expiresAt.getTime() - Date.now() < 5 * 60 * 1000

      if (!needsRefresh) {
        return true // Token is still valid
      }

      // Decrypt refresh token
      const decryptedTokens = await decryptCredentials({
        encryptedOAuthRefreshToken: connectionData.oauth_refresh_token,
        encryptionIv: connectionData.encryption_iv
      }) as DecryptedCredentials

      // Refresh tokens
      const newTokens = await supabaseOAuth2Service.refreshAccessToken(
        decryptedTokens.oauth_refresh_token!
      )

      // Encrypt new tokens
      const encryptedNewTokens = await encryptCredentials({
        oauth_access_token: newTokens.access_token,
        oauth_refresh_token: newTokens.refresh_token
      })

      // Update connection with new tokens
      const newExpiresAt = new Date(Date.now() + (newTokens.expires_in * 1000))
      const { error: updateError } = await supabase
        .from('supabase_connections')
        .update({
          oauth_access_token: encryptedNewTokens.encryptedOAuthAccessToken,
          oauth_refresh_token: encryptedNewTokens.encryptedOAuthRefreshToken,
          oauth_expires_at: newExpiresAt.toISOString(),
          last_validated: new Date().toISOString(),
          connection_status: 'connected'
        })
        .eq('id', connectionData.id)

      if (updateError) {
        throw updateError
      }

      secureLogger.info('OAuth2Connection', `OAuth2 tokens refreshed for project ${projectId}`)
      return true
    } catch (error) {
      secureLogger.error('OAuth2Connection', 'Error refreshing OAuth2 connection:', { error: error instanceof Error ? error.message : String(error) })
      
      // Mark connection as expired on refresh failure
      await this.markConnectionAsExpired(projectId)
      return false
    }
  }

  /**
   * Mark OAuth2 connection as expired
   */
  private async markConnectionAsExpired(projectId: string): Promise<void> {
    try {
      const user = (await supabase.auth.getUser()).data.user
      if (!user) return

      await supabase
        .from('supabase_connections')
        .update({
          connection_status: 'expired',
          error_message: 'OAuth2 token refresh failed'
        })
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .eq('connection_method', 'oauth')

      // Update project backend status
      await supabase
        .from('projects')
        .update({ backend_status: 'error' })
        .eq('id', projectId)
        .eq('user_id', user.id)

    } catch (error) {
      secureLogger.error('OAuth2Connection', 'Error marking connection as expired:', { error: error instanceof Error ? error.message : String(error) })
    }
  }

  /**
   * Test OAuth2 connection health
   */
  public async testOAuth2Connection(projectId: string): Promise<boolean> {
    try {
      const connection = await this.getOAuth2Connection(projectId)
      if (!connection) {
        return false
      }

      // Refresh tokens if needed
      const refreshSuccess = await this.refreshOAuth2ConnectionIfNeeded(projectId)
      if (!refreshSuccess) {
        return false
      }

      // Test the Supabase connection using the anon key
      const testClient = (await import('@supabase/supabase-js')).createClient(
        connection.supabaseProjectUrl,
        connection.anonKey
      )

      // Simple test query
      const { error } = await testClient
        .from('_realtime_schema')
        .select('*')
        .limit(1)

      // Connection is healthy if we don't get a critical error
      const isHealthy = !error || error.code === 'PGRST116' // Table not found is acceptable

      // Update last validated timestamp
      if (isHealthy) {
        await supabase
          .from('supabase_connections')
          .update({ last_validated: new Date().toISOString() })
          .eq('user_id', connection.userId)
          .eq('project_id', projectId)
      }

      return isHealthy
    } catch (error) {
      secureLogger.error('OAuth2Connection', 'Error testing OAuth2 connection:', { error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  /**
   * Delete OAuth2 connection
   */
  public async deleteOAuth2Connection(projectId: string): Promise<boolean> {
    try {
      const user = (await supabase.auth.getUser()).data.user
      if (!user) {
        return false
      }

      // Delete connection record
      const { error: deleteError } = await supabase
        .from('supabase_connections')
        .delete()
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .eq('connection_method', 'oauth')

      if (deleteError) {
        throw deleteError
      }

      // Clear Supabase details from project
      const { error: projectUpdateError } = await supabase
        .from('projects')
        .update({
          supabase_project_ref: null,
          supabase_project_url: null,
          supabase_anon_key: null,
          supabase_service_role_key: null,
          backend_status: 'disconnected',
          backend_config: {}
        })
        .eq('id', projectId)
        .eq('user_id', user.id)

      if (projectUpdateError) {
        throw projectUpdateError
      }

      secureLogger.info('OAuth2Connection', `OAuth2 connection deleted for project ${projectId}`)
      return true
    } catch (error) {
      secureLogger.error('OAuth2Connection', 'Error deleting OAuth2 connection:', { error: error instanceof Error ? error.message : String(error) })
      return false
    }
  }

  /**
   * Get organizations available to user
   */
  public async getUserOrganizations(projectId: string): Promise<SupabaseOrganization[]> {
    try {
      const connection = await this.getOAuth2Connection(projectId)
      if (!connection) {
        throw new Error('No OAuth2 connection found')
      }

      // Refresh tokens if needed
      await this.refreshOAuth2ConnectionIfNeeded(projectId)

      // Get fresh access token
      const user = (await supabase.auth.getUser()).data.user
      if (!user) {
        throw new Error('User not authenticated')
      }

      const { data: freshConnectionData, error } = await supabase
        .from('supabase_connections')
        .select('oauth_access_token, encryption_iv')
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .eq('connection_method', 'oauth')
        .single()

      if (error || !freshConnectionData) {
        throw new Error('Failed to get connection data')
      }

      const decryptedTokens = await decryptCredentials({
        encryptedOAuthAccessToken: freshConnectionData.oauth_access_token,
        encryptionIv: freshConnectionData.encryption_iv
      }) as DecryptedCredentials

      return await supabaseOAuth2Service.getOrganizations(
        decryptedTokens.oauth_access_token!,
        connection.id
      )
    } catch (error) {
      secureLogger.error('OAuth2Connection', 'Error fetching user organizations:', { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  /**
   * Get projects for an organization
   */
  public async getOrganizationProjects(
    projectId: string,
    organizationId: string
  ): Promise<SupabaseProject[]> {
    try {
      const connection = await this.getOAuth2Connection(projectId)
      if (!connection) {
        throw new Error('No OAuth2 connection found')
      }

      // Refresh tokens if needed
      await this.refreshOAuth2ConnectionIfNeeded(projectId)

      // Get fresh access token
      const user = (await supabase.auth.getUser()).data.user
      if (!user) {
        throw new Error('User not authenticated')
      }

      const { data: freshConnectionData, error } = await supabase
        .from('supabase_connections')
        .select('oauth_access_token, encryption_iv')
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .eq('connection_method', 'oauth')
        .single()

      if (error || !freshConnectionData) {
        throw new Error('Failed to get connection data')
      }

      const decryptedTokens = await decryptCredentials({
        encryptedOAuthAccessToken: freshConnectionData.oauth_access_token,
        encryptionIv: freshConnectionData.encryption_iv
      }) as DecryptedCredentials

      return await supabaseOAuth2Service.getOrganizationProjects(
        decryptedTokens.oauth_access_token!,
        organizationId,
        connection.id
      )
    } catch (error) {
      secureLogger.error('OAuth2Connection', 'Error fetching organization projects:', { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }

  /**
   * Create new Supabase project via OAuth2
   */
  public async createSupabaseProject(
    velocityProjectId: string,
    request: CreateSupabaseProjectRequest
  ): Promise<SupabaseProject> {
    try {
      const connection = await this.getOAuth2Connection(velocityProjectId)
      if (!connection) {
        throw new Error('No OAuth2 connection found')
      }

      // Refresh tokens if needed
      await this.refreshOAuth2ConnectionIfNeeded(velocityProjectId)

      // Get fresh access token
      const user = (await supabase.auth.getUser()).data.user
      if (!user) {
        throw new Error('User not authenticated')
      }

      const { data: freshConnectionData, error } = await supabase
        .from('supabase_connections')
        .select('oauth_access_token, encryption_iv')
        .eq('user_id', user.id)
        .eq('project_id', velocityProjectId)
        .eq('connection_method', 'oauth')
        .single()

      if (error || !freshConnectionData) {
        throw new Error('Failed to get connection data')
      }

      const decryptedTokens = await decryptCredentials({
        encryptedOAuthAccessToken: freshConnectionData.oauth_access_token,
        encryptionIv: freshConnectionData.encryption_iv
      }) as DecryptedCredentials

      return await supabaseOAuth2Service.createSupabaseProject(
        decryptedTokens.oauth_access_token!,
        request,
        connection.id
      )
    } catch (error) {
      secureLogger.error('OAuth2Connection', 'Error creating Supabase project:', { error: error instanceof Error ? error.message : String(error) })
      throw error
    }
  }
}

// Create singleton instance
export const supabaseOAuth2ConnectionService = new SupabaseOAuth2ConnectionService()