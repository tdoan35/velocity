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
  detectApproval,
  buildDesignPhasePrompt,
  buildBuilderPrompt,
  buildSystemPrompt,
  saveConversationMessage,
  saveDesignPhaseOutput,
  saveDesignSectionOutput,
  updateConversationTitle,
} from '../services/conversation.js'

function isValidPhaseOutput(phase: DesignPhaseType, output: any): boolean {
  if (!output || typeof output !== 'object') {
    console.warn(`[conversation] Phase output validation failed for ${phase}: output is empty or not an object`)
    return false
  }

  let valid = true
  switch (phase) {
    case 'product_vision':
      valid = !!output.name && output.problems?.length >= 1 && output.features?.length >= 3
      break
    case 'product_roadmap':
      valid = output.sections?.length >= 2
        && output.sections.every((s: any) => s.id && s.title && s.description)
      break
    case 'data_model':
      valid = output.entities?.length >= 1
        && output.entities.every((e: any) => e.name && Array.isArray(e.fields))
      break
    case 'design_tokens':
      valid = !!output.colors && !!output.typography
      break
    case 'design_shell':
      valid = !!output.overview && output.navigationItems?.length >= 1
      break
    case 'shape_section':
      valid = !!output.overview && output.keyFeatures?.length >= 1
      break
    case 'sample_data':
      valid = !!output.sampleData && !!output.typesDefinition
      break
  }

  if (!valid) {
    console.warn(`[conversation] Phase output validation failed for ${phase}: data quality too low`, {
      keys: Object.keys(output),
    })
  }
  return valid
}

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

  let systemPrompt = body.agentType === 'builder'
    ? buildBuilderPrompt(conversation.context, shouldGenerateTitle)
    : body.designPhase
      ? buildDesignPhasePrompt(body.designPhase, conversation.context, shouldGenerateTitle)
      : buildSystemPrompt(action, conversation.context, agentType, shouldGenerateTitle)

  // When the user's message looks like approval in a design phase,
  // inject a strong instruction to populate phaseOutput — but only if the
  // AI has previously presented a summary (readyToSave === true).
  const hasPresentedSummary = conversation.messages
    .filter(m => m.role === 'assistant')
    .some(m => m.metadata?.readyToSave === true)

  if (body.designPhase && detectApproval(message) && hasPresentedSummary) {
    console.log('[conversation] Approval detected with prior readyToSave — injecting save instruction')
    systemPrompt += `\n\n## SAVE INSTRUCTION (HIGHEST PRIORITY)
The user's latest message is an APPROVAL. You MUST:
1. Set phaseComplete to true
2. Populate phaseOutput with ALL the structured data discussed in the conversation
3. In your message, confirm that you've saved their work
Do NOT ask for further confirmation. The user has already approved. Save NOW.`
  }

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
      let lastPartialTime = Date.now()
      let partialCount = 0
      const PARTIAL_INACTIVITY_TIMEOUT = 15_000 // 15s without a new partial → assume AI is done

      console.log('[conversation] Starting partialObjectStream loop')

      // Wrap the async iterator so we can race each iteration against a timeout.
      // If the AI SDK's partialObjectStream hangs after the model finishes
      // (iterator never signals done), this timeout breaks us out.
      let streamExhausted = false
      const iterator = partialObjectStream[Symbol.asyncIterator]()

      while (!streamExhausted) {
        const timeoutPromise = new Promise<{ done: true; value: undefined }>((resolve) => {
          setTimeout(() => resolve({ done: true, value: undefined }), PARTIAL_INACTIVITY_TIMEOUT)
        })

        const result = await Promise.race([
          iterator.next(),
          timeoutPromise,
        ])

        if (result.done) {
          // Either the stream naturally ended or our timeout fired.
          // In both cases, we're done iterating.
          if (partialCount > 0) {
            const elapsed = Date.now() - lastPartialTime
            if (elapsed >= PARTIAL_INACTIVITY_TIMEOUT) {
              console.warn(`[conversation] partialObjectStream timed out after ${elapsed}ms of inactivity (${partialCount} partials received) — forcing done`)
            } else {
              console.log(`[conversation] partialObjectStream ended naturally after ${partialCount} partials`)
            }
          }
          streamExhausted = true
          break
        }

        const partial = result.value as Record<string, any>
        fullResponse = partial
        lastPartialTime = Date.now()
        partialCount++

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

      // Send done event — strip fileOperations (large payload) but keep
      // phaseOutput and phaseComplete so the frontend can reliably detect
      // phase completion even if earlier partials were lost.
      const { fileOperations: _fo, ...finalObject } = fullResponse as any
      console.log('[conversation] Sending done event')
      await stream.writeSSE({
        data: JSON.stringify({
          type: 'done',
          done: true,
          finalObject,
          usage: { model: modelId },
        }),
      })

      // Flush padding: @hono/node-server may buffer the last write before
      // closing the HTTP response. Extra writes push the done event through
      // the internal buffer so the client actually receives it.
      // SSE comments (lines starting with `:`) are ignored by clients.
      for (let i = 0; i < 5; i++) {
        await stream.write(`: flush ${i}\n\n`)
      }
      // Small delay to let Node.js drain the write buffer to the TCP socket
      await new Promise(resolve => setTimeout(resolve, 100))

      console.log('[conversation] Done event sent successfully')

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
              readyToSave: (fullResponse as any).readyToSave || false,
            },
          )

          if (body.designPhase) {
            console.log('[conversation] Design phase save check:', {
              designPhase: body.designPhase,
              hasPhaseOutput: !!(fullResponse as any).phaseOutput,
              phaseComplete: (fullResponse as any).phaseComplete,
              projectId: body.projectId,
              sectionId: body.sectionId,
            })
          }

          if (body.designPhase && (fullResponse as any).phaseOutput && (fullResponse as any).phaseComplete && body.projectId && isValidPhaseOutput(body.designPhase, (fullResponse as any).phaseOutput)) {
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
