import type { ChatTransport, UIMessage, UIMessageChunk, ChatRequestOptions } from 'ai'
import type { AgentType } from '../types/ai'
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
  conversationId: string
  projectId?: string
  agentType?: AgentType
  designPhase?: DesignPhaseType
  sectionId?: string
  context?: Record<string, any>
  onStructuredData?: (data: StructuredEventData) => void
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
      supabaseUrl, getAccessToken, conversationId, projectId,
      agentType, designPhase, sectionId, context, onStructuredData,
    } = this.options

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
        agentType: designPhase ? undefined : agentType,
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
    let started = false
    // Track accumulated text for computing incremental deltas
    // (backend sends full message text each partial, but AI SDK expects deltas)
    let lastEmittedText = ''

    const emitStructured = onStructuredData

    function processLines(lines: string[], controller: ReadableStreamDefaultController<UIMessageChunk>) {
      for (const line of lines) {
        if (!line.trim() || !line.startsWith('data: ')) continue

        const dataStr = line.slice(6).trim()
        if (!dataStr || dataStr === '[DONE]') continue

        try {
          const data = JSON.parse(dataStr)

          if (data.type === 'partial' && data.object) {
            const partial = data.object

            if (!started) {
              started = true
              controller.enqueue({ type: 'text-start', id: messageId, role: 'assistant' } as UIMessageChunk)
            }

            // Compute incremental delta from full message text
            if (partial.message != null) {
              const currentText: string = partial.message
              if (currentText.length > lastEmittedText.length && currentText.startsWith(lastEmittedText)) {
                const delta = currentText.slice(lastEmittedText.length)
                controller.enqueue({ type: 'text-delta', delta } as UIMessageChunk)
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
              controller.enqueue({ type: 'text-end' } as UIMessageChunk)
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
            if (!started) {
              controller.enqueue({ type: 'text-start', id: messageId, role: 'assistant' } as UIMessageChunk)
              controller.enqueue({ type: 'text-end' } as UIMessageChunk)
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
