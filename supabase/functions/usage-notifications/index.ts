// Supabase Edge Function for usage notifications and alerts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'
import { quotaAlerts } from '../_shared/quota-alerts.ts'
import { quotaManager } from '../_shared/quota-manager.ts'
import { progressiveDegradation } from '../_shared/progressive-degradation.ts'

interface NotificationRequest {
  action: 'check_alerts' | 'get_alerts' | 'acknowledge' | 'get_stats' | 'get_recommendations' | 'set_preferences'
  alertId?: string
  preferences?: {
    emailAlerts?: boolean
    alertThresholds?: Record<string, number>
    degradationPreferences?: any
  }
}

interface NotificationResponse {
  action: string
  success: boolean
  data?: any
  message?: string
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

    const body: NotificationRequest = await req.json()
    const { action, alertId, preferences } = body

    let response: NotificationResponse = {
      action,
      success: false
    }

    switch (action) {
      case 'check_alerts':
        await quotaAlerts.checkAndAlert(authResult.userId)
        const alerts = await quotaAlerts.getActiveAlerts(authResult.userId)
        response.success = true
        response.data = {
          activeAlerts: alerts,
          count: alerts.length
        }
        break

      case 'get_alerts':
        const activeAlerts = await quotaAlerts.getActiveAlerts(authResult.userId)
        const stats = await quotaAlerts.getAlertStats(authResult.userId)
        response.success = true
        response.data = {
          active: activeAlerts,
          stats
        }
        break

      case 'acknowledge':
        if (!alertId) {
          throw new Error('Alert ID required')
        }
        await quotaAlerts.acknowledgeAlert(authResult.userId, alertId)
        response.success = true
        response.message = 'Alert acknowledged'
        break

      case 'get_stats':
        const usageStats = await quotaManager.getUsageStats(authResult.userId)
        const alertStats = await quotaAlerts.getAlertStats(authResult.userId)
        const degradationPatterns = await progressiveDegradation.analyzeDegradationPatterns(authResult.userId)
        
        response.success = true
        response.data = {
          usage: usageStats,
          alerts: alertStats,
          degradation: degradationPatterns,
          recommendations: generateRecommendations(usageStats, alertStats, degradationPatterns)
        }
        break

      case 'get_recommendations':
        const usage = await quotaManager.getUsageStats(authResult.userId)
        const recommendations = await generateDetailedRecommendations(authResult.userId, usage)
        response.success = true
        response.data = recommendations
        break

      case 'set_preferences':
        if (!preferences) {
          throw new Error('Preferences required')
        }
        await setUserPreferences(authResult.userId, preferences)
        response.success = true
        response.message = 'Preferences updated'
        break

      default:
        throw new Error(`Unknown action: ${action}`)
    }

    await logger.info('Notification action completed', {
      action,
      success: response.success
    })

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    const logger = createLogger({ requestId: crypto.randomUUID() })
    await logger.error('Notification error', { error: error.message })
    
    return new Response(JSON.stringify({ 
      error: 'Notification operation failed',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function generateRecommendations(usage: any, alerts: any, patterns: any): string[] {
  const recommendations = []

  // Usage-based recommendations
  if (usage.currentPeriod.tokens.percentUsed > 80) {
    recommendations.push('Consider upgrading your plan for more tokens')
  }

  if (usage.currentPeriod.requests.percentUsed > 90) {
    recommendations.push('Optimize request frequency to avoid hitting limits')
  }

  // Alert-based recommendations
  if (alerts.unacknowledged > 5) {
    recommendations.push('Review and acknowledge pending alerts')
  }

  if (alerts.bySeverity?.critical > 0) {
    recommendations.push('Address critical alerts immediately')
  }

  // Pattern-based recommendations
  if (patterns?.averageDegradationLevel > 2) {
    recommendations.push('Your requests frequently require degradation - consider upgrading')
  }

  if (patterns?.mostDegradedFeatures?.includes('code_generation')) {
    recommendations.push('Code generation is hitting limits - try smaller, focused requests')
  }

  // Time-based recommendations
  const periodEnd = new Date(usage.currentPeriod.end)
  const daysRemaining = Math.ceil((periodEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  
  if (daysRemaining < 7 && usage.currentPeriod.tokens.percentUsed < 50) {
    recommendations.push('You have unused tokens expiring soon - make the most of them')
  }

  return recommendations
}

async function generateDetailedRecommendations(userId: string, usage: any): Promise<any> {
  const recommendations = {
    immediate: [],
    optimization: [],
    upgrade: [],
    tips: []
  }

  // Immediate actions
  if (usage.currentPeriod.tokens.remaining < 10000) {
    recommendations.immediate.push({
      title: 'Low token balance',
      description: 'You have less than 10,000 tokens remaining',
      action: 'Consider purchasing a token pack or upgrading',
      priority: 'high'
    })
  }

  // Optimization suggestions
  const breakdown = usage.currentPeriod.breakdown
  const totalRequests = Object.values(breakdown).reduce((sum: number, val: any) => sum + val, 0)
  
  for (const [feature, count] of Object.entries(breakdown)) {
    const percentage = (count as number / totalRequests) * 100
    if (percentage > 40) {
      recommendations.optimization.push({
        title: `Optimize ${feature} usage`,
        description: `${feature} accounts for ${percentage.toFixed(0)}% of your requests`,
        action: 'Consider caching or batching these requests',
        priority: 'medium'
      })
    }
  }

  // Upgrade recommendations
  const tier = usage.subscription.tier
  if (tier === 'free' && usage.currentPeriod.tokens.percentUsed > 70) {
    recommendations.upgrade.push({
      title: 'Upgrade to Starter',
      description: 'Get 5x more tokens and advanced features',
      action: 'View Starter plan benefits',
      priority: 'medium'
    })
  }

  if (tier === 'starter' && totalRequests > 800) {
    recommendations.upgrade.push({
      title: 'Consider Pro plan',
      description: 'Unlock team collaboration and priority generation',
      action: 'Compare Pro features',
      priority: 'low'
    })
  }

  // General tips
  recommendations.tips.push({
    title: 'Use progressive degradation',
    description: 'Enable automatic request optimization when approaching limits',
    action: 'Configure degradation preferences'
  })

  recommendations.tips.push({
    title: 'Monitor peak usage times',
    description: 'Schedule heavy operations during off-peak hours',
    action: 'View usage patterns'
  })

  return recommendations
}

async function setUserPreferences(userId: string, preferences: any): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Update notification preferences
  const { error } = await supabase
    .from('user_preferences')
    .upsert({
      user_id: userId,
      email_alerts: preferences.emailAlerts ?? true,
      alert_thresholds: preferences.alertThresholds || {
        tokens: 80,
        requests: 90
      },
      degradation_preferences: preferences.degradationPreferences || {
        acceptableDegradation: 'moderate',
        prioritizeQuality: true
      },
      updated_at: new Date().toISOString()
    })

  if (error) throw error

  // Apply degradation preferences
  if (preferences.degradationPreferences) {
    await progressiveDegradation.setUserPreferences(
      userId,
      preferences.degradationPreferences
    )
  }
}