/**
 * OAuth2 Health Monitor Service
 * Monitors OAuth2 connection health and provides notifications for issues
 */

import { supabase } from '@/lib/supabase'
import { enhancedOAuth2Service } from './enhancedOAuth2Service'
import { oauth2TokenManager } from './oauth2TokenManager'
import type { OAuth2ConnectionInfo } from './enhancedOAuth2Service'

export interface HealthCheckResult {
  connectionId: string
  isHealthy: boolean
  lastChecked: Date
  error?: string
  details?: any
  recommendation?: string
}

export interface HealthMonitorEvents {
  onConnectionUnhealthy: (result: HealthCheckResult) => void
  onConnectionRecovered: (result: HealthCheckResult) => void
  onTokenExpiringSoon: (connectionId: string, expiresIn: number) => void
  onRateLimitWarning: (connectionId: string, remainingRequests: number) => void
}

class OAuth2HealthMonitor {
  private healthStatus = new Map<string, HealthCheckResult>()
  private monitoringInterval?: NodeJS.Timeout
  private eventHandlers: Partial<HealthMonitorEvents> = {}
  private readonly CHECK_INTERVAL_MINUTES = 5
  private readonly TOKEN_EXPIRY_WARNING_MINUTES = 30

  /**
   * Start health monitoring for all active OAuth2 connections
   */
  public startMonitoring(intervalMinutes: number = this.CHECK_INTERVAL_MINUTES): void {
    if (this.monitoringInterval) {
      this.stopMonitoring()
    }

    // Run initial health check
    this.performHealthChecks()

    // Schedule periodic health checks
    this.monitoringInterval = setInterval(() => {
      this.performHealthChecks()
    }, intervalMinutes * 60 * 1000)

    console.log(`OAuth2 health monitoring started (checking every ${intervalMinutes} minutes)`)
  }

  /**
   * Stop health monitoring
   */
  public stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = undefined
      console.log('OAuth2 health monitoring stopped')
    }
  }

  /**
   * Register event handlers
   */
  public on<K extends keyof HealthMonitorEvents>(event: K, handler: HealthMonitorEvents[K]): void {
    this.eventHandlers[event] = handler
  }

  /**
   * Remove event handlers
   */
  public off<K extends keyof HealthMonitorEvents>(event: K): void {
    delete this.eventHandlers[event]
  }

  /**
   * Perform health checks for all active connections
   */
  private async performHealthChecks(): Promise<void> {
    try {
      // Get all active OAuth2 connections
      const { data: connections, error } = await supabase
        .from('oauth2_connections')
        .select('id, velocity_project_id, expires_at, last_used')
        .eq('is_active', true)

      if (error) {
        console.error('Failed to load connections for health check:', error)
        return
      }

      if (!connections || connections.length === 0) {
        return
      }

      // Perform health checks in parallel
      const healthCheckPromises = connections.map(connection => 
        this.checkConnectionHealth(connection.id, connection.expires_at)
      )

      const results = await Promise.allSettled(healthCheckPromises)
      
      // Process results and trigger events
      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          this.processHealthCheckResult(result.value)
        } else {
          console.error(`Health check failed for connection ${connections[index].id}:`, result.reason)
        }
      })

      // Check for expiring tokens
      this.checkTokenExpirations(connections)

      // Check rate limits
      this.checkRateLimits(connections.map(c => c.id))

    } catch (error) {
      console.error('Error during health check cycle:', error)
    }
  }

  /**
   * Check health of a specific connection
   */
  public async checkConnectionHealth(connectionId: string, expiresAt?: string): Promise<HealthCheckResult> {
    const result: HealthCheckResult = {
      connectionId,
      isHealthy: false,
      lastChecked: new Date()
    }

    try {
      // Check if token is expired
      if (expiresAt) {
        const expiryDate = new Date(expiresAt)
        const now = new Date()
        
        if (now >= expiryDate) {
          result.error = 'OAuth2 token has expired'
          result.recommendation = 'The connection needs to be re-authorized. Please reconnect your Supabase account.'
          return result
        }
      }

      // Test the connection
      const testResult = await enhancedOAuth2Service.testConnection(connectionId)
      
      if (testResult.success && testResult.data) {
        result.isHealthy = testResult.data.healthy
        result.details = testResult.data.details
        
        if (!result.isHealthy) {
          result.error = testResult.data.details.error
          result.recommendation = this.getHealthRecommendation(testResult.data.details.error)
        }
      } else {
        result.error = testResult.error || 'Connection test failed'
        result.recommendation = 'Please check your internet connection and try again.'
      }

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error during health check'
      result.recommendation = 'Please check your connection settings and try reconnecting.'
    }

    return result
  }

  /**
   * Process health check result and trigger events
   */
  private processHealthCheckResult(result: HealthCheckResult): void {
    const previousResult = this.healthStatus.get(result.connectionId)
    this.healthStatus.set(result.connectionId, result)

    // Check for state changes
    if (previousResult) {
      if (previousResult.isHealthy && !result.isHealthy) {
        // Connection became unhealthy
        this.eventHandlers.onConnectionUnhealthy?.(result)
      } else if (!previousResult.isHealthy && result.isHealthy) {
        // Connection recovered
        this.eventHandlers.onConnectionRecovered?.(result)
      }
    } else if (!result.isHealthy) {
      // First check and unhealthy
      this.eventHandlers.onConnectionUnhealthy?.(result)
    }
  }

  /**
   * Check for tokens expiring soon
   */
  private checkTokenExpirations(connections: Array<{ id: string; expires_at: string }>): void {
    const now = new Date()
    const warningThreshold = new Date(now.getTime() + this.TOKEN_EXPIRY_WARNING_MINUTES * 60 * 1000)

    for (const connection of connections) {
      const expiresAt = new Date(connection.expires_at)
      
      if (expiresAt <= warningThreshold) {
        const expiresInMinutes = Math.floor((expiresAt.getTime() - now.getTime()) / (60 * 1000))
        this.eventHandlers.onTokenExpiringSoon?.(connection.id, expiresInMinutes)
      }
    }
  }

  /**
   * Check rate limits for connections
   */
  private checkRateLimits(connectionIds: string[]): void {
    for (const connectionId of connectionIds) {
      const rateLimitInfo = oauth2TokenManager.getRateLimitStatus(connectionId)
      
      if (rateLimitInfo) {
        const remainingRequests = rateLimitInfo.limit - rateLimitInfo.requests
        const warningThreshold = rateLimitInfo.limit * 0.2 // Warn at 20% remaining
        
        if (remainingRequests <= warningThreshold) {
          this.eventHandlers.onRateLimitWarning?.(connectionId, remainingRequests)
        }
      }
    }
  }

  /**
   * Get health status for a specific connection
   */
  public getHealthStatus(connectionId: string): HealthCheckResult | null {
    return this.healthStatus.get(connectionId) || null
  }

  /**
   * Get health status for all monitored connections
   */
  public getAllHealthStatus(): Map<string, HealthCheckResult> {
    return new Map(this.healthStatus)
  }

  /**
   * Force a health check for a specific connection
   */
  public async forceHealthCheck(connectionId: string): Promise<HealthCheckResult> {
    const result = await this.checkConnectionHealth(connectionId)
    this.processHealthCheckResult(result)
    return result
  }

  /**
   * Get health recommendations based on error
   */
  private getHealthRecommendation(error: string): string {
    const lowercaseError = error.toLowerCase()
    
    if (lowercaseError.includes('token') || lowercaseError.includes('auth')) {
      return 'Your authentication token may have expired or been revoked. Please reconnect your Supabase account.'
    }
    
    if (lowercaseError.includes('rate limit') || lowercaseError.includes('too many requests')) {
      return 'You have exceeded the API rate limit. Please wait a few minutes before making more requests.'
    }
    
    if (lowercaseError.includes('network') || lowercaseError.includes('timeout')) {
      return 'There seems to be a network connectivity issue. Please check your internet connection.'
    }
    
    if (lowercaseError.includes('permission') || lowercaseError.includes('access')) {
      return 'Your account may not have the necessary permissions. Please check your Supabase account settings.'
    }
    
    return 'An unexpected error occurred. Please try reconnecting your Supabase account or contact support if the issue persists.'
  }

  /**
   * Get health summary for all connections
   */
  public getHealthSummary(): {
    total: number
    healthy: number
    unhealthy: number
    unknown: number
    issues: Array<{ connectionId: string; error: string; recommendation: string }>
  } {
    const statuses = Array.from(this.healthStatus.values())
    const healthy = statuses.filter(s => s.isHealthy).length
    const unhealthy = statuses.filter(s => !s.isHealthy && s.error).length
    const unknown = statuses.length - healthy - unhealthy
    
    const issues = statuses
      .filter(s => !s.isHealthy && s.error)
      .map(s => ({
        connectionId: s.connectionId,
        error: s.error!,
        recommendation: s.recommendation || 'Please check your connection.'
      }))

    return {
      total: statuses.length,
      healthy,
      unhealthy,
      unknown,
      issues
    }
  }

  /**
   * Clear health status for a connection (when disconnected)
   */
  public clearHealthStatus(connectionId: string): void {
    this.healthStatus.delete(connectionId)
  }

  /**
   * Clear all health status data
   */
  public clearAllHealthStatus(): void {
    this.healthStatus.clear()
  }
}

export const oauth2HealthMonitor = new OAuth2HealthMonitor()