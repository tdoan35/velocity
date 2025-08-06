// Supabase Edge Function for collecting and processing code quality feedback
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { logger } from '../_shared/logger.ts'

interface QualityFeedbackRequest {
  qualityResultId: string
  codeGenerationId?: string
  feedbackType: 'acceptance' | 'rejection' | 'improvement'
  userScore?: number // 1-10
  issuesFixed?: string[]
  issuesIgnored?: string[]
  additionalFeedback?: string
  codeModified?: boolean
  finalCode?: string
}

interface QualityFeedbackResponse {
  success: boolean
  message: string
  updatedMetrics?: {
    projectQualityTrend: number
    ruleEffectiveness: Record<string, number>
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authResult = await requireAuth(req)
    if (!authResult.authorized) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body: QualityFeedbackRequest = await req.json()
    const {
      qualityResultId,
      codeGenerationId,
      feedbackType,
      userScore,
      issuesFixed,
      issuesIgnored,
      additionalFeedback,
      codeModified,
      finalCode
    } = body

    if (!qualityResultId || !feedbackType) {
      return new Response(JSON.stringify({ 
        error: 'Quality result ID and feedback type are required' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Get the original quality result
    const { data: qualityResult, error: fetchError } = await supabase
      .from('code_quality_results')
      .select('*, code_issues(*), security_vulnerabilities(*), performance_issues(*)')
      .eq('id', qualityResultId)
      .single()

    if (fetchError || !qualityResult) {
      return new Response(JSON.stringify({ 
        error: 'Quality result not found' 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Process feedback based on type
    await processFeedback(
      supabase,
      qualityResult,
      feedbackType,
      userScore,
      issuesFixed,
      issuesIgnored
    )

    // Update rule effectiveness based on feedback
    if (issuesFixed || issuesIgnored) {
      await updateRuleEffectiveness(
        supabase,
        qualityResult.code_issues,
        issuesFixed || [],
        issuesIgnored || []
      )
    }

    // Store the feedback
    await supabase.from('quality_feedback_history').insert({
      quality_result_id: qualityResultId,
      code_generation_id: codeGenerationId,
      user_id: authResult.userId,
      feedback_type: feedbackType,
      user_score: userScore,
      issues_fixed: issuesFixed,
      issues_ignored: issuesIgnored,
      additional_feedback: additionalFeedback,
      code_modified: codeModified,
      final_code: finalCode,
      created_at: new Date().toISOString()
    })

    // Calculate updated metrics
    const updatedMetrics = await calculateUpdatedMetrics(
      supabase,
      qualityResult.project_id,
      authResult.userId
    )

    await logger.info('Quality feedback received', {
      userId: authResult.userId,
      qualityResultId,
      feedbackType,
      userScore,
      issuesFixedCount: issuesFixed?.length || 0,
      issuesIgnoredCount: issuesIgnored?.length || 0
    })

    const response: QualityFeedbackResponse = {
      success: true,
      message: 'Thank you for your feedback. It helps improve our code quality analysis.',
      updatedMetrics
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    await logger.error('Quality feedback error', { error: error.message })
    return new Response(JSON.stringify({ 
      error: 'Failed to process feedback',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function processFeedback(
  supabase: any,
  qualityResult: any,
  feedbackType: string,
  userScore?: number,
  issuesFixed?: string[],
  issuesIgnored?: string[]
) {
  // Update quality result with feedback
  const updates: any = {
    feedback_received: true,
    feedback_type: feedbackType,
    user_satisfaction_score: userScore,
    updated_at: new Date().toISOString()
  }

  // Adjust scores based on feedback
  if (feedbackType === 'rejection' && userScore) {
    // User rejected the analysis - adjust scores down
    const adjustment = (10 - userScore) * 5 // Max -45 points
    updates.adjusted_overall_score = Math.max(0, qualityResult.overall_score - adjustment)
  } else if (feedbackType === 'acceptance' && userScore) {
    // User accepted the analysis - slight boost
    const adjustment = (userScore - 5) * 2 // Max +10 points
    updates.adjusted_overall_score = Math.min(100, qualityResult.overall_score + adjustment)
  }

  await supabase
    .from('code_quality_results')
    .update(updates)
    .eq('id', qualityResult.id)
}

async function updateRuleEffectiveness(
  supabase: any,
  issues: any[],
  issuesFixed: string[],
  issuesIgnored: string[]
) {
  // Track which rules were effective (fixed) vs ignored
  const ruleStats: Record<string, { fixed: number; ignored: number }> = {}

  issues.forEach(issue => {
    if (!ruleStats[issue.rule_id]) {
      ruleStats[issue.rule_id] = { fixed: 0, ignored: 0 }
    }

    if (issuesFixed.includes(issue.id)) {
      ruleStats[issue.rule_id].fixed++
    } else if (issuesIgnored.includes(issue.id)) {
      ruleStats[issue.rule_id].ignored++
    }
  })

  // Update rule effectiveness in database
  for (const [ruleId, stats] of Object.entries(ruleStats)) {
    const { data: rule } = await supabase
      .from('quality_rules')
      .select('effectiveness_score, feedback_count')
      .eq('rule_id', ruleId)
      .single()

    if (rule) {
      // Calculate new effectiveness score
      const currentScore = rule.effectiveness_score || 0.5
      const feedbackCount = rule.feedback_count || 0
      
      // Weight: fixed = +1, ignored = -0.5
      const newFeedback = stats.fixed - (stats.ignored * 0.5)
      const newScore = (currentScore * feedbackCount + newFeedback) / (feedbackCount + stats.fixed + stats.ignored)
      
      await supabase
        .from('quality_rules')
        .update({
          effectiveness_score: Math.max(0, Math.min(1, newScore)),
          feedback_count: feedbackCount + stats.fixed + stats.ignored,
          last_feedback_at: new Date().toISOString()
        })
        .eq('rule_id', ruleId)
    }
  }
}

async function calculateUpdatedMetrics(
  supabase: any,
  projectId: string,
  userId: string
): Promise<any> {
  // Get recent quality results for the project
  const { data: recentResults } = await supabase
    .from('code_quality_results')
    .select('overall_score, adjusted_overall_score, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (!recentResults || recentResults.length === 0) {
    return null
  }

  // Calculate quality trend
  const scores = recentResults.map(r => r.adjusted_overall_score || r.overall_score)
  const trend = scores.length > 1 ? scores[0] - scores[scores.length - 1] : 0

  // Get rule effectiveness for the project
  const { data: ruleData } = await supabase
    .from('quality_rules')
    .select('rule_id, effectiveness_score')
    .gt('feedback_count', 0)
    .order('effectiveness_score', { ascending: false })
    .limit(5)

  const ruleEffectiveness = ruleData?.reduce((acc, rule) => {
    acc[rule.rule_id] = rule.effectiveness_score
    return acc
  }, {} as Record<string, number>)

  return {
    projectQualityTrend: trend,
    ruleEffectiveness
  }
}

// Add table creation for feedback history
const createFeedbackTable = `
CREATE TABLE IF NOT EXISTS quality_feedback_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quality_result_id UUID REFERENCES code_quality_results(id),
  code_generation_id UUID,
  user_id UUID REFERENCES auth.users(id),
  feedback_type VARCHAR(20) CHECK (feedback_type IN ('acceptance', 'rejection', 'improvement')),
  user_score INTEGER CHECK (user_score >= 1 AND user_score <= 10),
  issues_fixed TEXT[],
  issues_ignored TEXT[],
  additional_feedback TEXT,
  code_modified BOOLEAN DEFAULT false,
  final_code TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_feedback_quality_result ON quality_feedback_history(quality_result_id);
CREATE INDEX idx_feedback_user ON quality_feedback_history(user_id);

-- Add columns to quality_rules table
ALTER TABLE quality_rules 
ADD COLUMN IF NOT EXISTS effectiveness_score DECIMAL(3,2) DEFAULT 0.50,
ADD COLUMN IF NOT EXISTS feedback_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_feedback_at TIMESTAMPTZ;

-- Add columns to code_quality_results table  
ALTER TABLE code_quality_results
ADD COLUMN IF NOT EXISTS feedback_received BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS feedback_type VARCHAR(20),
ADD COLUMN IF NOT EXISTS user_satisfaction_score INTEGER,
ADD COLUMN IF NOT EXISTS adjusted_overall_score INTEGER;
`