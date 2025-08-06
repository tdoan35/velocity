// Enhanced logging utility for Edge Functions with structured data and analytics integration
import { createClient } from '@supabase/supabase-js'

interface LogMetadata {
  userId?: string
  projectId?: string
  requestId?: string
  duration?: number
  tokenCount?: number
  error?: any
  analyticsEvent?: AnalyticsEvent
  [key: string]: any
}

interface AnalyticsEvent {
  eventType: string
  duration?: number
  tokens?: { input: number; output: number }
  quality?: number
  cacheHit?: boolean
  success?: boolean
  error?: string
}

class Logger {
  private supabase: any
  private functionName: string
  private requestId: string

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
    this.functionName = Deno.env.get('SUPABASE_FUNCTION_NAME') || 'unknown'
    this.requestId = crypto.randomUUID()
  }

  // Set request context
  setRequestContext(requestId?: string) {
    this.requestId = requestId || crypto.randomUUID()
  }

  async log(level: string, message: string, metadata?: LogMetadata) {
    const timestamp = new Date().toISOString()
    const structuredLog = {
      level,
      message,
      metadata: {
        ...metadata,
        requestId: this.requestId,
        functionName: this.functionName,
        environment: Deno.env.get('DENO_ENV') || 'production'
      },
      function_name: this.functionName,
      request_id: this.requestId,
      created_at: timestamp
    }

    try {
      // Store in database for persistence
      await this.supabase.from('edge_function_logs').insert(structuredLog)
      
      // Track analytics event if applicable
      if (metadata?.analyticsEvent && metadata?.userId) {
        await this.trackAnalytics(metadata.userId, metadata.analyticsEvent)
      }
    } catch (error) {
      console.error('Logging error:', error)
    }

    // Console output with structured format
    const consoleOutput = {
      timestamp,
      level,
      message,
      ...structuredLog.metadata
    }
    
    console[level](JSON.stringify(consoleOutput))
  }

  async info(message: string, metadata?: LogMetadata) {
    await this.log('info', message, metadata)
  }

  async warn(message: string, metadata?: LogMetadata) {
    await this.log('warn', message, metadata)
  }

  async error(message: string, metadata?: LogMetadata) {
    await this.log('error', message, metadata)
  }

  async debug(message: string, metadata?: LogMetadata) {
    if (Deno.env.get('DEBUG') === 'true') {
      await this.log('debug', message, metadata)
    }
  }

  // Performance logging helper
  async logPerformance(operation: string, startTime: number, metadata?: LogMetadata) {
    const duration = Date.now() - startTime
    await this.info(`${operation} completed`, {
      ...metadata,
      duration,
      performance: {
        operation,
        durationMs: duration,
        timestamp: new Date().toISOString()
      }
    })
  }

  // API call logging helper
  async logApiCall(
    service: string,
    operation: string,
    success: boolean,
    metadata?: LogMetadata
  ) {
    const level = success ? 'info' : 'error'
    await this.log(level, `${service} API call: ${operation}`, {
      ...metadata,
      api: {
        service,
        operation,
        success,
        timestamp: new Date().toISOString()
      }
    })
  }

  // Track analytics event
  private async trackAnalytics(userId: string, event: AnalyticsEvent) {
    try {
      await this.supabase.rpc('track_ai_event', {
        p_event_type: event.eventType,
        p_user_id: userId,
        p_project_id: null, // Can be added from metadata
        p_duration_ms: event.duration,
        p_tokens_input: event.tokens?.input,
        p_tokens_output: event.tokens?.output,
        p_quality_score: event.quality,
        p_cache_hit: event.cacheHit,
        p_metadata: {
          function_name: this.functionName,
          success: event.success,
          error: event.error
        }
      })
    } catch (error) {
      console.error('Analytics tracking error:', error)
    }
  }

  // Structured error logging
  async logError(error: Error, context: string, metadata?: LogMetadata) {
    const errorInfo = {
      name: error.name,
      message: error.message,
      stack: error.stack,
      context
    }

    await this.error(`Error in ${context}: ${error.message}`, {
      ...metadata,
      error: errorInfo,
      errorType: error.name,
      errorContext: context
    })
  }
}

export const logger = new Logger()

// Export helper for creating child loggers with context
export function createLogger(context: { requestId?: string; userId?: string; projectId?: string }) {
  const childLogger = new Logger()
  if (context.requestId) {
    childLogger.setRequestContext(context.requestId)
  }
  
  // Return a wrapped logger that includes context in all calls
  return {
    info: (message: string, metadata?: LogMetadata) => 
      childLogger.info(message, { ...context, ...metadata }),
    warn: (message: string, metadata?: LogMetadata) => 
      childLogger.warn(message, { ...context, ...metadata }),
    error: (message: string, metadata?: LogMetadata) => 
      childLogger.error(message, { ...context, ...metadata }),
    debug: (message: string, metadata?: LogMetadata) => 
      childLogger.debug(message, { ...context, ...metadata }),
    logPerformance: (operation: string, startTime: number, metadata?: LogMetadata) =>
      childLogger.logPerformance(operation, startTime, { ...context, ...metadata }),
    logApiCall: (service: string, operation: string, success: boolean, metadata?: LogMetadata) =>
      childLogger.logApiCall(service, operation, success, { ...context, ...metadata }),
    logError: (error: Error, errorContext: string, metadata?: LogMetadata) =>
      childLogger.logError(error, errorContext, { ...context, ...metadata })
  }
}