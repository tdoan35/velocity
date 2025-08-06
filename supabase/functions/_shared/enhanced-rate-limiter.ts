// Enhanced rate limiting with sliding window, burst protection, and tier-based limits
import { createClient } from '@supabase/supabase-js'
import { createLogger } from './logger.ts'

interface RateLimitResult {
  allowed: boolean
  remaining: number
  limit: number
  reset: number // Unix timestamp when limit resets
  retryAfter?: number // Seconds until retry
  tier: string
  burstRemaining?: number
}

interface TierLimits {
  requests: number
  window: number // seconds
  burst?: number // Max burst requests
  tokens?: number // Token limit per window
  concurrent?: number // Max concurrent requests
}

interface RateLimitOptions {
  resource: string
  weight?: number // Request weight (for token-based limiting)
  priority?: 'low' | 'normal' | 'high'
  bypassCache?: boolean
}

export class EnhancedRateLimiter {
  private supabase: any
  private logger: any
  private requestCounts: Map<string, number[]> = new Map() // In-memory sliding window
  private tokenBuckets: Map<string, { tokens: number; lastRefill: number }> = new Map()
  private concurrentRequests: Map<string, Set<string>> = new Map()

  // Tier configuration
  private readonly TIER_LIMITS: Record<string, Record<string, TierLimits>> = {
    'code-generation': {
      free: { requests: 20, window: 3600, burst: 5, tokens: 100000 },
      starter: { requests: 100, window: 3600, burst: 20, tokens: 500000 },
      pro: { requests: 500, window: 3600, burst: 50, tokens: 2000000, concurrent: 10 },
      enterprise: { requests: -1, window: 3600, burst: -1, tokens: -1, concurrent: 50 }
    },
    'optimization': {
      free: { requests: 10, window: 3600, burst: 3, tokens: 50000 },
      starter: { requests: 50, window: 3600, burst: 10, tokens: 250000 },
      pro: { requests: 200, window: 3600, burst: 30, tokens: 1000000, concurrent: 5 },
      enterprise: { requests: -1, window: 3600, burst: -1, tokens: -1, concurrent: 20 }
    },
    'analysis': {
      free: { requests: 30, window: 3600, burst: 5 },
      starter: { requests: 150, window: 3600, burst: 20 },
      pro: { requests: 600, window: 3600, burst: 50 },
      enterprise: { requests: -1, window: 3600, burst: -1 }
    },
    'streaming': {
      free: { requests: 5, window: 3600, concurrent: 1 },
      starter: { requests: 25, window: 3600, concurrent: 3 },
      pro: { requests: 100, window: 3600, concurrent: 10 },
      enterprise: { requests: -1, window: 3600, concurrent: -1 }
    }
  }

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    this.logger = createLogger({ context: 'EnhancedRateLimiter' })

    // Start cleanup task
    this.startCleanupTask()
  }

  async check(userId: string, options: RateLimitOptions): Promise<RateLimitResult> {
    const startTime = Date.now()
    const { resource, weight = 1, priority = 'normal' } = options

    try {
      // Get user tier
      const tier = await this.getUserTier(userId, options.bypassCache)
      const limits = this.getTierLimits(resource, tier)

      // Handle unlimited tier
      if (this.isUnlimited(limits)) {
        return {
          allowed: true,
          remaining: -1,
          limit: -1,
          reset: 0,
          tier
        }
      }

      // Check concurrent requests limit
      if (limits.concurrent) {
        const concurrentCheck = await this.checkConcurrent(userId, resource, limits.concurrent)
        if (!concurrentCheck.allowed) {
          return {
            ...concurrentCheck,
            tier
          }
        }
      }

      // Check sliding window rate limit
      const slidingWindowCheck = await this.checkSlidingWindow(
        userId, 
        resource, 
        limits.requests, 
        limits.window
      )

      // Check burst limit
      if (limits.burst && slidingWindowCheck.allowed) {
        const burstCheck = await this.checkBurst(userId, resource, limits.burst)
        if (!burstCheck.allowed) {
          return {
            ...slidingWindowCheck,
            allowed: false,
            retryAfter: burstCheck.retryAfter,
            burstRemaining: 0,
            tier
          }
        }
        slidingWindowCheck.burstRemaining = burstCheck.remaining
      }

      // Check token bucket if applicable
      if (limits.tokens && slidingWindowCheck.allowed) {
        const tokenCheck = await this.checkTokenBucket(
          userId, 
          resource, 
          weight, 
          limits.tokens, 
          limits.window
        )
        if (!tokenCheck.allowed) {
          return {
            ...slidingWindowCheck,
            allowed: false,
            retryAfter: tokenCheck.retryAfter,
            tier
          }
        }
      }

      // Apply priority boost for high priority requests
      if (priority === 'high' && !slidingWindowCheck.allowed && slidingWindowCheck.remaining === 0) {
        const priorityBoost = await this.applyPriorityBoost(userId, resource, tier)
        if (priorityBoost) {
          slidingWindowCheck.allowed = true
          slidingWindowCheck.remaining = 1
        }
      }

      // Log request if allowed
      if (slidingWindowCheck.allowed) {
        await this.logRequest(userId, resource, weight)
      }

      // Track metrics
      await this.logger.debug('Rate limit check', {
        userId,
        resource,
        tier,
        allowed: slidingWindowCheck.allowed,
        remaining: slidingWindowCheck.remaining,
        checkTime: Date.now() - startTime
      })

      return {
        ...slidingWindowCheck,
        tier
      }

    } catch (error) {
      await this.logger.error('Rate limiting error', { 
        userId, 
        resource, 
        error: error.message 
      })
      
      // Fail open for better user experience
      return {
        allowed: true,
        remaining: -1,
        limit: -1,
        reset: Date.now() + 3600000,
        tier: 'unknown'
      }
    }
  }

  async release(userId: string, resource: string, requestId: string): Promise<void> {
    // Release concurrent request slot
    const key = `${userId}:${resource}`
    const concurrent = this.concurrentRequests.get(key)
    if (concurrent) {
      concurrent.delete(requestId)
    }
  }

  async getUserStats(userId: string): Promise<any> {
    const tier = await this.getUserTier(userId)
    const stats: any = {
      tier,
      resources: {}
    }

    // Get stats for each resource type
    for (const resource of Object.keys(this.TIER_LIMITS)) {
      const limits = this.getTierLimits(resource, tier)
      const slidingWindow = await this.checkSlidingWindow(
        userId, 
        resource, 
        limits.requests, 
        limits.window
      )

      stats.resources[resource] = {
        limit: limits.requests,
        used: limits.requests - slidingWindow.remaining,
        remaining: slidingWindow.remaining,
        reset: slidingWindow.reset,
        window: limits.window
      }

      if (limits.tokens) {
        const tokenBucket = this.getTokenBucket(userId, resource)
        stats.resources[resource].tokens = {
          limit: limits.tokens,
          remaining: tokenBucket.tokens
        }
      }
    }

    return stats
  }

  // Private methods

  private async getUserTier(userId: string, bypassCache = false): Promise<string> {
    // Check cache first
    if (!bypassCache) {
      const cached = await this.getCachedTier(userId)
      if (cached) return cached
    }

    // Get from database
    const { data } = await this.supabase
      .from('user_subscriptions')
      .select('subscription_tier')
      .eq('user_id', userId)
      .single()

    const tier = data?.subscription_tier || 'free'
    
    // Cache tier
    await this.cacheTier(userId, tier)
    
    return tier
  }

  private getTierLimits(resource: string, tier: string): TierLimits {
    const resourceLimits = this.TIER_LIMITS[resource] || this.TIER_LIMITS['code-generation']
    return resourceLimits[tier] || resourceLimits.free
  }

  private isUnlimited(limits: TierLimits): boolean {
    return limits.requests === -1
  }

  private async checkSlidingWindow(
    userId: string, 
    resource: string, 
    limit: number, 
    windowSeconds: number
  ): Promise<Omit<RateLimitResult, 'tier'>> {
    const now = Date.now()
    const windowStart = now - (windowSeconds * 1000)
    const key = `${userId}:${resource}`

    // Get timestamps from memory
    let timestamps = this.requestCounts.get(key) || []
    
    // Filter out old timestamps
    timestamps = timestamps.filter(ts => ts > windowStart)
    
    // Count requests in window
    const count = timestamps.length
    const allowed = count < limit

    // Calculate reset time (when oldest request expires)
    const reset = timestamps.length > 0 
      ? Math.ceil((timestamps[0] + windowSeconds * 1000) / 1000)
      : Math.ceil(now / 1000)

    return {
      allowed,
      remaining: Math.max(0, limit - count),
      limit,
      reset,
      retryAfter: allowed ? undefined : Math.ceil((reset * 1000 - now) / 1000)
    }
  }

  private async checkBurst(
    userId: string, 
    resource: string, 
    burstLimit: number
  ): Promise<{ allowed: boolean; remaining: number; retryAfter?: number }> {
    const now = Date.now()
    const key = `${userId}:${resource}:burst`
    const burstWindow = 60000 // 1 minute burst window
    
    let timestamps = this.requestCounts.get(key) || []
    timestamps = timestamps.filter(ts => ts > now - burstWindow)
    
    const allowed = timestamps.length < burstLimit
    
    return {
      allowed,
      remaining: Math.max(0, burstLimit - timestamps.length),
      retryAfter: allowed ? undefined : 60
    }
  }

  private async checkTokenBucket(
    userId: string,
    resource: string,
    weight: number,
    maxTokens: number,
    refillSeconds: number
  ): Promise<{ allowed: boolean; retryAfter?: number }> {
    const key = `${userId}:${resource}`
    const now = Date.now()
    
    let bucket = this.tokenBuckets.get(key)
    if (!bucket) {
      bucket = { tokens: maxTokens, lastRefill: now }
      this.tokenBuckets.set(key, bucket)
    }

    // Refill tokens
    const timeSinceRefill = now - bucket.lastRefill
    const tokensToAdd = (timeSinceRefill / 1000) * (maxTokens / refillSeconds)
    bucket.tokens = Math.min(maxTokens, bucket.tokens + tokensToAdd)
    bucket.lastRefill = now

    // Check if enough tokens
    const allowed = bucket.tokens >= weight
    if (allowed) {
      bucket.tokens -= weight
    }

    const retryAfter = allowed 
      ? undefined 
      : Math.ceil((weight - bucket.tokens) / (maxTokens / refillSeconds))

    return { allowed, retryAfter }
  }

  private async checkConcurrent(
    userId: string,
    resource: string,
    limit: number
  ): Promise<Omit<RateLimitResult, 'tier'>> {
    const key = `${userId}:${resource}`
    const requestId = crypto.randomUUID()
    
    let concurrent = this.concurrentRequests.get(key)
    if (!concurrent) {
      concurrent = new Set()
      this.concurrentRequests.set(key, concurrent)
    }

    const current = concurrent.size
    const allowed = current < limit

    if (allowed) {
      concurrent.add(requestId)
    }

    return {
      allowed,
      remaining: Math.max(0, limit - current),
      limit,
      reset: 0,
      retryAfter: allowed ? undefined : 5 // Retry in 5 seconds
    }
  }

  private async applyPriorityBoost(
    userId: string,
    resource: string,
    tier: string
  ): Promise<boolean> {
    // Give priority boost once per hour for pro/enterprise users
    if (!['pro', 'enterprise'].includes(tier)) return false

    const key = `${userId}:${resource}:priority`
    const lastBoost = await this.getLastPriorityBoost(key)
    const hourAgo = Date.now() - 3600000

    if (!lastBoost || lastBoost < hourAgo) {
      await this.setLastPriorityBoost(key, Date.now())
      return true
    }

    return false
  }

  private async logRequest(userId: string, resource: string, weight: number): Promise<void> {
    const now = Date.now()
    
    // Update in-memory counts
    const key = `${userId}:${resource}`
    const timestamps = this.requestCounts.get(key) || []
    timestamps.push(now)
    this.requestCounts.set(key, timestamps)

    // Update burst window
    const burstKey = `${userId}:${resource}:burst`
    const burstTimestamps = this.requestCounts.get(burstKey) || []
    burstTimestamps.push(now)
    this.requestCounts.set(burstKey, burstTimestamps)

    // Log to database for analytics (async, don't wait)
    this.supabase.from('rate_limit_logs').insert({
      user_id: userId,
      resource,
      weight,
      timestamp: new Date(now).toISOString()
    }).then(() => {}).catch(err => {
      this.logger.error('Failed to log rate limit', { error: err.message })
    })
  }

  private async getCachedTier(userId: string): Promise<string | null> {
    // Simple in-memory cache for tier lookups
    // In production, use Redis or similar
    return null
  }

  private async cacheTier(userId: string, tier: string): Promise<void> {
    // Cache tier for faster lookups
    // In production, use Redis with TTL
  }

  private getTokenBucket(userId: string, resource: string): { tokens: number; lastRefill: number } {
    const key = `${userId}:${resource}`
    return this.tokenBuckets.get(key) || { tokens: 0, lastRefill: Date.now() }
  }

  private async getLastPriorityBoost(key: string): Promise<number | null> {
    // In production, store in Redis or database
    return null
  }

  private async setLastPriorityBoost(key: string, timestamp: number): Promise<void> {
    // In production, store in Redis or database
  }

  private startCleanupTask(): void {
    // Clean up old timestamps every minute
    setInterval(() => {
      const now = Date.now()
      const maxAge = 3600000 // 1 hour

      // Clean request counts
      this.requestCounts.forEach((timestamps, key) => {
        const filtered = timestamps.filter(ts => ts > now - maxAge)
        if (filtered.length === 0) {
          this.requestCounts.delete(key)
        } else {
          this.requestCounts.set(key, filtered)
        }
      })

      // Clean concurrent requests
      this.concurrentRequests.forEach((requests, key) => {
        if (requests.size === 0) {
          this.concurrentRequests.delete(key)
        }
      })
    }, 60000)
  }
}

// Export singleton instance
export const enhancedRateLimiter = new EnhancedRateLimiter()