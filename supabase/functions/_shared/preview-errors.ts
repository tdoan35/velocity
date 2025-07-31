// Comprehensive error handling system for preview functionality

export enum PreviewErrorCode {
  // Session errors (1xxx)
  SESSION_CREATION_FAILED = 'PREV_1001',
  SESSION_NOT_FOUND = 'PREV_1002',
  SESSION_TIMEOUT = 'PREV_1003',
  SESSION_ALLOCATION_FAILED = 'PREV_1004',
  SESSION_POOL_EXHAUSTED = 'PREV_1005',
  SESSION_WARMUP_FAILED = 'PREV_1006',
  
  // Build errors (2xxx)
  BUILD_FAILED = 'PREV_2001',
  BUILD_TIMEOUT = 'PREV_2002',
  BUNDLE_CREATION_FAILED = 'PREV_2003',
  ASSET_PROCESSING_FAILED = 'PREV_2004',
  DEPENDENCY_RESOLUTION_FAILED = 'PREV_2005',
  BUILD_CACHE_ERROR = 'PREV_2006',
  
  // Device errors (3xxx)
  DEVICE_NOT_SUPPORTED = 'PREV_3001',
  DEVICE_CONFIGURATION_INVALID = 'PREV_3002',
  ORIENTATION_CHANGE_FAILED = 'PREV_3003',
  
  // Network errors (4xxx)
  NETWORK_TIMEOUT = 'PREV_4001',
  WEBSOCKET_CONNECTION_FAILED = 'PREV_4002',
  HOT_RELOAD_FAILED = 'PREV_4003',
  API_REQUEST_FAILED = 'PREV_4004',
  
  // Resource errors (5xxx)
  QUOTA_EXCEEDED = 'PREV_5001',
  MEMORY_LIMIT_EXCEEDED = 'PREV_5002',
  STORAGE_LIMIT_EXCEEDED = 'PREV_5003',
  RATE_LIMIT_EXCEEDED = 'PREV_5004',
  
  // Integration errors (6xxx)
  APPETIZE_API_ERROR = 'PREV_6001',
  SUPABASE_CONNECTION_ERROR = 'PREV_6002',
  AUTHENTICATION_FAILED = 'PREV_6003',
  PERMISSION_DENIED = 'PREV_6004',
  
  // Unknown errors (9xxx)
  UNKNOWN_ERROR = 'PREV_9999'
}

export interface PreviewError extends Error {
  code: PreviewErrorCode
  severity: 'low' | 'medium' | 'high' | 'critical'
  userMessage: string
  technicalDetails?: any
  recoverySteps?: string[]
  canRetry: boolean
  retryAfter?: number // milliseconds
  reportToMonitoring: boolean
}

export class PreviewErrorHandler {
  private static errorMappings = new Map<PreviewErrorCode, {
    severity: PreviewError['severity']
    userMessage: string
    recoverySteps: string[]
    canRetry: boolean
    reportToMonitoring: boolean
  }>([
    // Session errors
    [PreviewErrorCode.SESSION_CREATION_FAILED, {
      severity: 'high',
      userMessage: 'Unable to create preview session',
      recoverySteps: [
        'Check your internet connection',
        'Try refreshing the page',
        'Contact support if the issue persists'
      ],
      canRetry: true,
      reportToMonitoring: true
    }],
    [PreviewErrorCode.SESSION_POOL_EXHAUSTED, {
      severity: 'medium',
      userMessage: 'Preview sessions are currently at capacity',
      recoverySteps: [
        'Wait a few moments and try again',
        'Close any unused preview sessions',
        'Consider upgrading your plan for more concurrent sessions'
      ],
      canRetry: true,
      reportToMonitoring: true
    }],
    [PreviewErrorCode.SESSION_TIMEOUT, {
      severity: 'low',
      userMessage: 'Preview session timed out due to inactivity',
      recoverySteps: [
        'Click "Start Preview" to create a new session'
      ],
      canRetry: true,
      reportToMonitoring: false
    }],
    
    // Build errors
    [PreviewErrorCode.BUILD_FAILED, {
      severity: 'high',
      userMessage: 'Failed to build your application',
      recoverySteps: [
        'Check for syntax errors in your code',
        'Ensure all dependencies are properly installed',
        'Review the build logs for specific errors'
      ],
      canRetry: true,
      reportToMonitoring: true
    }],
    [PreviewErrorCode.BUILD_TIMEOUT, {
      severity: 'medium',
      userMessage: 'Build process took too long to complete',
      recoverySteps: [
        'Try simplifying your application',
        'Remove large assets or dependencies',
        'Contact support for build optimization tips'
      ],
      canRetry: true,
      reportToMonitoring: true
    }],
    
    // Network errors
    [PreviewErrorCode.NETWORK_TIMEOUT, {
      severity: 'medium',
      userMessage: 'Network request timed out',
      recoverySteps: [
        'Check your internet connection',
        'Try again in a few moments',
        'Switch to a more stable network if possible'
      ],
      canRetry: true,
      reportToMonitoring: false
    }],
    [PreviewErrorCode.WEBSOCKET_CONNECTION_FAILED, {
      severity: 'high',
      userMessage: 'Real-time connection failed',
      recoverySteps: [
        'Check if WebSockets are blocked by your firewall',
        'Try disabling browser extensions',
        'Refresh the page to reconnect'
      ],
      canRetry: true,
      reportToMonitoring: true
    }],
    
    // Resource errors
    [PreviewErrorCode.QUOTA_EXCEEDED, {
      severity: 'high',
      userMessage: 'Monthly preview quota exceeded',
      recoverySteps: [
        'Upgrade to a higher tier for more preview minutes',
        'Wait until next billing cycle',
        'Contact sales for custom plans'
      ],
      canRetry: false,
      reportToMonitoring: true
    }],
    [PreviewErrorCode.RATE_LIMIT_EXCEEDED, {
      severity: 'medium',
      userMessage: 'Too many requests, please slow down',
      recoverySteps: [
        'Wait a moment before trying again',
        'Reduce the frequency of your actions'
      ],
      canRetry: true,
      reportToMonitoring: false
    }],
    
    // Integration errors
    [PreviewErrorCode.APPETIZE_API_ERROR, {
      severity: 'critical',
      userMessage: 'Preview service is temporarily unavailable',
      recoverySteps: [
        'Try again in a few minutes',
        'Check our status page for updates',
        'Contact support if the issue persists'
      ],
      canRetry: true,
      reportToMonitoring: true
    }],
    [PreviewErrorCode.AUTHENTICATION_FAILED, {
      severity: 'high',
      userMessage: 'Authentication required',
      recoverySteps: [
        'Sign in to your account',
        'Check if your session has expired',
        'Clear cookies and sign in again'
      ],
      canRetry: false,
      reportToMonitoring: false
    }]
  ])

  static createError(
    code: PreviewErrorCode,
    message?: string,
    technicalDetails?: any
  ): PreviewError {
    const mapping = this.errorMappings.get(code) || {
      severity: 'high',
      userMessage: 'An unexpected error occurred',
      recoverySteps: ['Try refreshing the page', 'Contact support if the issue persists'],
      canRetry: true,
      reportToMonitoring: true
    }

    const error = new Error(message || mapping.userMessage) as PreviewError
    error.code = code
    error.severity = mapping.severity
    error.userMessage = mapping.userMessage
    error.technicalDetails = technicalDetails
    error.recoverySteps = mapping.recoverySteps
    error.canRetry = mapping.canRetry
    error.reportToMonitoring = mapping.reportToMonitoring

    // Add retry delay based on error type
    if (error.canRetry) {
      switch (code) {
        case PreviewErrorCode.RATE_LIMIT_EXCEEDED:
          error.retryAfter = 60000 // 1 minute
          break
        case PreviewErrorCode.SESSION_POOL_EXHAUSTED:
          error.retryAfter = 30000 // 30 seconds
          break
        case PreviewErrorCode.NETWORK_TIMEOUT:
        case PreviewErrorCode.WEBSOCKET_CONNECTION_FAILED:
          error.retryAfter = 5000 // 5 seconds
          break
        default:
          error.retryAfter = 10000 // 10 seconds
      }
    }

    return error
  }

  static isPreviewError(error: any): error is PreviewError {
    return error && 'code' in error && Object.values(PreviewErrorCode).includes(error.code)
  }

  static async handleError(
    error: any,
    context: {
      userId?: string
      projectId?: string
      sessionId?: string
      operation?: string
      metadata?: any
    }
  ): Promise<PreviewError> {
    // Convert to PreviewError if needed
    let previewError: PreviewError
    
    if (this.isPreviewError(error)) {
      previewError = error
    } else {
      // Map common errors to specific preview errors
      const code = this.mapErrorToCode(error)
      previewError = this.createError(code, error.message, {
        originalError: error,
        stack: error.stack
      })
    }

    // Log the error
    await this.logError(previewError, context)

    // Report to monitoring if needed
    if (previewError.reportToMonitoring) {
      await this.reportToMonitoring(previewError, context)
    }

    // Attempt self-healing if applicable
    if (previewError.canRetry && context.operation) {
      await this.attemptSelfHealing(previewError, context)
    }

    return previewError
  }

  private static mapErrorToCode(error: any): PreviewErrorCode {
    const message = error.message?.toLowerCase() || ''
    const code = error.code?.toLowerCase() || ''

    // Network errors
    if (message.includes('network') || message.includes('fetch') || code === 'network_error') {
      return PreviewErrorCode.NETWORK_TIMEOUT
    }

    // Auth errors
    if (message.includes('unauthorized') || message.includes('auth') || code === '401') {
      return PreviewErrorCode.AUTHENTICATION_FAILED
    }

    // Resource errors
    if (message.includes('quota') || message.includes('limit exceeded')) {
      return PreviewErrorCode.QUOTA_EXCEEDED
    }

    // Build errors
    if (message.includes('build') || message.includes('bundle')) {
      return PreviewErrorCode.BUILD_FAILED
    }

    // Session errors
    if (message.includes('session')) {
      return PreviewErrorCode.SESSION_CREATION_FAILED
    }

    // WebSocket errors
    if (message.includes('websocket') || message.includes('realtime')) {
      return PreviewErrorCode.WEBSOCKET_CONNECTION_FAILED
    }

    return PreviewErrorCode.UNKNOWN_ERROR
  }

  private static async logError(
    error: PreviewError,
    context: any
  ): Promise<void> {
    const logEntry = {
      timestamp: new Date().toISOString(),
      errorCode: error.code,
      severity: error.severity,
      message: error.message,
      userMessage: error.userMessage,
      context,
      technicalDetails: error.technicalDetails,
      stack: error.stack
    }

    // Log to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('[PreviewError]', logEntry)
    }

    // Store in database for analysis
    try {
      await this.storeErrorLog(logEntry)
    } catch (e) {
      console.error('Failed to store error log:', e)
    }
  }

  private static async storeErrorLog(logEntry: any): Promise<void> {
    // This will be implemented by the Edge Function
    // For now, just return
    return
  }

  private static async reportToMonitoring(
    error: PreviewError,
    context: any
  ): Promise<void> {
    // Send to monitoring service (e.g., Sentry, DataDog)
    // This is a placeholder for the actual implementation
    const monitoringPayload = {
      error: {
        code: error.code,
        message: error.message,
        severity: error.severity,
        stack: error.stack
      },
      context,
      timestamp: new Date().toISOString()
    }

    // In production, send to monitoring service
    if (process.env.NODE_ENV === 'production') {
      // await sendToMonitoringService(monitoringPayload)
    }
  }

  private static async attemptSelfHealing(
    error: PreviewError,
    context: any
  ): Promise<void> {
    // Implement self-healing strategies based on error type
    switch (error.code) {
      case PreviewErrorCode.SESSION_TIMEOUT:
      case PreviewErrorCode.SESSION_NOT_FOUND:
        // Attempt to create a new session automatically
        console.log('Attempting to create new session after timeout')
        break

      case PreviewErrorCode.WEBSOCKET_CONNECTION_FAILED:
        // Attempt to reconnect WebSocket
        console.log('Attempting to reconnect WebSocket')
        break

      case PreviewErrorCode.BUILD_CACHE_ERROR:
        // Clear cache and retry
        console.log('Clearing build cache and retrying')
        break

      default:
        // No self-healing available
        break
    }
  }
}

// Error recovery strategies
export class ErrorRecoveryManager {
  private static recoveryStrategies = new Map<PreviewErrorCode, () => Promise<boolean>>()

  static registerRecoveryStrategy(
    code: PreviewErrorCode,
    strategy: () => Promise<boolean>
  ): void {
    this.recoveryStrategies.set(code, strategy)
  }

  static async attemptRecovery(error: PreviewError): Promise<boolean> {
    const strategy = this.recoveryStrategies.get(error.code)
    
    if (!strategy) {
      return false
    }

    try {
      return await strategy()
    } catch (e) {
      console.error('Recovery strategy failed:', e)
      return false
    }
  }
}

// Diagnostic information collector
export class PreviewDiagnostics {
  static async collectDiagnosticInfo(
    sessionId?: string,
    includeSystemInfo = true
  ): Promise<any> {
    const diagnostics: any = {
      timestamp: new Date().toISOString(),
      sessionId
    }

    if (includeSystemInfo) {
      diagnostics.system = {
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'N/A',
        platform: typeof navigator !== 'undefined' ? navigator.platform : 'N/A',
        language: typeof navigator !== 'undefined' ? navigator.language : 'N/A',
        cookiesEnabled: typeof navigator !== 'undefined' ? navigator.cookieEnabled : false,
        onLine: typeof navigator !== 'undefined' ? navigator.onLine : true,
        connection: typeof navigator !== 'undefined' ? (navigator as any).connection : undefined
      }
    }

    // Collect performance metrics
    if (typeof performance !== 'undefined') {
      const navigation = performance.getEntriesByType('navigation')[0] as any
      diagnostics.performance = {
        loadTime: navigation?.loadEventEnd - navigation?.loadEventStart,
        domContentLoaded: navigation?.domContentLoadedEventEnd - navigation?.domContentLoadedEventStart,
        responseTime: navigation?.responseEnd - navigation?.requestStart
      }
    }

    // Collect memory info if available
    if (typeof performance !== 'undefined' && (performance as any).memory) {
      diagnostics.memory = (performance as any).memory
    }

    return diagnostics
  }
}