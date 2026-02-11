import { getSupabase } from '../services/supabase.js'

interface RateLimitResult {
  allowed: boolean
  remaining?: number
  retryAfter?: number
}

type TierLimits = Record<string, { maxRequests: number; windowMs: number }>

const LIMITS: Record<string, TierLimits> = {
  'ai-generation': {
    free: { maxRequests: 20, windowMs: 3_600_000 },
    basic: { maxRequests: 100, windowMs: 3_600_000 },
    pro: { maxRequests: 500, windowMs: 3_600_000 },
    enterprise: { maxRequests: 2_000, windowMs: 3_600_000 },
  },
  'design-phase': {
    free: { maxRequests: 80, windowMs: 3_600_000 },
    basic: { maxRequests: 200, windowMs: 3_600_000 },
    pro: { maxRequests: 500, windowMs: 3_600_000 },
    enterprise: { maxRequests: 2_000, windowMs: 3_600_000 },
  },
  'ai-optimization': {
    free: { maxRequests: 10, windowMs: 3_600_000 },
    basic: { maxRequests: 50, windowMs: 3_600_000 },
    pro: { maxRequests: 200, windowMs: 3_600_000 },
    enterprise: { maxRequests: 1_000, windowMs: 3_600_000 },
  },
  'builder-generation': {
    free: { maxRequests: 5, windowMs: 3_600_000 },
    basic: { maxRequests: 20, windowMs: 3_600_000 },
    pro: { maxRequests: 100, windowMs: 3_600_000 },
    enterprise: { maxRequests: 500, windowMs: 3_600_000 },
  },
}

function getLimitsForTier(tier: string, resource: string) {
  const resourceLimits = LIMITS[resource] || LIMITS['ai-generation']!
  return resourceLimits[tier] || resourceLimits['free']!
}

export async function checkRateLimit(userId: string, resource: string): Promise<RateLimitResult> {
  try {
    const supabase = getSupabase()

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('subscription_tier')
      .eq('user_id', userId)
      .single()

    const tier = (profile as { subscription_tier?: string } | null)?.subscription_tier || 'free'
    const limits = getLimitsForTier(tier, resource)

    const windowStart = new Date(Date.now() - limits.windowMs).toISOString()
    const { count } = await supabase
      .from('rate_limit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('resource', resource)
      .gte('created_at', windowStart)

    const usage = count || 0
    const allowed = usage < limits.maxRequests

    if (allowed) {
      await supabase.from('rate_limit_logs').insert({
        user_id: userId,
        resource,
        created_at: new Date().toISOString(),
      })
    }

    return {
      allowed,
      remaining: Math.max(0, limits.maxRequests - usage - 1),
      retryAfter: allowed ? undefined : limits.windowMs / 1000,
    }
  } catch (error) {
    console.error('Rate limiting error:', error)
    return { allowed: true }
  }
}
