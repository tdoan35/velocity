/**
 * Supabase OAuth2 Service
 * Handles OAuth2 flow with Management API integration including PKCE security
 * Based on official Supabase OAuth2 and Management API documentation
 */

import { config } from '@/config/env'
import { supabase } from '@/lib/supabase'
import { encryptCredentials, decryptCredentials } from '@/utils/supabase/credentialSecurity'
import { secureLogger } from '@/utils/logging/supabaseConnectionLogger'
import type {
  OAuthInitiateRequest,
  OAuthInitiateResponse,
  OAuthCallbackRequest,
  OAuthTokens,
  SupabaseOrganization,
  SupabaseProject,
  CreateSupabaseProjectRequest,
  CreateSupabaseProjectResponse
} from '@/types/supabase-oauth'

// Error class for OAuth operations
export class SupabaseOAuthError extends Error {
  public code: 'OAUTH_ERROR' | 'TOKEN_EXPIRED' | 'PROJECT_CREATION_FAILED' | 'NETWORK_ERROR' | 'UNKNOWN_ERROR';
  public details?: any;

  constructor(
    code: 'OAUTH_ERROR' | 'TOKEN_EXPIRED' | 'PROJECT_CREATION_FAILED' | 'NETWORK_ERROR' | 'UNKNOWN_ERROR',
    message: string,
    details?: any
  ) {
    super(message);
    this.name = 'SupabaseOAuthError';
    this.code = code;
    this.details = details;
  }
}

interface PKCEParams {
  codeVerifier: string
  codeChallenge: string
}

interface OAuth2StateData {
  state: string
  codeVerifier: string
  codeChallenge: string
}

interface ManagementAPIResponse<T = any> {
  data?: T
  error?: {
    message: string
    code?: string
  }
  quotaRemaining?: number
  quotaResetTime?: string
}

class SupabaseOAuth2Service {
  private readonly managementApiUrl: string
  private readonly clientId: string
  private readonly clientSecret: string
  private readonly redirectUri: string
  
  constructor() {
    this.managementApiUrl = config.supabaseManagementApiUrl || 'https://api.supabase.com/v1'
    this.clientId = config.supabaseOAuthClientId || ''
    this.clientSecret = config.supabaseOAuthClientSecret || ''
    this.redirectUri = config.supabaseOAuthRedirectUri || ''
    
    if (!this.clientId || !this.clientSecret) {
      secureLogger.warn('OAuth2 credentials not configured')
    }
  }

  /**
   * Check if OAuth2 is properly configured
   */
  public isOAuth2Enabled(): boolean {
    return config.supabaseOAuthEnabled && 
           !!this.clientId && 
           !!this.clientSecret && 
           !!this.redirectUri
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  private async generatePKCE(): Promise<PKCEParams> {
    try {
      const { data, error } = await supabase.rpc('generate_pkce_challenge')
      
      if (error || !data || data.length === 0) {
        throw new Error('Failed to generate PKCE challenge')
      }
      
      return {
        codeVerifier: data[0].code_verifier,
        codeChallenge: data[0].code_challenge
      }
    } catch (error) {
      secureLogger.error('Error generating PKCE challenge:', error)
      throw new SupabaseOAuthError('OAUTH_ERROR', 'Failed to generate PKCE challenge')
    }
  }

  /**
   * Create OAuth2 state with PKCE parameters
   */
  private async createOAuth2State(
    userId: string,
    projectId: string,
    redirectUri: string
  ): Promise<OAuth2StateData> {
    try {
      const { data, error } = await supabase.rpc('create_oauth2_state_with_pkce', {
        p_user_id: userId,
        p_project_id: projectId,
        p_redirect_uri: redirectUri
      })
      
      if (error || !data || data.length === 0) {
        throw new Error('Failed to create OAuth2 state')
      }
      
      return {
        state: data[0].state_token,
        codeVerifier: data[0].code_verifier,
        codeChallenge: data[0].code_challenge
      }
    } catch (error) {
      secureLogger.error('Error creating OAuth2 state:', error)
      throw new SupabaseOAuthError('OAUTH_ERROR', 'Failed to create OAuth2 state')
    }
  }

  /**
   * Initiate OAuth2 flow with PKCE
   */
  public async initiateOAuth2Flow(request: OAuthInitiateRequest): Promise<OAuthInitiateResponse> {
    if (!this.isOAuth2Enabled()) {
      throw new SupabaseOAuthError('OAUTH_ERROR', 'OAuth2 is not properly configured')
    }

    try {
      const user = (await supabase.auth.getUser()).data.user
      if (!user) {
        throw new SupabaseOAuthError('OAUTH_ERROR', 'User not authenticated')
      }

      // Create OAuth2 state with PKCE
      const stateData = await this.createOAuth2State(
        user.id,
        request.project_id,
        request.redirect_uri || this.redirectUri
      )

      // Build authorization URL with PKCE parameters
      const authUrl = new URL(`${this.managementApiUrl}/oauth/authorize`)
      authUrl.searchParams.set('response_type', 'code')
      authUrl.searchParams.set('client_id', this.clientId)
      authUrl.searchParams.set('redirect_uri', request.redirect_uri || this.redirectUri)
      authUrl.searchParams.set('scope', 'auth:read auth:write projects:read projects:write organizations:read')
      authUrl.searchParams.set('state', stateData.state)
      authUrl.searchParams.set('code_challenge', stateData.codeChallenge)
      authUrl.searchParams.set('code_challenge_method', 'S256')

      secureLogger.info(`OAuth2 flow initiated for project ${request.project_id}`)

      return {
        auth_url: authUrl.toString(),
        state: stateData.state
      }
    } catch (error) {
      secureLogger.error('Error initiating OAuth2 flow:', error)
      if (error instanceof SupabaseOAuthError) {
        throw error
      }
      throw new SupabaseOAuthError('OAUTH_ERROR', 'Failed to initiate OAuth2 flow')
    }
  }

  /**
   * Validate OAuth2 state and get PKCE verifier
   */
  private async validateOAuth2State(
    state: string,
    userId: string
  ): Promise<{ isValid: boolean; projectId?: string; redirectUri?: string; codeVerifier?: string }> {
    try {
      const { data, error } = await supabase.rpc('validate_oauth2_state_with_pkce', {
        p_state_token: state,
        p_user_id: userId
      })
      
      if (error || !data || data.length === 0) {
        return { isValid: false }
      }
      
      const result = data[0]
      return {
        isValid: result.is_valid,
        projectId: result.project_id,
        redirectUri: result.redirect_uri,
        codeVerifier: result.code_verifier
      }
    } catch (error) {
      secureLogger.error('Error validating OAuth2 state:', error)
      return { isValid: false }
    }
  }

  /**
   * Exchange authorization code for tokens with PKCE
   */
  public async handleOAuth2Callback(request: OAuthCallbackRequest): Promise<OAuthTokens> {
    if (!this.isOAuth2Enabled()) {
      throw new SupabaseOAuthError('OAUTH_ERROR', 'OAuth2 is not properly configured')
    }

    try {
      const user = (await supabase.auth.getUser()).data.user
      if (!user) {
        throw new SupabaseOAuthError('OAUTH_ERROR', 'User not authenticated')
      }

      // Validate state and get PKCE verifier
      const stateValidation = await this.validateOAuth2State(request.state, user.id)
      if (!stateValidation.isValid) {
        throw new SupabaseOAuthError('OAUTH_ERROR', 'Invalid or expired OAuth2 state')
      }

      // Exchange authorization code for tokens using PKCE
      const tokenResponse = await this.exchangeCodeForTokens(
        request.code,
        stateValidation.codeVerifier!,
        stateValidation.redirectUri!
      )

      secureLogger.info(`OAuth2 callback processed successfully for project ${stateValidation.projectId}`)

      return tokenResponse
    } catch (error) {
      secureLogger.error('Error handling OAuth2 callback:', error)
      if (error instanceof SupabaseOAuthError) {
        throw error
      }
      throw new SupabaseOAuthError('OAUTH_ERROR', 'Failed to handle OAuth2 callback')
    }
  }

  /**
   * Exchange code for tokens with PKCE verification
   */
  private async exchangeCodeForTokens(
    code: string,
    codeVerifier: string,
    redirectUri: string
  ): Promise<OAuthTokens> {
    try {
      const response = await fetch(`${this.managementApiUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error_description || `HTTP ${response.status}: ${response.statusText}`)
      }

      const tokenData = await response.json()
      
      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type || 'Bearer'
      }
    } catch (error) {
      secureLogger.error('Error exchanging code for tokens:', error)
      throw new SupabaseOAuthError('TOKEN_EXPIRED', 'Failed to exchange authorization code for tokens')
    }
  }

  /**
   * Refresh OAuth2 access token
   */
  public async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    if (!this.isOAuth2Enabled()) {
      throw new SupabaseOAuthError('OAUTH_ERROR', 'OAuth2 is not properly configured')
    }

    try {
      const response = await fetch(`${this.managementApiUrl}/oauth/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${btoa(`${this.clientId}:${this.clientSecret}`)}`
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: refreshToken
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error_description || `HTTP ${response.status}: ${response.statusText}`)
      }

      const tokenData = await response.json()
      
      secureLogger.info('OAuth2 tokens refreshed successfully')
      
      return {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || refreshToken, // Some providers don't return new refresh token
        expires_in: tokenData.expires_in,
        token_type: tokenData.token_type || 'Bearer'
      }
    } catch (error) {
      secureLogger.error('Error refreshing OAuth2 tokens:', error)
      throw new SupabaseOAuthError('TOKEN_EXPIRED', 'Failed to refresh OAuth2 tokens')
    }
  }

  /**
   * Make authenticated request to Management API with rate limiting
   */
  private async makeManagementAPIRequest<T>(
    endpoint: string,
    accessToken: string,
    options: RequestInit = {},
    connectionId?: string
  ): Promise<ManagementAPIResponse<T>> {
    const startTime = Date.now()
    
    try {
      const response = await fetch(`${this.managementApiUrl}${endpoint}`, {
        ...options,
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          ...options.headers
        }
      })

      const responseTime = Date.now() - startTime
      const quotaRemaining = response.headers.get('x-ratelimit-remaining')
      const quotaReset = response.headers.get('x-ratelimit-reset')

      // Record API request for rate limiting
      if (connectionId) {
        const user = (await supabase.auth.getUser()).data.user
        if (user) {
          await supabase.rpc('record_management_api_request', {
            p_user_id: user.id,
            p_connection_id: connectionId,
            p_endpoint: endpoint,
            p_method: options.method || 'GET',
            p_status_code: response.status,
            p_response_time_ms: responseTime,
            p_quota_remaining: quotaRemaining ? parseInt(quotaRemaining) : null,
            p_quota_reset_time: quotaReset ? new Date(parseInt(quotaReset) * 1000).toISOString() : null
          })
        }
      }

      if (!response.ok) {
        if (response.status === 429) {
          throw new SupabaseOAuthError('OAUTH_ERROR', 'Rate limit exceeded. Please try again later.')
        }
        
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.message || `HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      
      return {
        data,
        quotaRemaining: quotaRemaining ? parseInt(quotaRemaining) : undefined,
        quotaResetTime: quotaReset ? new Date(parseInt(quotaReset) * 1000).toISOString() : undefined
      }
    } catch (error) {
      secureLogger.error(`Management API request failed: ${endpoint}`, error)
      
      if (error instanceof SupabaseOAuthError) {
        throw error
      }
      
      throw new SupabaseOAuthError('NETWORK_ERROR', `Failed to call Management API: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  /**
   * Get user's organizations from Management API
   */
  public async getOrganizations(accessToken: string, connectionId?: string): Promise<SupabaseOrganization[]> {
    try {
      const response = await this.makeManagementAPIRequest<SupabaseOrganization[]>(
        '/organizations',
        accessToken,
        { method: 'GET' },
        connectionId
      )

      if (!response.data) {
        return []
      }

      secureLogger.info(`Retrieved ${response.data.length} organizations`)
      return response.data
    } catch (error) {
      secureLogger.error('Error fetching organizations:', error)
      if (error instanceof SupabaseOAuthError) {
        throw error
      }
      throw new SupabaseOAuthError('OAUTH_ERROR', 'Failed to fetch organizations')
    }
  }

  /**
   * Get projects for an organization from Management API
   */
  public async getOrganizationProjects(
    accessToken: string,
    organizationId: string,
    connectionId?: string
  ): Promise<SupabaseProject[]> {
    try {
      const response = await this.makeManagementAPIRequest<SupabaseProject[]>(
        `/organizations/${organizationId}/projects`,
        accessToken,
        { method: 'GET' },
        connectionId
      )

      if (!response.data) {
        return []
      }

      secureLogger.info(`Retrieved ${response.data.length} projects for organization ${organizationId}`)
      return response.data
    } catch (error) {
      secureLogger.error('Error fetching organization projects:', error)
      if (error instanceof SupabaseOAuthError) {
        throw error
      }
      throw new SupabaseOAuthError('OAUTH_ERROR', 'Failed to fetch organization projects')
    }
  }

  /**
   * Create new Supabase project via Management API
   */
  public async createSupabaseProject(
    accessToken: string,
    request: CreateSupabaseProjectRequest,
    connectionId?: string
  ): Promise<CreateSupabaseProjectResponse> {
    try {
      const response = await this.makeManagementAPIRequest<CreateSupabaseProjectResponse>(
        '/projects',
        accessToken,
        {
          method: 'POST',
          body: JSON.stringify(request)
        },
        connectionId
      )

      if (!response.data) {
        throw new Error('No project data returned from API')
      }

      secureLogger.info(`Created new Supabase project: ${response.data.name}`)
      return response.data
    } catch (error) {
      secureLogger.error('Error creating Supabase project:', error)
      if (error instanceof SupabaseOAuthError) {
        throw error
      }
      throw new SupabaseOAuthError('PROJECT_CREATION_FAILED', 'Failed to create Supabase project')
    }
  }

  /**
   * Get project API keys from Management API
   */
  public async getProjectApiKeys(
    accessToken: string,
    projectRef: string,
    connectionId?: string
  ): Promise<{ anonKey: string; serviceRoleKey: string }> {
    try {
      const response = await this.makeManagementAPIRequest<{ api_keys: Array<{ name: string; api_key: string }> }>(
        `/projects/${projectRef}/api-keys`,
        accessToken,
        { method: 'GET' },
        connectionId
      )

      if (!response.data?.api_keys) {
        throw new Error('No API keys returned')
      }

      const anonKey = response.data.api_keys.find(key => key.name === 'anon')?.api_key
      const serviceRoleKey = response.data.api_keys.find(key => key.name === 'service_role')?.api_key

      if (!anonKey || !serviceRoleKey) {
        throw new Error('Required API keys not found')
      }

      secureLogger.info(`Retrieved API keys for project ${projectRef}`)
      
      return {
        anonKey,
        serviceRoleKey
      }
    } catch (error) {
      secureLogger.error('Error fetching project API keys:', error)
      if (error instanceof SupabaseOAuthError) {
        throw error
      }
      throw new SupabaseOAuthError('OAUTH_ERROR', 'Failed to fetch project API keys')
    }
  }
}

// Create singleton instance
export const supabaseOAuth2Service = new SupabaseOAuth2Service()

// Error class is already exported above