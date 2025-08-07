// Supabase Edge Function for generating concise project titles
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { rateLimiter } from '../_shared/rate-limiter.ts'
import { logger } from '../_shared/logger.ts'
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateObject } from 'ai'
import { z } from 'zod'

// Zod schema for title generation response
const titleResponseSchema = z.object({
  title: z.string()
    .min(3)
    .max(50)
    .describe('A concise 3-5 word project title'),
  confidence: z.number()
    .min(0)
    .max(1)
    .describe('Confidence score for the generated title (0-1)'),
  reasoning: z.string()
    .optional()
    .describe('Brief explanation of why this title was chosen')
})

type TitleResponse = z.infer<typeof titleResponseSchema>

interface TitleRequest {
  prompt: string
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

    // Rate limiting - use a lighter limit for title generation
    const rateLimitCheck = await rateLimiter.check(authResult.userId, 'title-generation', 20, 60) // 20 per minute
    if (!rateLimitCheck.allowed) {
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded. Please try again later.',
        retryAfter: rateLimitCheck.retryAfter 
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request body
    const { prompt }: TitleRequest = await req.json()

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Initialize Anthropic client
    const anthropic = createAnthropic({
      apiKey: Deno.env.get('ANTHROPIC_API_KEY') || '',
    })

    // Generate title using Claude
    const systemPrompt = `You are an expert at creating concise, descriptive project titles for mobile applications.

Your task is to analyze the user's project description and generate a brief, catchy title that:
- Is 3-5 words maximum
- Captures the core purpose/functionality
- Sounds professional and engaging
- Is suitable for display in a project list
- Avoids generic words like "app", "simple", "basic" unless essential

Examples:
- "social media platform for photographers" → "Photo Community Hub"
- "task management app with team collaboration" → "Team Task Manager"
- "expense tracker for small business" → "Business Expense Tracker"
- "recipe sharing with meal planning" → "Recipe Meal Planner"
- "fitness tracker with workout routines" → "Fitness Workout Tracker"
- "e-commerce store for handmade crafts" → "Handmade Craft Store"

Generate a title with high confidence (0.8-0.95) if the prompt is clear and specific.
Use medium confidence (0.6-0.79) if the prompt is somewhat vague but workable.
Use low confidence (0.4-0.59) only if the prompt is very unclear.`

    const { object: titleResult } = await generateObject({
      model: anthropic('claude-3-haiku-20240307'),
      schema: titleResponseSchema,
      system: systemPrompt,
      prompt: `Generate a concise project title for: "${prompt}"`,
      temperature: 0.3, // Lower temperature for more consistent titles
    })

    // Log the generation for analytics
    await logger.info('Title generated', {
      userId: authResult.userId,
      originalPrompt: prompt,
      generatedTitle: titleResult.title,
      confidence: titleResult.confidence,
      method: 'ai'
    })

    return new Response(JSON.stringify(titleResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Title generation error:', error)
    
    await logger.error('Title generation failed', {
      error: error.message,
      stack: error.stack
    })

    return new Response(JSON.stringify({ 
      error: 'Failed to generate title',
      details: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})