import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { createAnthropic } from '@ai-sdk/anthropic'
import { streamObject } from 'ai'
import type { CoreMessage } from 'ai'
import { authMiddleware } from '../middleware/auth.js'
import { checkRateLimit } from '../middleware/rate-limiter.js'
import {
  assistantResponseSchema,
  builderResponseSchema,
  getDesignPhaseSchema,
  type ConversationRequest,
  type DesignPhaseType,
} from '../schemas/conversation.js'
import {
  loadConversation,
  createConversation,
  prepareClaudeMessages,
  detectPRDIntent,
  buildDesignPhasePrompt,
  buildBuilderPrompt,
  buildSystemPrompt,
  saveConversationMessage,
  saveDesignPhaseOutput,
  saveDesignSectionOutput,
  updateConversationTitle,
} from '../services/conversation.js'

type Env = { Variables: { userId: string } }
const app = new Hono<Env>()

app.post('/', authMiddleware, async (c) => {
  const userId = c.get('userId') as string

  const body: ConversationRequest = await c.req.json()
  const {
    conversationId,
    message,
    context,
    action = 'continue',
    agentType = 'project_manager',
    projectId,
  } = body

  // Rate limiting
  const rateLimitResource = body.agentType === 'builder'
    ? 'builder-generation'
    : (body.designPhase || body.projectId) ? 'design-phase' : 'ai-generation'
  const rateLimitCheck = await checkRateLimit(userId, rateLimitResource)
  if (!rateLimitCheck.allowed) {
    return c.json(
      { error: 'Rate limit exceeded', retryAfter: rateLimitCheck.retryAfter },
      429,
    )
  }

  console.log('Received context:', {
    hasContext: !!context,
    contextKeys: context ? Object.keys(context) : [],
    hasProjectContext: !!(context as any)?.projectContext,
  })

  if (!message) {
    return c.json({ error: 'Message is required' }, 400)
  }

  // Load or create conversation
  let conversation
  let shouldGenerateTitle = false
  if (conversationId) {
    conversation = await loadConversation(conversationId, userId)
    const needsTitle = !conversation.title
      || conversation.title === 'New Conversation'
      || conversation.title === 'Chat Conversation'
      || conversation.title === 'Untitled Conversation'
    shouldGenerateTitle = conversation.messages.length === 0 || needsTitle
  } else {
    conversation = await createConversation(userId)
    shouldGenerateTitle = true
  }

  // Add user message
  conversation.messages.push({
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
    metadata: { action, agentType },
  })

  // Update conversation context
  if (context) {
    conversation.context = { ...conversation.context, ...context }
  }

  // PRD context check
  if (agentType === 'project_manager' && projectId) {
    const isPRDRelated = detectPRDIntent(message) || context?.prdId

    if (isPRDRelated) {
      const supabaseUrl = process.env.SUPABASE_URL!
      try {
        const prdResponse = await fetch(`${supabaseUrl}/functions/v1/prd-management`, {
          method: 'POST',
          headers: {
            'Authorization': c.req.header('Authorization')!,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: context?.prdId ? 'get' : 'create',
            projectId,
            conversationId: conversation.id,
            prdId: context?.prdId,
          }),
        })

        if (prdResponse.ok) {
          const prdData = await prdResponse.json()
          const prdContext = prdData.prd || { prdId: prdData.prdId }

          conversation.context = {
            ...conversation.context,
            prdId: prdContext.prdId || prdContext.id,
            prdSection: prdContext.conversationState?.current_section || 'initialization',
          }
        }
      } catch (err) {
        console.error('PRD management call failed:', err)
      }
    }
  }

  // Prepare messages for Claude
  const claudeMessages = await prepareClaudeMessages(conversation, action)

  const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
  if (!ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured')
  }

  const anthropic = createAnthropic({ apiKey: ANTHROPIC_API_KEY })

  // Select schema and prompt based on agent type / design phase
  const responseSchema = body.agentType === 'builder'
    ? builderResponseSchema
    : body.designPhase
      ? getDesignPhaseSchema(body.designPhase)
      : assistantResponseSchema

  const systemPrompt = body.agentType === 'builder'
    ? buildBuilderPrompt(conversation.context, shouldGenerateTitle)
    : body.designPhase
      ? buildDesignPhasePrompt(body.designPhase, conversation.context, shouldGenerateTitle)
      : buildSystemPrompt(action, conversation.context, agentType, shouldGenerateTitle)

  const modelId = 'claude-haiku-4-5-20251001'

  const { partialObjectStream } = await streamObject({
    model: anthropic(modelId),
    schema: responseSchema,
    system: systemPrompt,
    messages: claudeMessages as CoreMessage[],
    temperature: body.agentType === 'builder' ? 0.5 : 0.7,
    maxTokens: body.agentType === 'builder' ? 16384 : 4096,
  })

  // Use Hono's streamSSE helper for proper per-event flushing.
  // Raw ReadableStream with start() + controller.enqueue/close can lose the
  // final "done" SSE event in Node.js because @hono/node-server may not flush
  // the last enqueued chunk before the HTTP response ends.
  let fullResponse: Record<string, any> = {}
  const isBuilder = body.agentType === 'builder'

  return streamSSE(c, async (stream) => {
    // Heartbeat: keep SSE connection alive
    const heartbeatInterval = setInterval(() => {
      stream.writeSSE({
        data: JSON.stringify({ type: 'heartbeat', ts: Date.now() }),
      }).catch(() => clearInterval(heartbeatInterval))
    }, 15_000)

    // Clean up heartbeat if client disconnects
    stream.onAbort(() => {
      clearInterval(heartbeatInterval)
    })

    try {
      let lastEmittedFileOpIndex = 0

      for await (const partialObject of partialObjectStream) {
        const partial = partialObject as Record<string, any>
        fullResponse = partial

        const partialForClient = isBuilder
          ? { message: partial.message, suggestedResponses: partial.suggestedResponses }
          : partial

        await stream.writeSSE({
          data: JSON.stringify({
            type: 'partial',
            object: partialForClient,
            conversationId: conversation.id,
          }),
        })

        // Builder: emit completed file operations as separate SSE events
        if (isBuilder && partial.fileOperations) {
          const ops = partial.fileOperations as Array<{ operation: string; filePath?: string; content?: string; reason?: string }>
          while (lastEmittedFileOpIndex < ops.length) {
            const op = ops[lastEmittedFileOpIndex]
            if (op.filePath && op.content) {
              await stream.writeSSE({
                data: JSON.stringify({
                  type: 'file_operation',
                  operation: op.operation,
                  filePath: op.filePath,
                  content: op.content,
                  reason: op.reason,
                  conversationId: conversation.id,
                }),
              })
              lastEmittedFileOpIndex++
            } else {
              break
            }
          }
        }
      }

      clearInterval(heartbeatInterval)

      // Send done event — strip phaseOutput and fileOperations (large payloads)
      // to keep it small. The client tracks these from partial events.
      const { phaseOutput: _po, fileOperations: _fo, ...lightFinalObject } = fullResponse as any
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'done',
          done: true,
          finalObject: lightFinalObject,
          usage: { model: modelId },
        }),
      })

      // Fire-and-forget DB saves — run after done event is flushed to client
      ;(async () => {
        try {
          await saveConversationMessage(
            conversation.id,
            'assistant',
            fullResponse.message || '',
            {
              action,
              agentType,
              suggestedResponses: fullResponse.suggestedResponses,
              metadata: fullResponse.metadata,
            },
          )

          if (body.designPhase && (fullResponse as any).phaseOutput && (fullResponse as any).phaseComplete && body.projectId) {
            const sectionPhases: DesignPhaseType[] = ['shape_section', 'sample_data']
            if (sectionPhases.includes(body.designPhase) && body.sectionId) {
              await saveDesignSectionOutput(
                body.projectId,
                userId,
                body.sectionId,
                body.designPhase as 'shape_section' | 'sample_data',
                (fullResponse as any).phaseOutput,
              )
            } else if (!sectionPhases.includes(body.designPhase)) {
              await saveDesignPhaseOutput(
                body.projectId,
                userId,
                body.designPhase,
                (fullResponse as any).phaseOutput,
              )
            }
          }

          if (fullResponse.conversationTitle && shouldGenerateTitle) {
            await updateConversationTitle(conversation.id, fullResponse.conversationTitle)
          }
        } catch (dbError) {
          console.error('Background DB save error:', dbError)
        }
      })()
    } catch (error) {
      clearInterval(heartbeatInterval)
      console.error('Streaming error:', error)
      try {
        await stream.writeSSE({
          data: JSON.stringify({
            type: 'error',
            error: {
              message: error instanceof Error ? error.message : 'Stream error',
              code: 'STREAM_ERROR',
            },
            partialObject: fullResponse,
          }),
        })
      } catch {
        // Stream already closed — nothing to do
      }
    }
    // Stream auto-closes when this callback returns
  })
})

export default app
