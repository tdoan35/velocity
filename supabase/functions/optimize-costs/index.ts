import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { corsHeaders } from '../_shared/cors.ts'

interface OptimizationRequest {
  action: 'analyze' | 'apply' | 'forecast'
  timeRange?: '24h' | '7d' | '30d'
  targetSavings?: number // Percentage
}

interface OptimizationStrategy {
  id: string
  name: string
  description: string
  estimatedSavings: number
  risk: 'low' | 'medium' | 'high'
  implemented: boolean
}

interface CostAnalysis {
  currentCost: {
    daily: number
    weekly: number
    monthly: number
  }
  optimizedCost: {
    daily: number
    weekly: number
    monthly: number
  }
  savingsPercentage: number
  strategies: OptimizationStrategy[]
}

// Initialize Supabase client
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const supabase = createClient(supabaseUrl, supabaseServiceKey)

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const request: OptimizationRequest = await req.json()

    switch (request.action) {
      case 'analyze':
        return await handleCostAnalysis(request)
      
      case 'apply':
        return await handleApplyOptimizations(request)
      
      case 'forecast':
        return await handleCostForecast(request)
      
      default:
        throw new Error(`Unknown action: ${request.action}`)
    }

  } catch (error) {
    console.error('Cost optimization error:', error)
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Cost optimization failed' 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

async function handleCostAnalysis(request: OptimizationRequest): Promise<Response> {
  const { timeRange = '7d' } = request

  // Get historical cost data
  const startDate = new Date()
  switch (timeRange) {
    case '24h':
      startDate.setDate(startDate.getDate() - 1)
      break
    case '7d':
      startDate.setDate(startDate.getDate() - 7)
      break
    case '30d':
      startDate.setDate(startDate.getDate() - 30)
      break
  }

  // Get session costs
  const { data: costs } = await supabase
    .from('session_costs')
    .select('*')
    .gte('period_start', startDate.toISOString())

  // Get session metrics
  const { data: metrics } = await supabase
    .from('session_metrics')
    .select('*')
    .gte('timestamp', startDate.toISOString())

  // Calculate current costs
  const totalCost = costs?.reduce((acc, c) => acc + c.cost_usd, 0) || 0
  const daysInRange = timeRange === '24h' ? 1 : timeRange === '7d' ? 7 : 30
  const dailyAverage = totalCost / daysInRange

  const currentCost = {
    daily: dailyAverage,
    weekly: dailyAverage * 7,
    monthly: dailyAverage * 30
  }

  // Analyze optimization opportunities
  const strategies = await analyzeOptimizationStrategies(metrics || [], costs || [])

  // Calculate potential savings
  const totalSavingsPercentage = strategies.reduce((acc, s) => acc + s.estimatedSavings, 0)
  const optimizationFactor = 1 - (totalSavingsPercentage / 100)

  const optimizedCost = {
    daily: currentCost.daily * optimizationFactor,
    weekly: currentCost.weekly * optimizationFactor,
    monthly: currentCost.monthly * optimizationFactor
  }

  const analysis: CostAnalysis = {
    currentCost,
    optimizedCost,
    savingsPercentage: totalSavingsPercentage,
    strategies
  }

  return new Response(
    JSON.stringify({
      success: true,
      analysis
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}

async function analyzeOptimizationStrategies(
  metrics: any[],
  costs: any[]
): Promise<OptimizationStrategy[]> {
  const strategies: OptimizationStrategy[] = []

  // Strategy 1: Aggressive hibernation
  const avgIdlePercentage = calculateAverageIdlePercentage(metrics)
  if (avgIdlePercentage > 30) {
    strategies.push({
      id: 'aggressive-hibernation',
      name: 'Aggressive Session Hibernation',
      description: `Reduce idle timeout from 10 to 5 minutes. ${Math.round(avgIdlePercentage)}% of sessions are idle.`,
      estimatedSavings: Math.round(avgIdlePercentage * 0.5),
      risk: 'low',
      implemented: false
    })
  }

  // Strategy 2: Pool size optimization
  const avgUtilization = calculateAverageUtilization(metrics)
  if (avgUtilization < 50) {
    strategies.push({
      id: 'pool-size-reduction',
      name: 'Reduce Pool Sizes',
      description: `Decrease minimum pool sizes by 30%. Current utilization is only ${Math.round(avgUtilization)}%.`,
      estimatedSavings: 15,
      risk: 'medium',
      implemented: false
    })
  }

  // Strategy 3: Off-peak scaling
  const peakHours = identifyPeakHours(metrics)
  if (peakHours.length < 12) {
    strategies.push({
      id: 'off-peak-scaling',
      name: 'Off-Peak Auto-Scaling',
      description: 'Reduce pool sizes during off-peak hours (10 PM - 8 AM).',
      estimatedSavings: 20,
      risk: 'low',
      implemented: false
    })
  }

  // Strategy 4: Session pre-warming optimization
  const reuseRate = calculateSessionReuseRate(costs)
  if (reuseRate < 60) {
    strategies.push({
      id: 'prewarm-optimization',
      name: 'Optimize Session Pre-warming',
      description: `Only pre-warm popular device types. Current reuse rate is ${Math.round(reuseRate)}%.`,
      estimatedSavings: 10,
      risk: 'medium',
      implemented: false
    })
  }

  // Strategy 5: Intelligent session termination
  strategies.push({
    id: 'intelligent-termination',
    name: 'Intelligent Session Termination',
    description: 'Terminate sessions with high error rates or poor health status immediately.',
    estimatedSavings: 8,
    risk: 'low',
    implemented: false
  })

  // Strategy 6: User-based quotas
  const { data: quotaUsage } = await supabase
    .from('user_quotas')
    .select('monthly_minutes_used, monthly_minutes_limit')

  const underutilizedUsers = quotaUsage?.filter(u => 
    u.monthly_minutes_used < u.monthly_minutes_limit * 0.2
  ).length || 0

  if (underutilizedUsers > 0) {
    strategies.push({
      id: 'dynamic-quotas',
      name: 'Dynamic User Quotas',
      description: `Implement usage-based quota allocation. ${underutilizedUsers} users use < 20% of quota.`,
      estimatedSavings: 12,
      risk: 'medium',
      implemented: false
    })
  }

  return strategies.sort((a, b) => b.estimatedSavings - a.estimatedSavings)
}

async function handleApplyOptimizations(request: OptimizationRequest): Promise<Response> {
  const { targetSavings = 20 } = request

  // Get current optimization strategies
  const analysisResponse = await handleCostAnalysis({ action: 'analyze', timeRange: '7d' })
  const { analysis } = await analysisResponse.json()

  // Select strategies to meet target savings
  let appliedSavings = 0
  const appliedStrategies: string[] = []

  for (const strategy of analysis.strategies) {
    if (appliedSavings >= targetSavings) break
    if (strategy.risk === 'high') continue // Skip high-risk strategies

    switch (strategy.id) {
      case 'aggressive-hibernation':
        await applyAggressiveHibernation()
        break
      
      case 'pool-size-reduction':
        await applyPoolSizeReduction()
        break
      
      case 'off-peak-scaling':
        await applyOffPeakScaling()
        break
      
      case 'intelligent-termination':
        await applyIntelligentTermination()
        break
    }

    appliedSavings += strategy.estimatedSavings
    appliedStrategies.push(strategy.id)
  }

  return new Response(
    JSON.stringify({
      success: true,
      appliedStrategies,
      estimatedSavings: appliedSavings,
      message: `Applied ${appliedStrategies.length} optimization strategies`
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}

async function applyAggressiveHibernation() {
  // Update all pool configurations to use 5-minute idle timeout
  await supabase
    .from('session_pools')
    .update({ idle_timeout_minutes: 5 })
    .gte('idle_timeout_minutes', 10)

  // Immediately hibernate currently idle sessions
  await supabase.rpc('hibernate_idle_sessions')
}

async function applyPoolSizeReduction() {
  // Reduce minimum pool sizes by 30%
  const { data: pools } = await supabase
    .from('session_pools')
    .select('id, min_sessions, max_sessions')

  for (const pool of pools || []) {
    const newMin = Math.max(1, Math.floor(pool.min_sessions * 0.7))
    const newMax = Math.max(newMin + 2, Math.floor(pool.max_sessions * 0.8))

    await supabase
      .from('session_pools')
      .update({
        min_sessions: newMin,
        max_sessions: newMax
      })
      .eq('id', pool.id)
  }
}

async function applyOffPeakScaling() {
  // This would typically integrate with a cron job or scheduler
  // For now, we'll update the pool configurations
  await supabase
    .from('session_pools')
    .update({
      metadata: {
        off_peak_scaling: {
          enabled: true,
          off_peak_hours: { start: 22, end: 8 },
          scale_factor: 0.5
        }
      }
    })
}

async function applyIntelligentTermination() {
  // Find and terminate unhealthy sessions
  const { data: unhealthySessions } = await supabase
    .from('session_instances')
    .select('id')
    .eq('health_status', 'unhealthy')
    .in('status', ['ready', 'hibernated'])

  for (const session of unhealthySessions || []) {
    await supabase
      .from('session_instances')
      .update({
        status: 'terminating'
      })
      .eq('id', session.id)
  }
}

async function handleCostForecast(request: OptimizationRequest): Promise<Response> {
  // Get historical data for forecasting
  const { data: historicalCosts } = await supabase
    .from('session_costs')
    .select('cost_usd, period_start')
    .gte('period_start', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('period_start', { ascending: true })

  // Simple linear regression for forecasting
  const forecast = calculateLinearForecast(historicalCosts || [])

  return new Response(
    JSON.stringify({
      success: true,
      forecast: {
        next7Days: forecast.weekly,
        next30Days: forecast.monthly,
        trend: forecast.trend,
        confidence: forecast.confidence
      }
    }),
    { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200
    }
  )
}

// Helper functions
function calculateAverageIdlePercentage(metrics: any[]): number {
  if (metrics.length === 0) return 0
  
  const avgIdle = metrics.reduce((acc, m) => 
    acc + (m.idle_sessions / (m.total_sessions || 1)), 0
  ) / metrics.length
  
  return avgIdle * 100
}

function calculateAverageUtilization(metrics: any[]): number {
  if (metrics.length === 0) return 0
  
  const avgUtil = metrics.reduce((acc, m) => 
    acc + (m.utilization_rate || 0), 0
  ) / metrics.length
  
  return avgUtil
}

function identifyPeakHours(metrics: any[]): number[] {
  const hourlyUtilization: Record<number, number[]> = {}
  
  metrics.forEach(m => {
    const hour = new Date(m.timestamp).getHours()
    if (!hourlyUtilization[hour]) hourlyUtilization[hour] = []
    hourlyUtilization[hour].push(m.utilization_rate || 0)
  })

  const peakHours: number[] = []
  Object.entries(hourlyUtilization).forEach(([hour, utils]) => {
    const avg = utils.reduce((a, b) => a + b, 0) / utils.length
    if (avg > 50) peakHours.push(parseInt(hour))
  })

  return peakHours
}

function calculateSessionReuseRate(costs: any[]): number {
  const allocations = costs.filter(c => c.cost_breakdown?.allocations)
  if (allocations.length === 0) return 0

  const totalAllocations = allocations.reduce((acc, c) => 
    acc + (c.cost_breakdown.allocations || 0), 0
  )
  
  const reusedAllocations = allocations.filter(c => 
    c.cost_breakdown.allocation_type === 'reused'
  ).length

  return (reusedAllocations / totalAllocations) * 100
}

function calculateLinearForecast(data: any[]) {
  if (data.length < 2) {
    return { weekly: 0, monthly: 0, trend: 'stable', confidence: 0 }
  }

  // Simple moving average
  const recentDays = data.slice(-7)
  const dailyAvg = recentDays.reduce((acc, d) => acc + d.cost_usd, 0) / recentDays.length

  // Calculate trend
  const firstHalf = data.slice(0, Math.floor(data.length / 2))
  const secondHalf = data.slice(Math.floor(data.length / 2))
  
  const firstAvg = firstHalf.reduce((acc, d) => acc + d.cost_usd, 0) / firstHalf.length
  const secondAvg = secondHalf.reduce((acc, d) => acc + d.cost_usd, 0) / secondHalf.length
  
  const trend = secondAvg > firstAvg * 1.1 ? 'increasing' : 
                secondAvg < firstAvg * 0.9 ? 'decreasing' : 'stable'

  return {
    weekly: dailyAvg * 7,
    monthly: dailyAvg * 30,
    trend,
    confidence: Math.min(data.length / 30, 1) * 100
  }
}