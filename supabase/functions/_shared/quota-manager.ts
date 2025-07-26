// Quota management system for subscription-based access control
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { createLogger } from './logger.ts'

interface QuotaCheckResult {
  allowed: boolean
  quotaType: 'tokens' | 'requests'
  limit: number
  used: number
  remaining: number
  percentUsed: number
  tier: string
  willExceed?: boolean
  exceedBy?: number
  periodEnd: string
  suggestion?: string
}

interface UsageUpdate {
  userId: string
  projectId?: string
  usageType: 'code_generation' | 'optimization' | 'analysis' | 'conversation'
  tokens: number
  metadata?: any
}

interface TierLimits {
  tokensPerMonth: number
  tokensPerDay?: number
  requestsPerMonth: number
  requestsPerDay?: number
  maxTokensPerRequest: number
  features: string[]
}

export class QuotaManager {
  private supabase: any
  private logger: any
  private cache: Map<string, { data: any; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 60000 // 1 minute

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    this.logger = createLogger({ context: 'QuotaManager' })
  }

  async checkQuota(
    userId: string,
    requestedTokens: number,
    quotaType: 'tokens' | 'requests' = 'tokens'
  ): Promise<QuotaCheckResult> {
    try {
      // Get user's subscription and tier info
      const { subscription, tier } = await this.getUserSubscription(userId)
      
      // Get current usage
      const usage = await this.getCurrentUsage(userId, quotaType)
      
      // Get limits based on tier
      const limits = this.getTierLimits(tier)
      const limit = quotaType === 'tokens' ? limits.tokensPerMonth : limits.requestsPerMonth
      
      // Check if unlimited
      if (limit === -1) {
        return {
          allowed: true,
          quotaType,
          limit: -1,
          used: usage.current,
          remaining: -1,
          percentUsed: 0,
          tier: tier.id,
          periodEnd: usage.periodEnd
        }
      }

      // Calculate if request would exceed quota
      const wouldExceed = (usage.current + requestedTokens) > limit
      const remaining = Math.max(0, limit - usage.current)
      const percentUsed = (usage.current / limit) * 100

      let suggestion: string | undefined
      if (wouldExceed) {
        suggestion = this.getUpgradeSuggestion(tier.id, quotaType, requestedTokens)
      }

      await this.logger.debug('Quota check', {
        userId,
        tier: tier.id,
        quotaType,
        limit,
        used: usage.current,
        requested: requestedTokens,
        allowed: !wouldExceed
      })

      return {
        allowed: !wouldExceed,
        quotaType,
        limit,
        used: usage.current,
        remaining,
        percentUsed,
        tier: tier.id,
        willExceed: wouldExceed,
        exceedBy: wouldExceed ? (usage.current + requestedTokens - limit) : undefined,
        periodEnd: usage.periodEnd,
        suggestion
      }

    } catch (error) {
      await this.logger.error('Quota check error', { 
        userId, 
        error: error.message 
      })
      
      // Fail open to not block users
      return {
        allowed: true,
        quotaType,
        limit: -1,
        used: 0,
        remaining: -1,
        percentUsed: 0,
        tier: 'free',
        periodEnd: new Date().toISOString()
      }
    }
  }

  async checkFeatureAccess(userId: string, featureKey: string): Promise<boolean> {
    try {
      const cacheKey = `feature:${userId}:${featureKey}`
      const cached = this.getFromCache(cacheKey)
      if (cached !== null) return cached

      const { data, error } = await this.supabase
        .rpc('check_feature_access', {
          p_user_id: userId,
          p_feature_key: featureKey
        })

      if (error) throw error

      const hasAccess = data === true
      this.setCache(cacheKey, hasAccess)

      await this.logger.debug('Feature access check', {
        userId,
        featureKey,
        hasAccess
      })

      return hasAccess

    } catch (error) {
      await this.logger.error('Feature access check error', {
        userId,
        featureKey,
        error: error.message
      })
      return false
    }
  }

  async trackUsage(update: UsageUpdate): Promise<void> {
    try {
      const { userId, projectId, usageType, tokens, metadata } = update

      // Track in database
      await this.supabase.rpc('track_usage', {
        p_user_id: userId,
        p_project_id: projectId || null,
        p_usage_type: usageType,
        p_tokens: tokens,
        p_metadata: metadata || {}
      })

      // Invalidate cache
      this.invalidateUserCache(userId)

      // Check if we need to send alerts
      await this.checkAndSendAlerts(userId)

      await this.logger.info('Usage tracked', {
        userId,
        projectId,
        usageType,
        tokens
      })

    } catch (error) {
      await this.logger.error('Usage tracking error', {
        update,
        error: error.message
      })
      // Don't throw - usage tracking shouldn't break the main flow
    }
  }

  async getRemainingQuota(
    userId: string,
    quotaType: 'tokens' | 'requests' = 'tokens'
  ): Promise<any> {
    try {
      const { data, error } = await this.supabase
        .rpc('get_remaining_quota', {
          p_user_id: userId,
          p_quota_type: quotaType
        })

      if (error) throw error

      return data?.[0] || {
        limit_value: 0,
        used_value: 0,
        remaining_value: 0,
        percent_used: 100
      }

    } catch (error) {
      await this.logger.error('Get remaining quota error', {
        userId,
        quotaType,
        error: error.message
      })
      throw error
    }
  }

  async getUsageStats(userId: string, period?: { start: string; end: string }): Promise<any> {
    try {
      // Get current period usage
      const currentMonth = await this.getCurrentMonthUsage(userId)
      
      // Get historical usage if period specified
      let historical = null
      if (period) {
        historical = await this.getHistoricalUsage(userId, period.start, period.end)
      }

      // Get subscription info
      const { subscription, tier } = await this.getUserSubscription(userId)

      return {
        subscription: {
          tier: tier.id,
          tierName: tier.display_name,
          status: subscription.status
        },
        currentPeriod: {
          start: currentMonth.periodStart,
          end: currentMonth.periodEnd,
          tokens: {
            used: currentMonth.tokensUsed,
            limit: tier.tokens_per_month,
            remaining: tier.tokens_per_month === -1 ? -1 : Math.max(0, tier.tokens_per_month - currentMonth.tokensUsed),
            percentUsed: tier.tokens_per_month === -1 ? 0 : (currentMonth.tokensUsed / tier.tokens_per_month) * 100
          },
          requests: {
            used: currentMonth.totalRequests,
            limit: tier.requests_per_month,
            remaining: tier.requests_per_month === -1 ? -1 : Math.max(0, tier.requests_per_month - currentMonth.totalRequests),
            percentUsed: tier.requests_per_month === -1 ? 0 : (currentMonth.totalRequests / tier.requests_per_month) * 100
          },
          breakdown: {
            codeGeneration: currentMonth.codeGenerationRequests,
            optimization: currentMonth.optimizationRequests,
            analysis: currentMonth.analysisRequests
          }
        },
        historical,
        estimatedCost: this.estimateCost(currentMonth.tokensUsed, tier.id),
        alerts: await this.getActiveAlerts(userId)
      }

    } catch (error) {
      await this.logger.error('Get usage stats error', {
        userId,
        error: error.message
      })
      throw error
    }
  }

  async enforceRequestLimit(
    userId: string,
    requestType: string,
    weight: number = 1
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    try {
      const { subscription, tier } = await this.getUserSubscription(userId)
      
      // Check daily limit
      if (tier.requests_per_day && tier.requests_per_day !== -1) {
        const dailyUsage = await this.getDailyUsage(userId, 'requests')
        if (dailyUsage.current + weight > tier.requests_per_day) {
          const tomorrow = new Date()
          tomorrow.setDate(tomorrow.getDate() + 1)
          tomorrow.setHours(0, 0, 0, 0)
          const retryAfter = Math.ceil((tomorrow.getTime() - Date.now()) / 1000)
          
          return { allowed: false, retryAfter }
        }
      }

      // Check monthly limit
      const monthlyCheck = await this.checkQuota(userId, weight, 'requests')
      if (!monthlyCheck.allowed) {
        const periodEnd = new Date(monthlyCheck.periodEnd)
        const retryAfter = Math.ceil((periodEnd.getTime() - Date.now()) / 1000)
        return { allowed: false, retryAfter }
      }

      return { allowed: true }

    } catch (error) {
      await this.logger.error('Enforce request limit error', {
        userId,
        requestType,
        error: error.message
      })
      // Fail open
      return { allowed: true }
    }
  }

  // Private methods

  private async getUserSubscription(userId: string): Promise<any> {
    const cacheKey = `subscription:${userId}`
    const cached = this.getFromCache(cacheKey)
    if (cached) return cached

    const { data: subscription, error: subError } = await this.supabase
      .from('user_subscriptions')
      .select('*, subscription_tiers(*)')
      .eq('user_id', userId)
      .eq('status', 'active')
      .single()

    if (subError || !subscription) {
      // Default to free tier
      const { data: freeTier } = await this.supabase
        .from('subscription_tiers')
        .select('*')
        .eq('id', 'free')
        .single()

      const result = {
        subscription: { 
          user_id: userId, 
          subscription_tier: 'free', 
          status: 'active' 
        },
        tier: freeTier
      }
      
      this.setCache(cacheKey, result)
      return result
    }

    const result = {
      subscription: subscription,
      tier: subscription.subscription_tiers
    }

    this.setCache(cacheKey, result)
    return result
  }

  private async getCurrentUsage(
    userId: string,
    quotaType: 'tokens' | 'requests'
  ): Promise<{ current: number; periodEnd: string }> {
    const { data, error } = await this.supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .eq('period_type', 'monthly')
      .eq('period_start', new Date().toISOString().substring(0, 7) + '-01')
      .single()

    if (error || !data) {
      const periodEnd = new Date()
      periodEnd.setMonth(periodEnd.getMonth() + 1)
      periodEnd.setDate(0)
      
      return {
        current: 0,
        periodEnd: periodEnd.toISOString()
      }
    }

    return {
      current: quotaType === 'tokens' ? data.tokens_used : data.total_requests,
      periodEnd: data.period_end
    }
  }

  private async getCurrentMonthUsage(userId: string): Promise<any> {
    const { data } = await this.supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .eq('period_type', 'monthly')
      .eq('period_start', new Date().toISOString().substring(0, 7) + '-01')

    const aggregated = {
      periodStart: new Date().toISOString().substring(0, 7) + '-01',
      periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString(),
      tokensUsed: 0,
      totalRequests: 0,
      codeGenerationRequests: 0,
      optimizationRequests: 0,
      analysisRequests: 0
    }

    if (data && data.length > 0) {
      data.forEach(row => {
        aggregated.tokensUsed += row.tokens_used || 0
        aggregated.totalRequests += row.total_requests || 0
        aggregated.codeGenerationRequests += row.code_generation_requests || 0
        aggregated.optimizationRequests += row.optimization_requests || 0
        aggregated.analysisRequests += row.analysis_requests || 0
      })
    }

    return aggregated
  }

  private async getDailyUsage(
    userId: string,
    quotaType: 'tokens' | 'requests'
  ): Promise<{ current: number }> {
    const { data } = await this.supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .eq('period_type', 'daily')
      .eq('period_start', new Date().toISOString().substring(0, 10))

    let total = 0
    if (data && data.length > 0) {
      data.forEach(row => {
        total += quotaType === 'tokens' ? row.tokens_used : row.total_requests
      })
    }

    return { current: total }
  }

  private async getHistoricalUsage(
    userId: string,
    startDate: string,
    endDate: string
  ): Promise<any> {
    const { data } = await this.supabase
      .from('usage_tracking')
      .select('*')
      .eq('user_id', userId)
      .gte('period_start', startDate)
      .lte('period_end', endDate)
      .order('period_start', { ascending: true })

    return data || []
  }

  private async checkAndSendAlerts(userId: string): Promise<void> {
    const { data: alerts } = await this.supabase
      .from('quota_alerts')
      .select('*')
      .eq('user_id', userId)
      .eq('period_start', new Date().toISOString().substring(0, 7) + '-01')
      .eq('notification_sent', false)

    if (alerts && alerts.length > 0) {
      // In production, send notifications via email/push
      alerts.forEach(async alert => {
        await this.logger.info('Quota alert triggered', {
          userId,
          alertType: alert.alert_type,
          usagePercent: alert.usage_percent
        })

        // Mark as sent
        await this.supabase
          .from('quota_alerts')
          .update({ notification_sent: true })
          .eq('id', alert.id)
      })
    }
  }

  private async getActiveAlerts(userId: string): Promise<any[]> {
    const { data } = await this.supabase
      .from('quota_alerts')
      .select('*')
      .eq('user_id', userId)
      .eq('period_start', new Date().toISOString().substring(0, 7) + '-01')
      .eq('acknowledged', false)
      .order('created_at', { ascending: false })

    return data || []
  }

  private getTierLimits(tier: any): TierLimits {
    return {
      tokensPerMonth: tier.tokens_per_month,
      tokensPerDay: tier.tokens_per_day,
      requestsPerMonth: tier.requests_per_month,
      requestsPerDay: tier.requests_per_day,
      maxTokensPerRequest: tier.max_tokens_per_request,
      features: Object.keys(tier.features || {}).filter(key => tier.features[key])
    }
  }

  private getUpgradeSuggestion(
    currentTier: string,
    quotaType: string,
    requestedAmount: number
  ): string {
    const tierOrder = ['free', 'starter', 'pro', 'enterprise']
    const currentIndex = tierOrder.indexOf(currentTier)
    
    if (currentIndex === -1 || currentIndex === tierOrder.length - 1) {
      return 'Contact sales for custom limits'
    }

    const nextTier = tierOrder[currentIndex + 1]
    const verb = quotaType === 'tokens' ? 'generate more code' : 'make more requests'
    
    return `Upgrade to ${nextTier} to ${verb} this month`
  }

  private estimateCost(tokens: number, tier: string): number {
    // Rough cost estimates per million tokens
    const costPerMillion = {
      free: 0,
      starter: 15,
      pro: 12,
      enterprise: 8
    }

    const rate = costPerMillion[tier] || 0
    return (tokens / 1000000) * rate
  }

  private getFromCache(key: string): any {
    const cached = this.cache.get(key)
    if (!cached) return null

    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.cache.delete(key)
      return null
    }

    return cached.data
  }

  private setCache(key: string, data: any): void {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })

    // Limit cache size
    if (this.cache.size > 1000) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
  }

  private invalidateUserCache(userId: string): void {
    const keysToDelete: string[] = []
    
    this.cache.forEach((_, key) => {
      if (key.includes(userId)) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => this.cache.delete(key))
  }
}

// Export singleton instance
export const quotaManager = new QuotaManager()