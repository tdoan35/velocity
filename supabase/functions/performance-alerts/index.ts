// Supabase Edge Function for performance monitoring and alerting
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'

interface AlertRequest {
  action: 'check' | 'configure' | 'acknowledge' | 'resolve' | 'get_active' | 'get_history'
  alertType?: string
  alertId?: string
  configuration?: AlertConfiguration
  filters?: {
    severity?: string[]
    types?: string[]
    status?: string[]
    projectId?: string
  }
  timeRange?: {
    start: string
    end: string
  }
}

interface AlertConfiguration {
  type: string
  enabled: boolean
  thresholds: {
    warning?: number
    critical?: number
  }
  conditions?: {
    metric: string
    operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
    value: number
    duration?: number // minutes
  }[]
  notifications?: {
    channels: ('email' | 'webhook' | 'dashboard')[]
    webhookUrl?: string
    emailAddresses?: string[]
  }
}

interface AlertResponse {
  alerts?: Alert[]
  configuration?: AlertConfiguration[]
  summary?: {
    total: number
    bySeverity: Record<string, number>
    byType: Record<string, number>
    byStatus: Record<string, number>
  }
  recommendations?: string[]
}

interface Alert {
  id: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  status: 'active' | 'acknowledged' | 'resolved'
  metric: string
  threshold: number
  actual: number
  message: string
  details?: any
  createdAt: string
  acknowledgedAt?: string
  resolvedAt?: string
}

const ALERT_TYPES = {
  high_latency: {
    metric: 'p95_latency',
    defaultThresholds: { warning: 3000, critical: 5000 },
    message: 'API latency exceeds threshold'
  },
  low_cache_hit: {
    metric: 'cache_hit_rate',
    defaultThresholds: { warning: 0.5, critical: 0.3 },
    message: 'Cache hit rate below threshold'
  },
  error_spike: {
    metric: 'error_rate',
    defaultThresholds: { warning: 0.05, critical: 0.1 },
    message: 'Error rate exceeds threshold'
  },
  quota_warning: {
    metric: 'quota_usage',
    defaultThresholds: { warning: 0.8, critical: 0.95 },
    message: 'Approaching usage quota'
  },
  quality_degradation: {
    metric: 'quality_score',
    defaultThresholds: { warning: 0.7, critical: 0.5 },
    message: 'Code quality below threshold'
  },
  cost_overrun: {
    metric: 'daily_cost',
    defaultThresholds: { warning: 50, critical: 100 },
    message: 'Daily costs exceed budget'
  },
  rate_limit: {
    metric: 'requests_per_minute',
    defaultThresholds: { warning: 100, critical: 150 },
    message: 'Approaching rate limits'
  },
  token_exhaustion: {
    metric: 'token_usage_percent',
    defaultThresholds: { warning: 0.85, critical: 0.95 },
    message: 'Token allocation nearly exhausted'
  }
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

    const body: AlertRequest = await req.json()
    const { action, alertType, alertId, configuration, filters, timeRange } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let response: AlertResponse = {}

    switch (action) {
      case 'check':
        response = await checkForAlerts(supabase, authResult.userId, logger)
        break

      case 'configure':
        if (!configuration) {
          throw new Error('Configuration is required')
        }
        response = await configureAlert(supabase, authResult.userId, configuration)
        break

      case 'acknowledge':
        if (!alertId) {
          throw new Error('Alert ID is required')
        }
        response = await acknowledgeAlert(supabase, authResult.userId, alertId)
        break

      case 'resolve':
        if (!alertId) {
          throw new Error('Alert ID is required')
        }
        response = await resolveAlert(supabase, authResult.userId, alertId)
        break

      case 'get_active':
        response = await getActiveAlerts(supabase, authResult.userId, filters)
        break

      case 'get_history':
        response = await getAlertHistory(supabase, authResult.userId, timeRange, filters)
        break

      default:
        throw new Error(`Unknown action: ${action}`)
    }

    await logger.info('Performance alert request processed', {
      userId: authResult.userId,
      action,
      alertType,
      alertId
    })

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    const logger = createLogger({ requestId: crypto.randomUUID() })
    await logger.logError(error as Error, 'Performance alert error')
    return new Response(JSON.stringify({ 
      error: 'Performance alert request failed',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function checkForAlerts(
  supabase: any,
  userId: string,
  logger: any
): Promise<AlertResponse> {
  const startTime = Date.now()
  const createdAlerts: Alert[] = []

  // Check each alert type
  for (const [type, config] of Object.entries(ALERT_TYPES)) {
    try {
      const metricValue = await getMetricValue(supabase, userId, config.metric)
      
      if (metricValue !== null) {
        // Check against thresholds
        let severity: 'warning' | 'critical' | null = null
        let threshold = 0

        if (config.metric === 'cache_hit_rate' || config.metric === 'quality_score') {
          // Lower is worse
          if (metricValue <= config.defaultThresholds.critical) {
            severity = 'critical'
            threshold = config.defaultThresholds.critical
          } else if (metricValue <= config.defaultThresholds.warning) {
            severity = 'warning'
            threshold = config.defaultThresholds.warning
          }
        } else {
          // Higher is worse
          if (metricValue >= config.defaultThresholds.critical) {
            severity = 'critical'
            threshold = config.defaultThresholds.critical
          } else if (metricValue >= config.defaultThresholds.warning) {
            severity = 'warning'
            threshold = config.defaultThresholds.warning
          }
        }

        if (severity) {
          // Check if alert already exists
          const existingAlert = await checkExistingAlert(supabase, userId, type, severity)
          
          if (!existingAlert) {
            // Create new alert
            const alert = await createAlert(
              supabase,
              userId,
              type,
              severity,
              config.metric,
              threshold,
              metricValue,
              config.message
            )
            createdAlerts.push(alert)
            
            // Send notifications
            await sendAlertNotifications(supabase, userId, alert)
          }
        }
      }
    } catch (error) {
      await logger.logError(error as Error, `Failed to check ${type} alert`)
    }
  }

  // Auto-resolve alerts that no longer meet conditions
  await autoResolveAlerts(supabase, userId)

  await logger.logPerformance('alert_check', startTime, {
    alertsCreated: createdAlerts.length
  })

  return {
    alerts: createdAlerts,
    summary: await getAlertSummary(supabase, userId)
  }
}

async function getMetricValue(
  supabase: any,
  userId: string,
  metric: string
): Promise<number | null> {
  const now = new Date()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  switch (metric) {
    case 'p95_latency': {
      const { data } = await supabase
        .from('ai_analytics_events')
        .select('duration_ms')
        .eq('user_id', userId)
        .gte('timestamp', hourAgo.toISOString())
        .order('duration_ms', { ascending: false })

      if (!data || data.length === 0) return null
      
      const p95Index = Math.floor(data.length * 0.05)
      return data[p95Index]?.duration_ms || null
    }

    case 'cache_hit_rate': {
      const { data } = await supabase
        .from('ai_analytics_events')
        .select('cache_hit')
        .eq('user_id', userId)
        .gte('timestamp', hourAgo.toISOString())

      if (!data || data.length === 0) return null
      
      const hits = data.filter(d => d.cache_hit).length
      return hits / data.length
    }

    case 'error_rate': {
      const { data } = await supabase
        .from('ai_analytics_events')
        .select('success')
        .eq('user_id', userId)
        .gte('timestamp', hourAgo.toISOString())

      if (!data || data.length === 0) return null
      
      const errors = data.filter(d => !d.success).length
      return errors / data.length
    }

    case 'quota_usage': {
      const { data: usage } = await supabase
        .from('ai_usage_tracking')
        .select('tokens_used, tokens_limit')
        .eq('user_id', userId)
        .eq('period_start', new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0])
        .single()

      if (!usage || !usage.tokens_limit) return null
      return usage.tokens_used / usage.tokens_limit
    }

    case 'quality_score': {
      const { data } = await supabase
        .from('ai_quality_metrics')
        .select('prompt_clarity_score, response_relevance_score, code_correctness_score')
        .limit(10)
        .order('created_at', { ascending: false })

      if (!data || data.length === 0) return null
      
      const avgScores = data.map(d => 
        (d.prompt_clarity_score + d.response_relevance_score + d.code_correctness_score) / 3
      )
      return avgScores.reduce((sum, s) => sum + s, 0) / avgScores.length
    }

    case 'daily_cost': {
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const { data } = await supabase
        .from('ai_analytics_events')
        .select('tokens_total')
        .eq('user_id', userId)
        .gte('timestamp', todayStart.toISOString())

      if (!data) return null
      
      const totalTokens = data.reduce((sum, d) => sum + (d.tokens_total || 0), 0)
      return totalTokens * 0.00002 // Rough cost estimate
    }

    case 'requests_per_minute': {
      const minuteAgo = new Date(now.getTime() - 60 * 1000)
      const { count } = await supabase
        .from('ai_analytics_events')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('timestamp', minuteAgo.toISOString())

      return count || 0
    }

    case 'token_usage_percent': {
      const { data: usage } = await supabase
        .from('ai_usage_tracking')
        .select('tokens_used, tokens_limit')
        .eq('user_id', userId)
        .eq('period_start', new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0])
        .single()

      if (!usage || !usage.tokens_limit) return null
      return usage.tokens_used / usage.tokens_limit
    }

    default:
      return null
  }
}

async function checkExistingAlert(
  supabase: any,
  userId: string,
  type: string,
  severity: string
): Promise<boolean> {
  const { data } = await supabase
    .from('ai_performance_alerts')
    .select('id')
    .eq('user_id', userId)
    .eq('alert_type', type)
    .eq('severity', severity)
    .eq('status', 'active')
    .single()

  return !!data
}

async function createAlert(
  supabase: any,
  userId: string,
  type: string,
  severity: string,
  metric: string,
  threshold: number,
  actual: number,
  message: string
): Promise<Alert> {
  const alert = {
    id: crypto.randomUUID(),
    alert_type: type,
    severity,
    metric_name: metric,
    threshold_value: threshold,
    actual_value: actual,
    user_id: userId,
    status: 'active',
    created_at: new Date().toISOString()
  }

  const { error } = await supabase
    .from('ai_performance_alerts')
    .insert(alert)

  if (error) throw error

  return {
    id: alert.id,
    type,
    severity: severity as any,
    status: 'active',
    metric,
    threshold,
    actual,
    message,
    createdAt: alert.created_at
  }
}

async function sendAlertNotifications(
  supabase: any,
  userId: string,
  alert: Alert
): Promise<void> {
  // Get user notification preferences
  const { data: prefs } = await supabase
    .from('user_notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (!prefs || !prefs.performance_alerts_enabled) return

  // Mark notification as sent
  await supabase
    .from('ai_performance_alerts')
    .update({ notification_sent: true })
    .eq('id', alert.id)

  // In production, would send actual notifications
  // For now, just log the notification
  console.log(`Alert notification for user ${userId}:`, alert)
}

async function autoResolveAlerts(
  supabase: any,
  userId: string
): Promise<void> {
  // Get active alerts
  const { data: activeAlerts } = await supabase
    .from('ai_performance_alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')

  if (!activeAlerts) return

  for (const alert of activeAlerts) {
    const currentValue = await getMetricValue(supabase, userId, alert.metric_name)
    
    if (currentValue !== null) {
      const config = ALERT_TYPES[alert.alert_type as keyof typeof ALERT_TYPES]
      if (!config) continue

      let shouldResolve = false

      if (config.metric === 'cache_hit_rate' || config.metric === 'quality_score') {
        // Lower is worse - resolve if improved
        shouldResolve = currentValue > alert.threshold_value * 1.1 // 10% buffer
      } else {
        // Higher is worse - resolve if improved
        shouldResolve = currentValue < alert.threshold_value * 0.9 // 10% buffer
      }

      if (shouldResolve) {
        await supabase
          .from('ai_performance_alerts')
          .update({
            status: 'resolved',
            resolved_at: new Date().toISOString()
          })
          .eq('id', alert.id)
      }
    }
  }
}

async function getAlertSummary(
  supabase: any,
  userId: string
): Promise<any> {
  const { data: alerts } = await supabase
    .from('ai_performance_alerts')
    .select('alert_type, severity, status')
    .eq('user_id', userId)

  if (!alerts) return null

  const summary = {
    total: alerts.length,
    bySeverity: {} as Record<string, number>,
    byType: {} as Record<string, number>,
    byStatus: {} as Record<string, number>
  }

  alerts.forEach(alert => {
    summary.bySeverity[alert.severity] = (summary.bySeverity[alert.severity] || 0) + 1
    summary.byType[alert.alert_type] = (summary.byType[alert.alert_type] || 0) + 1
    summary.byStatus[alert.status] = (summary.byStatus[alert.status] || 0) + 1
  })

  return summary
}

async function configureAlert(
  supabase: any,
  userId: string,
  configuration: AlertConfiguration
): Promise<AlertResponse> {
  // Store alert configuration
  const { error } = await supabase
    .from('alert_configurations')
    .upsert({
      user_id: userId,
      alert_type: configuration.type,
      enabled: configuration.enabled,
      thresholds: configuration.thresholds,
      conditions: configuration.conditions,
      notifications: configuration.notifications,
      updated_at: new Date().toISOString()
    })

  if (error) throw error

  return {
    configuration: [configuration],
    recommendations: generateAlertRecommendations(configuration)
  }
}

async function acknowledgeAlert(
  supabase: any,
  userId: string,
  alertId: string
): Promise<AlertResponse> {
  const { data, error } = await supabase
    .from('ai_performance_alerts')
    .update({
      status: 'acknowledged',
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString()
    })
    .eq('id', alertId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error

  return {
    alerts: [formatAlert(data)]
  }
}

async function resolveAlert(
  supabase: any,
  userId: string,
  alertId: string
): Promise<AlertResponse> {
  const { data, error } = await supabase
    .from('ai_performance_alerts')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString()
    })
    .eq('id', alertId)
    .eq('user_id', userId)
    .select()
    .single()

  if (error) throw error

  return {
    alerts: [formatAlert(data)]
  }
}

async function getActiveAlerts(
  supabase: any,
  userId: string,
  filters?: any
): Promise<AlertResponse> {
  let query = supabase
    .from('ai_performance_alerts')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (filters?.severity) {
    query = query.in('severity', filters.severity)
  }
  if (filters?.types) {
    query = query.in('alert_type', filters.types)
  }
  if (filters?.projectId) {
    query = query.eq('project_id', filters.projectId)
  }

  const { data, error } = await query

  if (error) throw error

  return {
    alerts: data?.map(formatAlert) || [],
    summary: await getAlertSummary(supabase, userId)
  }
}

async function getAlertHistory(
  supabase: any,
  userId: string,
  timeRange?: any,
  filters?: any
): Promise<AlertResponse> {
  const endDate = timeRange?.end || new Date().toISOString()
  const startDate = timeRange?.start || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  let query = supabase
    .from('ai_performance_alerts')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .order('created_at', { ascending: false })

  if (filters?.severity) {
    query = query.in('severity', filters.severity)
  }
  if (filters?.types) {
    query = query.in('alert_type', filters.types)
  }
  if (filters?.status) {
    query = query.in('status', filters.status)
  }

  const { data, error } = await query

  if (error) throw error

  return {
    alerts: data?.map(formatAlert) || [],
    summary: {
      total: data?.length || 0,
      bySeverity: groupBy(data || [], 'severity'),
      byType: groupBy(data || [], 'alert_type'),
      byStatus: groupBy(data || [], 'status')
    }
  }
}

// Helper functions
function formatAlert(data: any): Alert {
  return {
    id: data.id,
    type: data.alert_type,
    severity: data.severity,
    status: data.status,
    metric: data.metric_name,
    threshold: data.threshold_value,
    actual: data.actual_value,
    message: ALERT_TYPES[data.alert_type as keyof typeof ALERT_TYPES]?.message || 'Alert triggered',
    details: data.metadata,
    createdAt: data.created_at,
    acknowledgedAt: data.acknowledged_at,
    resolvedAt: data.resolved_at
  }
}

function groupBy(items: any[], key: string): Record<string, number> {
  return items.reduce((acc, item) => {
    acc[item[key]] = (acc[item[key]] || 0) + 1
    return acc
  }, {})
}

function generateAlertRecommendations(config: AlertConfiguration): string[] {
  const recommendations = []

  // Check threshold appropriateness
  if (config.type === 'high_latency' && config.thresholds.warning && config.thresholds.warning < 1000) {
    recommendations.push('Warning threshold for latency seems very low. Consider increasing to avoid alert fatigue.')
  }

  if (config.type === 'error_spike' && config.thresholds.critical && config.thresholds.critical > 0.2) {
    recommendations.push('Critical error rate threshold is high. Consider lowering to catch issues earlier.')
  }

  // Check notification setup
  if (!config.notifications || config.notifications.channels.length === 0) {
    recommendations.push('No notification channels configured. Alerts may go unnoticed.')
  }

  if (config.notifications?.channels.includes('webhook') && !config.notifications.webhookUrl) {
    recommendations.push('Webhook channel selected but no URL provided.')
  }

  return recommendations
}

// Create alert configuration table
const createAlertConfigTable = `
CREATE TABLE IF NOT EXISTS alert_configurations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type VARCHAR(50) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  thresholds JSONB,
  conditions JSONB,
  notifications JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, alert_type)
);

CREATE INDEX idx_alert_config_user ON alert_configurations(user_id);

-- Create notification preferences table
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  performance_alerts_enabled BOOLEAN DEFAULT true,
  email_notifications BOOLEAN DEFAULT true,
  webhook_notifications BOOLEAN DEFAULT false,
  webhook_url TEXT,
  email_addresses TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);`