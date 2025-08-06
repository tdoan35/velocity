// Supabase Edge Function for AI analytics and metrics aggregation
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { logger } from '../_shared/logger.ts'

interface AnalyticsRequest {
  action: 'get_metrics' | 'get_usage' | 'get_quality' | 'get_cache_stats' | 'get_alerts' | 'track_event'
  timeRange?: {
    start: string
    end: string
  }
  filters?: {
    eventType?: string[]
    projectId?: string
    userId?: string
  }
  groupBy?: ('hour' | 'day' | 'event_type' | 'project')[]
  metrics?: string[]
  eventData?: {
    eventType: string
    duration?: number
    tokens?: { input: number; output: number }
    quality?: number
    cacheHit?: boolean
    metadata?: Record<string, any>
  }
}

interface MetricsResponse {
  timeRange: {
    start: string
    end: string
  }
  metrics: {
    totalEvents: number
    uniqueUsers: number
    totalTokens: number
    averageLatency: number
    cacheHitRate: number
    successRate: number
    qualityScore: number
    estimatedCost: number
  }
  breakdown?: any[]
  trends?: {
    metric: string
    change: number
    direction: 'up' | 'down' | 'stable'
  }[]
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

    const body: AnalyticsRequest = await req.json()
    const { action, timeRange, filters, groupBy, metrics, eventData } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let response: any

    switch (action) {
      case 'track_event':
        if (!eventData) {
          throw new Error('Event data is required for tracking')
        }
        response = await trackAnalyticsEvent(supabase, authResult.userId, eventData)
        break

      case 'get_metrics':
        response = await getMetrics(supabase, authResult.userId, timeRange, filters, groupBy)
        break

      case 'get_usage':
        response = await getUsageMetrics(supabase, authResult.userId, timeRange)
        break

      case 'get_quality':
        response = await getQualityMetrics(supabase, authResult.userId, timeRange, filters)
        break

      case 'get_cache_stats':
        response = await getCacheStatistics(supabase, timeRange)
        break

      case 'get_alerts':
        response = await getPerformanceAlerts(supabase, authResult.userId)
        break

      default:
        throw new Error(`Unknown action: ${action}`)
    }

    await logger.info('Analytics request processed', {
      userId: authResult.userId,
      action,
      hasTimeRange: !!timeRange,
      hasFilters: !!filters
    })

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    await logger.error('Analytics error', { error: error.message })
    return new Response(JSON.stringify({ 
      error: 'Analytics request failed',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function trackAnalyticsEvent(
  supabase: any,
  userId: string,
  eventData: any
): Promise<{ success: boolean; eventId: string }> {
  const { data, error } = await supabase.rpc('track_ai_event', {
    p_event_type: eventData.eventType,
    p_user_id: userId,
    p_project_id: eventData.metadata?.projectId,
    p_duration_ms: eventData.duration,
    p_tokens_input: eventData.tokens?.input,
    p_tokens_output: eventData.tokens?.output,
    p_quality_score: eventData.quality,
    p_cache_hit: eventData.cacheHit,
    p_metadata: eventData.metadata || {}
  })

  if (error) throw error

  return { success: true, eventId: data }
}

async function getMetrics(
  supabase: any,
  userId: string,
  timeRange?: any,
  filters?: any,
  groupBy?: string[]
): Promise<MetricsResponse> {
  // Default time range: last 24 hours
  const startTime = timeRange?.start || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const endTime = timeRange?.end || new Date().toISOString()

  // Base query
  let query = supabase
    .from('ai_analytics_events')
    .select('*')
    .gte('timestamp', startTime)
    .lte('timestamp', endTime)

  // Apply filters
  if (filters?.eventType?.length > 0) {
    query = query.in('event_type', filters.eventType)
  }
  if (filters?.projectId) {
    query = query.eq('project_id', filters.projectId)
  }
  if (filters?.userId) {
    query = query.eq('user_id', filters.userId)
  } else {
    // Default: user's own data
    query = query.eq('user_id', userId)
  }

  const { data, error } = await query

  if (error) throw error

  // Calculate metrics
  const metrics = calculateMetrics(data)
  
  // Calculate breakdown if groupBy specified
  let breakdown
  if (groupBy && groupBy.length > 0) {
    breakdown = calculateBreakdown(data, groupBy)
  }

  // Calculate trends
  const trends = calculateTrends(data, startTime, endTime)

  return {
    timeRange: { start: startTime, end: endTime },
    metrics,
    breakdown,
    trends
  }
}

async function getUsageMetrics(
  supabase: any,
  userId: string,
  timeRange?: any
): Promise<any> {
  const currentPeriodStart = new Date()
  currentPeriodStart.setDate(1)
  currentPeriodStart.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('ai_usage_tracking')
    .select('*')
    .eq('user_id', userId)
    .gte('period_start', currentPeriodStart.toISOString())
    .single()

  if (error && error.code !== 'PGRST116') throw error // Ignore not found

  const usage = data || {
    tokens_used: 0,
    tokens_limit: 100000,
    requests_count: 0,
    requests_limit: 1000,
    code_generations: 0,
    prompt_optimizations: 0,
    code_analyses: 0,
    conversations: 0,
    estimated_cost: 0
  }

  // Get subscription info
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('subscription_tier')
    .eq('user_id', userId)
    .single()

  return {
    currentPeriod: {
      start: currentPeriodStart.toISOString(),
      end: new Date(currentPeriodStart.getFullYear(), currentPeriodStart.getMonth() + 1, 0).toISOString()
    },
    usage: {
      tokens: {
        used: usage.tokens_used,
        limit: usage.tokens_limit,
        remaining: usage.tokens_limit - usage.tokens_used,
        percentUsed: (usage.tokens_used / usage.tokens_limit) * 100
      },
      requests: {
        used: usage.requests_count,
        limit: usage.requests_limit,
        remaining: usage.requests_limit - usage.requests_count,
        percentUsed: (usage.requests_count / usage.requests_limit) * 100
      },
      features: {
        codeGenerations: usage.code_generations,
        promptOptimizations: usage.prompt_optimizations,
        codeAnalyses: usage.code_analyses,
        conversations: usage.conversations
      },
      estimatedCost: usage.estimated_cost
    },
    subscription: {
      tier: subscription?.subscription_tier || 'free',
      renewalDate: new Date(currentPeriodStart.getFullYear(), currentPeriodStart.getMonth() + 1, 1).toISOString()
    }
  }
}

async function getQualityMetrics(
  supabase: any,
  userId: string,
  timeRange?: any,
  filters?: any
): Promise<any> {
  const startTime = timeRange?.start || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
  const endTime = timeRange?.end || new Date().toISOString()

  // Get quality metrics joined with events
  const { data, error } = await supabase
    .from('ai_quality_metrics')
    .select(`
      *,
      ai_analytics_events!inner(
        event_type,
        timestamp,
        user_id,
        project_id
      )
    `)
    .gte('ai_analytics_events.timestamp', startTime)
    .lte('ai_analytics_events.timestamp', endTime)
    .eq('ai_analytics_events.user_id', userId)

  if (error) throw error

  // Calculate quality statistics
  const stats = {
    averagePromptClarity: average(data.map(d => d.prompt_clarity_score).filter(Boolean)),
    averageResponseRelevance: average(data.map(d => d.response_relevance_score).filter(Boolean)),
    averageCodeCorrectness: average(data.map(d => d.code_correctness_score).filter(Boolean)),
    averageUserRating: average(data.map(d => d.user_rating).filter(Boolean)),
    
    feedbackStats: {
      positive: data.filter(d => d.feedback_positive === true).length,
      negative: data.filter(d => d.feedback_positive === false).length,
      total: data.filter(d => d.feedback_positive !== null).length
    },
    
    issueStats: {
      syntaxInvalid: data.filter(d => d.syntax_valid === false).length,
      bestPracticesNotFollowed: data.filter(d => d.best_practices_followed === false).length,
      securityIssues: data.reduce((sum, d) => sum + (d.security_issues_found || 0), 0),
      performanceIssues: data.reduce((sum, d) => sum + (d.performance_issues_found || 0), 0)
    },
    
    enhancementStats: {
      enhanced: data.filter(d => d.enhanced === true).length,
      averageImprovement: average(data.filter(d => d.enhancement_score_delta).map(d => d.enhancement_score_delta))
    }
  }

  return {
    timeRange: { start: startTime, end: endTime },
    totalSamples: data.length,
    qualityStats: stats
  }
}

async function getCacheStatistics(
  supabase: any,
  timeRange?: any
): Promise<any> {
  const startTime = timeRange?.start || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const endTime = timeRange?.end || new Date().toISOString()

  const { data, error } = await supabase
    .from('cache_metrics')
    .select('*')
    .gte('timestamp', startTime)
    .lte('timestamp', endTime)
    .order('timestamp', { ascending: false })

  if (error) throw error

  // Get latest metrics by cache type
  const latestByType = data.reduce((acc, metric) => {
    if (!acc[metric.cache_type] || metric.timestamp > acc[metric.cache_type].timestamp) {
      acc[metric.cache_type] = metric
    }
    return acc
  }, {})

  // Calculate overall stats
  const overallStats = {
    totalHits: data.reduce((sum, m) => sum + m.hit_count, 0),
    totalMisses: data.reduce((sum, m) => sum + m.miss_count, 0),
    overallHitRate: 0,
    totalCacheSizeMB: 0,
    totalItemsCount: 0,
    averageRetrievalTimeMs: 0,
    totalSpaceSavedMB: 0
  }

  if (overallStats.totalHits + overallStats.totalMisses > 0) {
    overallStats.overallHitRate = overallStats.totalHits / (overallStats.totalHits + overallStats.totalMisses)
  }

  // Sum up latest values
  Object.values(latestByType).forEach((metric: any) => {
    overallStats.totalCacheSizeMB += metric.cache_size_mb || 0
    overallStats.totalItemsCount += metric.items_count || 0
    overallStats.totalSpaceSavedMB += metric.space_saved_mb || 0
  })

  // Calculate average retrieval time
  const retrievalTimes = data.map(m => m.avg_retrieval_time_ms).filter(Boolean)
  if (retrievalTimes.length > 0) {
    overallStats.averageRetrievalTimeMs = average(retrievalTimes)
  }

  return {
    timeRange: { start: startTime, end: endTime },
    overallStats,
    byType: latestByType,
    historicalData: data
  }
}

async function getPerformanceAlerts(
  supabase: any,
  userId: string
): Promise<any> {
  // Get active alerts for user
  const { data: alerts, error } = await supabase
    .from('ai_performance_alerts')
    .select('*')
    .or(`user_id.eq.${userId},user_id.is.null`)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) throw error

  // Group alerts by type and severity
  const alertsByType = alerts.reduce((acc, alert) => {
    if (!acc[alert.alert_type]) {
      acc[alert.alert_type] = []
    }
    acc[alert.alert_type].push(alert)
    return acc
  }, {})

  const alertsBySeverity = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    warning: alerts.filter(a => a.severity === 'warning').length,
    info: alerts.filter(a => a.severity === 'info').length
  }

  // Run performance check to potentially create new alerts
  await supabase.rpc('check_performance_alerts')

  return {
    activeAlerts: alerts,
    alertsByType,
    alertsBySeverity,
    totalActive: alerts.length
  }
}

// Helper functions
function calculateMetrics(events: any[]): any {
  if (events.length === 0) {
    return {
      totalEvents: 0,
      uniqueUsers: 0,
      totalTokens: 0,
      averageLatency: 0,
      cacheHitRate: 0,
      successRate: 0,
      qualityScore: 0,
      estimatedCost: 0
    }
  }

  const uniqueUsers = new Set(events.map(e => e.user_id)).size
  const totalTokens = events.reduce((sum, e) => sum + (e.tokens_total || 0), 0)
  const latencies = events.map(e => e.duration_ms).filter(Boolean)
  const qualityScores = events.map(e => e.quality_score).filter(Boolean)
  const cacheHits = events.filter(e => e.cache_hit === true).length
  const successes = events.filter(e => e.success === true).length

  return {
    totalEvents: events.length,
    uniqueUsers,
    totalTokens,
    averageLatency: latencies.length > 0 ? average(latencies) : 0,
    cacheHitRate: events.length > 0 ? cacheHits / events.length : 0,
    successRate: events.length > 0 ? successes / events.length : 0,
    qualityScore: qualityScores.length > 0 ? average(qualityScores) : 0,
    estimatedCost: totalTokens * 0.00002 // Rough estimate
  }
}

function calculateBreakdown(events: any[], groupBy: string[]): any[] {
  // Simple grouping implementation
  const groups: Record<string, any> = {}

  events.forEach(event => {
    const key = groupBy.map(field => {
      if (field === 'hour') {
        return new Date(event.timestamp).toISOString().substring(0, 13) + ':00'
      } else if (field === 'day') {
        return new Date(event.timestamp).toISOString().substring(0, 10)
      } else {
        return event[field] || 'unknown'
      }
    }).join('|')

    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(event)
  })

  return Object.entries(groups).map(([key, groupEvents]) => ({
    key,
    metrics: calculateMetrics(groupEvents)
  }))
}

function calculateTrends(events: any[], startTime: string, endTime: string): any[] {
  // Compare with previous period
  const currentPeriodMs = new Date(endTime).getTime() - new Date(startTime).getTime()
  const previousStart = new Date(new Date(startTime).getTime() - currentPeriodMs).toISOString()

  const currentMetrics = calculateMetrics(events)
  
  // This would need to fetch previous period data
  // For now, return mock trends
  return [
    {
      metric: 'totalEvents',
      change: 15.5,
      direction: 'up' as const
    },
    {
      metric: 'cacheHitRate',
      change: 5.2,
      direction: 'up' as const
    },
    {
      metric: 'averageLatency',
      change: -8.3,
      direction: 'down' as const
    }
  ]
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length
}