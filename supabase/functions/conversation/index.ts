// Supabase Edge Function for multi-turn conversation management
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { rateLimiter } from '../_shared/rate-limiter.ts'
import { logger } from '../_shared/logger.ts'

interface ConversationRequest {
  conversationId?: string
  message: string
  context?: {
    currentCode?: string
    fileContext?: string
    projectState?: any
  }
  action?: 'continue' | 'refine' | 'explain' | 'debug'
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
    const { conversationId, message, context, action = 'continue' } = body

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
      metadata: { action }
    })

    // Update conversation context
    if (context) {
      conversation.context = { ...conversation.context, ...context }
    }

    // Prepare messages for Claude API
    const claudeMessages = await prepareClaudeMessages(conversation, action)

    // Initialize Claude API client
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured')
    }

    // Make request to Claude API with streaming
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-5-sonnet-20241022',
        messages: claudeMessages,
        temperature: 0.7,
        max_tokens: 4096,
        stream: true,
        system: buildSystemPrompt(action, conversation.context)
      })
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      throw new Error(`Claude API error: ${error}`)
    }

    // Handle streaming response
    const encoder = new TextEncoder()
    let fullResponse = ''
    
    const stream = new ReadableStream({
      async start(controller) {
        const reader = claudeResponse.body!.getReader()
        const decoder = new TextDecoder()
        let buffer = ''

        try {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break

            buffer += decoder.decode(value, { stream: true })
            const lines = buffer.split('\n')
            buffer = lines.pop() || ''

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const data = line.slice(6).trim()
                if (data === '[DONE]') {
                  // Save conversation state
                  await saveConversationMessage(
                    conversation.id,
                    'assistant',
                    fullResponse,
                    { action }
                  )
                  controller.close()
                  return
                }

                try {
                  const parsed = JSON.parse(data)
                  if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                    fullResponse += parsed.delta.text
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({
                      type: 'text',
                      content: parsed.delta.text,
                      conversationId: conversation.id
                    })}\n\n`))
                  }
                } catch (e) {
                  console.error('Error parsing stream data:', e)
                }
              }
            }
          }
        } catch (error) {
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

  // Update conversation metadata
  await supabase
    .from('conversations')
    .update({
      'metadata.updatedAt': new Date().toISOString()
    })
    .eq('id', conversationId)
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

function buildSystemPrompt(action: string, context: any): string {
  let systemPrompt = `You are an expert React Native developer using Expo SDK. Your role is to help users build mobile applications with clean, efficient, and well-documented code.

Key principles:
1. Always use TypeScript with proper type definitions
2. Follow React Native and Expo best practices
3. Ensure cross-platform compatibility (iOS & Android)
4. Implement proper error handling and loading states
5. Use performance-optimized patterns
6. Include accessibility features
7. Write clean, maintainable code with comments`

  // Add action-specific instructions
  switch (action) {
    case 'refine':
      systemPrompt += '\n\nThe user wants to refine the previous code. Focus on improving code quality, performance, and following best practices.'
      break
    case 'explain':
      systemPrompt += '\n\nThe user wants an explanation. Provide clear, detailed explanations of the code, its purpose, and how it works.'
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

  return systemPrompt
}

async function summarizeMessages(messages: ConversationMessage[]): Promise<string> {
  // For now, simple concatenation. In production, use Claude to summarize
  const summary = messages
    .map(m => `${m.role}: ${m.content.substring(0, 100)}...`)
    .join('\n')
  
  return `Summary of ${messages.length} messages:\n${summary}`
}