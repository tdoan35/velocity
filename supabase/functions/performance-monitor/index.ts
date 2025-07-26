// Supabase Edge Function for performance monitoring dashboard
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'
import { defaultPool } from '../_shared/connection-pool.ts'
import { embeddingBatcher } from '../_shared/embedding-batcher.ts'
import { responseCompressor } from '../_shared/response-compressor.ts'
import { getAdvancedCache } from '../_shared/advanced-cache.ts'
import { enhancedRateLimiter } from '../_shared/enhanced-rate-limiter.ts'

interface PerformanceRequest {
  metric: 'overview' | 'functions' | 'cache' | 'rate_limits' | 'connections' | 'embeddings' | 'compression'
  timeRange?: {
    start: string
    end: string
  }
  functionName?: string
  groupBy?: 'hour' | 'day' | 'function' | 'operation'
}

interface PerformanceResponse {
  metric: string
  timeRange: {
    start: string
    end: string
  }
  data: any
  summary?: any
  recommendations?: string[]
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

    const body: PerformanceRequest = await req.json()
    const { metric, timeRange, functionName, groupBy } = body

    // Default time range: last 24 hours
    const endTime = timeRange?.end || new Date().toISOString()
    const startTime = timeRange?.start || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let response: PerformanceResponse = {
      metric,
      timeRange: { start: startTime, end: endTime },
      data: null
    }

    switch (metric) {
      case 'overview':
        response.data = await getOverviewMetrics(supabase, startTime, endTime)
        response.summary = generateOverviewSummary(response.data)
        response.recommendations = generateOverviewRecommendations(response.data)
        break

      case 'functions':
        response.data = await getFunctionMetrics(supabase, startTime, endTime, functionName, groupBy)
        response.recommendations = generateFunctionRecommendations(response.data)
        break

      case 'cache':
        response.data = await getCacheMetrics(supabase, getAdvancedCache())
        response.recommendations = generateCacheRecommendations(response.data)
        break

      case 'rate_limits':
        response.data = await getRateLimitMetrics(supabase, authResult.userId)
        response.recommendations = generateRateLimitRecommendations(response.data)
        break

      case 'connections':
        response.data = await getConnectionMetrics(supabase, defaultPool)
        response.recommendations = generateConnectionRecommendations(response.data)
        break

      case 'embeddings':
        response.data = embeddingBatcher.getStats()
        response.recommendations = generateEmbeddingRecommendations(response.data)
        break

      case 'compression':
        response.data = responseCompressor.getStats()
        response.recommendations = generateCompressionRecommendations(response.data)
        break

      default:
        throw new Error(`Unknown metric: ${metric}`)
    }

    await logger.info('Performance metrics retrieved', {
      metric,
      timeRange: `${startTime} to ${endTime}`,
      dataPoints: Array.isArray(response.data) ? response.data.length : 1
    })

    // Compress response if large
    const jsonResponse = JSON.stringify(response)
    if (jsonResponse.length > 10240) { // 10KB
      return responseCompressor.createCompressedResponse(
        jsonResponse,
        new Headers({ ...corsHeaders, 'Content-Type': 'application/json' })
      )
    }

    return new Response(jsonResponse, {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    const logger = createLogger({ requestId: crypto.randomUUID() })
    await logger.logError(error as Error, 'Performance monitoring error')
    return new Response(JSON.stringify({ 
      error: 'Performance monitoring failed',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function getOverviewMetrics(
  supabase: any,
  startTime: string,
  endTime: string
): Promise<any> {
  // Get function performance summary
  const { data: functionMetrics } = await supabase
    .from('performance_metrics')
    .select('*')
    .gte('created_at', startTime)
    .lte('created_at', endTime)

  // Get cache statistics
  const { data: cacheStats } = await supabase
    .from('cache_entries')
    .select('size, access_count, created_at')
    .gte('created_at', startTime)

  // Get rate limit logs
  const { data: rateLimitLogs } = await supabase
    .from('rate_limit_logs')
    .select('resource, timestamp')
    .gte('timestamp', startTime)
    .lte('timestamp', endTime)

  // Calculate metrics
  const totalRequests = functionMetrics?.length || 0
  const successfulRequests = functionMetrics?.filter(m => m.success).length || 0
  const avgDuration = functionMetrics?.length > 0
    ? functionMetrics.reduce((sum, m) => sum + m.duration_ms, 0) / functionMetrics.length
    : 0

  const cacheHitRate = cacheStats?.length > 0
    ? cacheStats.filter(c => c.access_count > 0).length / cacheStats.length
    : 0

  const rateLimitHits = rateLimitLogs?.length || 0

  return {
    requests: {
      total: totalRequests,
      successful: successfulRequests,
      failed: totalRequests - successfulRequests,
      successRate: totalRequests > 0 ? successfulRequests / totalRequests : 0
    },
    performance: {
      avgDuration: Math.round(avgDuration),
      p50Duration: calculatePercentile(functionMetrics?.map(m => m.duration_ms) || [], 50),
      p95Duration: calculatePercentile(functionMetrics?.map(m => m.duration_ms) || [], 95),
      p99Duration: calculatePercentile(functionMetrics?.map(m => m.duration_ms) || [], 99)
    },
    cache: {
      entries: cacheStats?.length || 0,
      hitRate: cacheHitRate,
      totalSize: cacheStats?.reduce((sum, c) => sum + c.size, 0) || 0
    },
    rateLimits: {
      totalHits: rateLimitHits,
      byResource: groupBy(rateLimitLogs || [], 'resource')
    }
  }
}

async function getFunctionMetrics(
  supabase: any,
  startTime: string,
  endTime: string,
  functionName?: string,
  groupBy?: string
): Promise<any> {
  let query = supabase
    .from('performance_metrics')
    .select('*')
    .gte('created_at', startTime)
    .lte('created_at', endTime)

  if (functionName) {
    query = query.eq('function_name', functionName)
  }

  const { data: metrics, error } = await query

  if (error) throw error

  if (groupBy === 'function') {
    return groupByFunction(metrics)
  } else if (groupBy === 'operation') {
    return groupByOperation(metrics)
  } else if (groupBy === 'hour' || groupBy === 'day') {
    return groupByTime(metrics, groupBy)
  }

  return metrics
}

async function getCacheMetrics(supabase: any, cache: any): Promise<any> {
  // Get cache statistics from both runtime and database
  const runtimeStats = cache.getStats()
  
  const { data: dbStats } = await supabase
    .rpc('get_cache_statistics')

  return {
    runtime: runtimeStats,
    database: dbStats?.[0] || {},
    combined: {
      totalEntries: runtimeStats.entries + (dbStats?.[0]?.total_entries || 0),
      hitRate: runtimeStats.hitRate,
      memoryUsage: runtimeStats.memoryUsage,
      compressionRatio: runtimeStats.compressionRatio
    }
  }
}

async function getRateLimitMetrics(supabase: any, userId: string): Promise<any> {
  const stats = await enhancedRateLimiter.getUserStats(userId)
  
  // Get historical data
  const { data: history } = await supabase
    .from('rate_limit_logs')
    .select('resource, timestamp')
    .eq('user_id', userId)
    .gte('timestamp', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('timestamp', { ascending: true })

  return {
    current: stats,
    history: groupByHour(history || [], 'timestamp')
  }
}

async function getConnectionMetrics(supabase: any, pool: any): Promise<any> {
  const poolStats = pool.getStats()
  
  // Get historical connection stats
  const { data: history } = await supabase
    .from('connection_pool_stats')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100)

  return {
    current: poolStats,
    history: history || [],
    utilization: poolStats.total > 0 ? poolStats.active / poolStats.total : 0
  }
}

// Helper functions

function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0
  
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.ceil((percentile / 100) * sorted.length) - 1
  return sorted[Math.max(0, index)]
}

function groupBy(items: any[], key: string): Record<string, number> {
  return items.reduce((acc, item) => {
    const value = item[key]
    acc[value] = (acc[value] || 0) + 1
    return acc
  }, {})
}

function groupByFunction(metrics: any[]): any {
  const grouped: Record<string, any> = {}
  
  metrics.forEach(metric => {
    const fn = metric.function_name
    if (!grouped[fn]) {
      grouped[fn] = {
        count: 0,
        totalDuration: 0,
        successful: 0,
        failed: 0,
        operations: new Set()
      }
    }
    
    grouped[fn].count++
    grouped[fn].totalDuration += metric.duration_ms
    if (metric.success) grouped[fn].successful++
    else grouped[fn].failed++
    grouped[fn].operations.add(metric.operation)
  })
  
  // Calculate averages
  Object.keys(grouped).forEach(fn => {
    grouped[fn].avgDuration = grouped[fn].totalDuration / grouped[fn].count
    grouped[fn].successRate = grouped[fn].successful / grouped[fn].count
    grouped[fn].operations = Array.from(grouped[fn].operations)
  })
  
  return grouped
}

function groupByOperation(metrics: any[]): any {
  const grouped: Record<string, any> = {}
  
  metrics.forEach(metric => {
    const op = metric.operation
    if (!grouped[op]) {
      grouped[op] = {
        count: 0,
        totalDuration: 0,
        successful: 0,
        failed: 0
      }
    }
    
    grouped[op].count++
    grouped[op].totalDuration += metric.duration_ms
    if (metric.success) grouped[op].successful++
    else grouped[op].failed++
  })
  
  // Calculate averages
  Object.keys(grouped).forEach(op => {
    grouped[op].avgDuration = grouped[op].totalDuration / grouped[op].count
    grouped[op].successRate = grouped[op].successful / grouped[op].count
  })
  
  return grouped
}

function groupByTime(metrics: any[], interval: 'hour' | 'day'): any[] {
  const grouped: Record<string, any> = {}
  
  metrics.forEach(metric => {
    const date = new Date(metric.created_at)
    const key = interval === 'hour'
      ? `${date.toISOString().substring(0, 13)}:00:00`
      : date.toISOString().substring(0, 10)
    
    if (!grouped[key]) {
      grouped[key] = {
        timestamp: key,
        count: 0,
        totalDuration: 0,
        successful: 0,
        failed: 0
      }
    }
    
    grouped[key].count++
    grouped[key].totalDuration += metric.duration_ms
    if (metric.success) grouped[key].successful++
    else grouped[key].failed++
  })
  
  // Calculate averages and sort by timestamp
  return Object.values(grouped)
    .map(g => ({
      ...g,
      avgDuration: g.totalDuration / g.count,
      successRate: g.successful / g.count
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
}

function groupByHour(items: any[], timestampField: string): any[] {
  const grouped: Record<string, number> = {}
  
  items.forEach(item => {
    const hour = new Date(item[timestampField]).toISOString().substring(0, 13) + ':00:00'
    grouped[hour] = (grouped[hour] || 0) + 1
  })
  
  return Object.entries(grouped)
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour.localeCompare(b.hour))
}

function generateOverviewSummary(data: any): any {
  return {
    health: data.requests.successRate > 0.95 ? 'healthy' : 
            data.requests.successRate > 0.9 ? 'warning' : 'critical',
    performance: data.performance.p95Duration < 1000 ? 'excellent' :
                data.performance.p95Duration < 3000 ? 'good' : 'needs improvement',
    efficiency: data.cache.hitRate > 0.7 ? 'optimal' :
               data.cache.hitRate > 0.5 ? 'moderate' : 'poor'
  }
}

// Recommendation generators

function generateOverviewRecommendations(data: any): string[] {
  const recommendations = []
  
  if (data.requests.successRate < 0.95) {
    recommendations.push('Investigate failed requests to improve reliability')
  }
  
  if (data.performance.p95Duration > 3000) {
    recommendations.push('Optimize slow functions to reduce p95 latency')
  }
  
  if (data.cache.hitRate < 0.7) {
    recommendations.push('Improve cache hit rate by analyzing access patterns')
  }
  
  if (data.rateLimits.totalHits > 100) {
    recommendations.push('Consider upgrading tier or optimizing request patterns')
  }
  
  return recommendations
}

function generateFunctionRecommendations(data: any): string[] {
  const recommendations = []
  
  // Find slow functions
  const slowFunctions = Object.entries(data)
    .filter(([_, stats]: any) => stats.avgDuration > 2000)
    .map(([name]) => name)
  
  if (slowFunctions.length > 0) {
    recommendations.push(`Optimize slow functions: ${slowFunctions.join(', ')}`)
  }
  
  // Find unreliable functions
  const unreliableFunctions = Object.entries(data)
    .filter(([_, stats]: any) => stats.successRate < 0.9)
    .map(([name]) => name)
  
  if (unreliableFunctions.length > 0) {
    recommendations.push(`Improve reliability of: ${unreliableFunctions.join(', ')}`)
  }
  
  return recommendations
}

function generateCacheRecommendations(data: any): string[] {
  const recommendations = []
  
  if (data.combined.hitRate < 0.5) {
    recommendations.push('Low cache hit rate - review caching strategy')
  }
  
  if (data.runtime.evictions > 100) {
    recommendations.push('High eviction rate - consider increasing cache size')
  }
  
  if (data.combined.compressionRatio < 0.5) {
    recommendations.push('Enable compression for better memory efficiency')
  }
  
  return recommendations
}

function generateRateLimitRecommendations(data: any): string[] {
  const recommendations = []
  
  Object.entries(data.current.resources).forEach(([resource, stats]: any) => {
    const usage = (stats.limit - stats.remaining) / stats.limit
    if (usage > 0.8) {
      recommendations.push(`High usage on ${resource} (${(usage * 100).toFixed(0)}%)`)
    }
  })
  
  return recommendations
}

function generateConnectionRecommendations(data: any): string[] {
  const recommendations = []
  
  if (data.utilization > 0.8) {
    recommendations.push('High connection pool utilization - consider increasing pool size')
  }
  
  if (data.current.waiting > 0) {
    recommendations.push('Requests waiting for connections - optimize query performance')
  }
  
  return recommendations
}

function generateEmbeddingRecommendations(data: any): string[] {
  const recommendations = []
  
  if (data.cacheHitRate < 0.7) {
    recommendations.push('Low embedding cache hit rate - consider pre-warming common texts')
  }
  
  if (data.avgBatchSize < 10 && data.totalRequests > 1000) {
    recommendations.push('Small batch sizes - consider increasing batch wait time')
  }
  
  return recommendations
}

function generateCompressionRecommendations(data: any): string[] {
  const recommendations = []
  
  if (data.compressionRate < 0.5) {
    recommendations.push('Low compression usage - review response size thresholds')
  }
  
  if (data.avgCompressionRatio < 0.3) {
    recommendations.push('Poor compression ratios - review content types')
  }
  
  return recommendations
}