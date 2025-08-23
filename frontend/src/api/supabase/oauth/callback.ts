/**
 * OAuth2 Callback Handler API
 * Handles OAuth2 authorization callback and token exchange
 */

import { supabaseOAuth2Service } from '@/services/supabaseOAuth2Service'
import type { OAuthCallbackRequest, OAuthTokens } from '@/types/supabase-oauth'

export interface OAuth2CallbackAPIRequest {
  code: string
  state: string
}

export interface OAuth2CallbackAPIResponse {
  success: boolean
  data?: {
    tokens: OAuthTokens
    message: string
  }
  error?: {
    code: string
    message: string
  }
}

/**
 * Handle OAuth2 callback and exchange authorization code for tokens
 */
export async function handleOAuth2Callback(request: OAuth2CallbackAPIRequest): Promise<OAuth2CallbackAPIResponse> {
  try {
    if (!request.code?.trim() || !request.state?.trim()) {
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Authorization code and state are required'
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

    const callbackRequest: OAuthCallbackRequest = {
      code: request.code,
      state: request.state
    }

    const tokens = await supabaseOAuth2Service.handleOAuth2Callback(callbackRequest)
    
    return {
      success: true,
      data: {
        tokens,
        message: 'OAuth2 authorization successful'
      }
    }
  } catch (error) {
    console.error('OAuth2 callback error:', error)
    
    // Determine error code based on error type/message
    let errorCode = 'OAUTH_ERROR'
    let errorMessage = 'OAuth2 callback failed'
    
    if (error instanceof Error) {
      errorMessage = error.message
      
      if (error.message.includes('Invalid or expired')) {
        errorCode = 'INVALID_STATE'
      } else if (error.message.includes('token')) {
        errorCode = 'TOKEN_ERROR'
      } else if (error.message.includes('unauthorized') || error.message.includes('authentication')) {
        errorCode = 'UNAUTHORIZED'
      }
    }
    
    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage
      }
    }
  }
}

/**
 * Refresh OAuth2 access token
 */
export interface RefreshTokenAPIRequest {
  refresh_token: string
}

export interface RefreshTokenAPIResponse {
  success: boolean
  data?: {
    tokens: OAuthTokens
    message: string
  }
  error?: {
    code: string
    message: string
  }
}

export async function refreshOAuth2Token(request: RefreshTokenAPIRequest): Promise<RefreshTokenAPIResponse> {
  try {
    if (!request.refresh_token?.trim()) {
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'Refresh token is required'
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

    const tokens = await supabaseOAuth2Service.refreshAccessToken(request.refresh_token)
    
    return {
      success: true,
      data: {
        tokens,
        message: 'OAuth2 tokens refreshed successfully'
      }
    }
  } catch (error) {
    console.error('OAuth2 token refresh error:', error)
    
    let errorCode = 'REFRESH_ERROR'
    let errorMessage = 'Failed to refresh OAuth2 tokens'
    
    if (error instanceof Error) {
      errorMessage = error.message
      
      if (error.message.includes('expired') || error.message.includes('invalid')) {
        errorCode = 'TOKEN_EXPIRED'
      } else if (error.message.includes('unauthorized')) {
        errorCode = 'UNAUTHORIZED'
      }
    }
    
    return {
      success: false,
      error: {
        code: errorCode,
        message: errorMessage
      }
    }
  }
}