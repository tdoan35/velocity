import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'
import { PreviewErrorHandler, PreviewErrorCode, PreviewDiagnostics } from '../_shared/preview-errors.ts'

interface DiagnosticRequest {
  action: 'collect' | 'analyze' | 'report' | 'health-check'
  sessionId?: string
  projectId?: string
  timeRange?: string
  includeSystemInfo?: boolean
}

interface ErrorReport {
  errorCode: string
  message: string
  context: any
  diagnostics?: any
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
        if (path === 'report-error') {
          // Report an error with diagnostics
          const report: ErrorReport = await req.json()
          const result = await reportError(supabase, authResult.userId, report, logger)
          
          return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else if (path === 'collect-diagnostics') {
          // Collect diagnostic information
          const request: DiagnosticRequest = await req.json()
          const diagnostics = await collectDiagnostics(
            supabase,
            authResult.userId,
            request,
            logger
          )
          
          return new Response(
            JSON.stringify(diagnostics),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        break

      case 'GET':
        if (path === 'health-check') {
          // Perform system health check
          const health = await performHealthCheck(supabase, logger)
          
          return new Response(
            JSON.stringify(health),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else if (path === 'error-analytics') {
          // Get error analytics
          const timeRange = url.searchParams.get('time_range') || '24h'
          const analytics = await getErrorAnalytics(
            supabase,
            authResult.userId,
            timeRange,
            logger
          )
          
          return new Response(
            JSON.stringify(analytics),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        } else if (path === 'diagnostic-report') {
          // Generate comprehensive diagnostic report
          const sessionId = url.searchParams.get('session_id')
          const report = await generateDiagnosticReport(
            supabase,
            authResult.userId,
            sessionId,
            logger
          )
          
          return new Response(
            JSON.stringify(report),
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
    console.error('Preview diagnostics error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

async function reportError(
  supabase: any,
  userId: string,
  report: ErrorReport,
  logger: any
): Promise<any> {
  try {
    // Process the error
    const previewError = await PreviewErrorHandler.handleError(
      {
        code: report.errorCode,
        message: report.message,
        ...report.context
      },
      {
        userId,
        ...report.context
      }
    )

    // Store error log
    const { data: errorLog, error: insertError } = await supabase
      .from('preview_error_logs')
      .insert({
        user_id: userId,
        error_code: previewError.code,
        severity: previewError.severity,
        message: previewError.message,
        user_message: previewError.userMessage,
        technical_details: previewError.technicalDetails,
        context: report.context,
        diagnostics: report.diagnostics,
        can_retry: previewError.canRetry,
        recovery_steps: previewError.recoverySteps,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Check for error patterns
    const pattern = await detectErrorPattern(supabase, userId, previewError.code)

    // Trigger alerts if needed
    if (pattern.isRecurring || previewError.severity === 'critical') {
      await createErrorAlert(supabase, userId, previewError, pattern)
    }

    await logger.info('Error reported', {
      errorCode: previewError.code,
      severity: previewError.severity,
      pattern: pattern
    })

    return {
      success: true,
      errorId: errorLog.id,
      error: {
        code: previewError.code,
        userMessage: previewError.userMessage,
        recoverySteps: previewError.recoverySteps,
        canRetry: previewError.canRetry,
        retryAfter: previewError.retryAfter
      },
      pattern: pattern.isRecurring ? {
        occurrences: pattern.occurrences,
        firstSeen: pattern.firstSeen,
        suggestion: pattern.suggestion
      } : null
    }

  } catch (error) {
    await logger.error('Failed to report error', { error: error.message })
    throw error
  }
}

async function collectDiagnostics(
  supabase: any,
  userId: string,
  request: DiagnosticRequest,
  logger: any
): Promise<any> {
  try {
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      userId,
      sessionId: request.sessionId,
      projectId: request.projectId
    }

    // Collect session information
    if (request.sessionId) {
      const { data: session } = await supabase
        .from('preview_sessions')
        .select('*')
        .eq('public_id', request.sessionId)
        .single()

      diagnostics.session = session
    }

    // Collect recent errors
    const { data: recentErrors } = await supabase
      .from('preview_error_logs')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)

    diagnostics.recentErrors = recentErrors

    // Collect performance metrics
    const { data: performanceMetrics } = await supabase
      .from('performance_metrics')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString()) // Last hour
      .order('created_at', { ascending: false })

    diagnostics.performanceMetrics = analyzePerformanceMetrics(performanceMetrics)

    // Collect resource usage
    const { data: resourceUsage } = await supabase
      .from('resource_usage')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)

    diagnostics.resourceUsage = resourceUsage?.[0]

    // Collect system diagnostics if requested
    if (request.includeSystemInfo) {
      diagnostics.system = await PreviewDiagnostics.collectDiagnosticInfo(
        request.sessionId,
        true
      )
    }

    await logger.info('Diagnostics collected', {
      sessionId: request.sessionId,
      errorCount: recentErrors?.length || 0
    })

    return diagnostics

  } catch (error) {
    await logger.error('Failed to collect diagnostics', { error: error.message })
    throw error
  }
}

async function performHealthCheck(
  supabase: any,
  logger: any
): Promise<any> {
  const health: any = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    checks: {}
  }

  try {
    // Check database connectivity
    const dbStart = Date.now()
    const { error: dbError } = await supabase
      .from('preview_sessions')
      .select('count')
      .limit(1)

    health.checks.database = {
      status: dbError ? 'unhealthy' : 'healthy',
      responseTime: Date.now() - dbStart,
      error: dbError?.message
    }

    // Check Container Orchestrator (Fly.io)
    const orchestratorStart = Date.now()
    try {
      const orchestratorResponse = await fetch(`${Deno.env.get('ORCHESTRATOR_URL')}/health`, {
        headers: {
          'Authorization': `Bearer ${Deno.env.get('ORCHESTRATOR_ADMIN_TOKEN')}`
        }
      })
      
      health.checks.orchestrator = {
        status: orchestratorResponse.ok ? 'healthy' : 'unhealthy',
        responseTime: Date.now() - orchestratorStart,
        statusCode: orchestratorResponse.status
      }
    } catch (error) {
      health.checks.orchestrator = {
        status: 'unhealthy',
        responseTime: Date.now() - orchestratorStart,
        error: error.message
      }
    }

    // Check session pool availability
    const { data: poolStats } = await supabase
      .from('preview_session_pool')
      .select('status')
      .eq('status', 'available')

    health.checks.sessionPool = {
      status: poolStats && poolStats.length > 0 ? 'healthy' : 'degraded',
      availableSessions: poolStats?.length || 0
    }

    // Check error rate (last hour)
    const { data: errorCount } = await supabase
      .from('preview_error_logs')
      .select('count')
      .gte('created_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
      .eq('severity', 'critical')

    const criticalErrors = errorCount?.[0]?.count || 0
    health.checks.errorRate = {
      status: criticalErrors > 10 ? 'unhealthy' : criticalErrors > 5 ? 'degraded' : 'healthy',
      criticalErrors
    }

    // Overall health status
    const unhealthyChecks = Object.values(health.checks)
      .filter((check: any) => check.status === 'unhealthy').length
    const degradedChecks = Object.values(health.checks)
      .filter((check: any) => check.status === 'degraded').length

    if (unhealthyChecks > 0) {
      health.status = 'unhealthy'
    } else if (degradedChecks > 0) {
      health.status = 'degraded'
    }

    await logger.info('Health check completed', {
      status: health.status,
      checks: Object.keys(health.checks)
    })

    return health

  } catch (error) {
    await logger.error('Health check failed', { error: error.message })
    health.status = 'unhealthy'
    health.error = error.message
    return health
  }
}

async function getErrorAnalytics(
  supabase: any,
  userId: string,
  timeRange: string,
  logger: any
): Promise<any> {
  try {
    const timeWindows = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000
    }

    const windowMs = timeWindows[timeRange] || timeWindows['24h']
    const startTime = new Date(Date.now() - windowMs).toISOString()

    // Get error logs
    const { data: errors } = await supabase
      .from('preview_error_logs')
      .select('*')
      .eq('user_id', userId)
      .gte('created_at', startTime)
      .order('created_at', { ascending: false })

    if (!errors || errors.length === 0) {
      return {
        timeRange,
        totalErrors: 0,
        analytics: {},
        trends: []
      }
    }

    // Analyze errors by code
    const byCode = errors.reduce((acc, error) => {
      if (!acc[error.error_code]) {
        acc[error.error_code] = {
          count: 0,
          severity: error.severity,
          firstSeen: error.created_at,
          lastSeen: error.created_at
        }
      }
      acc[error.error_code].count++
      acc[error.error_code].lastSeen = error.created_at
      return acc
    }, {})

    // Analyze errors by severity
    const bySeverity = errors.reduce((acc, error) => {
      acc[error.severity] = (acc[error.severity] || 0) + 1
      return acc
    }, {})

    // Calculate error trends
    const trends = calculateErrorTrends(errors, timeRange)

    // Identify top recovery steps
    const recoverySteps = errors
      .filter(e => e.recovery_steps)
      .flatMap(e => e.recovery_steps)
      .reduce((acc, step) => {
        acc[step] = (acc[step] || 0) + 1
        return acc
      }, {})

    const topRecoverySteps = Object.entries(recoverySteps)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([step, count]) => ({ step, count }))

    await logger.info('Error analytics generated', {
      timeRange,
      totalErrors: errors.length
    })

    return {
      timeRange,
      totalErrors: errors.length,
      analytics: {
        byCode,
        bySeverity,
        topRecoverySteps
      },
      trends
    }

  } catch (error) {
    await logger.error('Failed to get error analytics', { error: error.message })
    throw error
  }
}

async function generateDiagnosticReport(
  supabase: any,
  userId: string,
  sessionId: string | null,
  logger: any
): Promise<any> {
  try {
    const report: any = {
      timestamp: new Date().toISOString(),
      userId,
      sessionId
    }

    // Collect comprehensive diagnostics
    const diagnostics = await collectDiagnostics(
      supabase,
      userId,
      { sessionId, includeSystemInfo: true, action: 'analyze' },
      logger
    )

    report.diagnostics = diagnostics

    // Get error analytics
    const analytics = await getErrorAnalytics(supabase, userId, '24h', logger)
    report.errorAnalytics = analytics

    // Perform health check
    const health = await performHealthCheck(supabase, logger)
    report.systemHealth = health

    // Generate recommendations
    report.recommendations = generateRecommendations(diagnostics, analytics, health)

    // Store report
    const { data: storedReport, error } = await supabase
      .from('diagnostic_reports')
      .insert({
        user_id: userId,
        session_id: sessionId,
        report_data: report,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    await logger.info('Diagnostic report generated', {
      reportId: storedReport.id,
      sessionId
    })

    return {
      reportId: storedReport.id,
      report
    }

  } catch (error) {
    await logger.error('Failed to generate diagnostic report', { error: error.message })
    throw error
  }
}

// Helper functions
function analyzePerformanceMetrics(metrics: any[]): any {
  if (!metrics || metrics.length === 0) return null

  const byType = metrics.reduce((acc, metric) => {
    if (!acc[metric.metric_type]) {
      acc[metric.metric_type] = {
        count: 0,
        total: 0,
        min: Infinity,
        max: -Infinity
      }
    }

    const group = acc[metric.metric_type]
    group.count++
    group.total += metric.value
    group.min = Math.min(group.min, metric.value)
    group.max = Math.max(group.max, metric.value)

    return acc
  }, {})

  // Calculate averages
  Object.keys(byType).forEach(type => {
    byType[type].average = byType[type].total / byType[type].count
  })

  return byType
}

async function detectErrorPattern(
  supabase: any,
  userId: string,
  errorCode: string
): Promise<any> {
  // Look for recurring errors
  const { data: similarErrors } = await supabase
    .from('preview_error_logs')
    .select('created_at')
    .eq('user_id', userId)
    .eq('error_code', errorCode)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: true })

  if (!similarErrors || similarErrors.length < 3) {
    return { isRecurring: false }
  }

  // Calculate error frequency
  const intervals = []
  for (let i = 1; i < similarErrors.length; i++) {
    const interval = new Date(similarErrors[i].created_at).getTime() - 
                    new Date(similarErrors[i-1].created_at).getTime()
    intervals.push(interval)
  }

  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length
  const isRecurring = avgInterval < 5 * 60 * 1000 // Less than 5 minutes between errors

  let suggestion = null
  if (isRecurring) {
    suggestion = getPatternSuggestion(errorCode, similarErrors.length, avgInterval)
  }

  return {
    isRecurring,
    occurrences: similarErrors.length,
    firstSeen: similarErrors[0].created_at,
    averageInterval: avgInterval,
    suggestion
  }
}

function getPatternSuggestion(errorCode: string, occurrences: number, avgInterval: number): string {
  const suggestions = {
    [PreviewErrorCode.SESSION_TIMEOUT]: 'Consider increasing session timeout or implementing keep-alive',
    [PreviewErrorCode.BUILD_FAILED]: 'Review recent code changes or dependencies that may be causing build failures',
    [PreviewErrorCode.WEBSOCKET_CONNECTION_FAILED]: 'Check network stability or firewall settings',
    [PreviewErrorCode.QUOTA_EXCEEDED]: 'Consider upgrading your plan for increased quota',
    [PreviewErrorCode.RATE_LIMIT_EXCEEDED]: 'Implement request throttling or caching'
  }

  return suggestions[errorCode] || 
    `This error has occurred ${occurrences} times with an average interval of ${Math.round(avgInterval / 1000)}s`
}

async function createErrorAlert(
  supabase: any,
  userId: string,
  error: any,
  pattern: any
): Promise<void> {
  try {
    await supabase
      .from('performance_alerts')
      .insert({
        user_id: userId,
        alert_type: 'preview_error',
        severity: error.severity,
        message: pattern.isRecurring 
          ? `Recurring error detected: ${error.userMessage}`
          : `Critical error: ${error.userMessage}`,
        metadata: {
          errorCode: error.code,
          occurrences: pattern.occurrences,
          suggestion: pattern.suggestion
        },
        created_at: new Date().toISOString()
      })
  } catch (e) {
    console.error('Failed to create error alert:', e)
  }
}

function calculateErrorTrends(errors: any[], timeRange: string): any[] {
  const grouping = timeRange === '1h' ? 'minute' : 
                  timeRange === '24h' ? 'hour' : 
                  timeRange === '7d' ? 'day' : 'day'

  const grouped = errors.reduce((acc, error) => {
    const date = new Date(error.created_at)
    let key: string

    switch (grouping) {
      case 'minute':
        key = date.toISOString().substring(0, 16) // YYYY-MM-DDTHH:mm
        break
      case 'hour':
        key = date.toISOString().substring(0, 13) // YYYY-MM-DDTHH
        break
      case 'day':
        key = date.toISOString().substring(0, 10) // YYYY-MM-DD
        break
      default:
        key = date.toISOString().substring(0, 10)
    }

    if (!acc[key]) {
      acc[key] = { timestamp: key, count: 0, critical: 0 }
    }
    acc[key].count++
    if (error.severity === 'critical') {
      acc[key].critical++
    }

    return acc
  }, {})

  return Object.values(grouped).sort((a: any, b: any) => 
    a.timestamp.localeCompare(b.timestamp)
  )
}

function generateRecommendations(diagnostics: any, analytics: any, health: any): string[] {
  const recommendations = []

  // Based on error analytics
  if (analytics.totalErrors > 50) {
    recommendations.push('High error rate detected. Review error logs and implement fixes for recurring issues.')
  }

  const criticalErrors = analytics.analytics?.bySeverity?.critical || 0
  if (criticalErrors > 5) {
    recommendations.push('Multiple critical errors detected. Immediate attention required.')
  }

  // Based on performance metrics
  if (diagnostics.performanceMetrics) {
    const startupMetrics = diagnostics.performanceMetrics.preview_startup
    if (startupMetrics?.average > 5000) {
      recommendations.push('Slow preview startup times. Consider enabling session warming.')
    }
  }

  // Based on health check
  if (health.status === 'unhealthy') {
    recommendations.push('System health is critical. Check individual component statuses.')
  }

  if (health.checks?.sessionPool?.availableSessions === 0) {
    recommendations.push('No available preview sessions. Scale up session pool or wait for sessions to free up.')
  }

  // Based on resource usage
  if (diagnostics.resourceUsage?.cpu_usage > 80) {
    recommendations.push('High CPU usage detected. Consider optimizing builds or scaling resources.')
  }

  return recommendations
}