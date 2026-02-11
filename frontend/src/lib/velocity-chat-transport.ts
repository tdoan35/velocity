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

    const response = await fetch(`${supabaseUrl}/functions/v1/conversation`, {
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
    }

    const emitStructured = onStructuredData
    const emitFileOp = this.options.onFileOperation
    const emitBuildStatus = this.options.onBuildStatus

    const maxDuration = this.options.isBuilderAgent
      ? MAX_BUILDER_STREAM_DURATION
      : MAX_STREAM_DURATION
    const streamStartTime = Date.now()

    function processLines(lines: string[], controller: ReadableStreamDefaultController<UIMessageChunk>) {
      for (const line of lines) {
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
          // Heartbeat: no-op — just keeps the inactivity timer happy
          if (data.type === 'heartbeat') {
            console.debug('[VelocityTransport] SSE event: heartbeat')
            continue
          }

          // Structured error from backend
          if (data.type === 'error') {
            console.warn('[VelocityTransport] SSE event: error —', data.error?.message)
            // Emit any partial structured data from the error event
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
            // Emit clean lifecycle end and close stream immediately so the
            // AI SDK's consumeStream() completes → status transitions to 'ready'.
            emitCleanLifecycleEnd(controller, state.started, state.textEndEmitted, partId, messageId)
            state.textEndEmitted = true
            try { controller.close() } catch { /* already closed */ }
            state.streamDone = true
            return // Stop processing — stream is closed
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
            const partial = data.object

            if (!state.started) {
              state.started = true
              console.debug('[VelocityTransport] Emitting lifecycle: start')
              // Emit the full AI SDK lifecycle preamble (matches TextStreamChatTransport)
              controller.enqueue({ type: 'start', messageId } as UIMessageChunk)
              controller.enqueue({ type: 'start-step' } as UIMessageChunk)
              controller.enqueue({ type: 'text-start', id: partId } as UIMessageChunk)
            }

            // Compute incremental delta from full message text
            if (partial.message != null) {
              const currentText: string = partial.message
              if (currentText.length > state.lastEmittedText.length && currentText.startsWith(state.lastEmittedText)) {
                const delta = currentText.slice(state.lastEmittedText.length)
                controller.enqueue({ type: 'text-delta', id: partId, delta } as UIMessageChunk)
                state.lastEmittedText = currentText
              } else if (currentText !== state.lastEmittedText) {
                // Text changed in a non-append way (rare with streamObject).
                // Emit the difference as best we can — send entire new text as delta
                // after resetting. Since we can't "unsend", we just update tracking.
                // The final message will be correct from the done event.
                state.lastEmittedText = currentText
              }
            }

            // Emit structured side-channel data — failures must NOT break the streaming loop
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

            // Track latest partial structured data for fallback when done event
            // is missing or has phaseOutput stripped for size
            state.lastPartialData = {
              suggestedResponses: partial.suggestedResponses,
              conversationTitle: partial.conversationTitle,
              phaseOutput: partial.phaseOutput,
              phaseComplete: partial.phaseComplete,
              metadata: partial.metadata,
            }
          } else if (data.type === 'done' && data.done) {
            console.warn('[VelocityTransport] SSE event: done — closing stream')
            // Emit final structured data in its own try/catch — failures must NOT
            // prevent the lifecycle events below from firing.
            try {
              emitStructured?.({
                suggestedResponses: data.finalObject?.suggestedResponses,
                conversationTitle: data.finalObject?.conversationTitle,
                // phaseOutput is stripped from done event to keep it small;
                // fall back to the last partial's data
                phaseOutput: data.finalObject?.phaseOutput ?? state.lastPartialData?.phaseOutput,
                phaseComplete: data.finalObject?.phaseComplete ?? state.lastPartialData?.phaseComplete,
                metadata: data.finalObject?.metadata,
                usage: data.usage,
              })
            } catch (e) {
              console.error('[VelocityTransport] emitStructured error on done:', e)
            }

            // ALWAYS emit lifecycle end for done events
            if (state.started && !state.textEndEmitted) {
              console.warn('[VelocityTransport] Emitting lifecycle: finish')
              controller.enqueue({ type: 'text-end', id: partId } as UIMessageChunk)
              controller.enqueue({ type: 'finish-step' } as UIMessageChunk)
              controller.enqueue({ type: 'finish' } as UIMessageChunk)
              state.textEndEmitted = true
            }

            // Close the stream IMMEDIATELY so the AI SDK's consumeStream()
            // completes and status transitions to 'ready'. Without this,
            // the next pull() would wait for the server to close the HTTP
            // connection (or for the inactivity timeout), leaving the UI
            // stuck in "AI is thinking..." for up to 30+ seconds.
            try { controller.close() } catch { /* already closed */ }
            state.streamDone = true
            return // Stop processing — stream is closed
          }
        } catch (e) {
          console.error('[VelocityTransport] Unexpected error processing SSE event:', e)
        }
      }
    }

    return new ReadableStream<UIMessageChunk>({
      async pull(controller) {
        // If processLines already closed the stream (done/error event received),
        // just clean up the reader and return — no more data to read.
        if (state.streamDone) {
          reader.cancel()
          return
        }

        try {
          // Check absolute stream duration timeout
          if (Date.now() - streamStartTime > maxDuration) {
            console.warn(`[VelocityTransport] Absolute stream timeout (${maxDuration}ms) exceeded — forcing lifecycle end`)
            // Emit last partial data as fallback if done event was never received
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
            controller.close()
            reader.cancel()
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

          // If the timeout won the race, result.done is true and value is undefined
          // (a real stream-end would have value as Uint8Array or undefined)
          // Distinguish: real EOF has value === undefined AND done === true from reader
          // Timeout also has done === true and value === undefined, but we can check
          // if we got here via timeout by checking the elapsed time
          if (result.done && result.value === undefined) {
            console.warn('[VelocityTransport] Stream ended (EOF or inactivity timeout)')
            // Could be real EOF or timeout — try to distinguish
            // If there's still data in the buffer, it's likely a real EOF
            // For safety, flush buffer either way
            if (sseBuffer.trim()) {
              processLines(sseBuffer.split('\n'), controller)
            }

            // If we never received a done event but have partial data,
            // emit it with synthetic usage to trigger phase completion.
            // This handles the case where the done event was lost/truncated.
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

            emitCleanLifecycleEnd(controller, state.started, state.textEndEmitted, partId, messageId)
            state.textEndEmitted = true
            controller.close()
            reader.cancel()
            return
          }

          const chunk = decoder.decode(result.value, { stream: true })
          sseBuffer += chunk

          const lines = sseBuffer.split('\n')
          sseBuffer = lines.pop() || ''

          processLines(lines, controller)

          // If processLines closed the stream (done/error event), cancel the
          // HTTP reader — no point reading more from the server.
          if (state.streamDone) {
            reader.cancel()
            return
          }
        } catch (err) {
          console.error('[VelocityTransport] pull() error — emitting lifecycle end:', err)
          // Emit lifecycle events before erroring so the UI can transition
          emitCleanLifecycleEnd(controller, state.started, state.textEndEmitted, partId, messageId)
          state.textEndEmitted = true
          controller.error(err)
        }
      },
      cancel() {
        reader.cancel()
      },
    })
  }

  async reconnectToStream(_opts: {
    chatId: string
  } & ChatRequestOptions): Promise<ReadableStream<UIMessageChunk> | null> {
    return null
  }
}
