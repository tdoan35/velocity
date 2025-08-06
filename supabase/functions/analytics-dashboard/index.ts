// Supabase Edge Function for analytics dashboard queries
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'

interface DashboardRequest {
  query: 'overview' | 'performance' | 'quality' | 'usage' | 'costs' | 'trends' | 'insights'
  timeRange?: {
    preset?: 'today' | 'yesterday' | 'week' | 'month' | 'quarter' | 'year'
    custom?: {
      start: string
      end: string
    }
  }
  projectId?: string
  groupBy?: string[]
  metrics?: string[]
  comparison?: boolean // Compare with previous period
}

interface DashboardResponse {
  query: string
  timeRange: {
    start: string
    end: string
    label: string
  }
  data: any
  comparison?: {
    period: {
      start: string
      end: string
    }
    data: any
    changes: any
  }
  insights?: Array<{
    type: string
    title: string
    description: string
    severity: 'info' | 'warning' | 'success'
    metric?: string
    value?: any
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

    const body: DashboardRequest = await req.json()
    const { query, timeRange, projectId, groupBy, metrics, comparison } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Calculate time range
    const { start, end, label } = calculateTimeRange(timeRange)

    let response: DashboardResponse = {
      query,
      timeRange: { start, end, label },
      data: null
    }

    switch (query) {
      case 'overview':
        response.data = await getOverviewMetrics(supabase, authResult.userId, start, end, projectId)
        response.insights = await generateOverviewInsights(response.data)
        break

      case 'performance':
        response.data = await getPerformanceMetrics(supabase, authResult.userId, start, end, projectId, groupBy)
        response.insights = await generatePerformanceInsights(response.data)
        break

      case 'quality':
        response.data = await getQualityMetrics(supabase, authResult.userId, start, end, projectId)
        response.insights = await generateQualityInsights(response.data)
        break

      case 'usage':
        response.data = await getUsageMetrics(supabase, authResult.userId, start, end, projectId, metrics)
        response.insights = await generateUsageInsights(response.data)
        break

      case 'costs':
        response.data = await getCostMetrics(supabase, authResult.userId, start, end, projectId)
        response.insights = await generateCostInsights(response.data)
        break

      case 'trends':
        response.data = await getTrendMetrics(supabase, authResult.userId, start, end, projectId, groupBy || ['day'])
        response.insights = await generateTrendInsights(response.data)
        break

      case 'insights':
        const allData = await getAllMetrics(supabase, authResult.userId, start, end, projectId)
        response.data = allData
        response.insights = await generateComprehensiveInsights(allData)
        break

      default:
        throw new Error(`Unknown query type: ${query}`)
    }

    // Add comparison data if requested
    if (comparison) {
      const comparisonData = await getComparisonData(
        supabase, 
        authResult.userId, 
        start, 
        end, 
        query, 
        projectId
      )
      response.comparison = comparisonData
    }

    await logger.info('Dashboard query processed', {
      userId: authResult.userId,
      query,
      timeRange: label,
      projectId,
      hasComparison: !!comparison
    })

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    const logger = createLogger({ requestId: crypto.randomUUID() })
    await logger.logError(error as Error, 'Dashboard query error')
    return new Response(JSON.stringify({ 
      error: 'Dashboard query failed',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function getOverviewMetrics(
  supabase: any,
  userId: string,
  start: string,
  end: string,
  projectId?: string
): Promise<any> {
  // Get event counts and basic metrics
  let eventsQuery = supabase
    .from('ai_analytics_events')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', start)
    .lte('timestamp', end)

  if (projectId) {
    eventsQuery = eventsQuery.eq('project_id', projectId)
  }

  const { data: events, error } = await eventsQuery
  if (error) throw error

  // Calculate overview metrics
  const totalEvents = events.length
  const uniqueProjects = new Set(events.map(e => e.project_id).filter(Boolean)).size
  const totalTokens = events.reduce((sum, e) => sum + (e.tokens_total || 0), 0)
  const totalDuration = events.reduce((sum, e) => sum + (e.duration_ms || 0), 0)
  const cacheHits = events.filter(e => e.cache_hit).length
  const successes = events.filter(e => e.success).length
  const errors = events.filter(e => !e.success).length

  // Event type breakdown
  const eventTypeBreakdown = events.reduce((acc, e) => {
    acc[e.event_type] = (acc[e.event_type] || 0) + 1
    return acc
  }, {})

  // Calculate averages
  const avgDuration = totalEvents > 0 ? totalDuration / totalEvents : 0
  const avgTokensPerRequest = totalEvents > 0 ? totalTokens / totalEvents : 0
  const cacheHitRate = totalEvents > 0 ? cacheHits / totalEvents : 0
  const successRate = totalEvents > 0 ? successes / totalEvents : 0

  // Get active alerts count
  const { data: alerts } = await supabase
    .from('ai_performance_alerts')
    .select('id')
    .eq('user_id', userId)
    .eq('status', 'active')

  return {
    summary: {
      totalEvents,
      uniqueProjects,
      totalTokens,
      totalDuration,
      activeAlerts: alerts?.length || 0
    },
    rates: {
      successRate,
      cacheHitRate,
      errorRate: 1 - successRate
    },
    averages: {
      duration: Math.round(avgDuration),
      tokensPerRequest: Math.round(avgTokensPerRequest),
      requestsPerHour: totalEvents / ((new Date(end).getTime() - new Date(start).getTime()) / (1000 * 60 * 60))
    },
    breakdown: {
      byEventType: eventTypeBreakdown,
      bySuccess: {
        successful: successes,
        failed: errors
      },
      byCache: {
        hits: cacheHits,
        misses: totalEvents - cacheHits
      }
    }
  }
}

async function getPerformanceMetrics(
  supabase: any,
  userId: string,
  start: string,
  end: string,
  projectId?: string,
  groupBy?: string[]
): Promise<any> {
  // Use materialized view for better performance
  let query = supabase
    .from('ai_metrics_hourly')
    .select('*')
    .gte('hour_bucket', start)
    .lte('hour_bucket', end)

  const { data: hourlyMetrics, error } = await query
  if (error) throw error

  // Get latency percentiles
  let eventsQuery = supabase
    .from('ai_analytics_events')
    .select('duration_ms, event_type, timestamp')
    .eq('user_id', userId)
    .gte('timestamp', start)
    .lte('timestamp', end)
    .order('duration_ms', { ascending: true })

  if (projectId) {
    eventsQuery = eventsQuery.eq('project_id', projectId)
  }

  const { data: latencyData } = await eventsQuery

  const percentiles = calculatePercentiles(latencyData?.map(e => e.duration_ms) || [])

  // Group performance metrics if requested
  let grouped = null
  if (groupBy && groupBy.length > 0 && latencyData) {
    grouped = groupPerformanceMetrics(latencyData, groupBy)
  }

  return {
    latency: {
      percentiles,
      distribution: createLatencyDistribution(latencyData?.map(e => e.duration_ms) || []),
      byEventType: calculateLatencyByType(latencyData || [])
    },
    throughput: {
      requestsPerMinute: calculateThroughput(hourlyMetrics, 'minute'),
      requestsPerHour: calculateThroughput(hourlyMetrics, 'hour'),
      peakHour: findPeakHour(hourlyMetrics)
    },
    reliability: {
      uptime: calculateUptime(hourlyMetrics),
      errorTypes: await getErrorTypes(supabase, userId, start, end),
      recoveryTime: await calculateRecoveryTime(supabase, userId, start, end)
    },
    grouped
  }
}

async function getQualityMetrics(
  supabase: any,
  userId: string,
  start: string,
  end: string,
  projectId?: string
): Promise<any> {
  // Get quality metrics with event data
  let query = supabase
    .from('ai_quality_metrics')
    .select(`
      *,
      ai_analytics_events!inner(
        user_id,
        project_id,
        timestamp,
        event_type
      )
    `)
    .eq('ai_analytics_events.user_id', userId)
    .gte('ai_analytics_events.timestamp', start)
    .lte('ai_analytics_events.timestamp', end)

  if (projectId) {
    query = query.eq('ai_analytics_events.project_id', projectId)
  }

  const { data: qualityData, error } = await query
  if (error) throw error

  // Calculate quality scores
  const scores = {
    promptClarity: average(qualityData.map(d => d.prompt_clarity_score).filter(Boolean)),
    responseRelevance: average(qualityData.map(d => d.response_relevance_score).filter(Boolean)),
    codeCorrectness: average(qualityData.map(d => d.code_correctness_score).filter(Boolean)),
    overall: average(qualityData.map(d => 
      (d.prompt_clarity_score + d.response_relevance_score + d.code_correctness_score) / 3
    ).filter(Boolean))
  }

  // Get feedback statistics
  const feedbackStats = {
    total: qualityData.filter(d => d.feedback_positive !== null).length,
    positive: qualityData.filter(d => d.feedback_positive === true).length,
    negative: qualityData.filter(d => d.feedback_positive === false).length,
    userRatings: qualityData.map(d => d.user_rating).filter(Boolean),
    averageRating: average(qualityData.map(d => d.user_rating).filter(Boolean))
  }

  // Get issue statistics
  const issueStats = {
    syntaxErrors: qualityData.filter(d => d.syntax_valid === false).length,
    bestPracticeViolations: qualityData.filter(d => d.best_practices_followed === false).length,
    securityIssues: qualityData.reduce((sum, d) => sum + (d.security_issues_found || 0), 0),
    performanceIssues: qualityData.reduce((sum, d) => sum + (d.performance_issues_found || 0), 0)
  }

  // Get enhancement statistics
  const enhancementStats = {
    totalEnhanced: qualityData.filter(d => d.enhanced === true).length,
    averageImprovement: average(
      qualityData
        .filter(d => d.enhancement_score_delta)
        .map(d => d.enhancement_score_delta)
    ),
    enhancementRate: qualityData.length > 0 
      ? qualityData.filter(d => d.enhanced === true).length / qualityData.length
      : 0
  }

  return {
    scores,
    feedback: feedbackStats,
    issues: issueStats,
    enhancements: enhancementStats,
    qualityTrend: await calculateQualityTrend(supabase, userId, start, end)
  }
}

async function getUsageMetrics(
  supabase: any,
  userId: string,
  start: string,
  end: string,
  projectId?: string,
  specificMetrics?: string[]
): Promise<any> {
  // Get usage tracking data
  const { data: usageData } = await supabase
    .from('ai_usage_tracking')
    .select('*')
    .eq('user_id', userId)
    .gte('period_start', start)
    .lte('period_end', end)

  // Get detailed event data
  let eventsQuery = supabase
    .from('ai_analytics_events')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', start)
    .lte('timestamp', end)

  if (projectId) {
    eventsQuery = eventsQuery.eq('project_id', projectId)
  }

  const { data: events } = await eventsQuery

  // Calculate feature usage
  const featureUsage = {
    codeGenerations: events?.filter(e => e.event_type === 'code_generation').length || 0,
    promptOptimizations: events?.filter(e => e.event_type === 'prompt_optimization').length || 0,
    codeAnalyses: events?.filter(e => e.event_type === 'code_analysis').length || 0,
    conversations: events?.filter(e => e.event_type === 'conversation').length || 0,
    cacheOperations: events?.filter(e => ['cache_hit', 'cache_miss'].includes(e.event_type)).length || 0
  }

  // Token usage breakdown
  const tokenUsage = {
    total: events?.reduce((sum, e) => sum + (e.tokens_total || 0), 0) || 0,
    input: events?.reduce((sum, e) => sum + (e.tokens_input || 0), 0) || 0,
    output: events?.reduce((sum, e) => sum + (e.tokens_output || 0), 0) || 0,
    byModel: events?.reduce((acc, e) => {
      const model = e.model_version || 'unknown'
      acc[model] = (acc[model] || 0) + (e.tokens_total || 0)
      return acc
    }, {}) || {}
  }

  // Time-based usage patterns
  const usagePatterns = analyzeUsagePatterns(events || [])

  return {
    features: featureUsage,
    tokens: tokenUsage,
    patterns: usagePatterns,
    limits: await getUserLimits(supabase, userId),
    topProjects: await getTopProjects(events || [])
  }
}

async function getCostMetrics(
  supabase: any,
  userId: string,
  start: string,
  end: string,
  projectId?: string
): Promise<any> {
  // Get events for cost calculation
  let eventsQuery = supabase
    .from('ai_analytics_events')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', start)
    .lte('timestamp', end)

  if (projectId) {
    eventsQuery = eventsQuery.eq('project_id', projectId)
  }

  const { data: events } = await eventsQuery

  // Get user subscription for pricing
  const { data: subscription } = await supabase
    .from('user_subscriptions')
    .select('subscription_tier')
    .eq('user_id', userId)
    .single()

  const tier = subscription?.subscription_tier || 'free'

  // Calculate costs
  const costs = calculateDetailedCosts(events || [], tier)

  // Cost breakdown by various dimensions
  const breakdown = {
    byEventType: calculateCostByType(events || [], tier),
    byProject: projectId ? null : calculateCostByProject(events || [], tier),
    byModel: calculateCostByModel(events || [], tier),
    byDay: calculateDailyCosts(events || [], tier)
  }

  // Cost projections
  const projections = calculateCostProjections(costs, start, end)

  return {
    current: costs,
    breakdown,
    projections,
    optimization: generateCostOptimizationSuggestions(costs, breakdown, tier)
  }
}

async function getTrendMetrics(
  supabase: any,
  userId: string,
  start: string,
  end: string,
  projectId?: string,
  groupBy: string[]
): Promise<any> {
  // Get events for trend analysis
  let eventsQuery = supabase
    .from('ai_analytics_events')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', start)
    .lte('timestamp', end)
    .order('timestamp', { ascending: true })

  if (projectId) {
    eventsQuery = eventsQuery.eq('project_id', projectId)
  }

  const { data: events } = await eventsQuery

  // Calculate trends
  const trends = {
    usage: calculateUsageTrends(events || [], groupBy),
    performance: calculatePerformanceTrends(events || [], groupBy),
    quality: await calculateQualityTrends(supabase, userId, start, end, groupBy),
    cost: calculateCostTrends(events || [], groupBy)
  }

  // Identify significant changes
  const significantChanges = identifySignificantChanges(trends)

  // Generate forecasts
  const forecasts = generateForecasts(trends)

  return {
    trends,
    significantChanges,
    forecasts,
    seasonality: analyzeSeasonality(events || [])
  }
}

// Helper functions
function calculateTimeRange(timeRange?: any): { start: string; end: string; label: string } {
  const now = new Date()
  let start: Date
  let end: Date = now
  let label: string

  if (timeRange?.custom) {
    return {
      start: timeRange.custom.start,
      end: timeRange.custom.end,
      label: 'Custom Range'
    }
  }

  switch (timeRange?.preset || 'today') {
    case 'today':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      label = 'Today'
      break
    case 'yesterday':
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      label = 'Yesterday'
      break
    case 'week':
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      label = 'Last 7 Days'
      break
    case 'month':
      start = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate())
      label = 'Last 30 Days'
      break
    case 'quarter':
      start = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate())
      label = 'Last Quarter'
      break
    case 'year':
      start = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate())
      label = 'Last Year'
      break
    default:
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      label = 'Today'
  }

  return {
    start: start.toISOString(),
    end: end.toISOString(),
    label
  }
}

function average(numbers: number[]): number {
  if (numbers.length === 0) return 0
  return numbers.reduce((sum, n) => sum + n, 0) / numbers.length
}

function calculatePercentiles(values: number[]): any {
  if (values.length === 0) {
    return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 }
  }

  const sorted = [...values].sort((a, b) => a - b)
  const percentile = (p: number) => {
    const index = Math.ceil((p / 100) * sorted.length) - 1
    return sorted[Math.max(0, index)]
  }

  return {
    p50: percentile(50),
    p75: percentile(75),
    p90: percentile(90),
    p95: percentile(95),
    p99: percentile(99)
  }
}

async function generateOverviewInsights(data: any): Promise<any[]> {
  const insights = []

  // Success rate insight
  if (data.rates.successRate < 0.95) {
    insights.push({
      type: 'reliability',
      title: 'Success Rate Below Target',
      description: `Current success rate is ${(data.rates.successRate * 100).toFixed(1)}%. Consider investigating failed requests.`,
      severity: data.rates.successRate < 0.9 ? 'warning' : 'info',
      metric: 'successRate',
      value: data.rates.successRate
    })
  }

  // Cache performance insight
  if (data.rates.cacheHitRate < 0.3) {
    insights.push({
      type: 'performance',
      title: 'Low Cache Hit Rate',
      description: `Cache hit rate is only ${(data.rates.cacheHitRate * 100).toFixed(1)}%. Improving caching could reduce costs and latency.`,
      severity: 'info',
      metric: 'cacheHitRate',
      value: data.rates.cacheHitRate
    })
  }

  // High activity insight
  if (data.averages.requestsPerHour > 100) {
    insights.push({
      type: 'usage',
      title: 'High Activity Level',
      description: `Processing ${Math.round(data.averages.requestsPerHour)} requests per hour. Ensure your limits can handle this load.`,
      severity: 'info',
      metric: 'requestsPerHour',
      value: data.averages.requestsPerHour
    })
  }

  return insights
}

async function generateComprehensiveInsights(allData: any): Promise<any[]> {
  const insights = []

  // Analyze all metrics for comprehensive insights
  // Performance insights
  if (allData.performance?.latency?.percentiles?.p95 > 5000) {
    insights.push({
      type: 'performance',
      title: 'High Latency Detected',
      description: `95th percentile latency is ${allData.performance.latency.percentiles.p95}ms. Consider optimizing slow operations.`,
      severity: 'warning',
      metric: 'p95Latency',
      value: allData.performance.latency.percentiles.p95
    })
  }

  // Quality insights
  if (allData.quality?.scores?.overall < 0.8) {
    insights.push({
      type: 'quality',
      title: 'Quality Score Below Target',
      description: `Overall quality score is ${(allData.quality.scores.overall * 100).toFixed(1)}%. Focus on improving code generation quality.`,
      severity: 'warning',
      metric: 'qualityScore',
      value: allData.quality.scores.overall
    })
  }

  // Cost insights
  if (allData.costs?.projections?.monthlyEstimate > 100) {
    insights.push({
      type: 'cost',
      title: 'High Projected Costs',
      description: `Monthly costs projected at $${allData.costs.projections.monthlyEstimate.toFixed(2)}. Review optimization suggestions.`,
      severity: 'info',
      metric: 'projectedCost',
      value: allData.costs.projections.monthlyEstimate
    })
  }

  // Usage pattern insights
  if (allData.usage?.patterns?.peakHour) {
    insights.push({
      type: 'usage',
      title: 'Peak Usage Pattern',
      description: `Most activity occurs at ${allData.usage.patterns.peakHour}. Consider scheduling heavy tasks during off-peak hours.`,
      severity: 'info',
      metric: 'peakHour',
      value: allData.usage.patterns.peakHour
    })
  }

  return insights
}

// Additional helper functions would continue here...
// Including all the calculate* functions, generate* functions, etc.