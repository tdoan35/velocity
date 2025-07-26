// Quota alert system for proactive notifications
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { quotaManager } from './quota-manager.ts'
import { createLogger } from './logger.ts'

interface AlertThreshold {
  percentage: number
  type: 'warning' | 'critical' | 'info'
  message: string
  actions: string[]
}

interface AlertConfig {
  feature: string
  thresholds: AlertThreshold[]
  cooldownMinutes: number
  channels: ('email' | 'in_app' | 'webhook')[]
}

interface QuotaAlert {
  id: string
  userId: string
  type: string
  severity: 'info' | 'warning' | 'critical'
  message: string
  details: any
  actions: string[]
  createdAt: string
  acknowledgedAt?: string
}

export class QuotaAlertSystem {
  private supabase: any
  private logger: any
  private alertConfigs: Map<string, AlertConfig> = new Map()
  private recentAlerts: Map<string, number> = new Map() // userId:alertType -> timestamp

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    this.logger = createLogger({ context: 'QuotaAlerts' })
    this.initializeAlertConfigs()
  }

  // Check and send alerts for a user
  async checkAndAlert(userId: string): Promise<void> {
    try {
      // Get current usage stats
      const stats = await quotaManager.getUsageStats(userId)
      
      // Check token usage
      await this.checkTokenAlerts(userId, stats)
      
      // Check request usage
      await this.checkRequestAlerts(userId, stats)
      
      // Check approaching period end
      await this.checkPeriodEndAlert(userId, stats)

      // Check feature-specific usage
      await this.checkFeatureAlerts(userId, stats)

    } catch (error) {
      await this.logger.error('Alert check error', {
        userId,
        error: error.message
      })
    }
  }

  // Send a custom alert
  async sendCustomAlert(
    userId: string,
    type: string,
    severity: 'info' | 'warning' | 'critical',
    message: string,
    details?: any,
    actions?: string[]
  ): Promise<void> {
    try {
      const alert: QuotaAlert = {
        id: crypto.randomUUID(),
        userId,
        type,
        severity,
        message,
        details: details || {},
        actions: actions || this.getDefaultActions(type, severity),
        createdAt: new Date().toISOString()
      }

      // Store alert
      await this.storeAlert(alert)

      // Send notifications
      await this.sendNotifications(userId, alert)

      await this.logger.info('Custom alert sent', {
        userId,
        type,
        severity
      })

    } catch (error) {
      await this.logger.error('Custom alert error', {
        userId,
        type,
        error: error.message
      })
    }
  }

  // Get active alerts for a user
  async getActiveAlerts(userId: string): Promise<QuotaAlert[]> {
    try {
      const { data, error } = await this.supabase
        .from('quota_alerts')
        .select('*')
        .eq('user_id', userId)
        .is('acknowledged_at', null)
        .order('created_at', { ascending: false })

      if (error) throw error

      return data || []

    } catch (error) {
      await this.logger.error('Get alerts error', {
        userId,
        error: error.message
      })
      return []
    }
  }

  // Acknowledge an alert
  async acknowledgeAlert(userId: string, alertId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('quota_alerts')
        .update({ 
          acknowledged_at: new Date().toISOString(),
          acknowledged: true 
        })
        .eq('id', alertId)
        .eq('user_id', userId)

      if (error) throw error

      await this.logger.info('Alert acknowledged', {
        userId,
        alertId
      })

    } catch (error) {
      await this.logger.error('Acknowledge alert error', {
        userId,
        alertId,
        error: error.message
      })
      throw error
    }
  }

  // Get alert statistics
  async getAlertStats(userId: string): Promise<any> {
    try {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: alerts } = await this.supabase
        .from('quota_alerts')
        .select('type, severity, created_at, acknowledged_at')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString())

      const stats = {
        total: alerts?.length || 0,
        bySeverity: this.groupBySeverity(alerts || []),
        byType: this.groupByType(alerts || []),
        averageAcknowledgeTime: this.calculateAvgAckTime(alerts || []),
        unacknowledged: alerts?.filter(a => !a.acknowledged_at).length || 0
      }

      return stats

    } catch (error) {
      await this.logger.error('Get alert stats error', {
        userId,
        error: error.message
      })
      return null
    }
  }

  private initializeAlertConfigs() {
    // Token usage alerts
    this.alertConfigs.set('token_usage', {
      feature: 'tokens',
      thresholds: [
        {
          percentage: 50,
          type: 'info',
          message: 'You have used 50% of your monthly token quota',
          actions: ['View usage details', 'Optimize requests']
        },
        {
          percentage: 80,
          type: 'warning',
          message: 'You have used 80% of your monthly token quota',
          actions: ['View usage details', 'Upgrade plan', 'Enable quota fallbacks']
        },
        {
          percentage: 90,
          type: 'critical',
          message: 'You have used 90% of your monthly token quota',
          actions: ['Upgrade plan', 'Purchase token pack', 'Review usage patterns']
        },
        {
          percentage: 100,
          type: 'critical',
          message: 'You have reached your monthly token quota limit',
          actions: ['Upgrade plan immediately', 'Wait for reset', 'Contact support']
        }
      ],
      cooldownMinutes: 60,
      channels: ['email', 'in_app']
    })

    // Request usage alerts
    this.alertConfigs.set('request_usage', {
      feature: 'requests',
      thresholds: [
        {
          percentage: 70,
          type: 'info',
          message: 'You have used 70% of your daily request quota',
          actions: ['View usage patterns', 'Optimize request frequency']
        },
        {
          percentage: 90,
          type: 'warning',
          message: 'You have used 90% of your daily request quota',
          actions: ['Reduce request frequency', 'Batch requests', 'Upgrade plan']
        },
        {
          percentage: 100,
          type: 'critical',
          message: 'Daily request limit reached',
          actions: ['Wait for daily reset', 'Upgrade for higher limits']
        }
      ],
      cooldownMinutes: 30,
      channels: ['in_app']
    })

    // Feature-specific alerts
    this.alertConfigs.set('feature_limit', {
      feature: 'features',
      thresholds: [
        {
          percentage: 100,
          type: 'warning',
          message: 'Feature limit reached',
          actions: ['Upgrade to access this feature', 'Try alternative features']
        }
      ],
      cooldownMinutes: 120,
      channels: ['in_app']
    })
  }

  private async checkTokenAlerts(userId: string, stats: any): Promise<void> {
    const config = this.alertConfigs.get('token_usage')!
    const usage = stats.currentPeriod.tokens

    if (usage.limit === -1) return // Unlimited

    const percentUsed = usage.percentUsed

    for (const threshold of config.thresholds) {
      if (percentUsed >= threshold.percentage) {
        const alertKey = `${userId}:tokens_${threshold.percentage}`
        
        if (!this.shouldSendAlert(alertKey, config.cooldownMinutes)) {
          continue
        }

        await this.sendCustomAlert(
          userId,
          `tokens_${threshold.percentage}`,
          threshold.type as any,
          threshold.message,
          {
            used: usage.used,
            limit: usage.limit,
            remaining: usage.remaining,
            percentUsed: percentUsed.toFixed(1),
            periodEnd: stats.currentPeriod.end
          },
          threshold.actions
        )

        this.recordAlertSent(alertKey)
        break // Only send highest threshold
      }
    }
  }

  private async checkRequestAlerts(userId: string, stats: any): Promise<void> {
    const config = this.alertConfigs.get('request_usage')!
    const usage = stats.currentPeriod.requests

    if (usage.limit === -1) return // Unlimited

    const percentUsed = usage.percentUsed

    for (const threshold of config.thresholds) {
      if (percentUsed >= threshold.percentage) {
        const alertKey = `${userId}:requests_${threshold.percentage}`
        
        if (!this.shouldSendAlert(alertKey, config.cooldownMinutes)) {
          continue
        }

        await this.sendCustomAlert(
          userId,
          `requests_${threshold.percentage}`,
          threshold.type as any,
          threshold.message,
          {
            used: usage.used,
            limit: usage.limit,
            remaining: usage.remaining,
            percentUsed: percentUsed.toFixed(1)
          },
          threshold.actions
        )

        this.recordAlertSent(alertKey)
        break
      }
    }
  }

  private async checkPeriodEndAlert(userId: string, stats: any): Promise<void> {
    const periodEnd = new Date(stats.currentPeriod.end)
    const now = new Date()
    const daysUntilReset = Math.ceil((periodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilReset <= 3 && stats.currentPeriod.tokens.percentUsed > 70) {
      const alertKey = `${userId}:period_end_${periodEnd.toISOString().substring(0, 10)}`
      
      if (!this.shouldSendAlert(alertKey, 1440)) { // 24 hour cooldown
        return
      }

      await this.sendCustomAlert(
        userId,
        'period_ending',
        'info',
        `Your billing period ends in ${daysUntilReset} days`,
        {
          periodEnd: stats.currentPeriod.end,
          tokensRemaining: stats.currentPeriod.tokens.remaining,
          requestsRemaining: stats.currentPeriod.requests.remaining
        },
        ['Review usage', 'Plan for next period', 'Set up auto-renewal']
      )

      this.recordAlertSent(alertKey)
    }
  }

  private async checkFeatureAlerts(userId: string, stats: any): Promise<void> {
    // Check for feature-specific usage patterns
    const breakdown = stats.currentPeriod.breakdown

    // Alert if one feature is consuming disproportionate resources
    const totalRequests = Object.values(breakdown).reduce((sum: number, count: any) => sum + count, 0) as number
    
    for (const [feature, count] of Object.entries(breakdown)) {
      const percentage = (count as number / totalRequests) * 100
      
      if (percentage > 60) {
        const alertKey = `${userId}:feature_heavy_${feature}`
        
        if (!this.shouldSendAlert(alertKey, 720)) { // 12 hour cooldown
          continue
        }

        await this.sendCustomAlert(
          userId,
          'feature_heavy_usage',
          'info',
          `${feature} is using ${percentage.toFixed(0)}% of your requests`,
          {
            feature,
            count,
            percentage: percentage.toFixed(1),
            totalRequests
          },
          ['Optimize ' + feature + ' usage', 'Review implementation', 'Consider caching']
        )

        this.recordAlertSent(alertKey)
      }
    }
  }

  private async storeAlert(alert: QuotaAlert): Promise<void> {
    const { error } = await this.supabase
      .from('quota_alerts')
      .insert({
        id: alert.id,
        user_id: alert.userId,
        alert_type: alert.type,
        severity: alert.severity,
        message: alert.message,
        details: alert.details,
        actions: alert.actions,
        created_at: alert.createdAt,
        notification_sent: true
      })

    if (error) throw error
  }

  private async sendNotifications(userId: string, alert: QuotaAlert): Promise<void> {
    const config = this.getConfigForAlert(alert.type)
    const channels = config?.channels || ['in_app']

    for (const channel of channels) {
      switch (channel) {
        case 'in_app':
          await this.sendInAppNotification(userId, alert)
          break
        case 'email':
          if (alert.severity !== 'info') {
            await this.sendEmailNotification(userId, alert)
          }
          break
        case 'webhook':
          await this.sendWebhookNotification(userId, alert)
          break
      }
    }
  }

  private async sendInAppNotification(userId: string, alert: QuotaAlert): Promise<void> {
    // In-app notifications would be handled by the frontend
    // Store in a real-time enabled table
    await this.supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type: 'quota_alert',
        title: this.getAlertTitle(alert),
        message: alert.message,
        severity: alert.severity,
        data: alert,
        read: false
      })
  }

  private async sendEmailNotification(userId: string, alert: QuotaAlert): Promise<void> {
    // Email notifications would integrate with an email service
    // For now, log the intent
    await this.logger.info('Email notification queued', {
      userId,
      alertType: alert.type,
      severity: alert.severity
    })
  }

  private async sendWebhookNotification(userId: string, alert: QuotaAlert): Promise<void> {
    // Webhook notifications for integrations
    // Would send to user-configured webhook URL
    await this.logger.info('Webhook notification sent', {
      userId,
      alertType: alert.type
    })
  }

  private shouldSendAlert(key: string, cooldownMinutes: number): boolean {
    const lastSent = this.recentAlerts.get(key)
    if (!lastSent) return true

    const cooldownMs = cooldownMinutes * 60 * 1000
    return Date.now() - lastSent > cooldownMs
  }

  private recordAlertSent(key: string): void {
    this.recentAlerts.set(key, Date.now())
    
    // Clean up old entries
    if (this.recentAlerts.size > 1000) {
      const oldest = Array.from(this.recentAlerts.entries())
        .sort(([, a], [, b]) => a - b)
        .slice(0, 100)
      
      oldest.forEach(([key]) => this.recentAlerts.delete(key))
    }
  }

  private getConfigForAlert(type: string): AlertConfig | undefined {
    for (const config of this.alertConfigs.values()) {
      if (type.startsWith(config.feature)) {
        return config
      }
    }
    return undefined
  }

  private getDefaultActions(type: string, severity: string): string[] {
    if (severity === 'critical') {
      return ['Upgrade plan', 'Contact support', 'View usage']
    } else if (severity === 'warning') {
      return ['View usage', 'Optimize requests', 'Consider upgrading']
    } else {
      return ['View details', 'Dismiss']
    }
  }

  private getAlertTitle(alert: QuotaAlert): string {
    const titles = {
      info: 'Usage Update',
      warning: 'Usage Warning',
      critical: 'Urgent: Quota Alert'
    }
    return titles[alert.severity] || 'Quota Notification'
  }

  private groupBySeverity(alerts: any[]): Record<string, number> {
    return alerts.reduce((acc, alert) => {
      acc[alert.severity] = (acc[alert.severity] || 0) + 1
      return acc
    }, {})
  }

  private groupByType(alerts: any[]): Record<string, number> {
    return alerts.reduce((acc, alert) => {
      acc[alert.type] = (acc[alert.type] || 0) + 1
      return acc
    }, {})
  }

  private calculateAvgAckTime(alerts: any[]): number {
    const ackedAlerts = alerts.filter(a => a.acknowledged_at)
    if (ackedAlerts.length === 0) return 0

    const totalTime = ackedAlerts.reduce((sum, alert) => {
      const created = new Date(alert.created_at).getTime()
      const acked = new Date(alert.acknowledged_at).getTime()
      return sum + (acked - created)
    }, 0)

    return Math.round(totalTime / ackedAlerts.length / 1000 / 60) // Minutes
  }
}

// Export singleton instance
export const quotaAlerts = new QuotaAlertSystem()