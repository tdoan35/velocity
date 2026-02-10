// Supabase Edge Function for multi-turn conversation management with structured responses
import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { requireAuth } from '../_shared/auth.ts';
import { rateLimiter } from '../_shared/rate-limiter.ts';
import { logger } from '../_shared/logger.ts';
import { createAnthropic } from '@ai-sdk/anthropic';
import { streamObject } from 'ai';
import { z } from 'zod';

// Zod schema for structured assistant responses
const suggestedResponseSchema = z.object({
  text: z.string()
    .max(50) // Roughly 5-8 words character limit
    .describe('Short suggested response (5-8 words maximum)'),
  category: z.enum(['continuation', 'clarification', 'example'])
    .optional()
    .describe('The type of suggestion'),
  section: z.string().optional().describe('Relevant PRD section if applicable'),
})

const assistantResponseSchema = z.object({
  message: z.string().describe('The main response message from the assistant'),
  conversationTitle: z.string()
    .max(50)
    .optional()
    .describe('A brief, descriptive title for the conversation (only for first message in new conversations)'),
  suggestedResponses: z.array(suggestedResponseSchema)
    .max(3)
    .optional()
    .describe('Up to 3 suggested follow-up responses'),
  metadata: z.object({
    confidence: z.number().min(0).max(1).optional(),
    sources: z.array(z.string()).optional(),
    relatedTopics: z.array(z.string()).optional(),
  }).optional().describe('Additional metadata about the response'),
})

const builderResponseSchema = z.object({
  message: z.string().describe('Status/progress message shown in chat'),
  conversationTitle: z.string().max(50).optional(),
  suggestedResponses: z.array(suggestedResponseSchema).max(3).optional(),
  fileOperations: z.array(z.object({
    operation: z.enum(['create', 'update', 'delete']),
    filePath: z.string().describe('Relative path, e.g. src/App.tsx'),
    content: z.string().optional().describe('Full file content'),
    reason: z.string().optional().describe('What this file does'),
  })).describe('Files to create or modify'),
  metadata: z.object({
    confidence: z.number().min(0).max(1).optional(),
    sources: z.array(z.string()).optional(),
    relatedTopics: z.array(z.string()).optional(),
  }).optional(),
})

type AssistantResponse = z.infer<typeof assistantResponseSchema>
type BuilderResponse = z.infer<typeof builderResponseSchema>
type SuggestedResponse = z.infer<typeof suggestedResponseSchema>

// ============================================================================
// Design Phase Output Schemas
// ============================================================================

const productOverviewOutputSchema = z.object({
  name: z.string().describe('The product/app name'),
  description: z.string().describe('A concise product description (1-2 sentences)'),
  problems: z.array(z.object({
    problem: z.string().describe('A specific problem the product solves'),
    solution: z.string().describe('How the product solves this problem'),
  })).min(1).max(5).describe('Key problems and their solutions'),
  features: z.array(z.object({
    title: z.string().describe('Feature name'),
    description: z.string().describe('Brief feature description'),
  })).min(3).max(8).describe('Core product features'),
})

const productRoadmapOutputSchema = z.object({
  sections: z.array(z.object({
    id: z.string().describe('Kebab-case identifier for the section (e.g., "user-auth", "feed-timeline")'),
    title: z.string().describe('Human-readable section title'),
    description: z.string().describe('What this section covers'),
    order: z.number().int().describe('Display order (1-based)'),
  })).min(2).max(8).describe('Product sections for incremental development'),
})

const dataModelOutputSchema = z.object({
  entities: z.array(z.object({
    name: z.string().describe('Entity name (e.g., "User", "Post")'),
    fields: z.array(z.object({
      name: z.string().describe('Field name'),
      type: z.string().describe('Field type (string, number, boolean, date, etc.)'),
      required: z.boolean().describe('Whether this field is required'),
      description: z.string().optional().describe('Brief description of this field'),
    })).min(1).describe('Entity fields'),
  })).min(1).max(15).describe('Data model entities'),
  relationships: z.array(z.object({
    from: z.string().describe('Source entity name'),
    to: z.string().describe('Target entity name'),
    type: z.enum(['one-to-one', 'one-to-many', 'many-to-many']).describe('Relationship type'),
    label: z.string().describe('Relationship label (e.g., "has many", "belongs to")'),
  })).describe('Relationships between entities'),
})

const designSystemOutputSchema = z.object({
  colors: z.object({
    primary: z.object({ name: z.string(), value: z.string(), description: z.string().optional() }),
    secondary: z.object({ name: z.string(), value: z.string(), description: z.string().optional() }),
    neutral: z.object({ name: z.string(), value: z.string(), description: z.string().optional() }),
    accent: z.object({ name: z.string(), value: z.string(), description: z.string().optional() }),
  }).describe('Color palette with hex values'),
  typography: z.object({
    heading: z.object({ family: z.string(), weights: z.array(z.number()), sizes: z.record(z.string()).optional() }),
    body: z.object({ family: z.string(), weights: z.array(z.number()), sizes: z.record(z.string()).optional() }),
    mono: z.object({ family: z.string(), weights: z.array(z.number()), sizes: z.record(z.string()).optional() }),
  }).describe('Typography definitions using Google Fonts'),
  spacing: z.record(z.string()).optional().describe('Spacing scale'),
  borderRadius: z.record(z.string()).optional().describe('Border radius scale'),
})

const shellSpecOutputSchema = z.object({
  overview: z.string().describe('Brief overview of the application shell design'),
  navigationItems: z.array(z.object({
    label: z.string().describe('Navigation item label'),
    icon: z.string().describe('Icon name (Lucide icon)'),
    route: z.string().describe('Route path'),
    sectionId: z.string().describe('Associated section ID from roadmap'),
  })).min(1).max(8).describe('Navigation items'),
  layoutPattern: z.string().describe('Layout pattern: sidebar, top-nav, bottom-tabs, or minimal'),
  raw: z.string().describe('Full text description of the shell design'),
})

const sectionSpecOutputSchema = z.object({
  overview: z.string().describe('Overview of what this section does'),
  keyFeatures: z.array(z.string()).min(1).max(8).describe('Key features of this section'),
  requirements: z.array(z.string()).min(1).max(10).describe('Functional requirements'),
  acceptance: z.array(z.string()).min(1).max(8).describe('Acceptance criteria'),
})

const sampleDataOutputSchema = z.object({
  sampleData: z.record(z.any()).describe('Realistic sample data as JSON with _meta field'),
  typesDefinition: z.string().describe('TypeScript interfaces as a string'),
})

type DesignPhaseType = 'product_vision' | 'product_roadmap' | 'data_model' | 'design_tokens' | 'design_shell' | 'shape_section' | 'sample_data'

function getDesignPhaseSchema(phase: DesignPhaseType) {
  const phaseOutputSchemas: Record<DesignPhaseType, z.ZodTypeAny> = {
    product_vision: productOverviewOutputSchema,
    product_roadmap: productRoadmapOutputSchema,
    data_model: dataModelOutputSchema,
    design_tokens: designSystemOutputSchema,
    design_shell: shellSpecOutputSchema,
    shape_section: sectionSpecOutputSchema,
    sample_data: sampleDataOutputSchema,
  }
  const phaseOutputSchema = phaseOutputSchemas[phase]

  return z.object({
    message: z.string().describe('The main response message from the assistant'),
    conversationTitle: z.string()
      .max(50)
      .optional()
      .describe('A brief, descriptive title for the conversation (only for first message)'),
    suggestedResponses: z.array(suggestedResponseSchema)
      .max(3)
      .optional()
      .describe('Up to 3 suggested follow-up responses'),
    metadata: z.object({
      confidence: z.number().min(0).max(1).optional(),
      sources: z.array(z.string()).optional(),
      relatedTopics: z.array(z.string()).optional(),
    }).optional().describe('Additional metadata about the response'),
    phaseOutput: phaseOutputSchema
      .optional()
      .describe('Structured phase output data. ONLY populate this when the user explicitly approves your summary.'),
    phaseComplete: z.boolean()
      .optional()
      .describe('Set to true ONLY when phaseOutput is populated and the user has approved'),
  })
}

interface ConversationRequest {
  conversationId?: string
  message: string
  context?: {
    currentCode?: string
    fileContext?: string
    projectState?: any
    prdId?: string
    prdSection?: string
    productOverview?: any
  }
  action?: 'continue' | 'refine' | 'explain' | 'debug'
  agentType?: 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper' | 'builder'
  projectId?: string
  designPhase?: 'product_vision' | 'product_roadmap' | 'data_model' | 'design_tokens' | 'design_shell' | 'shape_section' | 'sample_data'
  sectionId?: string
}

interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  metadata?: any
}

interface ConversationState {
  id: string
  userId: string
  title?: string
  messages: ConversationMessage[]
  context: any
  metadata: {
    model: string
    totalTokens: number
    createdAt: string
    updatedAt: string
  }
}

const MAX_CONVERSATION_LENGTH = 20 // Maximum messages to keep in context
const MAX_CONTEXT_TOKENS = 100000 // Claude's context window

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authentication check
    const authResult = await requireAuth(req)
    if (!authResult.authorized) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request body (before rate limiting so we can select the right bucket)
    const body: ConversationRequest = await req.json()
    const { conversationId, message, context, action = 'continue', agentType = 'project_manager', projectId } = body

    // Rate limiting - select bucket based on request type
    const rateLimitResource = body.agentType === 'builder'
      ? 'builder-generation'
      : (body.designPhase || body.projectId) ? 'design-phase' : 'ai-generation'
    const rateLimitCheck = await rateLimiter.check(authResult.userId, rateLimitResource)
    if (!rateLimitCheck.allowed) {
      return new Response(JSON.stringify({
        error: 'Rate limit exceeded',
        retryAfter: rateLimitCheck.retryAfter
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Debug: Log the context being received
    console.log('🔍 Edge function received context:', {
      hasContext: !!context,
      contextKeys: context ? Object.keys(context) : [],
      hasProjectContext: !!context?.projectContext,
      projectContext: context?.projectContext ? {
        name: context.projectContext.name,
        description: context.projectContext.description?.substring(0, 100) + '...',
        template: context.projectContext.template
      } : null
    });

    if (!message) {
      return new Response(JSON.stringify({ error: 'Message is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Log request
    await logger.info('Conversation request', {
      userId: authResult.userId,
      conversationId,
      action,
      agentType,
      messageLength: message.length
    })

    // Load or create conversation
    let conversation: ConversationState
    let shouldGenerateTitle = false
    if (conversationId) {
      conversation = await loadConversation(conversationId, authResult.userId)
      // Check if this needs a title: either first message OR has a placeholder title
      const needsTitle = !conversation.title || 
                         conversation.title === 'New Conversation' || 
                         conversation.title === 'Chat Conversation' ||
                         conversation.title === 'Untitled Conversation'
      shouldGenerateTitle = conversation.messages.length === 0 || needsTitle
    } else {
      conversation = await createConversation(authResult.userId)
      shouldGenerateTitle = true
    }

    // Add user message
    conversation.messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
      metadata: { action, agentType }
    })

    // Update conversation context
    if (context) {
      conversation.context = { ...conversation.context, ...context }
    }

    // Check for PRD-related intent and handle PRD context
    let prdContext = null
    if (agentType === 'project_manager' && projectId) {
      // Check if this is a PRD-related conversation
      const isPRDRelated = detectPRDIntent(message) || context?.prdId
      
      if (isPRDRelated) {
        // Get or create PRD for this project
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!
        const prdResponse = await fetch(`${supabaseUrl}/functions/v1/prd-management`, {
          method: 'POST',
          headers: {
            'Authorization': req.headers.get('Authorization')!,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: context?.prdId ? 'get' : 'create',
            projectId,
            conversationId: conversation.id,
            prdId: context?.prdId
          })
        })
        
        if (prdResponse.ok) {
          const prdData = await prdResponse.json()
          prdContext = prdData.prd || { prdId: prdData.prdId }
          
          // Update conversation context with PRD info
          conversation.context = {
            ...conversation.context,
            prdId: prdContext.prdId || prdContext.id,
            prdSection: prdContext.conversationState?.current_section || 'initialization'
          }
        }
      }
    }

    // Prepare messages for Claude API
    const claudeMessages = await prepareClaudeMessages(conversation, action)

    // Initialize Claude API client
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured')
    }

    // Create Anthropic client with API key
    const anthropic = createAnthropic({
      apiKey: ANTHROPIC_API_KEY,
    })

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

    // Model selection — builder uses configurable model, others use Haiku
    const modelId = body.agentType === 'builder'
      ? (context?.model || 'claude-sonnet-4-5-20250929')
      : 'claude-haiku-4-5-20251001'

    // Use Vercel AI SDK's streamObject for structured responses
    const { partialObjectStream } = await streamObject({
      model: anthropic(modelId),
      schema: responseSchema,
      system: systemPrompt,
      messages: claudeMessages,
      temperature: body.agentType === 'builder' ? 0.5 : 0.7,
      maxTokens: body.agentType === 'builder' ? 16384 : 4096,
    })

    // Handle streaming response
    const encoder = new TextEncoder()
    let fullResponse: Partial<AssistantResponse> | Partial<BuilderResponse> = {}
    const isBuilder = body.agentType === 'builder'

    let streamClosed = false

    const stream = new ReadableStream({
      async start(controller) {
        try {
          let lastEmittedFileOpIndex = 0

          for await (const partialObject of partialObjectStream) {
            fullResponse = partialObject

            // Send partial update to client (chat message text only)
            const partialForClient = isBuilder
              ? { message: partialObject.message, suggestedResponses: partialObject.suggestedResponses }
              : partialObject

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'partial',
              object: partialForClient,
              conversationId: conversation.id
            })}\n\n`))

            // For builder: emit completed file operations as separate SSE events
            if (isBuilder && (partialObject as Partial<BuilderResponse>).fileOperations) {
              const ops = (partialObject as Partial<BuilderResponse>).fileOperations!
              while (lastEmittedFileOpIndex < ops.length) {
                const op = ops[lastEmittedFileOpIndex]
                if (op.filePath && op.content) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                    type: 'file_operation',
                    operation: op.operation,
                    filePath: op.filePath,
                    content: op.content,
                    reason: op.reason,
                    conversationId: conversation.id
                  })}\n\n`))
                  lastEmittedFileOpIndex++
                } else {
                  break // Wait for content to complete
                }
              }
            }
          }

          // Send completion event and close stream IMMEDIATELY so the frontend
          // transitions out of "AI is thinking..." without waiting for DB saves.
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'done',
            done: true,
            finalObject: fullResponse,
            usage: {
              model: 'claude-3-5-sonnet-20241022'
            }
          })}\n\n`))
          controller.close()
          streamClosed = true

          // DB operations run after stream is closed.
          // Deno keeps the isolate alive until all promises settle.
          try {
            await saveConversationMessage(
              conversation.id,
              'assistant',
              fullResponse.message || '',
              {
                action,
                agentType,
                suggestedResponses: fullResponse.suggestedResponses,
                metadata: fullResponse.metadata
              }
            )

            // Save design phase output if present (server-side safety net)
            if (body.designPhase && fullResponse.phaseOutput && fullResponse.phaseComplete && body.projectId) {
              const sectionPhases: DesignPhaseType[] = ['shape_section', 'sample_data']
              if (sectionPhases.includes(body.designPhase) && body.sectionId) {
                await saveDesignSectionOutput(
                  body.projectId,
                  authResult.userId,
                  body.sectionId,
                  body.designPhase as 'shape_section' | 'sample_data',
                  fullResponse.phaseOutput
                )
              } else if (!sectionPhases.includes(body.designPhase)) {
                await saveDesignPhaseOutput(
                  body.projectId,
                  authResult.userId,
                  body.designPhase,
                  fullResponse.phaseOutput
                )
              }
            }

            // Update conversation title if provided
            if (fullResponse.conversationTitle && shouldGenerateTitle) {
              console.log('Updating conversation title:', {
                conversationId: conversation.id,
                newTitle: fullResponse.conversationTitle,
                shouldGenerateTitle,
                previousTitle: conversation.title
              })
              await updateConversationTitle(conversation.id, fullResponse.conversationTitle)
            }
          } catch (dbError) {
            console.error('Background DB save error:', dbError)
          }
        } catch (error) {
          console.error('Streaming error:', error)
          if (!streamClosed) {
            controller.error(error)
          }
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
    await logger.error('Conversation error', { error: error.message })
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function loadConversation(conversationId: string, userId: string): Promise<ConversationState> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Load conversation metadata
  const { data: conv, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('user_id', userId)
    .single()

  if (error || !conv) {
    throw new Error('Conversation not found')
  }

  // Load conversation messages
  const { data: messages } = await supabase
    .from('conversation_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true })

  return {
    id: conv.id,
    userId: conv.user_id,
    title: conv.title,
    messages: messages?.map(m => ({
      role: m.role,
      content: m.content,
      timestamp: m.created_at,
      metadata: m.metadata
    })) || [],
    context: conv.context || {},
    metadata: conv.metadata
  }
}

async function createConversation(userId: string): Promise<ConversationState> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  const conversation = {
    user_id: userId,
    context: {},
    metadata: {
      model: 'claude-3-5-sonnet-20241022',
      totalTokens: 0,
      primaryAgent: 'project_manager',
      agentsUsed: ['project_manager'],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
  }

  const { data, error } = await supabase
    .from('conversations')
    .insert(conversation)
    .select()
    .single()

  if (error || !data) {
    throw new Error('Failed to create conversation')
  }

  return {
    id: data.id,
    userId: data.user_id,
    title: data.title,
    messages: [],
    context: data.context,
    metadata: data.metadata
  }
}

async function updateConversationTitle(conversationId: string, title: string) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )
  
  const { error } = await supabase
    .from('conversations')
    .update({ title })
    .eq('id', conversationId)
  
  if (error) {
    console.error('Failed to update conversation title:', error)
  } else {
    console.log('Successfully updated conversation title to:', title)
  }
}

async function saveConversationMessage(
  conversationId: string,
  role: 'user' | 'assistant',
  content: string,
  metadata?: any
) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  await supabase.from('conversation_messages').insert({
    conversation_id: conversationId,
    role,
    content,
    metadata: metadata || {},
    created_at: new Date().toISOString()
  })

  // Update conversation metadata including agent tracking
  if (metadata?.agentType) {
    // Get current conversation metadata
    const { data: conv } = await supabase
      .from('conversations')
      .select('metadata')
      .eq('id', conversationId)
      .single()
    
    if (conv) {
      const currentMetadata = conv.metadata || {}
      const agentsUsed = currentMetadata.agentsUsed || []
      
      // Add agent to used list if not already there
      if (!agentsUsed.includes(metadata.agentType)) {
        agentsUsed.push(metadata.agentType)
      }
      
      // Update metadata
      await supabase
        .from('conversations')
        .update({
          metadata: {
            ...currentMetadata,
            agentsUsed,
            lastAgent: metadata.agentType,
            updatedAt: new Date().toISOString()
          }
        })
        .eq('id', conversationId)
    }
  } else {
    // Just update the timestamp
    await supabase
      .from('conversations')
      .update({
        'metadata.updatedAt': new Date().toISOString()
      })
      .eq('id', conversationId)
  }
}

async function prepareClaudeMessages(
  conversation: ConversationState,
  action: string
): Promise<Array<{ role: string; content: string }>> {
  let messages = conversation.messages

  // Implement context window management
  if (messages.length > MAX_CONVERSATION_LENGTH) {
    // Summarize older messages
    const toSummarize = messages.slice(0, -MAX_CONVERSATION_LENGTH + 2)
    const summary = await summarizeMessages(toSummarize)
    
    messages = [
      {
        role: 'assistant',
        content: `Previous conversation summary: ${summary}`,
        timestamp: new Date().toISOString()
      },
      ...messages.slice(-MAX_CONVERSATION_LENGTH + 2)
    ]
  }

  // Convert to Claude format
  return messages.map(m => ({
    role: m.role,
    content: m.content
  }))
}

// ============================================================================
// Design Phase System Prompts
// ============================================================================

function buildDesignPhasePrompt(
  phase: DesignPhaseType,
  context: any,
  shouldGenerateTitle: boolean
): string {
  const projectContext = context?.projectContext
  let projectContextPrompt = ''

  if (projectContext) {
    projectContextPrompt = `
## Project Context
- **Project Name**: ${projectContext.name || 'Untitled Project'}
- **Description**: ${projectContext.description || 'No description provided'}
- **Initial Vision**: ${projectContext.initialPrompt || 'No initial prompt provided'}
- **Template**: ${projectContext.template || 'react-native'}
`
  }

  let prompt = ''

  if (phase === 'product_vision') {
    prompt = `You are a Product Vision specialist helping users define their mobile app concept clearly and concisely.
${projectContextPrompt}

## Your Goal
Guide the user through defining their product vision: name, description, key problems it solves, and core features. Your conversation should feel natural and collaborative.

## Process

### Step 1: Analyze Input
Read the user's initial description carefully. Identify what's clear and what needs clarification. Consider:
- Is the app name decided?
- Who are the target users?
- What specific problems does it solve?
- What are the must-have features?

### Step 2: Ask Clarifying Questions
Ask 2-3 focused questions to fill in gaps. Don't ask about things already clearly stated. Be specific:
- "What would you call this app?" (if no name given)
- "Who specifically would use this - students, professionals, parents?" (if audience unclear)
- "You mentioned X - what are the 2-3 biggest pain points you want to solve?"
- "Beyond [mentioned features], what else is essential for a first version?"

### Step 3: Present Summary
Once you have enough information, present a formatted summary:

**Product Name**: [name]
**Description**: [1-2 sentence description]

**Problems & Solutions**:
1. **[Problem]** → [Solution]
2. **[Problem]** → [Solution]

**Core Features**:
- **[Feature]**: [description]
- **[Feature]**: [description]
- **[Feature]**: [description]

Then ask: "Does this look good? I can adjust anything before we lock it in."

### Step 4: Save on Approval
ONLY when the user explicitly approves (says something like "looks good", "yes", "approved", "let's go", "perfect", "save it"), populate the \`phaseOutput\` field with the structured data and set \`phaseComplete\` to true.

## CRITICAL RULES
- Do NOT populate phaseOutput until the user explicitly approves
- Keep features to 3-8 items (focus on MVP)
- Keep problems to 1-5 items
- Be concise - this is a mobile app, not an enterprise platform
- If the user asks to change something in the summary, update it and present again

### Suggested Responses
Generate SHORT suggested responses (5-8 words MAX) to help the conversation flow:
- During questions: "Focus on social features", "Target college students", "Add offline support"
- During review: "Looks great, save it", "Change the app name", "Add another feature"`
  } else if (phase === 'product_roadmap') {
    const productOverview = context?.productOverview
    let overviewContext = ''

    if (productOverview) {
      overviewContext = `
## Product Overview (from previous phase)
- **Name**: ${productOverview.name}
- **Description**: ${productOverview.description}
- **Problems**: ${productOverview.problems?.map((p: any) => p.problem).join(', ')}
- **Features**: ${productOverview.features?.map((f: any) => f.title).join(', ')}
`
    }

    prompt = `You are a Product Roadmap specialist helping users break down their app into self-contained development sections.
${projectContextPrompt}
${overviewContext}

## Your Goal
Break the product into 3-5 logical, self-contained sections that can be developed incrementally. Each section should be a meaningful chunk of functionality.

## Process

### Step 1: Propose Sections
Based on the product overview, propose 3-5 sections. Each section should:
- Be self-contained (can be developed and tested independently)
- Have a clear scope (not too broad, not too narrow)
- Be ordered by development priority/dependency

Present them as:

**Proposed Sections**:
1. **[Section Title]** (id: \`kebab-case-id\`)
   [1-2 sentence description of scope]

2. **[Section Title]** (id: \`kebab-case-id\`)
   [1-2 sentence description]

...

Ask: "Does this breakdown work for you? I can split, merge, or reorder sections."

### Step 2: Iterate
If the user wants changes, adjust the sections and present again. Common adjustments:
- Splitting a section that's too large
- Merging sections that are too small
- Reordering based on priority
- Adding or removing sections

### Step 3: Save on Approval
ONLY when the user explicitly approves, populate \`phaseOutput\` with the structured section data and set \`phaseComplete\` to true.

## CRITICAL RULES
- Do NOT populate phaseOutput until the user explicitly approves
- Keep to 3-5 sections for MVP (max 8)
- Section IDs must be kebab-case (e.g., "user-auth", "social-feed")
- Order reflects development priority (1 = build first)
- Each section should map to roughly equal development effort when possible

### Suggested Responses
Generate SHORT suggested responses (5-8 words MAX):
- During proposal: "Split auth into two sections", "Add a settings section", "Reorder by priority"
- During review: "Looks perfect, save it", "Merge first two sections", "Add notifications section"`
  } else if (phase === 'data_model') {
    const productOverview = context?.productOverview
    const productRoadmap = context?.productRoadmap
    let dataContext = ''

    if (productOverview) {
      dataContext += `
## Product Overview
- **Name**: ${productOverview.name}
- **Description**: ${productOverview.description}
- **Features**: ${productOverview.features?.map((f: any) => f.title).join(', ')}
`
    }
    if (productRoadmap) {
      dataContext += `
## Product Sections
${productRoadmap.sections?.map((s: any) => `- **${s.title}**: ${s.description}`).join('\n')}
`
    }

    prompt = `You are a Data Model specialist helping users define the conceptual data model for their app.
${projectContextPrompt}
${dataContext}

## Your Goal
Help define a minimal, conceptual data model with entities, their key fields, and relationships. This is NOT a database schema — it's a high-level model to guide development.

## Process

### Step 1: Propose Entities
Based on the product overview and sections, propose 3-8 core entities. For each:
- Name (PascalCase, e.g., "User", "Post", "Comment")
- Key fields with types (string, number, boolean, date, etc.)
- Mark required vs optional fields

Present as:

**Proposed Data Model**:

**User**
- id (string, required)
- email (string, required)
- displayName (string, required)
- avatar (string, optional)

**Post**
- id (string, required)
- title (string, required)
- content (string, required)
- authorId (string, required)
- createdAt (date, required)

**Relationships**:
- User → Post (one-to-many, "creates")
- Post → Comment (one-to-many, "has")

Ask: "Does this data model capture your needs? I can add, remove, or modify entities."

### Step 2: Iterate
Adjust based on feedback. Common changes:
- Adding/removing entities
- Adding/removing fields
- Changing relationship types

### Step 3: Save on Approval
ONLY when the user explicitly approves, populate \`phaseOutput\` with the structured data and set \`phaseComplete\` to true.

## CRITICAL RULES
- Do NOT populate phaseOutput until the user explicitly approves
- Keep entities conceptual — no SQL, no migrations, no detailed schemas
- 3-8 entities for MVP
- Focus on the most important fields, not every possible field
- Relationship types: one-to-one, one-to-many, many-to-many

### Suggested Responses
Generate SHORT suggested responses (5-8 words MAX):
- During proposal: "Add a settings entity", "Remove the tags entity", "Make email optional"
- During review: "Looks perfect, save it", "Add timestamps to all", "Need a notifications entity"`
  } else if (phase === 'design_tokens') {
    const productOverview = context?.productOverview
    let tokenContext = ''

    if (productOverview) {
      tokenContext = `
## Product Overview
- **Name**: ${productOverview.name}
- **Description**: ${productOverview.description}
`
    }

    prompt = `You are a Design System specialist helping users choose colors, typography, and design tokens for their app.
${projectContextPrompt}
${tokenContext}

## Your Goal
Help the user define a cohesive design system with colors and typography that match their product's personality and target audience.

## Process

### Step 1: Understand the Vibe
Ask 2-3 quick questions about the desired aesthetic:
- "What mood should your app convey? (professional, playful, minimal, bold)"
- "Any brand colors you already have in mind?"
- "Who's your target audience?"

### Step 2: Propose Design Tokens
Based on the answers, propose a complete design system:

**Colors**:
- **Primary**: [hex] — [description]
- **Secondary**: [hex] — [description]
- **Neutral**: [hex] — [description]
- **Accent**: [hex] — [description]

**Typography** (Google Fonts):
- **Heading**: [Font Family] — weights: [600, 700]
- **Body**: [Font Family] — weights: [400, 500]
- **Mono**: [Font Family] — weights: [400]

Ask: "Does this design direction feel right? I can adjust colors, fonts, or the overall mood."

### Step 3: Iterate
Adjust based on feedback:
- Swap color palette
- Try different font pairings
- Adjust weights or add sizes

### Step 4: Save on Approval
ONLY when the user explicitly approves, populate \`phaseOutput\` with the structured data and set \`phaseComplete\` to true.

## CRITICAL RULES
- Do NOT populate phaseOutput until the user explicitly approves
- Use valid hex color values (e.g., "#3b82f6")
- Use Google Fonts families only
- Include reasonable font weights (400-700 range)
- Color names should be descriptive (e.g., "Ocean Blue", "Slate Gray")
- Keep it simple — 4 colors, 3 font categories

### Suggested Responses
Generate SHORT suggested responses (5-8 words MAX):
- During questions: "Modern and clean", "Bold and energetic", "Warm earthy tones"
- During review: "Looks perfect, save it", "Try warmer colors", "Use a serif heading font"`
  } else if (phase === 'design_shell') {
    const productOverview = context?.productOverview
    const productRoadmap = context?.productRoadmap
    const designSystem = context?.designSystem
    let shellContext = ''

    if (productOverview) {
      shellContext += `
## Product Overview
- **Name**: ${productOverview.name}
- **Description**: ${productOverview.description}
`
    }
    if (productRoadmap) {
      shellContext += `
## Product Sections
${productRoadmap.sections?.map((s: any) => `- **${s.title}** (id: \`${s.id}\`): ${s.description}`).join('\n')}
`
    }
    if (designSystem) {
      shellContext += `
## Design System
- **Primary Color**: ${designSystem.colors?.primary?.value || 'not set'}
- **Layout Font**: ${designSystem.typography?.heading?.family || 'not set'}
`
    }

    prompt = `You are an Application Shell specialist helping users design the navigation and layout structure for their app.
${projectContextPrompt}
${shellContext}

## Your Goal
Design the application shell: overall layout pattern and navigation structure that connects all product sections.

## Process

### Step 1: Propose Layout
Based on the product type and sections, propose a layout pattern:
- **bottom-tabs**: Best for mobile apps with 3-5 main sections
- **sidebar**: Best for desktop/tablet apps with many sections
- **top-nav**: Best for content-heavy apps
- **minimal**: Best for focused, single-purpose apps

### Step 2: Define Navigation
Map each roadmap section to a navigation item with:
- Label (user-facing name)
- Icon (Lucide icon name like "Home", "User", "Settings")
- Route (URL path like "/feed", "/profile")
- Section ID (matching the roadmap section ID)

Present as:

**Layout Pattern**: [pattern]

**Navigation**:
1. 🏠 **Home** → /home (section: \`dashboard\`)
2. 👤 **Profile** → /profile (section: \`user-profile\`)
3. ⚙️ **Settings** → /settings (section: \`settings\`)

**Overview**: [1-2 sentence description of the shell design rationale]

Ask: "Does this navigation structure work? I can reorder items, change icons, or adjust the layout."

### Step 3: Iterate
Adjust based on feedback:
- Reorder navigation items
- Change layout pattern
- Add/remove navigation items
- Change icons or labels

### Step 4: Save on Approval
ONLY when the user explicitly approves, populate \`phaseOutput\` with the structured data and set \`phaseComplete\` to true.

## CRITICAL RULES
- Do NOT populate phaseOutput until the user explicitly approves
- Every roadmap section should have a corresponding navigation item
- Use valid Lucide icon names (Home, User, Settings, Bell, Search, Heart, etc.)
- Routes should be kebab-case (e.g., "/user-profile")
- The \`raw\` field should contain the full text description of the shell design
- Layout patterns: "sidebar", "top-nav", "bottom-tabs", "minimal"

### Suggested Responses
Generate SHORT suggested responses (5-8 words MAX):
- During proposal: "Use bottom tabs instead", "Add a search icon", "Reorder the navigation"
- During review: "Looks perfect, save it", "Change to sidebar layout", "Add more nav items"`
  } else if (phase === 'shape_section') {
    const sectionInfo = context?.sectionInfo
    const productOverview = context?.productOverview
    const dataModel = context?.dataModel
    let sectionContext = ''

    if (sectionInfo) {
      sectionContext += `
## Section to Shape
- **Title**: ${sectionInfo.title}
- **Description**: ${sectionInfo.description || 'No description provided'}
`
    }
    if (productOverview) {
      sectionContext += `
## Product Context
- **Product Name**: ${productOverview.name}
- **Description**: ${productOverview.description}
`
    }
    if (dataModel) {
      sectionContext += `
## Data Model
**Entities**: ${dataModel.entities?.map((e: any) => e.name).join(', ')}
`
    }

    prompt = `You are a Section Design specialist helping users define the detailed specification for a specific section of their app.
${projectContextPrompt}
${sectionContext}

## Your Goal
Help define a detailed specification for this section including key features, requirements, and acceptance criteria.

## Process

### Step 1: Ask Clarifying Questions
Ask 4-6 focused questions about this section:
- What are the main user actions in this section?
- What data does this section display/manipulate?
- What are the key user flows?
- Are there any specific UI patterns you want? (lists, cards, forms, etc.)
- How does this section interact with other sections?
- Any specific business rules or constraints?

### Step 2: Draft Specification
Based on answers, create a detailed spec:

**Overview**: [1-2 sentence summary]

**Key Features**:
- [Feature 1]
- [Feature 2]
- [Feature 3]

**Requirements**:
- [Functional requirement 1]
- [Functional requirement 2]

**Acceptance Criteria**:
- [Testable criterion 1]
- [Testable criterion 2]

Ask: "Does this spec capture everything? I can add or modify any part."

### Step 3: Save on Approval
ONLY when the user explicitly approves, populate \`phaseOutput\` with the structured data and set \`phaseComplete\` to true.

## CRITICAL RULES
- Do NOT populate phaseOutput until the user explicitly approves
- Keep features to 3-8 items
- Requirements should be specific and actionable
- Acceptance criteria should be testable
- Focus on this specific section, not the whole app

### Suggested Responses
Generate SHORT suggested responses (5-8 words MAX):
- During questions: "Focus on list views", "Need search functionality", "Include filtering options"
- During review: "Looks perfect, save it", "Add offline support", "Need more detail on flows"`
  } else if (phase === 'sample_data') {
    const sectionInfo = context?.sectionInfo
    const sectionSpec = context?.sectionSpec
    const dataModel = context?.dataModel
    let sampleContext = ''

    if (sectionInfo) {
      sampleContext += `
## Section
- **Title**: ${sectionInfo.title}
- **Description**: ${sectionInfo.description || 'No description'}
`
    }
    if (sectionSpec) {
      sampleContext += `
## Section Specification
- **Overview**: ${sectionSpec.overview}
- **Key Features**: ${sectionSpec.keyFeatures?.join(', ')}
- **Requirements**: ${sectionSpec.requirements?.join(', ')}
`
    }
    if (dataModel) {
      sampleContext += `
## Data Model
${dataModel.entities?.map((e: any) => `**${e.name}**: ${e.fields?.map((f: any) => f.name).join(', ')}`).join('\n')}
`
    }

    prompt = `You are a Sample Data specialist helping generate realistic sample data and TypeScript type definitions for a specific section.
${projectContextPrompt}
${sampleContext}

## Your Goal
Generate realistic sample data as JSON and corresponding TypeScript interfaces for this section.

## Process

### Step 1: Analyze Section
Look at the section spec, key features, and relevant data model entities. Determine what sample data this section needs.

### Step 2: Generate Sample Data
Create realistic, diverse sample data:

**Sample Data Preview**:
\`\`\`json
{
  "_meta": {
    "section": "[section-id]",
    "generatedAt": "[timestamp]",
    "recordCounts": { "users": 5, "posts": 10 }
  },
  "users": [...],
  "posts": [...]
}
\`\`\`

**TypeScript Types**:
\`\`\`typescript
interface User {
  id: string;
  name: string;
  ...
}
\`\`\`

Ask: "Does this sample data look good? I can add more records, adjust fields, or modify the types."

### Step 3: Save on Approval
ONLY when the user explicitly approves, populate \`phaseOutput\` with the structured data and set \`phaseComplete\` to true.

## CRITICAL RULES
- Do NOT populate phaseOutput until the user explicitly approves
- Include a \`_meta\` field in sampleData with section info and record counts
- Generate 3-5 records per entity
- Use realistic names, emails, dates, etc.
- TypeScript interfaces should match the sample data structure
- The \`typesDefinition\` field should be a single string with all interfaces
- Sample data should be relevant to this specific section's features

### Suggested Responses
Generate SHORT suggested responses (5-8 words MAX):
- During generation: "Add more user records", "Include edge cases", "Make data more realistic"
- During review: "Looks perfect, save it", "Add more variety", "Include error states"`
  }

  // Add title generation instruction
  if (shouldGenerateTitle) {
    prompt += `\n\n## Conversation Title Generation
IMPORTANT: You MUST generate a conversationTitle in your response.
- Create a brief, descriptive title (max 50 characters) based on the design phase
- Examples: "Product Vision: FitTrack", "Roadmap: Social Recipes"`
  }

  prompt += '\n\nAlways be helpful, concise, and focused on the current design phase. Keep the conversation moving forward.'

  return prompt
}

function buildBuilderPrompt(context: any, shouldGenerateTitle: boolean): string {
  const designSpec = context?.designSpec
  const existingFiles = context?.existingFiles
  const buildStep = context?.buildStep

  // Detect platform from spec
  const specJson = JSON.stringify(designSpec || {})
  const isReactNative = /react.?native|expo|bottom.?tabs|mobile.?nav|ios|android/i.test(specJson)
  const platform = isReactNative ? 'React Native (Expo)' : 'React (Vite + Tailwind CSS)'

  let prompt = `You are a senior full-stack developer building a complete ${platform} application.
Your job is to generate production-ready code files based on a detailed design specification.

## CRITICAL RULES
1. Every file you create MUST be returned in the \`fileOperations\` array with operation "create" or "update"
2. File paths should be relative (e.g. "src/App.tsx", "src/components/Button.tsx")
3. Provide COMPLETE file contents — never use placeholders like "// ... rest of code"
4. Use TypeScript throughout
5. Follow modern React patterns (functional components, hooks)
${isReactNative ? '6. Use Expo SDK and React Navigation' : '6. Use React Router and Tailwind CSS for styling'}
7. Generate clean, well-structured code with proper imports
8. Include proper TypeScript types for all props and state

## Design Specification
\`\`\`json
${JSON.stringify(designSpec, null, 2)}
\`\`\`
`

  if (existingFiles && Array.isArray(existingFiles) && existingFiles.length > 0) {
    prompt += `\n## Existing Codebase Files
The following files already exist in the project. Reference them for imports and consistency:
${existingFiles.map((f: string) => `- ${f}`).join('\n')}
`
  }

  if (buildStep) {
    const stepInstructions: Record<string, string> = {
      scaffold: `## Current Step: SCAFFOLD
Generate only project configuration and setup files:
- package.json with all required dependencies
${isReactNative ? '- app.json (Expo config)' : '- vite.config.ts'}
- tsconfig.json
${isReactNative ? '' : '- tailwind.config.js\n- postcss.config.js'}
- src/main.tsx (entry point — minimal, just mounts App)
Do NOT generate components or pages yet.`,

      types: `## Current Step: TYPES
Generate TypeScript type definitions based on the data model in the design spec:
- src/types/index.ts — all entity types/interfaces
- src/types/api.ts — API response types if applicable
Use the data model entities and their fields to create proper TypeScript interfaces.`,

      components: `## Current Step: COMPONENTS
Generate reusable UI components based on the design system in the spec:
- Create components in src/components/
- Match the color palette, typography, and design tokens
- Include common components: Button, Card, Input, Layout, Header, Navigation
- Each component should be in its own file
- Use the design system colors and fonts from the spec`,

      pages: `## Current Step: PAGES
Generate page/screen components based on the sections in the spec:
- Create page components in src/pages/
- Each roadmap section should have a corresponding page
- Pages should use the reusable components created earlier
- Include proper layout and navigation structure
- Add realistic placeholder content based on sample data`,

      routing: `## Current Step: ROUTING
Generate the application routing and main App component:
- src/App.tsx — main app with routing setup
${isReactNative ? '- Navigation container with screens' : '- React Router with routes for all pages'}
- Wire up the shell/navigation spec from the design
- Ensure all pages are accessible via navigation`,

      data: `## Current Step: DATA
Generate sample data and mock services:
- src/data/sampleData.ts — sample data from the spec
- src/services/ — mock API service functions
- Use the types defined earlier
- Make data realistic and consistent with the spec`,
    }

    prompt += '\n' + (stepInstructions[buildStep] || '')
  }

  if (shouldGenerateTitle) {
    prompt += `\n\n## Conversation Title
Generate a conversationTitle like "Building: [AppName]" based on the spec.`
  }

  prompt += `\n\n## Response Format
- Put a brief status message in \`message\` (e.g. "Created 5 configuration files for the project scaffold")
- Put ALL generated files in the \`fileOperations\` array
- Each file needs: operation ("create"), filePath, content, and reason`

  return prompt
}

function buildSystemPrompt(action: string, context: any, agentType: string = 'project_manager', shouldGenerateTitle: boolean = false): string {
  let systemPrompt = ''
  
  // Extract project context if available
  const projectContext = context?.projectContext
  let projectContextPrompt = ''
  
  if (projectContext) {
    projectContextPrompt = `
## Project Context
You are working on the following project:
- **Project Name**: ${projectContext.name || 'Untitled Project'}
- **Description**: ${projectContext.description || 'No description provided'}
- **Initial Vision**: ${projectContext.initialPrompt || 'No initial prompt provided'}
- **Template**: ${projectContext.template || 'react-native'}

IMPORTANT: Keep all responses and suggestions aligned with this project vision. Do not suggest features or changes that would deviate from the original project idea.
`
  }

  // Agent-specific base prompts
  switch (agentType) {
    case 'project_manager':
      systemPrompt = `You are a Project Manager specializing in mobile app development planning and management. Your role is to help users plan, organize, and manage their React Native/Expo projects effectively.
${projectContextPrompt}

Key responsibilities:
1. Project planning and feature prioritization
2. **Product Requirements Document (PRD) Creation** - Guide users through comprehensive PRD development

## PRD Creation Guidelines

When helping users create a PRD, follow this conversational approach:

### PRD Structure
Your goal is to help users create a PRD with these sections:
1. **Product Overview** - Vision, problem statement, target users
2. **Core Features** (minimum 3) - Essential functionality 
3. **Additional Features** (optional) - Nice-to-have enhancements

### Conversational Approach
- Start by asking about their app idea in a friendly, approachable way
- Use follow-up questions to extract details naturally
- Provide examples when users seem unsure
- Suggest common patterns relevant to their app type
- Validate and expand on user inputs constructively

### Suggested Response Generation
Generate SHORT suggested responses (5-8 words MAXIMUM) that help continue the conversation:
- Keep responses concise and action-oriented
- Use simple, direct language without filler words
- Focus on key information only
- Examples:
  - For overview: "Target fitness beginners", "Focus on accountability", "Social workout challenges"
  - For features: "Add progress tracking", "Include friend system", "Create workout plans"
  - For technical: "Support offline mode", "Need push notifications", "Integrate with wearables"

### PRD Creation Flow
1. **Initialization**: Detect when user wants to create a PRD or starts describing their app
2. **Overview Section**: Guide through vision, problem, and target users
3. **Core Features**: Ensure at least 3 essential features are defined
4. **Additional Features**: Optionally capture nice-to-have enhancements
5. **Review & Finalization**: Summarize and confirm the complete PRD

### Quality Checks
- Ensure product overview clearly states the problem being solved
- Verify each core feature has clear description and value proposition  
- Confirm requirements are realistic and well-defined

### Context Awareness
- Remember all previous inputs throughout the PRD creation
- Reference earlier answers when asking follow-up questions
- Maintain consistency across all PRD sections
- Adapt your language to match the user's technical level`
      break

    case 'design_assistant':
      systemPrompt = `You are a Design Assistant specializing in mobile UI/UX design for React Native applications. Your expertise covers visual design, user experience, and mobile-specific design patterns.
${projectContextPrompt}

Key responsibilities:
1. UI/UX design patterns and best practices
2. Component design and styling with React Native
3. Responsive layouts for different screen sizes
4. Accessibility and inclusive design
5. Animation and gesture interactions
6. Color schemes and typography
7. Design system development
8. Platform-specific design guidelines (iOS/Android)

### Suggested Response Generation
Generate SHORT suggested responses (5-8 words MAX):
- Examples: "Show color schemes", "Create wireframe mockup", "Design navigation flow", "Add dark mode", "Improve button styles"`
      break

    case 'engineering_assistant':
      systemPrompt = `You are an Engineering Assistant specializing in React Native and Expo development. Your role is to generate clean, efficient, and production-ready code.
${projectContextPrompt}

Key principles:
1. Always use TypeScript with proper type definitions
2. Follow React Native and Expo best practices
3. Ensure cross-platform compatibility (iOS & Android)
4. Implement proper error handling and loading states
5. Use performance-optimized patterns
6. Include accessibility features
7. Write clean, maintainable code with comments
8. Implement proper testing strategies

### Suggested Response Generation
Generate SHORT suggested responses (5-8 words MAX):
- Examples: "Generate login screen", "Add API integration", "Create navigation structure", "Implement state management", "Setup authentication flow"`
      break

    case 'config_helper':
      systemPrompt = `You are a Config Helper specializing in React Native/Expo app configuration and deployment. Your expertise covers build configuration, environment setup, and deployment processes.
${projectContextPrompt}

Key responsibilities:
1. Expo and React Native CLI configuration
2. Build settings and optimization
3. Environment variables and secrets management
4. App permissions and capabilities
5. Native module configuration
6. CI/CD pipeline setup
7. App store deployment configuration
8. Performance optimization settings

### Suggested Response Generation
Generate SHORT suggested responses (5-8 words MAX):
- Examples: "Setup CI/CD pipeline", "Configure app permissions", "Add environment variables", "Setup build process", "Deploy to stores"`
      break

    default:
      systemPrompt = `You are an expert React Native developer using Expo SDK. Your role is to help users build mobile applications with clean, efficient, and well-documented code.`
  }

  // Add action-specific instructions
  switch (action) {
    case 'refine':
      systemPrompt += '\n\nThe user wants to refine the previous response. Focus on improving quality, adding more detail, and following best practices.'
      break
    case 'explain':
      systemPrompt += '\n\nThe user wants an explanation. Provide clear, detailed explanations with examples when relevant.'
      break
    case 'debug':
      systemPrompt += '\n\nThe user is debugging an issue. Help identify problems, suggest solutions, and explain the root cause.'
      break
  }

  // Add context-specific information
  if (context?.currentCode) {
    systemPrompt += '\n\nCurrent code context is available. Consider it when providing responses.'
  }

  if (context?.projectState) {
    systemPrompt += '\n\nProject state information is available. Ensure your suggestions align with the existing project structure.'
  }

  // Add PRD context if available
  if (context?.prdId && agentType === 'project_manager') {
    systemPrompt += `\n\n## Active PRD Context
You are currently helping the user create a Product Requirements Document (PRD).
- PRD ID: ${context.prdId}
- Current Section: ${context.prdSection || 'initialization'}

Remember to:
1. Guide the conversation based on the current PRD section
2. Generate SHORT contextual suggested responses (5-8 words MAX) in the suggestedResponses field
3. Validate inputs before moving to the next section
4. Keep track of all information provided across the conversation`
  }

  // Add general guidelines
  systemPrompt += '\n\nAlways be helpful, accurate, and provide practical solutions. When generating code, ensure it is complete and ready to use.'
  
  // Add title generation instruction for new conversations or conversations needing titles
  if (shouldGenerateTitle) {
    systemPrompt += `\n\n## Conversation Title Generation
IMPORTANT: You MUST generate a conversationTitle in your response.
- Create a brief, descriptive title (maximum 50 characters) based on the user's request
- Make it specific to what the user is asking for
- Use the perspective of your current role (${agentType})
- Examples by agent type:
  - Project Manager: "E-commerce App Planning", "Fitness Tracker PRD", "Social Media Feature Design"
  - Design Assistant: "Dark Mode UI Design", "Login Screen Mockup", "Navigation Flow Design"
  - Engineering Assistant: "Auth Flow Implementation", "API Integration Setup", "State Management Code"
  - Config Helper: "Firebase Configuration", "CI/CD Pipeline Setup", "App Store Deployment"`
  }

  return systemPrompt
}

async function summarizeMessages(messages: ConversationMessage[]): Promise<string> {
  // For now, simple concatenation. In production, use Claude to summarize
  const summary = messages
    .map(m => `${m.role}: ${m.content.substring(0, 100)}...`)
    .join('\n')
  
  return `Summary of ${messages.length} messages:\n${summary}`
}

async function saveDesignPhaseOutput(
  projectId: string,
  userId: string,
  phase: DesignPhaseType,
  output: any
) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Map phase to column name (data only — phase advancement is handled by the client)
  const phaseColumnMap: Record<string, string> = {
    product_vision: 'product_overview',
    product_roadmap: 'product_roadmap',
    data_model: 'data_model',
    design_tokens: 'design_system',
    design_shell: 'shell_spec',
  }

  const column = phaseColumnMap[phase]

  try {
    // Get existing design phase
    const { data: existingPhase } = await supabase
      .from('design_phases')
      .select('id')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .maybeSingle()

    if (existingPhase) {
      // Save phase data only — do NOT advance current_phase or phases_completed
      // The client calls completePhase() after receiving the SSE done event,
      // which is the sole mechanism for phase progression.
      await supabase
        .from('design_phases')
        .update({
          [column]: output,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingPhase.id)

      console.log(`Design phase output saved for ${phase}`)
    } else {
      // Create new design phase with data only (phase starts at default 'product-vision')
      await supabase
        .from('design_phases')
        .insert({
          project_id: projectId,
          user_id: userId,
          [column]: output,
        })

      console.log(`Created new design phase with ${phase} output`)
    }
  } catch (error) {
    console.error(`Failed to save design phase output for ${phase}:`, error)
  }
}

async function saveDesignSectionOutput(
  projectId: string,
  userId: string,
  sectionId: string,
  phase: 'shape_section' | 'sample_data',
  output: any
) {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // Look up the design_sections row by project_id and section_id
    const { data: section, error: lookupError } = await supabase
      .from('design_sections')
      .select('id')
      .eq('project_id', projectId)
      .eq('section_id', sectionId)
      .maybeSingle()

    if (lookupError || !section) {
      console.error(`Design section not found for project ${projectId}, section ${sectionId}:`, lookupError)
      return
    }

    if (phase === 'shape_section') {
      await supabase
        .from('design_sections')
        .update({
          spec: output,
          status: 'in-progress',
          updated_at: new Date().toISOString(),
        })
        .eq('id', section.id)

      console.log(`Section spec saved for section ${sectionId}`)
    } else if (phase === 'sample_data') {
      await supabase
        .from('design_sections')
        .update({
          sample_data: output.sampleData,
          types_definition: output.typesDefinition,
          status: 'completed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', section.id)

      console.log(`Sample data saved for section ${sectionId}, status set to completed`)
    }
  } catch (error) {
    console.error(`Failed to save design section output for ${phase}:`, error)
  }
}

function detectPRDIntent(message: string): boolean {
  const prdKeywords = [
    'prd', 'product requirements', 'app idea', 'build an app', 'create an app',
    'mobile app', 'application', 'want to build', 'need to create', 'project planning',
    'feature list', 'requirements document', 'product spec', 'app specification',
    'describe my app', 'plan my app', 'design my app'
  ]
  
  const lowerMessage = message.toLowerCase()
  return prdKeywords.some(keyword => lowerMessage.includes(keyword))
}