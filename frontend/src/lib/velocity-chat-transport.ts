import type { ChatTransport, UIMessage, UIMessageChunk, ChatRequestOptions } from 'ai'
import type { AgentType, FileOperation } from '../types/ai'
import type { DesignPhaseType } from '../types/design-phases'

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
    let started = false
    let textEndEmitted = false
    // Track accumulated text for computing incremental deltas
    // (backend sends full message text each partial, but AI SDK expects deltas)
    let lastEmittedText = ''

    const emitStructured = onStructuredData
    const emitFileOp = this.options.onFileOperation
    const emitBuildStatus = this.options.onBuildStatus

    function processLines(lines: string[], controller: ReadableStreamDefaultController<UIMessageChunk>) {
      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue

        const dataStr = line.slice(6).trim()
        if (!dataStr || dataStr === '[DONE]') continue

        try {
          const data = JSON.parse(dataStr)

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
            const partial = data.object

            if (!started) {
              started = true
              controller.enqueue({ type: 'text-start', id: partId } as UIMessageChunk)
            }

            // Compute incremental delta from full message text
            if (partial.message != null) {
              const currentText: string = partial.message
              if (currentText.length > lastEmittedText.length && currentText.startsWith(lastEmittedText)) {
                const delta = currentText.slice(lastEmittedText.length)
                controller.enqueue({ type: 'text-delta', id: partId, delta } as UIMessageChunk)
                lastEmittedText = currentText
              } else if (currentText !== lastEmittedText) {
                // Text changed in a non-append way (rare with streamObject).
                // Emit the difference as best we can — send entire new text as delta
                // after resetting. Since we can't "unsend", we just update tracking.
                // The final message will be correct from the done event.
                lastEmittedText = currentText
              }
            }

            // Emit structured side-channel data
            emitStructured?.({
              suggestedResponses: partial.suggestedResponses,
              conversationTitle: partial.conversationTitle,
              phaseOutput: partial.phaseOutput,
              phaseComplete: partial.phaseComplete,
              metadata: partial.metadata,
            })
          } else if (data.type === 'done' && data.done) {
            // Emit final structured data
            emitStructured?.({
              suggestedResponses: data.finalObject?.suggestedResponses,
              conversationTitle: data.finalObject?.conversationTitle,
              phaseOutput: data.finalObject?.phaseOutput,
              phaseComplete: data.finalObject?.phaseComplete,
              metadata: data.finalObject?.metadata,
              usage: data.usage,
            })

            if (started) {
              controller.enqueue({ type: 'text-end', id: partId } as UIMessageChunk)
              textEndEmitted = true
            }
          }
        } catch {
          // Skip unparseable lines
        }
      }
    }

    return new ReadableStream<UIMessageChunk>({
      async pull(controller) {
        try {
          const { done, value } = await reader.read()

          if (done) {
            // Flush remaining buffer
            if (sseBuffer.trim()) {
              processLines(sseBuffer.split('\n'), controller)
            }
            // Safety net: ensure text-end is always emitted so the UI
            // transitions out of "AI is thinking..." even if the done SSE
            // event was missed (malformed JSON, network glitch, etc.)
            if (started && !textEndEmitted) {
              controller.enqueue({ type: 'text-end', id: partId } as UIMessageChunk)
            } else if (!started) {
              controller.enqueue({ type: 'text-start', id: partId } as UIMessageChunk)
              controller.enqueue({ type: 'text-end', id: partId } as UIMessageChunk)
            }
            controller.close()
            return
          }

          const chunk = decoder.decode(value, { stream: true })
          sseBuffer += chunk

          const lines = sseBuffer.split('\n')
          sseBuffer = lines.pop() || ''

          processLines(lines, controller)
        } catch (err) {
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
