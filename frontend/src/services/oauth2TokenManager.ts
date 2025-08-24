/**
 * OAuth2 Token Manager Service
 * Handles automatic token refresh, rate limiting, and token lifecycle management
 */

import { supabase } from '@/lib/supabase'
import { supabaseOAuth2Service } from './supabaseOAuth2Service'
import type { OAuth2Tokens } from '@/types/supabase-oauth'

export interface TokenRefreshResult {
  success: boolean
  tokens?: OAuth2Tokens
  error?: string
}

export interface RateLimitInfo {
  requests: number
  windowStart: Date
  limit: number
  resetTime: Date
}

export interface ConnectionTokenInfo {
  connectionId: string
  tokens: OAuth2Tokens
  lastRefresh: Date
  expiresAt: Date
  rateLimitInfo?: RateLimitInfo
}

class OAuth2TokenManager {
  private tokenCache = new Map<string, ConnectionTokenInfo>()
  private refreshPromises = new Map<string, Promise<TokenRefreshResult>>()
  private rateLimitInfo = new Map<string, RateLimitInfo>()
  private readonly REFRESH_BUFFER_MINUTES = 5 // Refresh tokens 5 minutes before expiry
  private readonly RATE_LIMIT_WINDOW = 60000 // 1 minute window
  private readonly RATE_LIMIT_MAX_REQUESTS = 60 // Max requests per window

  /**
   * Get valid tokens for a connection, automatically refreshing if needed
   */
  public async getValidTokens(connectionId: string): Promise<{ tokens?: OAuth2Tokens; error?: string }> {
    try {
      // Check cache first
      const cachedInfo = this.tokenCache.get(connectionId)
      
      if (cachedInfo && this.isTokenValid(cachedInfo)) {
        return { tokens: cachedInfo.tokens }
      }

      // Load tokens from database
      const { data: connection, error } = await supabase
        .from('oauth2_connections')
        .select('access_token, refresh_token, expires_at, created_at, updated_at')
        .eq('id', connectionId)
        .eq('is_active', true)
        .single()

      if (error || !connection) {
        return { error: 'OAuth2 connection not found or inactive' }
      }

      // Decrypt tokens (implementation would depend on your encryption setup)
      const decryptedTokens: OAuth2Tokens = {
        access_token: this.decryptToken(connection.access_token),
        refresh_token: this.decryptToken(connection.refresh_token),
        expires_in: Math.floor((new Date(connection.expires_at).getTime() - Date.now()) / 1000),
        token_type: 'bearer'
      }

      const tokenInfo: ConnectionTokenInfo = {
        connectionId,
        tokens: decryptedTokens,
        lastRefresh: new Date(connection.updated_at),
        expiresAt: new Date(connection.expires_at)
      }

      // Check if token needs refresh
      if (this.shouldRefreshToken(tokenInfo)) {
        const refreshResult = await this.refreshTokens(connectionId, decryptedTokens.refresh_token)
        if (refreshResult.success && refreshResult.tokens) {
          tokenInfo.tokens = refreshResult.tokens
          tokenInfo.lastRefresh = new Date()
          tokenInfo.expiresAt = new Date(Date.now() + refreshResult.tokens.expires_in * 1000)
        } else {
          return { error: refreshResult.error }
        }
      }

      // Update cache
      this.tokenCache.set(connectionId, tokenInfo)
      
      return { tokens: tokenInfo.tokens }
    } catch (error) {
      console.error('Error getting valid tokens:', error)
      return { error: error instanceof Error ? error.message : 'Failed to get valid tokens' }
    }
  }

  /**
   * Refresh OAuth2 tokens
   */
  private async refreshTokens(connectionId: string, refreshToken: string): Promise<TokenRefreshResult> {
    // Check if refresh is already in progress
    const existingRefresh = this.refreshPromises.get(connectionId)
    if (existingRefresh) {
      return existingRefresh
    }

    const refreshPromise = this.performTokenRefresh(connectionId, refreshToken)
    this.refreshPromises.set(connectionId, refreshPromise)

    try {
      const result = await refreshPromise
      return result
    } finally {
      this.refreshPromises.delete(connectionId)
    }
  }

  /**
   * Actually perform the token refresh
   */
  private async performTokenRefresh(connectionId: string, refreshToken: string): Promise<TokenRefreshResult> {
    try {
      // Check rate limit before making request
      if (!this.checkRateLimit(connectionId)) {
        return { 
          success: false, 
          error: 'Rate limit exceeded. Please wait before making more requests.' 
        }
      }

      // Call Supabase Management API to refresh tokens
      const newTokens = await supabaseOAuth2Service.refreshAccessToken(refreshToken)
      
      // Record the API request for rate limiting
      this.recordApiRequest(connectionId)

      // Update database with new tokens
      const expiresAt = new Date(Date.now() + newTokens.expires_in * 1000)
      
      const { error } = await supabase
        .from('oauth2_connections')
        .update({
          access_token: this.encryptToken(newTokens.access_token),
          refresh_token: this.encryptToken(newTokens.refresh_token),
          expires_at: expiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', connectionId)

      if (error) {
        console.error('Failed to update tokens in database:', error)
        return { success: false, error: 'Failed to save refreshed tokens' }
      }

      // Update cache
      const tokenInfo = this.tokenCache.get(connectionId)
      if (tokenInfo) {
        tokenInfo.tokens = newTokens
        tokenInfo.lastRefresh = new Date()
        tokenInfo.expiresAt = expiresAt
      }

      return { success: true, tokens: newTokens }
    } catch (error) {
      console.error('Error refreshing tokens:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to refresh tokens' 
      }
    }
  }

  /**
   * Check if a token is valid (not expired and not close to expiring)
   */
  private isTokenValid(tokenInfo: ConnectionTokenInfo): boolean {
    const now = new Date()
    const expiryWithBuffer = new Date(tokenInfo.expiresAt.getTime() - this.REFRESH_BUFFER_MINUTES * 60 * 1000)
    return now < expiryWithBuffer
  }

  /**
   * Check if a token should be refreshed
   */
  private shouldRefreshToken(tokenInfo: ConnectionTokenInfo): boolean {
    const now = new Date()
    const expiryWithBuffer = new Date(tokenInfo.expiresAt.getTime() - this.REFRESH_BUFFER_MINUTES * 60 * 1000)
    return now >= expiryWithBuffer
  }

  /**
   * Check rate limit for Management API requests
   */
  private checkRateLimit(connectionId: string): boolean {
    const now = new Date()
    const rateLimitInfo = this.rateLimitInfo.get(connectionId)

    if (!rateLimitInfo) {
      // First request, initialize rate limit tracking
      this.rateLimitInfo.set(connectionId, {
        requests: 0,
        windowStart: now,
        limit: this.RATE_LIMIT_MAX_REQUESTS,
        resetTime: new Date(now.getTime() + this.RATE_LIMIT_WINDOW)
      })
      return true
    }

    // Check if window has expired
    if (now >= rateLimitInfo.resetTime) {
      // Reset window
      rateLimitInfo.requests = 0
      rateLimitInfo.windowStart = now
      rateLimitInfo.resetTime = new Date(now.getTime() + this.RATE_LIMIT_WINDOW)
      return true
    }

    // Check if within rate limit
    return rateLimitInfo.requests < rateLimitInfo.limit
  }

  /**
   * Record an API request for rate limiting
   */
  private recordApiRequest(connectionId: string): void {
    const rateLimitInfo = this.rateLimitInfo.get(connectionId)
    if (rateLimitInfo) {
      rateLimitInfo.requests++
    }
  }

  /**
   * Get current rate limit status
   */
  public getRateLimitStatus(connectionId: string): RateLimitInfo | null {
    return this.rateLimitInfo.get(connectionId) || null
  }

  /**
   * Invalidate cached tokens for a connection
   */
  public invalidateTokens(connectionId: string): void {
    this.tokenCache.delete(connectionId)
    this.rateLimitInfo.delete(connectionId)
  }

  /**
   * Clear all cached data
   */
  public clearCache(): void {
    this.tokenCache.clear()
    this.refreshPromises.clear()
    this.rateLimitInfo.clear()
  }

  /**
   * Encrypt token for storage (placeholder - implement with your encryption library)
   */
  private encryptToken(token: string): string {
    // TODO: Implement actual encryption using AES-256
    // For now, return the token as-is (NOT SECURE - implement proper encryption)
    return token
  }

  /**
   * Decrypt token from storage (placeholder - implement with your encryption library)
   */
  private decryptToken(encryptedToken: string): string {
    // TODO: Implement actual decryption using AES-256
    // For now, return the token as-is (NOT SECURE - implement proper decryption)
    return encryptedToken
  }

  /**
   * Schedule automatic token refresh for all active connections
   */
  public async scheduleTokenRefresh(): Promise<void> {
    try {
      const { data: connections, error } = await supabase
        .from('oauth2_connections')
        .select('id, expires_at')
        .eq('is_active', true)

      if (error || !connections) {
        console.error('Failed to load connections for token refresh scheduling:', error)
        return
      }

      const now = new Date()
      const refreshThreshold = new Date(now.getTime() + this.REFRESH_BUFFER_MINUTES * 60 * 1000)

      for (const connection of connections) {
        const expiresAt = new Date(connection.expires_at)
        
        if (expiresAt <= refreshThreshold) {
          // Token expires soon, refresh it
          const { tokens } = await this.getValidTokens(connection.id)
          if (!tokens) {
            console.warn(`Failed to refresh tokens for connection ${connection.id}`)
          }
        }
      }
    } catch (error) {
      console.error('Error in scheduled token refresh:', error)
    }
  }

  /**
   * Start automatic token refresh scheduler
   */
  public startTokenRefreshScheduler(intervalMinutes: number = 10): void {
    // Run initial refresh
    this.scheduleTokenRefresh()

    // Schedule periodic refresh
    setInterval(() => {
      this.scheduleTokenRefresh()
    }, intervalMinutes * 60 * 1000)
  }
}

export const oauth2TokenManager = new OAuth2TokenManager()