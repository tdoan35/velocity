/**
 * OAuth2 Flow Initiation API
 * Handles starting OAuth2 authorization flow with PKCE
 */

import { supabaseOAuth2Service } from '@/services/supabaseOAuth2Service'
import type { OAuthInitiateRequest, OAuthInitiateResponse } from '@/types/supabase-oauth'

export interface OAuth2InitiateAPIRequest {
  project_id: string
  redirect_uri?: string
}

export interface OAuth2InitiateAPIResponse {
  success: boolean
  data?: OAuthInitiateResponse
  error?: {
    code: string
    message: string
  }
}

/**
 * Initiate OAuth2 flow for a Velocity project
 */
export async function initiateOAuth2Flow(request: OAuth2InitiateAPIRequest): Promise<OAuth2InitiateAPIResponse> {
  try {
    if (!request.project_id?.trim()) {
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Project ID is required'
        }
      }
    }

    // Check if OAuth2 is enabled
    if (!supabaseOAuth2Service.isOAuth2Enabled()) {
      return {
        success: false,
        error: {
          code: 'OAUTH_DISABLED',
          message: 'OAuth2 integration is not enabled or configured'
        }
      }
    }

    const oauthRequest: OAuthInitiateRequest = {
      project_id: request.project_id,
      redirect_uri: request.redirect_uri
    }

    const response = await supabaseOAuth2Service.initiateOAuth2Flow(oauthRequest)
    
    return {
      success: true,
      data: response
    }
  } catch (error) {
    console.error('OAuth2 initiation error:', error)
    
    return {
      success: false,
      error: {
        code: 'OAUTH_ERROR',
        message: error instanceof Error ? error.message : 'Failed to initiate OAuth2 flow'
      }
    }
  }
}

/**
 * Check OAuth2 availability
 */
export function checkOAuth2Availability(): { available: boolean; reason?: string } {
  if (!supabaseOAuth2Service.isOAuth2Enabled()) {
    return {
      available: false,
      reason: 'OAuth2 is not enabled or properly configured'
    }
  }
  
  return { available: true }
}