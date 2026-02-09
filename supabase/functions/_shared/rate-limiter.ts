// Rate limiting implementation for Edge Functions
import { createClient } from '@supabase/supabase-js'

interface RateLimitResult {
  allowed: boolean
  remaining?: number
  retryAfter?: number
}

class RateLimiter {
  private supabase: any

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
  }

  async check(userId: string, resource: string): Promise<RateLimitResult> {
    try {
      // Get user's subscription tier
      const { data: profile } = await this.supabase
        .from('user_profiles')
        .select('subscription_tier')
        .eq('user_id', userId)
        .single()

      const tier = profile?.subscription_tier || 'free'
      const limits = this.getLimitsForTier(tier, resource)

      // Check current usage
      const windowStart = new Date(Date.now() - limits.windowMs).toISOString()
      const { count } = await this.supabase
        .from('rate_limit_logs')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('resource', resource)
        .gte('created_at', windowStart)

      const usage = count || 0
      const allowed = usage < limits.maxRequests

      if (allowed) {
        // Log the request
        await this.supabase.from('rate_limit_logs').insert({
          user_id: userId,
          resource,
          created_at: new Date().toISOString()
        })
      }

      return {
        allowed,
        remaining: Math.max(0, limits.maxRequests - usage - 1),
        retryAfter: allowed ? undefined : limits.windowMs / 1000
      }
    } catch (error) {
      console.error('Rate limiting error:', error)
      // Fail open - allow request if rate limiting fails
      return { allowed: true }
    }
  }

  private getLimitsForTier(tier: string, resource: string) {
    const limits = {
      'ai-generation': {
        free: { maxRequests: 20, windowMs: 3600000 }, // 20 per hour
        basic: { maxRequests: 100, windowMs: 3600000 }, // 100 per hour
        pro: { maxRequests: 500, windowMs: 3600000 }, // 500 per hour
        enterprise: { maxRequests: 2000, windowMs: 3600000 } // 2000 per hour
      },
      'design-phase': {
        free: { maxRequests: 80, windowMs: 3600000 }, // 80 per hour
        basic: { maxRequests: 200, windowMs: 3600000 }, // 200 per hour
        pro: { maxRequests: 500, windowMs: 3600000 }, // 500 per hour
        enterprise: { maxRequests: 2000, windowMs: 3600000 } // 2000 per hour
      },
      'ai-optimization': {
        free: { maxRequests: 10, windowMs: 3600000 },
        basic: { maxRequests: 50, windowMs: 3600000 },
        pro: { maxRequests: 200, windowMs: 3600000 },
        enterprise: { maxRequests: 1000, windowMs: 3600000 }
      }
    }

    const resourceLimits = limits[resource] || limits['ai-generation']
    return resourceLimits[tier] || resourceLimits.free
  }
}

export const rateLimiter = new RateLimiter()