import { supabase } from '@/lib/supabase'

interface SessionAllocation {
  sessionId: string
  sessionUrl: string
  publicKey: string
}

interface SessionMetrics {
  pools: PoolStatus[]
  history: MetricPoint[]
  cost: {
    last24Hours: number
    estimatedMonthly: number
  }
}

interface PoolStatus {
  id: string
  name: string
  platform: string
  deviceType: string
  totalSessions: number
  activeSessions: number
  readySessions: number
  hibernatedSessions: number
  errorSessions: number
  utilizationPercentage: number
}

interface MetricPoint {
  timestamp: string
  totalSessions: number
  activeSessions: number
  idleSessions: number
  hibernatedSessions: number
  utilizationRate: number
  averageWaitTimeMs: number
  allocationFailures: number
  costPerHour: number
}

interface UserQuota {
  planType: 'free' | 'pro' | 'enterprise'
  monthlyMinutesLimit: number
  monthlyMinutesUsed: number
  concurrentSessionsLimit: number
  quotaResetDate: string
}

class SessionPoolService {
  private static instance: SessionPoolService
  private healthCheckInterval: number | null = null
  private autoScaleInterval: number | null = null

  private constructor() {
    // Start background tasks
    this.startHealthChecks()
    this.startAutoScaling()
  }

  static getInstance(): SessionPoolService {
    if (!SessionPoolService.instance) {
      SessionPoolService.instance = new SessionPoolService()
    }
    return SessionPoolService.instance
  }

  /**
   * Allocate a session from the pool
   */
  async allocateSession(
    projectId: string,
    deviceType: string = 'iphone15pro',
    platform: 'ios' | 'android' = 'ios',
    priority: 'low' | 'normal' | 'high' = 'normal'
  ): Promise<SessionAllocation> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-pool`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'allocate',
          projectId,
          deviceType,
          platform,
          priority
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to allocate session')
      }

      const data = await response.json()
      
      if (!data.success) {
        throw new Error(data.error || 'Session allocation failed')
      }

      return {
        sessionId: data.sessionId,
        sessionUrl: data.sessionUrl,
        publicKey: data.publicKey
      }
    } catch (error) {
      console.error('Session allocation error:', error)
      throw error
    }
  }

  /**
   * Release a session back to the pool
   */
  async releaseSession(sessionId: string): Promise<void> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-pool`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'release',
          sessionId
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to release session')
      }
    } catch (error) {
      console.error('Session release error:', error)
      throw error
    }
  }

  /**
   * Get session pool metrics
   */
  async getMetrics(poolId?: string): Promise<SessionMetrics> {
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-pool`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'metrics',
          poolId
        }),
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to get metrics')
      }

      const data = await response.json()
      return data.metrics
    } catch (error) {
      console.error('Metrics fetch error:', error)
      throw error
    }
  }

  /**
   * Get user quota information
   */
  async getUserQuota(): Promise<UserQuota | null> {
    try {
      const { data: user } = await supabase.auth.getUser()
      if (!user.user) return null

      const { data: quota, error } = await supabase
        .from('user_quotas')
        .select('*')
        .eq('user_id', user.user.id)
        .single()

      if (error || !quota) {
        // Create default quota if not exists
        const { data: newQuota } = await supabase
          .from('user_quotas')
          .insert({
            user_id: user.user.id,
            plan_type: 'free',
            monthly_minutes_limit: 300,
            monthly_minutes_used: 0,
            concurrent_sessions_limit: 1,
            quota_reset_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString()
          })
          .select()
          .single()

        return newQuota as UserQuota
      }

      return {
        planType: quota.plan_type,
        monthlyMinutesLimit: quota.monthly_minutes_limit,
        monthlyMinutesUsed: parseFloat(quota.monthly_minutes_used),
        concurrentSessionsLimit: quota.concurrent_sessions_limit,
        quotaResetDate: quota.quota_reset_date
      }
    } catch (error) {
      console.error('Failed to get user quota:', error)
      return null
    }
  }

  /**
   * Check if user has available quota
   */
  async checkQuotaAvailable(): Promise<boolean> {
    const quota = await this.getUserQuota()
    if (!quota) return false
    
    return quota.monthlyMinutesUsed < quota.monthlyMinutesLimit
  }

  /**
   * Wait for available session with timeout
   */
  async waitForAvailableSession(
    projectId: string,
    deviceType: string,
    platform: 'ios' | 'android',
    maxWaitMs: number = 30000
  ): Promise<SessionAllocation> {
    const startTime = Date.now()
    const retryDelay = 2000 // 2 seconds

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const session = await this.allocateSession(projectId, deviceType, platform, 'high')
        return session
      } catch (error: any) {
        // Check if error is due to no available sessions
        if (error.message?.includes('No available sessions')) {
          // Wait and retry
          await new Promise(resolve => setTimeout(resolve, retryDelay))
        } else {
          // Other errors should be thrown
          throw error
        }
      }
    }

    throw new Error('Timeout waiting for available session')
  }

  /**
   * Start health check background task
   */
  private startHealthChecks() {
    // Run health checks every 5 minutes
    this.healthCheckInterval = setInterval(async () => {
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-pool`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'health_check'
          }),
        })
      } catch (error) {
        console.error('Health check failed:', error)
      }
    }, 5 * 60 * 1000)
  }

  /**
   * Start auto-scaling background task
   */
  private startAutoScaling() {
    // Run auto-scaling every 2 minutes
    this.autoScaleInterval = setInterval(async () => {
      try {
        await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/session-pool`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'scale'
          }),
        })
      } catch (error) {
        console.error('Auto-scaling failed:', error)
      }
    }, 2 * 60 * 1000)
  }

  /**
   * Clean up background tasks
   */
  destroy() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }
    if (this.autoScaleInterval) {
      clearInterval(this.autoScaleInterval)
    }
  }
}

// Export singleton instance
export const sessionPoolService = SessionPoolService.getInstance()

// Export types
export type { 
  SessionAllocation, 
  SessionMetrics, 
  PoolStatus, 
  MetricPoint, 
  UserQuota 
}