// Supabase Edge Function for collecting and processing prompt optimization feedback
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { logger } from '../_shared/logger.ts'

interface FeedbackRequest {
  promptOptimizationId?: string
  templateId?: string
  feedbackType: 'positive' | 'negative' | 'suggestion' | 'error'
  feedbackText?: string
  codeQualityScore?: number // 1-5
  relevanceScore?: number // 1-5
  completenessScore?: number // 1-5
  issuesEncountered?: string[]
  improvementsSuggested?: string[]
  generatedCode?: string
  originalPrompt?: string
  optimizedPrompt?: string
}

interface FeedbackResponse {
  success: boolean
  feedbackId?: string
  message?: string
  templateMetrics?: {
    successRate: number
    usageCount: number
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

    // Parse request body
    const body: FeedbackRequest = await req.json()
    const {
      promptOptimizationId,
      templateId,
      feedbackType,
      feedbackText,
      codeQualityScore,
      relevanceScore,
      completenessScore,
      issuesEncountered,
      improvementsSuggested,
      generatedCode,
      originalPrompt,
      optimizedPrompt
    } = body

    // Validate required fields
    if (!feedbackType) {
      return new Response(JSON.stringify({ 
        error: 'Feedback type is required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Validate scores
    if (codeQualityScore && (codeQualityScore < 1 || codeQualityScore > 5)) {
      return new Response(JSON.stringify({ 
        error: 'Code quality score must be between 1 and 5' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // If we have generated code, analyze it for patterns
    let detectedIssues: string[] = issuesEncountered || []
    if (generatedCode && feedbackType === 'negative') {
      const codeIssues = analyzeCodeIssues(generatedCode)
      detectedIssues = [...new Set([...detectedIssues, ...codeIssues])]
    }

    // Store feedback
    const { data: feedback, error: feedbackError } = await supabase
      .from('prompt_feedback')
      .insert({
        user_id: authResult.userId,
        prompt_optimization_id: promptOptimizationId,
        template_id: templateId,
        feedback_type: feedbackType,
        feedback_text: feedbackText,
        code_quality_score: codeQualityScore,
        relevance_score: relevanceScore,
        completeness_score: completenessScore,
        issues_encountered: detectedIssues,
        improvements_suggested: improvementsSuggested,
        created_at: new Date().toISOString()
      })
      .select()
      .single()

    if (feedbackError) {
      throw feedbackError
    }

    // Log feedback event
    await logger.info('Prompt feedback received', {
      userId: authResult.userId,
      feedbackId: feedback.id,
      feedbackType,
      templateId,
      hasCodeQualityScore: !!codeQualityScore
    })

    // If negative feedback with suggestions, create improvement task
    if (feedbackType === 'negative' && improvementsSuggested && improvementsSuggested.length > 0) {
      await createImprovementTask(
        templateId,
        improvementsSuggested,
        detectedIssues,
        authResult.userId
      )
    }

    // Get updated template metrics if applicable
    let templateMetrics = undefined
    if (templateId) {
      const { data: template } = await supabase
        .from('prompt_templates')
        .select('success_rate, usage_count')
        .eq('template_id', templateId)
        .single()

      if (template) {
        templateMetrics = {
          successRate: template.success_rate,
          usageCount: template.usage_count
        }
      }
    }

    // If this is a learning opportunity, update the system
    if (feedbackType === 'positive' && originalPrompt && optimizedPrompt) {
      await updateLearningData(
        originalPrompt,
        optimizedPrompt,
        templateId,
        authResult.userId
      )
    }

    const response: FeedbackResponse = {
      success: true,
      feedbackId: feedback.id,
      message: 'Thank you for your feedback! It helps us improve the system.',
      templateMetrics
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    await logger.error('Feedback processing error', { error: error.message })
    return new Response(JSON.stringify({ 
      error: 'Failed to process feedback',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function analyzeCodeIssues(code: string): string[] {
  const issues: string[] = []
  
  // Check for common React Native issues
  if (!code.includes('StyleSheet.create') && code.includes('style=')) {
    issues.push('Inline styles detected - should use StyleSheet.create')
  }
  
  if (code.includes('console.log') || code.includes('console.error')) {
    issues.push('Console statements should be removed in production')
  }
  
  if (!code.includes('Platform.') && (code.includes('ios') || code.includes('android'))) {
    issues.push('Platform-specific code should use Platform.select or Platform.OS')
  }
  
  if (code.includes('any>') || code.includes(': any')) {
    issues.push('TypeScript "any" type detected - use proper types')
  }
  
  if (!code.includes('key=') && code.includes('map(')) {
    issues.push('Missing key prop in list rendering')
  }
  
  if (!code.includes('accessible') && !code.includes('accessibilityLabel')) {
    issues.push('Missing accessibility properties')
  }
  
  if (code.includes('catch') && !code.includes('error')) {
    issues.push('Error handling may be incomplete')
  }
  
  return issues
}

async function createImprovementTask(
  templateId: string | undefined,
  suggestions: string[],
  issues: string[],
  userId: string
) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Create an improvement task (could be sent to a queue or stored for review)
    await supabase
      .from('template_improvement_tasks')
      .insert({
        template_id: templateId,
        suggestions: suggestions,
        issues: issues,
        reported_by: userId,
        status: 'pending',
        created_at: new Date().toISOString()
      })

    await logger.info('Template improvement task created', {
      templateId,
      suggestionCount: suggestions.length,
      issueCount: issues.length
    })
  } catch (error) {
    console.error('Failed to create improvement task:', error)
  }
}

async function updateLearningData(
  originalPrompt: string,
  optimizedPrompt: string,
  templateId: string | undefined,
  userId: string
) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Store successful optimization patterns for future learning
    await supabase
      .from('optimization_patterns')
      .insert({
        original_prompt: originalPrompt,
        optimized_prompt: optimizedPrompt,
        template_id: templateId,
        user_id: userId,
        success: true,
        created_at: new Date().toISOString()
      })

    // Update template learning metrics
    if (templateId) {
      await supabase.rpc('increment_template_success', {
        p_template_id: templateId
      })
    }
  } catch (error) {
    console.error('Failed to update learning data:', error)
  }
}