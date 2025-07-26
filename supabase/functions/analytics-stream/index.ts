// Supabase Edge Function for real-time analytics streaming
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'

interface StreamRequest {
  streamType: 'events' | 'metrics' | 'alerts' | 'quality'
  filters?: {
    eventTypes?: string[]
    projectId?: string
    userId?: string
    severity?: string[]
  }
  windowSize?: number // seconds for aggregation window
}

interface StreamEvent {
  type: 'event' | 'metric' | 'alert' | 'quality'
  timestamp: string
  data: any
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

    // Validate request
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body: StreamRequest = await req.json()
    const { streamType, filters, windowSize = 5 } = body

    if (!streamType) {
      return new Response(JSON.stringify({ 
        error: 'Stream type is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create SSE response
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder()
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        // Send initial connection message
        controller.enqueue(encoder.encode('event: connected\ndata: {"status": "connected"}\n\n'))

        // Set up real-time subscription based on stream type
        let subscription: any

        try {
          switch (streamType) {
            case 'events':
              subscription = await subscribeToEvents(
                supabase, 
                controller, 
                encoder, 
                authResult.userId, 
                filters,
                logger
              )
              break

            case 'metrics':
              subscription = await subscribeToMetrics(
                supabase, 
                controller, 
                encoder, 
                authResult.userId, 
                filters,
                windowSize,
                logger
              )
              break

            case 'alerts':
              subscription = await subscribeToAlerts(
                supabase, 
                controller, 
                encoder, 
                authResult.userId, 
                filters,
                logger
              )
              break

            case 'quality':
              subscription = await subscribeToQuality(
                supabase, 
                controller, 
                encoder, 
                authResult.userId, 
                filters,
                logger
              )
              break
          }

          // Keep connection alive with heartbeat
          const heartbeat = setInterval(() => {
            try {
              controller.enqueue(encoder.encode('event: heartbeat\ndata: {"timestamp": "' + new Date().toISOString() + '"}\n\n'))
            } catch (error) {
              clearInterval(heartbeat)
              if (subscription) subscription.unsubscribe()
            }
          }, 30000) // Every 30 seconds

          // Clean up on close
          req.signal.addEventListener('abort', () => {
            clearInterval(heartbeat)
            if (subscription) subscription.unsubscribe()
            controller.close()
          })

        } catch (error) {
          await logger.logError(error as Error, 'Stream setup error')
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`))
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      }
    })

  } catch (error) {
    const logger = createLogger({ requestId: crypto.randomUUID() })
    await logger.logError(error as Error, 'Analytics stream error')
    return new Response(JSON.stringify({ 
      error: 'Failed to create stream',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function subscribeToEvents(
  supabase: any,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  userId: string,
  filters: any,
  logger: any
) {
  // Build real-time filter
  let realtimeFilter = `user_id=eq.${userId}`
  
  if (filters?.projectId) {
    realtimeFilter += `,project_id=eq.${filters.projectId}`
  }

  const subscription = supabase
    .channel('analytics-events')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_analytics_events',
        filter: realtimeFilter
      },
      (payload: any) => {
        // Filter by event type if specified
        if (filters?.eventTypes && !filters.eventTypes.includes(payload.new.event_type)) {
          return
        }

        const event: StreamEvent = {
          type: 'event',
          timestamp: payload.new.timestamp,
          data: {
            id: payload.new.id,
            eventType: payload.new.event_type,
            duration: payload.new.duration_ms,
            tokens: {
              input: payload.new.tokens_input,
              output: payload.new.tokens_output,
              total: payload.new.tokens_total
            },
            quality: payload.new.quality_score,
            cacheHit: payload.new.cache_hit,
            success: payload.new.success,
            projectId: payload.new.project_id
          }
        }

        controller.enqueue(encoder.encode(`event: analytics\ndata: ${JSON.stringify(event)}\n\n`))
      }
    )
    .subscribe()

  await logger.info('Event stream subscription created', { userId, filters })
  return subscription
}

async function subscribeToMetrics(
  supabase: any,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  userId: string,
  filters: any,
  windowSize: number,
  logger: any
) {
  // Aggregate metrics over time windows
  const metricsBuffer: any[] = []
  let aggregationTimer: any

  const subscription = supabase
    .channel('analytics-metrics')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_analytics_events',
        filter: `user_id=eq.${userId}`
      },
      (payload: any) => {
        metricsBuffer.push(payload.new)
        
        // Reset aggregation timer
        if (aggregationTimer) clearTimeout(aggregationTimer)
        
        aggregationTimer = setTimeout(() => {
          if (metricsBuffer.length > 0) {
            const aggregated = aggregateMetrics(metricsBuffer)
            const event: StreamEvent = {
              type: 'metric',
              timestamp: new Date().toISOString(),
              data: aggregated
            }
            controller.enqueue(encoder.encode(`event: metrics\ndata: ${JSON.stringify(event)}\n\n`))
            metricsBuffer.length = 0 // Clear buffer
          }
        }, windowSize * 1000)
      }
    )
    .subscribe()

  // Also send periodic metrics updates
  const periodicUpdate = setInterval(async () => {
    try {
      const metrics = await fetchCurrentMetrics(supabase, userId, filters)
      const event: StreamEvent = {
        type: 'metric',
        timestamp: new Date().toISOString(),
        data: metrics
      }
      controller.enqueue(encoder.encode(`event: metrics-update\ndata: ${JSON.stringify(event)}\n\n`))
    } catch (error) {
      await logger.logError(error as Error, 'Periodic metrics update error')
    }
  }, 60000) // Every minute

  // Clean up on unsubscribe
  subscription.on('unsubscribe', () => {
    clearInterval(periodicUpdate)
    if (aggregationTimer) clearTimeout(aggregationTimer)
  })

  await logger.info('Metrics stream subscription created', { userId, filters, windowSize })
  return subscription
}

async function subscribeToAlerts(
  supabase: any,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  userId: string,
  filters: any,
  logger: any
) {
  let alertFilter = `user_id=eq.${userId},status=eq.active`
  
  const subscription = supabase
    .channel('performance-alerts')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_performance_alerts',
        filter: alertFilter
      },
      (payload: any) => {
        // Filter by severity if specified
        if (filters?.severity && !filters.severity.includes(payload.new.severity)) {
          return
        }

        const event: StreamEvent = {
          type: 'alert',
          timestamp: payload.new.created_at,
          data: {
            id: payload.new.id,
            type: payload.new.alert_type,
            severity: payload.new.severity,
            metric: payload.new.metric_name,
            threshold: payload.new.threshold_value,
            actual: payload.new.actual_value,
            projectId: payload.new.project_id
          }
        }

        controller.enqueue(encoder.encode(`event: alert\ndata: ${JSON.stringify(event)}\n\n`))
      }
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'ai_performance_alerts',
        filter: alertFilter
      },
      (payload: any) => {
        // Notify when alerts are resolved
        if (payload.new.status === 'resolved' && payload.old.status === 'active') {
          const event: StreamEvent = {
            type: 'alert',
            timestamp: payload.new.resolved_at,
            data: {
              id: payload.new.id,
              type: payload.new.alert_type,
              status: 'resolved',
              resolvedAt: payload.new.resolved_at
            }
          }

          controller.enqueue(encoder.encode(`event: alert-resolved\ndata: ${JSON.stringify(event)}\n\n`))
        }
      }
    )
    .subscribe()

  await logger.info('Alert stream subscription created', { userId, filters })
  return subscription
}

async function subscribeToQuality(
  supabase: any,
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  userId: string,
  filters: any,
  logger: any
) {
  // Subscribe to quality metrics updates
  const subscription = supabase
    .channel('quality-metrics')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'ai_quality_metrics'
      },
      async (payload: any) => {
        // Check if this event belongs to the user
        const { data: eventData } = await supabase
          .from('ai_analytics_events')
          .select('user_id, project_id')
          .eq('id', payload.new.event_id)
          .single()

        if (!eventData || eventData.user_id !== userId) return

        if (filters?.projectId && eventData.project_id !== filters.projectId) return

        const event: StreamEvent = {
          type: 'quality',
          timestamp: payload.new.created_at,
          data: {
            id: payload.new.id,
            eventId: payload.new.event_id,
            scores: {
              promptClarity: payload.new.prompt_clarity_score,
              responseRelevance: payload.new.response_relevance_score,
              codeCorrectness: payload.new.code_correctness_score,
              userRating: payload.new.user_rating
            },
            feedback: {
              positive: payload.new.feedback_positive,
              syntaxValid: payload.new.syntax_valid,
              bestPractices: payload.new.best_practices_followed,
              securityIssues: payload.new.security_issues_found,
              performanceIssues: payload.new.performance_issues_found
            },
            enhanced: payload.new.enhanced,
            improvementDelta: payload.new.enhancement_score_delta
          }
        }

        controller.enqueue(encoder.encode(`event: quality\ndata: ${JSON.stringify(event)}\n\n`))
      }
    )
    .subscribe()

  await logger.info('Quality stream subscription created', { userId, filters })
  return subscription
}

// Helper functions
function aggregateMetrics(events: any[]): any {
  const totalEvents = events.length
  const totalTokens = events.reduce((sum, e) => sum + (e.tokens_total || 0), 0)
  const avgDuration = events.reduce((sum, e) => sum + (e.duration_ms || 0), 0) / totalEvents
  const cacheHits = events.filter(e => e.cache_hit).length
  const successes = events.filter(e => e.success).length

  const byType = events.reduce((acc, e) => {
    if (!acc[e.event_type]) {
      acc[e.event_type] = 0
    }
    acc[e.event_type]++
    return acc
  }, {})

  return {
    window: {
      start: events[0]?.timestamp,
      end: events[events.length - 1]?.timestamp,
      duration: events.length > 1 
        ? new Date(events[events.length - 1].timestamp).getTime() - new Date(events[0].timestamp).getTime()
        : 0
    },
    summary: {
      totalEvents,
      totalTokens,
      avgDuration: Math.round(avgDuration),
      cacheHitRate: totalEvents > 0 ? cacheHits / totalEvents : 0,
      successRate: totalEvents > 0 ? successes / totalEvents : 0
    },
    breakdown: byType
  }
}

async function fetchCurrentMetrics(
  supabase: any,
  userId: string,
  filters: any
): Promise<any> {
  const now = new Date()
  const hourAgo = new Date(now.getTime() - 60 * 60 * 1000)

  let query = supabase
    .from('ai_analytics_events')
    .select('*')
    .eq('user_id', userId)
    .gte('timestamp', hourAgo.toISOString())

  if (filters?.projectId) {
    query = query.eq('project_id', filters.projectId)
  }

  const { data, error } = await query

  if (error) throw error

  return {
    period: {
      start: hourAgo.toISOString(),
      end: now.toISOString()
    },
    metrics: aggregateMetrics(data || [])
  }
}