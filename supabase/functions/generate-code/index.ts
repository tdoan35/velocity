// Supabase Edge Function for AI code generation with streaming and performance optimizations
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { rateLimiter } from '../_shared/rate-limiter.ts'
import { createLogger } from '../_shared/logger.ts'
import { historyTracker } from '../_shared/history-tracker.ts'
import { getContextBuilder } from '../_shared/parallel-context-builder.ts'
import { streamingHandler } from '../_shared/streaming-handler.ts'

interface GenerateCodeRequest {
  prompt: string
  projectId?: string
  context?: {
    projectStructure?: string[]
    currentFile?: string
    userHistory?: string[]
    preferences?: Record<string, any>
  }
  options?: {
    temperature?: number
    maxTokens?: number
    stream?: boolean
    analyzeQuality?: boolean
    autoEnhance?: boolean
    targetQualityScore?: number
  }
}

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
    const body: GenerateCodeRequest = await req.json()
    const { prompt, projectId, context, options = {} } = body

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create logger with context
    const logger = createLogger({ 
      userId: authResult.userId,
      requestId: crypto.randomUUID(),
      projectId
    })

    // Log request
    await logger.info('Code generation request', {
      promptLength: prompt.length,
      hasContext: !!context,
      stream: options.stream
    })

    // Initialize Claude API client
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY')
    if (!ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured')
    }

    // Track interaction start
    const interactionStart = Date.now()
    
    // Get intelligent context assembly if projectId provided using parallel builder
    let assembledContext = null
    if (projectId) {
      try {
        const contextBuilder = getContextBuilder()
        const contextResult = await contextBuilder.buildContext({
          projectId,
          userId: authResult.userId,
          targetComponent: context?.currentFile?.includes('.tsx') ? 'component' : 'screen',
          includePatterns: true,
          includeHistory: true,
          includeStructure: true,
          includeDependencies: true,
          maxItems: 10,
          cacheKey: `${projectId}:${prompt.substring(0, 50)}`
        })

        assembledContext = {
          patterns: contextResult.patterns,
          relevantFiles: contextResult.history,
          userHistory: contextResult.history,
          projectStructure: contextResult.structure,
          dependencies: contextResult.dependencies,
          metadata: contextResult.metadata
        }

        await logger.info('Context built', {
          buildTime: contextResult.metadata.buildTime,
          cacheHit: contextResult.metadata.cacheHit,
          itemCounts: contextResult.metadata.itemCounts
        })
      } catch (error) {
        await logger.error('Context assembly error', { error: error.message })
      }
    }

    // Prepare context-enhanced prompt
    const enhancedPrompt = await buildEnhancedPrompt(prompt, context, assembledContext)

    // Set up Claude API request
    const claudeOptions = {
      model: 'claude-3-5-sonnet-20241022',
      messages: [{
        role: 'user',
        content: enhancedPrompt
      }],
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4096,
      stream: options.stream ?? true
    }

    // Make request to Claude API
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(claudeOptions)
    })

    if (!claudeResponse.ok) {
      const error = await claudeResponse.text()
      throw new Error(`Claude API error: ${error}`)
    }

    // Handle streaming response with optimized handler
    if (options.stream) {
      // Create code generation stream
      async function* generateCode() {
        yield* streamingHandler.streamCodeGeneration(
          prompt,
          assembledContext,
          async (p, ctx) => claudeResponse
        )
      }

      // Track streaming metrics
      let fullResponse = ''
      let tokenCount = 0

      const trackedGenerator = async function*() {
        for await (const chunk of generateCode()) {
          // Track content
          if (chunk.type === 'code') {
            fullResponse += chunk.content || chunk.delta || ''
            tokenCount++
          }

          // Yield chunk to client
          yield chunk

          // On completion, track interaction
          if (chunk.type === 'progress' && chunk.phase === 'complete') {
            const duration = Date.now() - interactionStart
            await historyTracker.trackInteraction({
              userId: authResult.userId,
              projectId: projectId || 'default',
              type: 'code_generation',
              data: {
                prompt,
                response: fullResponse.substring(0, 1000),
                context: assembledContext?.metadata,
                patterns: assembledContext?.patterns?.map(p => p.name),
                duration,
                success: true
              },
              metadata: {
                timestamp: new Date().toISOString(),
                modelVersion: 'claude-3-5-sonnet-20241022',
                tokenCount
              }
            })

            // Store in cache
            await storeInCache(authResult.userId, prompt, fullResponse, context)

            // Log performance metrics
            await logger.logPerformance('code_generation_stream', interactionStart, {
              tokenCount,
              responseLength: fullResponse.length
            })
          }
        }
      }

      // Return streaming response
      return streamingHandler.createStreamResponse(trackedGenerator(), {
        chunkSize: 100,
        includeMetadata: true
      })
    }

    // Non-streaming response
    const result = await claudeResponse.json()
    let generatedCode = result.content[0]?.text || ''
    let qualityAnalysis = null
    let enhancedCode = null

    // Perform quality analysis if requested
    if (options.analyzeQuality || options.autoEnhance) {
      try {
        const analysisResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/code-analysis`, {
          method: 'POST',
          headers: {
            'Authorization': req.headers.get('Authorization')!,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            code: generatedCode,
            language: 'typescript',
            projectId,
            analysisType: 'full',
            platform: 'both'
          })
        })

        if (analysisResponse.ok) {
          qualityAnalysis = await analysisResponse.json()
          
          // Auto-enhance if requested and score is below target
          if (options.autoEnhance && qualityAnalysis.overallScore < (options.targetQualityScore || 80)) {
            const enhanceResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/code-enhance`, {
              method: 'POST',
              headers: {
                'Authorization': req.headers.get('Authorization')!,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                code: generatedCode,
                enhancements: {
                  fixSecurity: true,
                  fixPerformance: true,
                  fixStyle: true,
                  addAccessibility: true,
                  modernizeSyntax: false,
                  addTypeScript: false
                },
                targetScore: options.targetQualityScore || 80
              })
            })

            if (enhanceResponse.ok) {
              const enhanceResult = await enhanceResponse.json()
              enhancedCode = enhanceResult.enhancedCode
              generatedCode = enhancedCode // Use enhanced version
              
              // Re-analyze enhanced code
              const reAnalysisResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/code-analysis`, {
                method: 'POST',
                headers: {
                  'Authorization': req.headers.get('Authorization')!,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  code: enhancedCode,
                  language: 'typescript',
                  projectId,
                  analysisType: 'quick'
                })
              })

              if (reAnalysisResponse.ok) {
                qualityAnalysis = await reAnalysisResponse.json()
              }
            }
          }
        }
      } catch (error) {
        console.error('Quality analysis error:', error)
        // Don't fail the main request if quality analysis fails
      }
    }

    // Store in cache for similarity search
    await storeInCache(authResult.userId, prompt, generatedCode, context)

    // Track interaction
    const duration = Date.now() - interactionStart
    await historyTracker.trackInteraction({
      userId: authResult.userId,
      projectId: projectId || 'default',
      type: 'code_generation',
      data: {
        prompt,
        response: generatedCode.substring(0, 1000), // Store truncated response
        context: assembledContext?.metadata,
        patterns: assembledContext?.patterns?.map(p => p.pattern),
        files: assembledContext?.relevantFiles?.map(f => f.path),
        duration,
        success: true,
        qualityScore: qualityAnalysis?.overallScore,
        enhanced: !!enhancedCode
      },
      metadata: {
        timestamp: new Date().toISOString(),
        modelVersion: 'claude-3-5-sonnet-20241022',
        tokenCount: result.usage?.total_tokens
      }
    })

    // Log success
    await logger.info('Code generation completed', {
      userId: authResult.userId,
      responseLength: generatedCode.length,
      qualityScore: qualityAnalysis?.overallScore,
      enhanced: !!enhancedCode
    })

    return new Response(JSON.stringify({
      code: generatedCode,
      usage: result.usage,
      ...(qualityAnalysis ? { qualityAnalysis } : {}),
      ...(enhancedCode ? { originalCode: result.content[0]?.text, enhanced: true } : {})
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    await logger.error('Code generation error', { error: error.message })
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function buildEnhancedPrompt(prompt: string, context?: any, assembledContext?: any): Promise<string> {
  let enhanced = prompt

  // Add assembled context if available
  if (assembledContext) {
    const contextParts = []
    
    // Add relevant files
    if (assembledContext.relevantFiles?.length > 0) {
      const fileContext = assembledContext.relevantFiles
        .slice(0, 5)
        .map(f => `File: ${f.path}\nRelevance: ${(f.relevanceScore * 100).toFixed(0)}%\nSnippet:\n${f.content.substring(0, 500)}...`)
        .join('\n\n')
      contextParts.push(`Relevant Project Files:\n${fileContext}`)
    }
    
    // Add detected patterns
    if (assembledContext.patterns?.length > 0) {
      const patterns = assembledContext.patterns
        .map(p => `- ${p.pattern} (${p.type}, confidence: ${(p.confidence * 100).toFixed(0)}%)`)
        .join('\n')
      contextParts.push(`Detected Patterns:\n${patterns}`)
    }
    
    // Add user history insights
    if (assembledContext.userHistory?.length > 0) {
      const history = assembledContext.userHistory
        .slice(0, 3)
        .map(h => `Previous: ${h.prompt.substring(0, 100)}...`)
        .join('\n')
      contextParts.push(`Recent Related Prompts:\n${history}`)
    }
    
    if (contextParts.length > 0) {
      enhanced = `${contextParts.join('\n\n')}\n\n${enhanced}`
    }
  }

  // Add manual context if provided
  if (context) {
    // Add project structure context
    if (context.projectStructure?.length > 0) {
      enhanced = `Project Structure:\n${context.projectStructure.join('\n')}\n\n${enhanced}`
    }

    // Add current file context
    if (context.currentFile) {
      enhanced = `Current File: ${context.currentFile}\n\n${enhanced}`
    }
  }

  // Always add React Native context
  enhanced = `You are generating code for a React Native application using Expo SDK. Please follow React Native and Expo best practices.\n\n${enhanced}`

  return enhanced
}

async function storeInCache(userId: string, prompt: string, response: string, context?: any) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Generate embedding for the prompt
    const embedding = await generateEmbedding(prompt)

    // Store in cache table
    await supabase.from('ai_cache').insert({
      user_id: userId,
      prompt,
      response,
      context: context || {},
      embedding,
      created_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Cache storage error:', error)
    // Don't throw - caching failure shouldn't break the main flow
  }
}

async function generateEmbedding(text: string): Promise<number[]> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
  if (!OPENAI_API_KEY) {
    throw new Error('OpenAI API key not configured for embeddings')
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'text-embedding-ada-002',
      input: text
    })
  })

  if (!response.ok) {
    throw new Error('Failed to generate embedding')
  }

  const result = await response.json()
  return result.data[0].embedding
}