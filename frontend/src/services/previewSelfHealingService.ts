import { supabase } from '@/lib/supabase'
import { sessionPoolService } from './sessionPoolService'
import { toast } from '@/components/ui/use-toast'

export enum RecoveryStrategy {
  RETRY_WITH_BACKOFF = 'retry_with_backoff',
  RECREATE_SESSION = 'recreate_session',
  CLEAR_CACHE = 'clear_cache',
  RECONNECT_WEBSOCKET = 'reconnect_websocket',
  REFRESH_AUTH = 'refresh_auth',
  FALLBACK_DEVICE = 'fallback_device',
  REDUCE_QUALITY = 'reduce_quality'
}

interface RecoveryContext {
  errorCode: string
  sessionId?: string
  projectId?: string
  deviceType?: string
  retryCount: number
  metadata?: any
}

interface RecoveryResult {
  success: boolean
  strategy: RecoveryStrategy
  message: string
  newSessionId?: string
  shouldRetry: boolean
}

export class PreviewSelfHealingService {
  private static instance: PreviewSelfHealingService
  private recoveryInProgress = new Map<string, boolean>()
  private recoveryHistory = new Map<string, RecoveryResult[]>()
  
  // Recovery strategy mappings
  private readonly strategyMap = new Map<string, RecoveryStrategy[]>([
    ['PREV_1001', [RecoveryStrategy.RETRY_WITH_BACKOFF, RecoveryStrategy.RECREATE_SESSION]],
    ['PREV_1002', [RecoveryStrategy.RECREATE_SESSION]],
    ['PREV_1003', [RecoveryStrategy.RECREATE_SESSION]],
    ['PREV_1004', [RecoveryStrategy.FALLBACK_DEVICE, RecoveryStrategy.REDUCE_QUALITY]],
    ['PREV_1005', [RecoveryStrategy.RETRY_WITH_BACKOFF]],
    ['PREV_2001', [RecoveryStrategy.CLEAR_CACHE, RecoveryStrategy.RETRY_WITH_BACKOFF]],
    ['PREV_2002', [RecoveryStrategy.REDUCE_QUALITY, RecoveryStrategy.RETRY_WITH_BACKOFF]],
    ['PREV_4002', [RecoveryStrategy.RECONNECT_WEBSOCKET]],
    ['PREV_6003', [RecoveryStrategy.REFRESH_AUTH]]
  ])

  static getInstance(): PreviewSelfHealingService {
    if (!PreviewSelfHealingService.instance) {
      PreviewSelfHealingService.instance = new PreviewSelfHealingService()
    }
    return PreviewSelfHealingService.instance
  }

  async attemptRecovery(context: RecoveryContext): Promise<RecoveryResult> {
    const recoveryKey = `${context.errorCode}-${context.sessionId || 'global'}`
    
    // Prevent concurrent recovery attempts
    if (this.recoveryInProgress.get(recoveryKey)) {
      return {
        success: false,
        strategy: RecoveryStrategy.RETRY_WITH_BACKOFF,
        message: 'Recovery already in progress',
        shouldRetry: false
      }
    }

    this.recoveryInProgress.set(recoveryKey, true)

    try {
      // Get applicable strategies
      const strategies = this.strategyMap.get(context.errorCode) || [RecoveryStrategy.RETRY_WITH_BACKOFF]
      
      // Try each strategy in order
      for (const strategy of strategies) {
        const result = await this.executeStrategy(strategy, context)
        
        // Record recovery attempt
        this.recordRecoveryAttempt(recoveryKey, result)
        
        if (result.success) {
          this.notifyRecoverySuccess(result)
          return result
        }
      }

      // All strategies failed
      return {
        success: false,
        strategy: strategies[strategies.length - 1],
        message: 'All recovery strategies exhausted',
        shouldRetry: false
      }

    } catch (error) {
      console.error('Recovery error:', error)
      return {
        success: false,
        strategy: RecoveryStrategy.RETRY_WITH_BACKOFF,
        message: `Recovery failed: ${error.message}`,
        shouldRetry: false
      }
    } finally {
      this.recoveryInProgress.set(recoveryKey, false)
    }
  }

  private async executeStrategy(
    strategy: RecoveryStrategy,
    context: RecoveryContext
  ): Promise<RecoveryResult> {
    console.log(`Executing recovery strategy: ${strategy}`)

    switch (strategy) {
      case RecoveryStrategy.RETRY_WITH_BACKOFF:
        return await this.retryWithBackoff(context)
      
      case RecoveryStrategy.RECREATE_SESSION:
        return await this.recreateSession(context)
      
      case RecoveryStrategy.CLEAR_CACHE:
        return await this.clearCache(context)
      
      case RecoveryStrategy.RECONNECT_WEBSOCKET:
        return await this.reconnectWebSocket(context)
      
      case RecoveryStrategy.REFRESH_AUTH:
        return await this.refreshAuth(context)
      
      case RecoveryStrategy.FALLBACK_DEVICE:
        return await this.fallbackDevice(context)
      
      case RecoveryStrategy.REDUCE_QUALITY:
        return await this.reduceQuality(context)
      
      default:
        return {
          success: false,
          strategy,
          message: 'Unknown recovery strategy',
          shouldRetry: false
        }
    }
  }

  private async retryWithBackoff(context: RecoveryContext): Promise<RecoveryResult> {
    const backoffMs = Math.min(1000 * Math.pow(2, context.retryCount), 30000)
    
    await new Promise(resolve => setTimeout(resolve, backoffMs))
    
    return {
      success: true,
      strategy: RecoveryStrategy.RETRY_WITH_BACKOFF,
      message: `Waited ${backoffMs}ms before retry`,
      shouldRetry: true
    }
  }

  private async recreateSession(context: RecoveryContext): Promise<RecoveryResult> {
    try {
      // Release old session if exists
      if (context.sessionId) {
        await sessionPoolService.releaseSession(context.sessionId)
      }

      // Create new session
      const newSession = await sessionPoolService.allocateSession(
        context.projectId!,
        context.deviceType || 'iphone15pro',
        'ios',
        'high'
      )

      return {
        success: true,
        strategy: RecoveryStrategy.RECREATE_SESSION,
        message: 'Created new preview session',
        newSessionId: newSession.sessionId,
        shouldRetry: true
      }
    } catch (error) {
      return {
        success: false,
        strategy: RecoveryStrategy.RECREATE_SESSION,
        message: `Failed to recreate session: ${error.message}`,
        shouldRetry: false
      }
    }
  }

  private async clearCache(context: RecoveryContext): Promise<RecoveryResult> {
    try {
      // Clear build cache
      const { error } = await supabase.functions.invoke('build-preview/clear-cache', {
        body: { projectId: context.projectId }
      })

      if (error) throw error

      // Clear local storage cache
      if (typeof window !== 'undefined') {
        const keys = Object.keys(localStorage).filter(key => 
          key.startsWith('preview-cache-') || key.startsWith('build-cache-')
        )
        keys.forEach(key => localStorage.removeItem(key))
      }

      return {
        success: true,
        strategy: RecoveryStrategy.CLEAR_CACHE,
        message: 'Cleared preview cache',
        shouldRetry: true
      }
    } catch (error) {
      return {
        success: false,
        strategy: RecoveryStrategy.CLEAR_CACHE,
        message: `Failed to clear cache: ${error.message}`,
        shouldRetry: false
      }
    }
  }

  private async reconnectWebSocket(context: RecoveryContext): Promise<RecoveryResult> {
    try {
      // Get all subscriptions
      const subscriptions = supabase.getSubscriptions()
      
      // Remove all subscriptions
      for (const subscription of subscriptions) {
        await supabase.removeSubscription(subscription)
      }

      // Wait for cleanup
      await new Promise(resolve => setTimeout(resolve, 1000))

      // Reconnect
      const channel = supabase.channel(`preview-${context.sessionId}`)
        .on('presence', { event: 'sync' }, () => {
          console.log('WebSocket reconnected')
        })
        .subscribe()

      // Wait for connection
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 5000)
        
        channel.on('system', { event: 'connected' }, () => {
          clearTimeout(timeout)
          resolve(true)
        })
      })

      return {
        success: true,
        strategy: RecoveryStrategy.RECONNECT_WEBSOCKET,
        message: 'WebSocket reconnected',
        shouldRetry: true
      }
    } catch (error) {
      return {
        success: false,
        strategy: RecoveryStrategy.RECONNECT_WEBSOCKET,
        message: `Failed to reconnect: ${error.message}`,
        shouldRetry: false
      }
    }
  }

  private async refreshAuth(context: RecoveryContext): Promise<RecoveryResult> {
    try {
      // Refresh session
      const { data, error } = await supabase.auth.refreshSession()
      
      if (error) throw error

      if (data.session) {
        // Update auth token in localStorage
        localStorage.setItem('supabase.auth.token', data.session.access_token)
        
        return {
          success: true,
          strategy: RecoveryStrategy.REFRESH_AUTH,
          message: 'Authentication refreshed',
          shouldRetry: true
        }
      }

      return {
        success: false,
        strategy: RecoveryStrategy.REFRESH_AUTH,
        message: 'No valid session found',
        shouldRetry: false
      }
    } catch (error) {
      return {
        success: false,
        strategy: RecoveryStrategy.REFRESH_AUTH,
        message: `Auth refresh failed: ${error.message}`,
        shouldRetry: false
      }
    }
  }

  private async fallbackDevice(context: RecoveryContext): Promise<RecoveryResult> {
    const fallbackDevices = {
      'iphone15pro': 'iphone14',
      'iphone14': 'iphone13',
      'ipadpro11': 'ipadair',
      'pixel8pro': 'pixel7',
      'galaxys23': 'galaxys22'
    }

    const fallbackDevice = fallbackDevices[context.deviceType || ''] || 'iphone13'

    try {
      // Try to allocate session with fallback device
      const newSession = await sessionPoolService.allocateSession(
        context.projectId!,
        fallbackDevice,
        fallbackDevice.includes('iphone') || fallbackDevice.includes('ipad') ? 'ios' : 'android',
        'medium'
      )

      return {
        success: true,
        strategy: RecoveryStrategy.FALLBACK_DEVICE,
        message: `Using fallback device: ${fallbackDevice}`,
        newSessionId: newSession.sessionId,
        shouldRetry: true
      }
    } catch (error) {
      return {
        success: false,
        strategy: RecoveryStrategy.FALLBACK_DEVICE,
        message: `Fallback device failed: ${error.message}`,
        shouldRetry: false
      }
    }
  }

  private async reduceQuality(context: RecoveryContext): Promise<RecoveryResult> {
    try {
      // Update quality settings
      const { error } = await supabase.functions.invoke('preview-optimizer/adaptive-quality', {
        body: {
          sessionId: context.sessionId,
          networkQuality: 'poor' // Force lowest quality
        }
      })

      if (error) throw error

      // Update local settings
      if (typeof window !== 'undefined') {
        localStorage.setItem('preview-quality-override', 'low')
      }

      return {
        success: true,
        strategy: RecoveryStrategy.REDUCE_QUALITY,
        message: 'Reduced preview quality for better performance',
        shouldRetry: true
      }
    } catch (error) {
      return {
        success: false,
        strategy: RecoveryStrategy.REDUCE_QUALITY,
        message: `Quality reduction failed: ${error.message}`,
        shouldRetry: false
      }
    }
  }

  private recordRecoveryAttempt(key: string, result: RecoveryResult) {
    const history = this.recoveryHistory.get(key) || []
    history.push({
      ...result,
      timestamp: new Date().toISOString()
    } as any)
    
    // Keep only last 10 attempts
    if (history.length > 10) {
      history.shift()
    }
    
    this.recoveryHistory.set(key, history)
  }

  private notifyRecoverySuccess(result: RecoveryResult) {
    toast({
      title: 'Recovery Successful',
      description: result.message,
      duration: 3000
    })
  }

  // Public method to check if recovery is recommended
  shouldAttemptRecovery(errorCode: string, retryCount: number): boolean {
    // Don't retry after 3 attempts
    if (retryCount >= 3) return false
    
    // Check if we have a strategy for this error
    return this.strategyMap.has(errorCode)
  }

  // Get recovery history for diagnostics
  getRecoveryHistory(errorCode?: string): RecoveryResult[] {
    if (errorCode) {
      return this.recoveryHistory.get(errorCode) || []
    }
    
    // Return all history
    const allHistory: RecoveryResult[] = []
    this.recoveryHistory.forEach(history => {
      allHistory.push(...history)
    })
    return allHistory
  }

  // Clear recovery history
  clearHistory() {
    this.recoveryHistory.clear()
  }
}

// Export singleton instance
export const previewSelfHealingService = PreviewSelfHealingService.getInstance()