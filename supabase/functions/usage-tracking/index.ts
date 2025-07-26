// Supabase Edge Function for usage tracking and billing metrics
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'

interface UsageTrackingRequest {
  action: 'get_usage' | 'get_limits' | 'check_quota' | 'get_billing' | 'get_history'
  projectId?: string
  period?: {
    start: string
    end: string
  }
  granularity?: 'hourly' | 'daily' | 'monthly'
}

interface UsageResponse {
  period: {
    start: string
    end: string
    billingCycle?: string
  }
  usage: {
    tokens: {
      used: number
      limit: number
      remaining: number
      percentUsed: number
      breakdown?: {
        input: number
        output: number
        byModel?: Record<string, number>
      }
    }
    requests: {
      used: number
      limit: number
      remaining: number
      percentUsed: number
      breakdown?: {
        byType?: Record<string, number>
        byProject?: Record<string, number>
      }
    }
    features: {
      codeGenerations: number
      promptOptimizations: number
      codeAnalyses: number
      conversations: number
      enhancements: number
    }
    storage?: {
      cacheSize: number
      projectFiles: number
      totalSizeMB: number
    }
  }
  billing?: {
    currentCost: number
    estimatedMonthly: number
    costBreakdown?: {
      tokens: number
      requests: number
      storage: number
      features: number
    }
    nextBillingDate: string
    paymentMethod?: string
  }
  subscription: {
    tier: string
    status: 'active' | 'trial' | 'suspended' | 'cancelled'
    features: string[]
    upgradeOptions?: Array<{
      tier: string
      price: number
      limits: any
    }>
  }
  alerts?: Array<{
    type: string
    message: string
    severity: string
    threshold: number
    current: number
  }>
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authResult = await requireAuth(req)
    if (!authResult.authorized) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const logger = createLogger({ 
      userId: authResult.userId,
      requestId: crypto.randomUUID()
    })

    const body: UsageTrackingRequest = await req.json()
    const { action, projectId, period, granularity = 'daily' } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let response: any

    switch (action) {
      case 'get_usage':
        response = await getCurrentUsage(supabase, authResult.userId, projectId, period)
        break

      case 'get_limits':
        response = await getUsageLimits(supabase, authResult.userId)
        break

      case 'check_quota':
        response = await checkQuota(supabase, authResult.userId, projectId)
        break

      case 'get_billing':
        response = await getBillingInfo(supabase, authResult.userId, period)
        break

      case 'get_history':
        response = await getUsageHistory(supabase, authResult.userId, projectId, period, granularity)
        break

      default:
        throw new Error(`Unknown action: ${action}`)
    }

    await logger.info('Usage tracking request processed', {
      userId: authResult.userId,
      action,
      projectId,
      hasPeriod: !!period
    })

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    const logger = createLogger({ requestId: crypto.randomUUID() })
    await logger.logError(error as Error, 'Usage tracking error')
    return new Response(JSON.stringify({ 
      error: 'Usage tracking request failed',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function getCurrentUsage(
  supabase: any,
  userId: string,
  projectId?: string,
  customPeriod?: any
): Promise<UsageResponse> {
  // Determine period
  const now = new Date()
  const periodStart = customPeriod?.start 
    ? new Date(customPeriod.start)
    : new Date(now.getFullYear(), now.getMonth(), 1)
  const periodEnd = customPeriod?.end
    ? new Date(customPeriod.end)
    : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  // Get current usage from tracking table
  const { data: usageData, error: usageError } = await supabase
    .from('ai_usage_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('period_start', periodStart.toISOString().split('T')[0])
    .single()

  if (usageError && usageError.code !== 'PGRST116') throw usageError

  // Get detailed usage from events
  let eventsQuery = supabase
    .from('ai_analytics_events')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', periodStart.toISOString())
    .lte('timestamp', periodEnd.toISOString())

  if (projectId) {
    eventsQuery = eventsQuery.eq('project_id', projectId)
  }

  const { data: events, error: eventsError } = await eventsQuery
  if (eventsError) throw eventsError

  // Get subscription info
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single()

  // Get limits based on subscription tier
  const limits = getSubscriptionLimits(subscription?.subscription_tier || 'free')

  // Calculate detailed usage
  const tokenBreakdown = calculateTokenBreakdown(events)
  const requestBreakdown = calculateRequestBreakdown(events)
  const featureUsage = calculateFeatureUsage(events)

  // Check for quota alerts
  const alerts = checkUsageAlerts(usageData, limits)

  return {
    period: {
      start: periodStart.toISOString(),
      end: periodEnd.toISOString(),
      billingCycle: `${periodStart.toLocaleDateString()} - ${periodEnd.toLocaleDateString()}`
    },
    usage: {
      tokens: {
        used: usageData?.tokens_used || tokenBreakdown.total,
        limit: limits.tokens,
        remaining: limits.tokens - (usageData?.tokens_used || tokenBreakdown.total),
        percentUsed: ((usageData?.tokens_used || tokenBreakdown.total) / limits.tokens) * 100,
        breakdown: tokenBreakdown
      },
      requests: {
        used: usageData?.requests_count || events.length,
        limit: limits.requests,
        remaining: limits.requests - (usageData?.requests_count || events.length),
        percentUsed: ((usageData?.requests_count || events.length) / limits.requests) * 100,
        breakdown: requestBreakdown
      },
      features: featureUsage
    },
    subscription: {
      tier: subscription?.subscription_tier || 'free',
      status: subscription?.status || 'active',
      features: limits.features
    },
    alerts
  }
}

async function getUsageLimits(
  supabase: any,
  userId: string
): Promise<any> {
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single()

  const tier = subscription?.subscription_tier || 'free'
  const limits = getSubscriptionLimits(tier)

  return {
    tier,
    limits,
    features: {
      available: limits.features,
      customModels: tier !== 'free',
      prioritySupport: ['pro', 'enterprise'].includes(tier),
      teamCollaboration: ['pro', 'enterprise'].includes(tier),
      advancedAnalytics: ['pro', 'enterprise'].includes(tier),
      apiAccess: tier !== 'free'
    },
    upgradePath: getUpgradePath(tier)
  }
}

async function checkQuota(
  supabase: any,
  userId: string,
  projectId?: string
): Promise<any> {
  const usage = await getCurrentUsage(supabase, userId, projectId)
  
  const quotaStatus = {
    tokens: {
      available: usage.usage.tokens.remaining > 0,
      percentRemaining: (usage.usage.tokens.remaining / usage.usage.tokens.limit) * 100,
      estimatedDaysRemaining: calculateEstimatedDaysRemaining(usage.usage.tokens)
    },
    requests: {
      available: usage.usage.requests.remaining > 0,
      percentRemaining: (usage.usage.requests.remaining / usage.usage.requests.limit) * 100,
      estimatedDaysRemaining: calculateEstimatedDaysRemaining(usage.usage.requests)
    },
    recommendations: [] as string[]
  }

  // Add recommendations
  if (quotaStatus.tokens.percentRemaining < 20) {
    quotaStatus.recommendations.push('Consider upgrading your plan for more tokens')
  }
  if (quotaStatus.requests.percentRemaining < 20) {
    quotaStatus.recommendations.push('You\'re approaching your request limit')
  }

  return quotaStatus
}

async function getBillingInfo(
  supabase: any,
  userId: string,
  period?: any
): Promise<any> {
  const usage = await getCurrentUsage(supabase, userId, undefined, period)
  
  // Calculate costs based on usage
  const tokenCost = calculateTokenCost(usage.usage.tokens.used, usage.subscription.tier)
  const requestCost = calculateRequestCost(usage.usage.requests.used, usage.subscription.tier)
  const storageCost = 0 // TODO: Implement storage cost calculation
  
  const totalCost = tokenCost + requestCost + storageCost
  
  // Estimate monthly cost based on current usage rate
  const daysInPeriod = Math.ceil(
    (new Date(usage.period.end).getTime() - new Date(usage.period.start).getTime()) / (1000 * 60 * 60 * 24)
  )
  const daysElapsed = Math.ceil(
    (new Date().getTime() - new Date(usage.period.start).getTime()) / (1000 * 60 * 60 * 24)
  )
  const dailyRate = totalCost / daysElapsed
  const estimatedMonthly = dailyRate * daysInPeriod

  return {
    ...usage,
    billing: {
      currentCost: totalCost,
      estimatedMonthly,
      costBreakdown: {
        tokens: tokenCost,
        requests: requestCost,
        storage: storageCost,
        features: 0
      },
      nextBillingDate: new Date(usage.period.end).toISOString(),
      currency: 'USD'
    }
  }
}

async function getUsageHistory(
  supabase: any,
  userId: string,
  projectId?: string,
  period?: any,
  granularity: string = 'daily'
): Promise<any> {
  const endDate = period?.end ? new Date(period.end) : new Date()
  const startDate = period?.start 
    ? new Date(period.start)
    : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000) // 30 days ago

  let query = supabase
    .from('ai_analytics_events')
    .select('timestamp, tokens_total, event_type')
    .eq('user_id', userId)
    .gte('timestamp', startDate.toISOString())
    .lte('timestamp', endDate.toISOString())
    .order('timestamp', { ascending: true })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data: events, error } = await query
  if (error) throw error

  // Aggregate by granularity
  const aggregated = aggregateByGranularity(events, granularity)

  return {
    period: {
      start: startDate.toISOString(),
      end: endDate.toISOString()
    },
    granularity,
    history: aggregated,
    summary: {
      totalTokens: events.reduce((sum, e) => sum + (e.tokens_total || 0), 0),
      totalRequests: events.length,
      averageTokensPerRequest: events.length > 0 
        ? events.reduce((sum, e) => sum + (e.tokens_total || 0), 0) / events.length
        : 0
    }
  }
}

// Helper functions
function getSubscriptionLimits(tier: string): any {
  const limits = {
    free: {
      tokens: 100000,
      requests: 1000,
      storage: 100, // MB
      features: ['basic_generation', 'basic_analysis']
    },
    starter: {
      tokens: 500000,
      requests: 5000,
      storage: 500,
      features: ['basic_generation', 'basic_analysis', 'prompt_optimization', 'code_enhancement']
    },
    pro: {
      tokens: 2000000,
      requests: 20000,
      storage: 2000,
      features: ['all']
    },
    enterprise: {
      tokens: -1, // Unlimited
      requests: -1,
      storage: -1,
      features: ['all']
    }
  }

  return limits[tier] || limits.free
}

function calculateTokenBreakdown(events: any[]): any {
  return {
    total: events.reduce((sum, e) => sum + (e.tokens_total || 0), 0),
    input: events.reduce((sum, e) => sum + (e.tokens_input || 0), 0),
    output: events.reduce((sum, e) => sum + (e.tokens_output || 0), 0),
    byModel: events.reduce((acc, e) => {
      const model = e.model_version || 'unknown'
      acc[model] = (acc[model] || 0) + (e.tokens_total || 0)
      return acc
    }, {})
  }
}

function calculateRequestBreakdown(events: any[]): any {
  return {
    byType: events.reduce((acc, e) => {
      acc[e.event_type] = (acc[e.event_type] || 0) + 1
      return acc
    }, {}),
    byProject: events.reduce((acc, e) => {
      if (e.project_id) {
        acc[e.project_id] = (acc[e.project_id] || 0) + 1
      }
      return acc
    }, {})
  }
}

function calculateFeatureUsage(events: any[]): any {
  const features = {
    codeGenerations: 0,
    promptOptimizations: 0,
    codeAnalyses: 0,
    conversations: 0,
    enhancements: 0
  }

  events.forEach(e => {
    switch (e.event_type) {
      case 'code_generation':
        features.codeGenerations++
        break
      case 'prompt_optimization':
        features.promptOptimizations++
        break
      case 'code_analysis':
        features.codeAnalyses++
        break
      case 'conversation':
        features.conversations++
        break
      case 'code_enhancement':
        features.enhancements++
        break
    }
  })

  return features
}

function checkUsageAlerts(usage: any, limits: any): any[] {
  const alerts = []

  if (usage) {
    const tokenPercent = (usage.tokens_used / limits.tokens) * 100
    const requestPercent = (usage.requests_count / limits.requests) * 100

    if (tokenPercent > 90) {
      alerts.push({
        type: 'quota_warning',
        message: 'Token usage above 90%',
        severity: 'critical',
        threshold: 90,
        current: tokenPercent
      })
    } else if (tokenPercent > 75) {
      alerts.push({
        type: 'quota_warning',
        message: 'Token usage above 75%',
        severity: 'warning',
        threshold: 75,
        current: tokenPercent
      })
    }

    if (requestPercent > 90) {
      alerts.push({
        type: 'quota_warning',
        message: 'Request count above 90%',
        severity: 'critical',
        threshold: 90,
        current: requestPercent
      })
    }
  }

  return alerts
}

function calculateEstimatedDaysRemaining(usage: any): number {
  if (usage.remaining <= 0) return 0
  
  const dailyRate = usage.used / 30 // Assume 30 days in period
  if (dailyRate === 0) return -1 // Infinite

  return Math.floor(usage.remaining / dailyRate)
}

function calculateTokenCost(tokens: number, tier: string): number {
  const rates = {
    free: 0,
    starter: 0.00002,
    pro: 0.000015,
    enterprise: 0.00001
  }

  return tokens * (rates[tier] || rates.free)
}

function calculateRequestCost(requests: number, tier: string): number {
  const rates = {
    free: 0,
    starter: 0.001,
    pro: 0.0005,
    enterprise: 0.0001
  }

  return requests * (rates[tier] || rates.free)
}

function getUpgradePath(currentTier: string): any[] {
  const tiers = ['free', 'starter', 'pro', 'enterprise']
  const currentIndex = tiers.indexOf(currentTier)
  
  return tiers.slice(currentIndex + 1).map(tier => ({
    tier,
    benefits: getUpgradeBenefits(currentTier, tier),
    pricing: getTierPricing(tier)
  }))
}

function getUpgradeBenefits(from: string, to: string): string[] {
  const benefits = {
    starter: ['5x more tokens', '5x more requests', 'Prompt optimization', 'Code enhancement'],
    pro: ['20x more tokens', '20x more requests', 'Team collaboration', 'Advanced analytics', 'Priority support'],
    enterprise: ['Unlimited usage', 'Dedicated support', 'Custom models', 'SLA guarantees']
  }

  return benefits[to] || []
}

function getTierPricing(tier: string): any {
  const pricing = {
    free: { monthly: 0, annual: 0 },
    starter: { monthly: 29, annual: 290 },
    pro: { monthly: 99, annual: 990 },
    enterprise: { monthly: 'Contact sales', annual: 'Contact sales' }
  }

  return pricing[tier] || pricing.free
}

function aggregateByGranularity(events: any[], granularity: string): any[] {
  const buckets: Record<string, any> = {}

  events.forEach(event => {
    const date = new Date(event.timestamp)
    let key: string

    switch (granularity) {
      case 'hourly':
        key = `${date.toISOString().substring(0, 13)}:00:00`
        break
      case 'daily':
        key = date.toISOString().substring(0, 10)
        break
      case 'monthly':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
        break
      default:
        key = date.toISOString().substring(0, 10)
    }

    if (!buckets[key]) {
      buckets[key] = {
        period: key,
        tokens: 0,
        requests: 0,
        byType: {}
      }
    }

    buckets[key].tokens += event.tokens_total || 0
    buckets[key].requests++
    
    if (!buckets[key].byType[event.event_type]) {
      buckets[key].byType[event.event_type] = 0
    }
    buckets[key].byType[event.event_type]++
  })

  return Object.values(buckets).sort((a, b) => a.period.localeCompare(b.period))
}