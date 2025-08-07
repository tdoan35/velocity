// Supabase Edge Function for multi-turn conversation management with structured responses
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { rateLimiter } from '../_shared/rate-limiter.ts'
import { logger } from '../_shared/logger.ts'
import { anthropic } from '@ai-sdk/anthropic'
import { streamObject } from 'ai'
import { z } from 'zod'

// Zod schema for structured assistant responses
const suggestedResponseSchema = z.object({
  text: z.string().describe('The suggested response text'),
  category: z.enum(['continuation', 'clarification', 'example'])
    .optional()
    .describe('The type of suggestion'),
  section: z.string().optional().describe('Relevant PRD section if applicable'),
})

const assistantResponseSchema = z.object({
  message: z.string().describe('The main response message from the assistant'),
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

type AssistantResponse = z.infer<typeof assistantResponseSchema>
type SuggestedResponse = z.infer<typeof suggestedResponseSchema>

interface ConversationRequest {
  conversationId?: string
  message: string
  context?: {
    currentCode?: string
    fileContext?: string
    projectState?: any
    prdId?: string
    prdSection?: string
  }
  action?: 'continue' | 'refine' | 'explain' | 'debug'
  agentType?: 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper'
  projectId?: string
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

    // Rate limiting
    const rateLimitCheck = await rateLimiter.check(authResult.userId, 'ai-generation')
    if (!rateLimitCheck.allowed) {
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded',
        retryAfter: rateLimitCheck.retryAfter 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request body
    const body: ConversationRequest = await req.json()
    const { conversationId, message, context, action = 'continue', agentType = 'project_manager', projectId } = body

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
    if (conversationId) {
      conversation = await loadConversation(conversationId, authResult.userId)
    } else {
      conversation = await createConversation(authResult.userId)
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

    // Use Vercel AI SDK's streamObject for structured responses
    const { partialObjectStream } = await streamObject({
      model: anthropic('claude-3-5-sonnet-20241022', {
        headers: {
          'x-api-key': ANTHROPIC_API_KEY,
        },
      }),
      schema: assistantResponseSchema,
      system: buildSystemPrompt(action, conversation.context, agentType),
      messages: claudeMessages,
      temperature: 0.7,
      maxTokens: 4096,
    })

    // Handle streaming response
    const encoder = new TextEncoder()
    let fullResponse: Partial<AssistantResponse> = {}
    
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const partialObject of partialObjectStream) {
            fullResponse = partialObject
            
            // Send partial update to client
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'partial',
              object: partialObject,
              conversationId: conversation.id
            })}\n\n`))
          }
          
          // Save the complete message with structured data
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
          
          // Send completion event
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({
            type: 'done',
            done: true,
            finalObject: fullResponse,
            usage: {
              model: 'claude-3-5-sonnet-20241022'
            }
          })}\n\n`))
          
          controller.close()
        } catch (error) {
          console.error('Streaming error:', error)
          controller.error(error)
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
    messages: [],
    context: data.context,
    metadata: data.metadata
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

function buildSystemPrompt(action: string, context: any, agentType: string = 'project_manager'): string {
  let systemPrompt = ''

  // Agent-specific base prompts
  switch (agentType) {
    case 'project_manager':
      systemPrompt = `You are a Project Manager specializing in mobile app development planning and management. Your role is to help users plan, organize, and manage their React Native/Expo projects effectively.

Key responsibilities:
1. Project planning and feature prioritization
2. **Product Requirements Document (PRD) Creation** - Guide users through comprehensive PRD development

## PRD Creation Guidelines

When helping users create a PRD, follow this conversational approach:

### PRD Structure
Your goal is to help users create a PRD with these sections:
1. **Product Overview** - Vision, problem statement, target users
2. **Core Features** (minimum 3) - Essential functionality 
3. **Additional Features** - Nice-to-have enhancements

### Conversational Approach
- Start by asking about their app idea in a friendly, approachable way
- Use follow-up questions to extract details naturally
- Provide examples when users seem unsure
- Suggest common patterns relevant to their app type
- Validate and expand on user inputs constructively

### Suggested Response Generation
Generate contextual suggested responses that help the user continue the conversation naturally. These should be specific to the current PRD section and previous context. Examples:
- For overview: "It's a social app for...", "I want to solve the problem of...", "My target users are..."
- For features: "Add user authentication", "Include real-time chat", "Implement offline mode"
- For technical: "Needs to work on iOS and Android", "Should handle 10k+ users", "Must integrate with..."

### PRD Creation Flow
1. **Initialization**: Detect when user wants to create a PRD or starts describing their app
2. **Overview Section**: Guide through vision, problem, and target users
3. **Core Features**: Ensure at least 3 essential features are defined
4. **Additional Features**: Capture nice-to-have enhancements
5. **Review & Finalization**: Summarize and confirm the complete PRD

### Quality Checks
- Ensure product overview clearly states the problem being solved
- Verify each core feature has clear description and value proposition  
- Confirm technical requirements are realistic and well-defined
- Validate that success metrics are measurable

### Context Awareness
- Remember all previous inputs throughout the PRD creation
- Reference earlier answers when asking follow-up questions
- Maintain consistency across all PRD sections
- Adapt your language to match the user's technical level`
      break

    case 'design_assistant':
      systemPrompt = `You are a Design Assistant specializing in mobile UI/UX design for React Native applications. Your expertise covers visual design, user experience, and mobile-specific design patterns.

Key responsibilities:
1. UI/UX design patterns and best practices
2. Component design and styling with React Native
3. Responsive layouts for different screen sizes
4. Accessibility and inclusive design
5. Animation and gesture interactions
6. Color schemes and typography
7. Design system development
8. Platform-specific design guidelines (iOS/Android)`
      break

    case 'engineering_assistant':
      systemPrompt = `You are an Engineering Assistant specializing in React Native and Expo development. Your role is to generate clean, efficient, and production-ready code.

Key principles:
1. Always use TypeScript with proper type definitions
2. Follow React Native and Expo best practices
3. Ensure cross-platform compatibility (iOS & Android)
4. Implement proper error handling and loading states
5. Use performance-optimized patterns
6. Include accessibility features
7. Write clean, maintainable code with comments
8. Implement proper testing strategies`
      break

    case 'config_helper':
      systemPrompt = `You are a Config Helper specializing in React Native/Expo app configuration and deployment. Your expertise covers build configuration, environment setup, and deployment processes.

Key responsibilities:
1. Expo and React Native CLI configuration
2. Build settings and optimization
3. Environment variables and secrets management
4. App permissions and capabilities
5. Native module configuration
6. CI/CD pipeline setup
7. App store deployment configuration
8. Performance optimization settings`
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
2. Generate contextual suggested responses (in the suggestedResponses field, not in the message text)
3. Validate inputs before moving to the next section
4. Keep track of all information provided across the conversation`
  }

  // Add general guidelines
  systemPrompt += '\n\nAlways be helpful, accurate, and provide practical solutions. When generating code, ensure it is complete and ready to use.'

  return systemPrompt
}

async function summarizeMessages(messages: ConversationMessage[]): Promise<string> {
  // For now, simple concatenation. In production, use Claude to summarize
  const summary = messages
    .map(m => `${m.role}: ${m.content.substring(0, 100)}...`)
    .join('\n')
  
  return `Summary of ${messages.length} messages:\n${summary}`
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