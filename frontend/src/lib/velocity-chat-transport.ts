import type { ChatTransport, UIMessage, UIMessageChunk, ChatRequestOptions } from 'ai'
import type { AgentType, FileOperation } from '../types/ai'
import type { DesignPhaseType } from '../types/design-phases'

// Timeout constants
const CHUNK_INACTIVITY_TIMEOUT = 30_000 // 30s without any data from the stream
const MAX_STREAM_DURATION = 90_000 // 90s absolute timeout for normal agents
const MAX_BUILDER_STREAM_DURATION = 180_000 // 180s absolute timeout for builder agent

export interface SuggestedResponse {
  text: string
  category?: 'continuation' | 'clarification' | 'example'
  section?: string
}

export interface StructuredEventData {
  suggestedResponses?: SuggestedResponse[]
  conversationTitle?: string
  phaseOutput?: any
  phaseComplete?: boolean
  metadata?: {
    confidence?: number
    sources?: string[]
    relatedTopics?: string[]
  }
  usage?: { model?: string; totalTokens?: number }
}

export class RateLimitError extends Error {
  retryAfter: number
  constructor(retryAfter: number) {
    const minutes = Math.ceil(retryAfter / 60)
    const timeText = minutes > 1 ? `${minutes} minutes` : 'about a minute'
    super(`You've hit the rate limit. Please wait ${timeText} and try again.`)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

export interface VelocityChatTransportOptions {
  supabaseUrl: string
  getAccessToken: () => Promise<string>
  conversationId: string | (() => string)
  projectId?: string
  agentType?: AgentType
  designPhase?: DesignPhaseType
  sectionId?: string
  context?: Record<string, any> | (() => Record<string, any>)
  onStructuredData?: (data: StructuredEventData) => void
  onFileOperation?: (op: FileOperation) => void
  onBuildStatus?: (status: { step: string; filesCompleted: number; filesTotal: number }) => void
  isBuilderAgent?: boolean
}

/**
 * Emit the remaining AI SDK lifecycle events so the UI transitions out of
 * the streaming/submitted state. Wraps in try/catch because the controller
 * may already be closed.
 */
function emitCleanLifecycleEnd(
  controller: ReadableStreamDefaultController<UIMessageChunk>,
  started: boolean,
  textEndEmitted: boolean,
  partId: string,
  messageId: string,
) {
  try {
    if (started && !textEndEmitted) {
      console.debug('[VelocityTransport] emitCleanLifecycleEnd: emitting finish (started, text not ended)')
      controller.enqueue({ type: 'text-end', id: partId } as UIMessageChunk)
      controller.enqueue({ type: 'finish-step' } as UIMessageChunk)
      controller.enqueue({ type: 'finish' } as UIMessageChunk)
    } else if (!started) {
      console.debug('[VelocityTransport] emitCleanLifecycleEnd: emitting full lifecycle (not started)')
      controller.enqueue({ type: 'start', messageId } as UIMessageChunk)
      controller.enqueue({ type: 'start-step' } as UIMessageChunk)
      controller.enqueue({ type: 'text-start', id: partId } as UIMessageChunk)
      controller.enqueue({ type: 'text-end', id: partId } as UIMessageChunk)
      controller.enqueue({ type: 'finish-step' } as UIMessageChunk)
      controller.enqueue({ type: 'finish' } as UIMessageChunk)
    } else {
      console.debug('[VelocityTransport] emitCleanLifecycleEnd: no-op (already finished)')
    }
  } catch {
    // Controller already closed — nothing to do
  }
}

export class VelocityChatTransport implements ChatTransport<UIMessage> {
  private options: VelocityChatTransportOptions

  constructor(options: VelocityChatTransportOptions) {
    this.options = options
  }

  async sendMessages(opts: {
    trigger: 'submit-message' | 'regenerate-message'
    chatId: string
    messageId: string | undefined
    messages: UIMessage[]
    abortSignal: AbortSignal | undefined
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk>> {
    const { messages, abortSignal } = opts
    const {
      supabaseUrl, getAccessToken, conversationId: conversationIdOrGetter, projectId,
      agentType, designPhase, sectionId, context: contextOrGetter, onStructuredData,
    } = this.options

    // Resolve conversationId — supports both static strings and getter functions
    const conversationId = typeof conversationIdOrGetter === 'function'
      ? conversationIdOrGetter()
      : conversationIdOrGetter

    // Resolve context — supports both static objects and getter functions
    const context = typeof contextOrGetter === 'function' ? contextOrGetter() : contextOrGetter

    // Get the last user message content from parts
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user')
    const messageText = lastUserMessage?.parts
      ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map(p => p.text)
      .join('') || ''

    const accessToken = await getAccessToken()

    // Use dedicated backend URL when available, fall back to Supabase edge function
    const backendUrl = import.meta.env.VITE_BACKEND_URL
    const conversationEndpoint = backendUrl
      ? `${backendUrl}/v1/conversation`
      : `${supabaseUrl}/functions/v1/conversation`

    const response = await fetch(conversationEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        conversationId,
        message: messageText,
        context: context || {},
        designPhase: designPhase || undefined,
        sectionId: sectionId || undefined,
        agentType: designPhase && agentType !== 'builder' ? undefined : agentType,
        action: 'continue',
        projectId: projectId || undefined,
      }),
      signal: abortSignal,
    })

    if (!response.ok) {
      if (response.status === 429) {
        let retryAfter = 60
        try {
          const errorBody = await response.json()
          if (typeof errorBody.retryAfter === 'number') {
            retryAfter = errorBody.retryAfter
          }
        } catch { /* use default */ }
        throw new RateLimitError(retryAfter)
      }
      throw new Error(`HTTP error! status: ${response.status}`)
    }

    const reader = response.body?.getReader()
    if (!reader) {
      throw new Error('Response body is not readable')
    }

    const decoder = new TextDecoder()
    let sseBuffer = ''
    const messageId = `assistant-${Date.now()}`
    const partId = `${messageId}-text`

    // Mutable state object — shared between processLines, pull, and error handlers.
    // streamDone: set to true when done/error SSE event has been processed and
    // the controller has been closed — signals pull() to stop reading.
    // lastPartialData: tracks structured data from the most recent partial event
    // so we can recover phaseOutput/phaseComplete when the done event arrives
    // without them (stripped for size) or when the stream ends without a done event.
    const state = {
      started: false, textEndEmitted: false, lastEmittedText: '', streamDone: false,
      lastPartialData: null as StructuredEventData | null,
      lastRealDataTime: Date.now(), // Updated only by partial/done/error, NOT heartbeats
    }

    const emitStructured = onStructuredData
    const emitFileOp = this.options.onFileOperation
    const emitBuildStatus = this.options.onBuildStatus

    const maxDuration = this.options.isBuilderAgent
      ? MAX_BUILDER_STREAM_DURATION
      : MAX_STREAM_DURATION
    const streamStartTime = Date.now()

    /** Safe enqueue — no-ops if the stream was already closed by watchdog or done handler. */
    function safeEnqueue(controller: ReadableStreamDefaultController<UIMessageChunk>, chunk: UIMessageChunk) {
      if (state.streamDone) return
      try {
        controller.enqueue(chunk)
      } catch {
        // Controller already closed (e.g., watchdog race) — ignore
      }
    }

    function processLines(lines: string[], controller: ReadableStreamDefaultController<UIMessageChunk>) {
      for (const line of lines) {
        // Bail out early if stream was closed by watchdog between iterations
        if (state.streamDone) return

        if (!line.trim() || !line.startsWith('data: ')) continue

        const dataStr = line.slice(6).trim()
        if (!dataStr || dataStr === '[DONE]') continue

        let data: any
        try {
          data = JSON.parse(dataStr)
        } catch {
          // Skip unparseable lines
          continue
        }

        try {
          // Heartbeat — no-op, just keeps the inactivity timer in pull() happy.
          // The watchdog timer handles stale-stream detection independently.
          if (data.type === 'heartbeat') {
            console.debug('[VelocityTransport] SSE event: heartbeat')
            continue
          }

          // Structured error from backend
          if (data.type === 'error') {
            console.warn('[VelocityTransport] SSE event: error —', data.error?.message)
            if (data.partialObject) {
              try {
                emitStructured?.({
                  suggestedResponses: data.partialObject.suggestedResponses,
                  conversationTitle: data.partialObject.conversationTitle,
                  metadata: data.partialObject.metadata,
                })
              } catch (e) {
                console.error('[VelocityTransport] emitStructured error on error event:', e)
              }
            }
            emitCleanLifecycleEnd(controller, state.started, state.textEndEmitted, partId, messageId)
            state.textEndEmitted = true
            state.streamDone = true
            try { controller.close() } catch { /* already closed */ }
            return
          }

          if (data.type === 'file_operation') {
            emitFileOp?.({
              operation: data.operation,
              filePath: data.filePath,
              content: data.content,
              reason: data.reason,
            })
            continue
          }
          if (data.type === 'build_status') {
            emitBuildStatus?.(data)
            continue
          }

          if (data.type === 'partial' && data.object) {
            console.debug('[VelocityTransport] SSE event: partial')
            state.lastRealDataTime = Date.now()
            const partial = data.object

            if (!state.started) {
              state.started = true
              console.debug('[VelocityTransport] Emitting lifecycle: start')
              safeEnqueue(controller, { type: 'start', messageId } as UIMessageChunk)
              safeEnqueue(controller, { type: 'start-step' } as UIMessageChunk)
              safeEnqueue(controller, { type: 'text-start', id: partId } as UIMessageChunk)
            }

            if (partial.message != null) {
              const currentText: string = partial.message
              if (currentText.length > state.lastEmittedText.length && currentText.startsWith(state.lastEmittedText)) {
                const delta = currentText.slice(state.lastEmittedText.length)
                safeEnqueue(controller, { type: 'text-delta', id: partId, delta } as UIMessageChunk)
                state.lastEmittedText = currentText
              } else if (currentText !== state.lastEmittedText) {
                state.lastEmittedText = currentText
              }
            }

            try {
              emitStructured?.({
                suggestedResponses: partial.suggestedResponses,
                conversationTitle: partial.conversationTitle,
                phaseOutput: partial.phaseOutput,
                phaseComplete: partial.phaseComplete,
                metadata: partial.metadata,
              })
            } catch (e) {
              console.error('[VelocityTransport] emitStructured error on partial:', e)
            }

            state.lastPartialData = {
              suggestedResponses: partial.suggestedResponses,
              conversationTitle: partial.conversationTitle,
              phaseOutput: partial.phaseOutput,
              phaseComplete: partial.phaseComplete,
              metadata: partial.metadata,
            }
          } else if (data.type === 'done' && data.done) {
            state.lastRealDataTime = Date.now()
            const resolvedPhaseOutput = data.finalObject?.phaseOutput ?? state.lastPartialData?.phaseOutput
            const resolvedPhaseComplete = data.finalObject?.phaseComplete ?? state.lastPartialData?.phaseComplete
            console.warn('[VelocityTransport] SSE event: done — closing stream', {
              hasPhaseOutput: !!resolvedPhaseOutput,
              phaseComplete: resolvedPhaseComplete,
              sourcePhaseOutput: data.finalObject?.phaseOutput ? 'finalObject' : state.lastPartialData?.phaseOutput ? 'lastPartial' : 'none',
            })
            try {
              emitStructured?.({
                suggestedResponses: data.finalObject?.suggestedResponses,
                conversationTitle: data.finalObject?.conversationTitle,
                phaseOutput: resolvedPhaseOutput,
                phaseComplete: resolvedPhaseComplete,
                metadata: data.finalObject?.metadata,
                usage: data.usage,
              })
            } catch (e) {
              console.error('[VelocityTransport] emitStructured error on done:', e)
            }

            if (state.started && !state.textEndEmitted) {
              console.warn('[VelocityTransport] Emitting lifecycle: finish')
              safeEnqueue(controller, { type: 'text-end', id: partId } as UIMessageChunk)
              safeEnqueue(controller, { type: 'finish-step' } as UIMessageChunk)
              safeEnqueue(controller, { type: 'finish' } as UIMessageChunk)
              state.textEndEmitted = true
            }

            state.streamDone = true
            try { controller.close() } catch { /* already closed */ }
            return
          }
        } catch (e) {
          console.error('[VelocityTransport] Unexpected error processing SSE event:', e)
        }
      }
    }

    // Watchdog timer — runs independently of pull() to detect stale streams.
    // This handles the case where @hono/node-server doesn't flush the last
    // SSE events (done event) before closing the HTTP response, leaving
    // reader.read() blocked indefinitely inside pull(). The watchdog fires
    // on the JS event loop regardless of the blocked read.
    // Watchdog timeouts: shorter once partials are flowing (AI model is done
    // but done event was lost), longer before first partial (model may be slow).
    const STALE_AFTER_STARTED = 12_000 // 12s after last partial → AI is done
    const STALE_BEFORE_STARTED = 30_000 // 30s before first partial → still waiting
    let watchdogTimer: ReturnType<typeof setInterval> | undefined

    return new ReadableStream<UIMessageChunk>({
      start(controller) {
        watchdogTimer = setInterval(() => {
          if (state.streamDone) {
            clearInterval(watchdogTimer)
            return
          }
          const staleTimeout = state.started ? STALE_AFTER_STARTED : STALE_BEFORE_STARTED
          const elapsed = Date.now() - state.lastRealDataTime
          if (elapsed > staleTimeout) {
            console.warn(`[VelocityTransport] Watchdog: no real data for ${Math.round(elapsed / 1000)}s (started=${state.started}) — forcing stream end`)
            clearInterval(watchdogTimer)

            // Emit last partial data as done fallback
            if (state.lastPartialData) {
              try {
                emitStructured?.({
                  ...state.lastPartialData,
                  usage: { model: 'unknown' },
                })
              } catch (e) {
                console.error('[VelocityTransport] emitStructured error on watchdog fallback:', e)
              }
            }

            emitCleanLifecycleEnd(controller, state.started, state.textEndEmitted, partId, messageId)
            state.textEndEmitted = true
            state.streamDone = true
            try { controller.close() } catch { /* already closed */ }
            reader.cancel().catch(() => {})
          }
        }, 3_000) // Check every 3 seconds
      },

      async pull(controller) {
        // If the stream is done (from processLines, watchdog, or previous pull),
        // just clean up the reader and return — no more data to read.
        if (state.streamDone) {
          clearInterval(watchdogTimer)
          reader.cancel().catch(() => {})
          return
        }

        try {
          // Check absolute stream duration timeout
          if (Date.now() - streamStartTime > maxDuration) {
            console.warn(`[VelocityTransport] Absolute stream timeout (${maxDuration}ms) exceeded — forcing lifecycle end`)
            clearInterval(watchdogTimer)
            if (!state.streamDone && state.lastPartialData) {
              console.warn('[VelocityTransport] Timeout without done event — using last partial data as fallback')
              try {
                emitStructured?.({
                  ...state.lastPartialData,
                  usage: { model: 'unknown' },
                })
              } catch (e) {
                console.error('[VelocityTransport] emitStructured error on timeout fallback:', e)
              }
            }
            emitCleanLifecycleEnd(controller, state.started, state.textEndEmitted, partId, messageId)
            state.textEndEmitted = true
            state.streamDone = true
            controller.close()
            reader.cancel().catch(() => {})
            return
          }

          // Race reader.read() against an inactivity timeout
          let inactivityTimer: ReturnType<typeof setTimeout> | undefined
          const timeoutPromise = new Promise<{ done: true; value: undefined }>(resolve => {
            inactivityTimer = setTimeout(() => {
              resolve({ done: true, value: undefined })
            }, CHUNK_INACTIVITY_TIMEOUT)
          })

          const result = await Promise.race([
            reader.read(),
            timeoutPromise,
          ])

          clearTimeout(inactivityTimer)

          if (result.done && result.value === undefined) {
            console.warn('[VelocityTransport] Stream ended (EOF or inactivity timeout)')
            clearInterval(watchdogTimer)

            if (sseBuffer.trim()) {
              processLines(sseBuffer.split('\n'), controller)
            }

            if (!state.streamDone && state.lastPartialData) {
              console.warn('[VelocityTransport] Stream ended without done event — using last partial data as fallback')
              try {
                emitStructured?.({
                  ...state.lastPartialData,
                  usage: { model: 'unknown' },
                })
              } catch (e) {
                console.error('[VelocityTransport] emitStructured error on EOF fallback:', e)
              }
            }

            if (!state.streamDone) {
              emitCleanLifecycleEnd(controller, state.started, state.textEndEmitted, partId, messageId)
              state.textEndEmitted = true
              state.streamDone = true
              controller.close()
            }
            reader.cancel().catch(() => {})
            return
          }

          // Watchdog may have closed the stream while reader.read() was blocked.
          // Check before processing the chunk.
          if (state.streamDone) {
            clearInterval(watchdogTimer)
            reader.cancel().catch(() => {})
            return
          }

          const chunk = decoder.decode(result.value, { stream: true })
          sseBuffer += chunk

          const lines = sseBuffer.split('\n')
          sseBuffer = lines.pop() || ''

          processLines(lines, controller)

          if (state.streamDone) {
            clearInterval(watchdogTimer)
            reader.cancel().catch(() => {})
            return
          }
        } catch (err) {
          clearInterval(watchdogTimer)
          console.error('[VelocityTransport] pull() error — emitting lifecycle end:', err)
          emitCleanLifecycleEnd(controller, state.started, state.textEndEmitted, partId, messageId)
          state.textEndEmitted = true
          state.streamDone = true
          controller.error(err)
        }
      },
      cancel() {
        clearInterval(watchdogTimer)
        reader.cancel().catch(() => {})
      },
    })
  }

  async reconnectToStream(_opts: {
    chatId: string
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }
}
