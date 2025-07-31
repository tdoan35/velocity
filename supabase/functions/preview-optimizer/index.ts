import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'
import { getAdvancedCache } from '../_shared/advanced-cache.ts'

interface SessionWarmingRequest {
  action: 'warm' | 'preload' | 'optimize'
  projectId?: string
  deviceTypes?: string[]
  priority?: 'high' | 'medium' | 'low'
}

interface OptimizationConfig {
  enableSessionWarming: boolean
  warmingPoolSize: number
  preloadThreshold: number
  adaptiveQuality: boolean
  cacheStrategy: 'aggressive' | 'balanced' | 'minimal'
}

// Default optimization configuration
const DEFAULT_CONFIG: OptimizationConfig = {
  enableSessionWarming: true,
  warmingPoolSize: 3,
  preloadThreshold: 0.7, // 70% confidence threshold
  adaptiveQuality: true,
  cacheStrategy: 'balanced'
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authResult = await requireAuth(req)
    if (!authResult.authorized) {
      return new Response(
        JSON.stringify({ error: authResult.error }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const logger = createLogger({
      userId: authResult.userId,
      requestId: crypto.randomUUID()
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { method } = req
    const url = new URL(req.url)
    const path = url.pathname.split('/').pop()

    switch (method) {
      case 'POST':
        if (path === 'warm-sessions') {
          // Warm up preview sessions in the background
          const request: SessionWarmingRequest = await req.json()
          const result = await warmSessions(supabase, authResult.userId, request, logger)
          
          return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else if (path === 'optimize-build') {
          // Optimize build process for faster preview generation
          const { projectId } = await req.json()
          const result = await optimizeBuildProcess(supabase, projectId, logger)
          
          return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else if (path === 'adaptive-quality') {
          // Adjust preview quality based on network conditions
          const { sessionId, networkQuality } = await req.json()
          const result = await adjustQuality(supabase, sessionId, networkQuality, logger)
          
          return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        break

      case 'GET':
        if (path === 'performance-metrics') {
          // Get detailed performance metrics for preview system
          const projectId = url.searchParams.get('project_id')
          const timeRange = url.searchParams.get('time_range') || '24h'
          
          const metrics = await getPerformanceMetrics(
            supabase,
            authResult.userId,
            projectId,
            timeRange
          )
          
          return new Response(
            JSON.stringify(metrics),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else if (path === 'optimization-config') {
          // Get current optimization configuration
          const config = await getOptimizationConfig(supabase, authResult.userId)
          
          return new Response(
            JSON.stringify(config),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        break

      case 'PUT':
        if (path === 'optimization-config') {
          // Update optimization configuration
          const config: Partial<OptimizationConfig> = await req.json()
          const result = await updateOptimizationConfig(
            supabase,
            authResult.userId,
            config,
            logger
          )
          
          return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        break
    }

    return new Response(
      JSON.stringify({ error: 'Invalid endpoint' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Preview optimizer error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function warmSessions(
  supabase: any,
  userId: string,
  request: SessionWarmingRequest,
  logger: any
): Promise<any> {
  const startTime = Date.now()
  const cache = getAdvancedCache()
  
  try {
    // Get user's optimization config
    const config = await getOptimizationConfig(supabase, userId)
    
    if (!config.enableSessionWarming) {
      return {
        success: false,
        message: 'Session warming is disabled in configuration'
      }
    }
    
    // Predict which devices will be needed based on usage patterns
    const predictedDevices = await predictDeviceUsage(supabase, userId, request.projectId)
    
    // Get current warm sessions
    const { data: existingSessions } = await supabase
      .from('preview_session_pool')
      .select('*')
      .eq('status', 'warm')
      .eq('user_id', userId)
    
    const devicesToWarm = request.deviceTypes || predictedDevices
    const sessionsToCreate = Math.min(
      config.warmingPoolSize - (existingSessions?.length || 0),
      devicesToWarm.length
    )
    
    const warmedSessions = []
    
    // Create warm sessions for predicted devices
    for (let i = 0; i < sessionsToCreate; i++) {
      const deviceType = devicesToWarm[i]
      
      // Check cache first
      const cacheKey = `warm-session:${userId}:${deviceType}`
      const cachedSession = await cache.get(cacheKey)
      
      if (cachedSession) {
        warmedSessions.push(cachedSession)
        continue
      }
      
      // Create new warm session
      const session = await createWarmSession(supabase, userId, deviceType, request.priority)
      
      if (session) {
        warmedSessions.push(session)
        
        // Cache the warm session
        await cache.set(cacheKey, session, 300) // 5 minutes
      }
    }
    
    const duration = Date.now() - startTime
    
    await logger.info('Sessions warmed', {
      count: warmedSessions.length,
      devices: devicesToWarm,
      duration
    })
    
    // Record performance metric
    await recordPerformanceMetric(supabase, {
      user_id: userId,
      metric_type: 'session_warming',
      value: duration,
      metadata: {
        sessions_created: warmedSessions.length,
        cache_hits: sessionsToCreate - warmedSessions.filter(s => !s.fromCache).length
      }
    })
    
    return {
      success: true,
      warmedSessions: warmedSessions.length,
      duration,
      devices: devicesToWarm
    }
    
  } catch (error) {
    await logger.error('Session warming failed', { error: error.message })
    throw error
  }
}

async function predictDeviceUsage(
  supabase: any,
  userId: string,
  projectId?: string
): Promise<string[]> {
  // Analyze user's historical device usage patterns
  const { data: usageHistory } = await supabase
    .from('preview_session_metrics')
    .select('device_type, created_at')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false })
  
  if (!usageHistory || usageHistory.length === 0) {
    // Default to common devices
    return ['iphone15pro', 'pixel8pro', 'ipadpro11']
  }
  
  // Count device usage frequency
  const deviceCounts = usageHistory.reduce((acc, session) => {
    acc[session.device_type] = (acc[session.device_type] || 0) + 1
    return acc
  }, {})
  
  // Sort by frequency and return top devices
  return Object.entries(deviceCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([device]) => device)
}

async function createWarmSession(
  supabase: any,
  userId: string,
  deviceType: string,
  priority?: string
): Promise<any> {
  try {
    // Create a session in the pool with 'warm' status
    const { data: session, error } = await supabase
      .from('preview_session_pool')
      .insert({
        user_id: userId,
        device_type: deviceType,
        platform: deviceType.includes('iphone') || deviceType.includes('ipad') ? 'ios' : 'android',
        status: 'warm',
        priority: priority || 'medium',
        metadata: {
          warmed_at: new Date().toISOString(),
          warming_type: 'predictive'
        }
      })
      .select()
      .single()
    
    if (error) throw error
    
    return {
      ...session,
      fromCache: false
    }
    
  } catch (error) {
    console.error('Failed to create warm session:', error)
    return null
  }
}

async function optimizeBuildProcess(
  supabase: any,
  projectId: string,
  logger: any
): Promise<any> {
  const startTime = Date.now()
  const cache = getAdvancedCache()
  
  try {
    // Analyze build patterns
    const { data: recentBuilds } = await supabase
      .from('preview_builds')
      .select('*')
      .eq('project_id', projectId)
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(50)
    
    if (!recentBuilds || recentBuilds.length === 0) {
      return {
        success: false,
        message: 'No build history available for optimization'
      }
    }
    
    // Identify frequently unchanged files for caching
    const fileChangeFrequency = analyzeFileChanges(recentBuilds)
    
    // Create optimized build configuration
    const optimizations = {
      // Cache stable dependencies
      dependencyCache: identifyStableDependencies(recentBuilds),
      
      // Pre-compile common components
      precompiledComponents: identifyCommonComponents(recentBuilds),
      
      // Optimize asset loading
      assetOptimizations: {
        lazyLoadThreshold: calculateLazyLoadThreshold(recentBuilds),
        compressionTargets: identifyCompressionTargets(recentBuilds)
      },
      
      // Build parallelization
      parallelization: {
        enabled: true,
        workers: 4,
        chunkSize: calculateOptimalChunkSize(recentBuilds)
      }
    }
    
    // Store optimization config
    const { error: updateError } = await supabase
      .from('project_settings')
      .upsert({
        project_id: projectId,
        build_optimizations: optimizations,
        updated_at: new Date().toISOString()
      })
    
    if (updateError) throw updateError
    
    // Cache the optimization config
    await cache.set(`build-opt:${projectId}`, optimizations, 3600) // 1 hour
    
    const duration = Date.now() - startTime
    
    await logger.info('Build process optimized', {
      projectId,
      optimizations: Object.keys(optimizations),
      duration
    })
    
    return {
      success: true,
      optimizations,
      estimatedSpeedup: calculateEstimatedSpeedup(optimizations, recentBuilds),
      duration
    }
    
  } catch (error) {
    await logger.error('Build optimization failed', { error: error.message })
    throw error
  }
}

async function adjustQuality(
  supabase: any,
  sessionId: string,
  networkQuality: string,
  logger: any
): Promise<any> {
  try {
    // Define quality profiles
    const qualityProfiles = {
      high: {
        resolution: '100%',
        frameRate: 60,
        compression: 'none',
        features: ['hot-reload', 'gesture-recording', 'performance-monitoring']
      },
      medium: {
        resolution: '75%',
        frameRate: 30,
        compression: 'moderate',
        features: ['hot-reload']
      },
      low: {
        resolution: '50%',
        frameRate: 15,
        compression: 'aggressive',
        features: []
      }
    }
    
    // Map network quality to profile
    const profileMap = {
      excellent: 'high',
      good: 'high',
      fair: 'medium',
      poor: 'low'
    }
    
    const selectedProfile = qualityProfiles[profileMap[networkQuality] || 'medium']
    
    // Update session with quality settings
    const { error } = await supabase
      .from('preview_sessions')
      .update({
        quality_settings: selectedProfile,
        network_quality: networkQuality,
        updated_at: new Date().toISOString()
      })
      .eq('public_id', sessionId)
    
    if (error) throw error
    
    await logger.info('Quality adjusted', {
      sessionId,
      networkQuality,
      profile: profileMap[networkQuality] || 'medium'
    })
    
    return {
      success: true,
      qualityProfile: selectedProfile,
      networkQuality
    }
    
  } catch (error) {
    await logger.error('Quality adjustment failed', { error: error.message })
    throw error
  }
}

async function getPerformanceMetrics(
  supabase: any,
  userId: string,
  projectId: string | null,
  timeRange: string
): Promise<any> {
  const timeWindows = {
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000
  }
  
  const windowMs = timeWindows[timeRange] || timeWindows['24h']
  const startTime = new Date(Date.now() - windowMs).toISOString()
  
  // Get preview-specific performance metrics
  const { data: metrics } = await supabase
    .from('performance_metrics')
    .select('*')
    .eq('user_id', userId)
    .in('metric_type', ['preview_startup', 'build_time', 'hot_reload', 'session_allocation'])
    .gte('created_at', startTime)
    .order('created_at', { ascending: false })
  
  // Get session metrics
  const { data: sessionMetrics } = await supabase
    .from('preview_session_metrics')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', startTime)
  
  // Calculate aggregated metrics
  const aggregated = {
    averageStartupTime: calculateAverage(metrics?.filter(m => m.metric_type === 'preview_startup')),
    averageBuildTime: calculateAverage(metrics?.filter(m => m.metric_type === 'build_time')),
    averageHotReloadTime: calculateAverage(metrics?.filter(m => m.metric_type === 'hot_reload')),
    sessionAllocationTime: calculateAverage(metrics?.filter(m => m.metric_type === 'session_allocation')),
    totalSessions: sessionMetrics?.length || 0,
    cacheHitRate: calculateCacheHitRate(metrics),
    optimizationImpact: calculateOptimizationImpact(metrics)
  }
  
  return {
    timeRange,
    metrics: aggregated,
    trends: calculateTrends(metrics),
    recommendations: generateRecommendations(aggregated)
  }
}

async function getOptimizationConfig(
  supabase: any,
  userId: string
): Promise<OptimizationConfig> {
  const { data: userConfig } = await supabase
    .from('user_settings')
    .select('preview_optimization_config')
    .eq('user_id', userId)
    .single()
  
  return userConfig?.preview_optimization_config || DEFAULT_CONFIG
}

async function updateOptimizationConfig(
  supabase: any,
  userId: string,
  config: Partial<OptimizationConfig>,
  logger: any
): Promise<any> {
  try {
    const currentConfig = await getOptimizationConfig(supabase, userId)
    const newConfig = { ...currentConfig, ...config }
    
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        preview_optimization_config: newConfig,
        updated_at: new Date().toISOString()
      })
    
    if (error) throw error
    
    await logger.info('Optimization config updated', {
      userId,
      changes: Object.keys(config)
    })
    
    return {
      success: true,
      config: newConfig
    }
    
  } catch (error) {
    await logger.error('Config update failed', { error: error.message })
    throw error
  }
}

async function recordPerformanceMetric(
  supabase: any,
  metric: any
): Promise<void> {
  try {
    await supabase
      .from('performance_metrics')
      .insert({
        ...metric,
        created_at: new Date().toISOString()
      })
  } catch (error) {
    console.error('Failed to record performance metric:', error)
  }
}

// Helper functions
function analyzeFileChanges(builds: any[]): any {
  const fileChanges = {}
  
  builds.forEach(build => {
    if (build.metadata?.changedFiles) {
      build.metadata.changedFiles.forEach(file => {
        fileChanges[file] = (fileChanges[file] || 0) + 1
      })
    }
  })
  
  return fileChanges
}

function identifyStableDependencies(builds: any[]): string[] {
  // Identify dependencies that rarely change
  const dependencyChanges = {}
  
  builds.forEach(build => {
    if (build.metadata?.dependencies) {
      Object.keys(build.metadata.dependencies).forEach(dep => {
        dependencyChanges[dep] = (dependencyChanges[dep] || 0) + 1
      })
    }
  })
  
  // Return dependencies that changed in less than 10% of builds
  const threshold = builds.length * 0.1
  return Object.entries(dependencyChanges)
    .filter(([, changes]) => changes < threshold)
    .map(([dep]) => dep)
}

function identifyCommonComponents(builds: any[]): string[] {
  // Identify components used in most builds
  const componentUsage = {}
  
  builds.forEach(build => {
    if (build.metadata?.components) {
      build.metadata.components.forEach(comp => {
        componentUsage[comp] = (componentUsage[comp] || 0) + 1
      })
    }
  })
  
  // Return components used in more than 80% of builds
  const threshold = builds.length * 0.8
  return Object.entries(componentUsage)
    .filter(([, usage]) => usage > threshold)
    .map(([comp]) => comp)
}

function calculateLazyLoadThreshold(builds: any[]): number {
  // Calculate optimal lazy load threshold based on asset sizes
  const assetSizes = builds
    .flatMap(b => b.metadata?.assets || [])
    .map(a => a.size)
    .filter(s => s)
    .sort((a, b) => a - b)
  
  if (assetSizes.length === 0) return 50000 // 50KB default
  
  // Use 75th percentile as threshold
  const index = Math.floor(assetSizes.length * 0.75)
  return assetSizes[index]
}

function identifyCompressionTargets(builds: any[]): string[] {
  // Identify file types that benefit from compression
  const fileTypes = {}
  
  builds.forEach(build => {
    if (build.metadata?.assets) {
      build.metadata.assets.forEach(asset => {
        const ext = asset.path.split('.').pop()
        if (!fileTypes[ext]) {
          fileTypes[ext] = { count: 0, totalSize: 0 }
        }
        fileTypes[ext].count++
        fileTypes[ext].totalSize += asset.size || 0
      })
    }
  })
  
  // Return file types with average size > 10KB
  return Object.entries(fileTypes)
    .filter(([, stats]: any) => stats.totalSize / stats.count > 10000)
    .map(([ext]) => ext)
}

function calculateOptimalChunkSize(builds: any[]): number {
  // Calculate optimal chunk size based on build sizes
  const buildSizes = builds
    .map(b => b.metadata?.totalSize || 0)
    .filter(s => s > 0)
  
  if (buildSizes.length === 0) return 1000000 // 1MB default
  
  const avgSize = buildSizes.reduce((a, b) => a + b, 0) / buildSizes.length
  
  // Optimal chunk size is ~10% of average build size
  return Math.max(100000, Math.min(5000000, Math.floor(avgSize * 0.1)))
}

function calculateEstimatedSpeedup(optimizations: any, builds: any[]): number {
  let speedup = 1.0
  
  // Dependency caching can save 20-30%
  if (optimizations.dependencyCache?.length > 0) {
    speedup *= 0.75
  }
  
  // Pre-compiled components can save 10-15%
  if (optimizations.precompiledComponents?.length > 0) {
    speedup *= 0.88
  }
  
  // Parallelization can save 30-40%
  if (optimizations.parallelization?.enabled) {
    speedup *= 0.65
  }
  
  return Math.round((1 - speedup) * 100)
}

function calculateAverage(metrics: any[]): number {
  if (!metrics || metrics.length === 0) return 0
  return metrics.reduce((sum, m) => sum + m.value, 0) / metrics.length
}

function calculateCacheHitRate(metrics: any[]): number {
  if (!metrics) return 0
  
  const cacheMetrics = metrics.filter(m => m.metadata?.cache_hit !== undefined)
  if (cacheMetrics.length === 0) return 0
  
  const hits = cacheMetrics.filter(m => m.metadata.cache_hit).length
  return hits / cacheMetrics.length
}

function calculateOptimizationImpact(metrics: any[]): number {
  if (!metrics || metrics.length < 10) return 0
  
  // Compare recent metrics with older ones
  const midpoint = Math.floor(metrics.length / 2)
  const older = metrics.slice(midpoint)
  const recent = metrics.slice(0, midpoint)
  
  const olderAvg = calculateAverage(older)
  const recentAvg = calculateAverage(recent)
  
  if (olderAvg === 0) return 0
  
  return Math.round(((olderAvg - recentAvg) / olderAvg) * 100)
}

function calculateTrends(metrics: any[]): any {
  // Group metrics by hour
  const hourly = {}
  
  metrics?.forEach(metric => {
    const hour = new Date(metric.created_at).toISOString().substring(0, 13)
    if (!hourly[hour]) {
      hourly[hour] = []
    }
    hourly[hour].push(metric.value)
  })
  
  // Calculate hourly averages
  return Object.entries(hourly)
    .map(([hour, values]: [string, any]) => ({
      hour,
      average: values.reduce((a, b) => a + b, 0) / values.length,
      count: values.length
    }))
    .sort((a, b) => a.hour.localeCompare(b.hour))
}

function generateRecommendations(metrics: any): string[] {
  const recommendations = []
  
  if (metrics.averageStartupTime > 3000) {
    recommendations.push('Enable session warming to reduce startup time')
  }
  
  if (metrics.averageBuildTime > 30000) {
    recommendations.push('Optimize build process with dependency caching')
  }
  
  if (metrics.cacheHitRate < 0.5) {
    recommendations.push('Improve cache strategy to increase hit rate')
  }
  
  if (metrics.optimizationImpact < 10) {
    recommendations.push('Current optimizations showing limited impact - review configuration')
  }
  
  return recommendations
}