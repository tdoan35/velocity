import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { corsHeaders } from "../_shared/cors.ts"

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Verify authentication
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ code: 401, message: 'Missing authorization header' }), 
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse request body
    const { prompt, projectId, context, options } = await req.json()

    if (!prompt) {
      return new Response(
        JSON.stringify({ error: 'Prompt is required' }), 
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    if (!ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured')
    }

    // Prepare the system prompt
    const systemPrompt = `You are an AI assistant helping to build a mobile app with React Native and Expo. 
Your responses should be focused on mobile app development, UI/UX design, and React Native best practices.
${context?.preferences?.conversationType === 'design_assistant' ? 
  'You are acting as a design assistant, providing helpful suggestions and explanations about app design and implementation.' : 
  'Generate clean, modern React Native code following best practices.'}`

    // Build messages array
    const messages = [
      { 
        role: 'system' as const, 
        content: systemPrompt 
      }
    ]

    // Add conversation history if provided
    if (context?.userHistory && context.userHistory.length > 0) {
      // Add previous user messages as context (last 3 messages for context)
      context.userHistory.slice(-3).forEach((msg: string, index: number) => {
        messages.push({ role: 'user' as const, content: msg })
        if (index < context.userHistory.length - 1) {
          messages.push({ role: 'assistant' as const, content: 'I understand and will help you with that.' })
        }
      })
    }

    // Add current prompt
    messages.push({ role: 'user' as const, content: prompt })

    // Call Anthropic API
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-3-sonnet-20240229',
        messages,
        max_tokens: options?.maxTokens || 2048,
        temperature: options?.temperature || 0.8,
        stream: options?.stream !== false
      })
    })

    if (!anthropicResponse.ok) {
      const error = await anthropicResponse.text()
      console.error('Anthropic API error:', error)
      return new Response(
        JSON.stringify({ error: `AI API error: ${error}` }), 
        {
          status: anthropicResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // If streaming is enabled, transform and return the stream
    if (options?.stream !== false) {
      const encoder = new TextEncoder()
      const decoder = new TextDecoder()

      // Create a transform stream to convert Anthropic's format to our format
      const transformStream = new TransformStream({
        async transform(chunk, controller) {
          const text = decoder.decode(chunk, { stream: true })
          const lines = text.split('\n')
          
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6)
              if (dataStr.trim()) {
                try {
                  const data = JSON.parse(dataStr)
                  
                  // Transform Anthropic format to our format
                  if (data.type === 'content_block_delta' && data.delta?.text) {
                    const streamChunk = {
                      type: 'code',
                      delta: data.delta.text
                    }
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify(streamChunk)}\n\n`))
                  } else if (data.type === 'message_stop') {
                    controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                  }
                } catch (e) {
                  console.error('Error parsing stream data:', e)
                }
              }
            }
          }
        }
      })

      // Pipe the response through our transform
      anthropicResponse.body?.pipeThrough(transformStream)

      // Return streaming response with proper headers
      return new Response(transformStream.readable, {
        headers: {
          ...corsHeaders,
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no'
        }
      })
    }

    // Non-streaming response
    const result = await anthropicResponse.json()
    const responseContent = result.content?.[0]?.text || ''
    
    return new Response(
      JSON.stringify({
        type: 'code',
        content: responseContent
      }), 
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Edge function error:', error)
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        message: error.message 
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})