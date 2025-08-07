// Supabase Edge Function for PRD management
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { logger } from '../_shared/logger.ts'

interface PRDRequest {
  action: 'create' | 'update' | 'get' | 'finalize' | 'generateSuggestions' | 'validateSection'
  conversationId?: string
  projectId?: string
  prdId?: string
  section?: 'overview' | 'core_features' | 'additional_features' | 'technical_requirements' | 'success_metrics'
  data?: any
  context?: any
}

interface PRDSuggestion {
  text: string
  category: 'continuation' | 'clarification' | 'example'
  section: string
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
    const body: PRDRequest = await req.json()
    const { action, conversationId, projectId, prdId, section, data, context } = body

    // Log request
    await logger.info('PRD management request', {
      userId: authResult.userId,
      action,
      conversationId,
      projectId,
      prdId,
      section
    })

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let response: any

    switch (action) {
      case 'create':
        response = await createPRD(supabase, authResult.userId, projectId!, conversationId)
        break

      case 'update':
        response = await updatePRDSection(supabase, authResult.userId, prdId!, section!, data)
        break

      case 'get':
        response = await getPRD(supabase, authResult.userId, prdId || conversationId)
        break

      case 'finalize':
        response = await finalizePRD(supabase, authResult.userId, prdId!)
        break

      case 'generateSuggestions':
        response = await generateSuggestions(supabase, conversationId!, section!, context)
        break

      case 'validateSection':
        response = await validatePRDSection(section!, data)
        break

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    await logger.error('PRD management error', { error: error.message })
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function createPRD(
  supabase: any,
  userId: string,
  projectId: string,
  conversationId?: string
) {
  // Check if a PRD already exists for this project
  const { data: existingPRD } = await supabase
    .from('prds')
    .select('id')
    .eq('project_id', projectId)
    .eq('status', 'draft')
    .single()

  if (existingPRD) {
    return { prdId: existingPRD.id, existing: true }
  }

  // Create new PRD
  const { data: newPRD, error } = await supabase
    .from('prds')
    .insert({
      user_id: userId,
      project_id: projectId,
      conversation_id: conversationId,
      title: 'Untitled PRD',
      status: 'draft',
      creation_flow_state: 'initialization'
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to create PRD: ${error.message}`)
  }

  // Create conversation state if conversation ID provided
  if (conversationId) {
    await supabase
      .from('prd_conversation_states')
      .insert({
        prd_id: newPRD.id,
        conversation_id: conversationId,
        current_section: 'initialization'
      })
  }

  return { prdId: newPRD.id, created: true }
}

async function updatePRDSection(
  supabase: any,
  userId: string,
  prdId: string,
  section: string,
  data: any
) {
  // Verify user owns the PRD
  const { data: prd, error: prdError } = await supabase
    .from('prds')
    .select('*')
    .eq('id', prdId)
    .eq('user_id', userId)
    .single()

  if (prdError || !prd) {
    throw new Error('PRD not found or access denied')
  }

  // Update the specific section
  const updateData: any = {
    [section]: data,
    last_section_completed: section,
    updated_at: new Date().toISOString()
  }

  // Calculate completion percentage
  const tempPRD = { ...prd, [section]: data }
  updateData.completion_percentage = calculateCompletion(tempPRD)

  // Update PRD status based on completion
  if (updateData.completion_percentage === 100 && prd.status === 'draft') {
    updateData.status = 'review'
  } else if (prd.status === 'draft') {
    updateData.status = 'in_progress'
  }

  const { data: updatedPRD, error: updateError } = await supabase
    .from('prds')
    .update(updateData)
    .eq('id', prdId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to update PRD: ${updateError.message}`)
  }

  // Update conversation state
  if (prd.conversation_id) {
    await supabase
      .from('prd_conversation_states')
      .update({
        current_section: getNextSection(section),
        section_progress: {
          ...prd.section_progress,
          [section]: true
        }
      })
      .eq('conversation_id', prd.conversation_id)
  }

  return { 
    prd: updatedPRD,
    nextSection: getNextSection(section),
    completionPercentage: updateData.completion_percentage
  }
}

async function getPRD(
  supabase: any,
  userId: string,
  identifier?: string
) {
  if (!identifier) {
    // Get all PRDs for user
    const { data, error } = await supabase
      .from('prds')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error(`Failed to fetch PRDs: ${error.message}`)
    }

    return { prds: data }
  }

  // Try to get by ID first
  let { data: prd, error } = await supabase
    .from('prds')
    .select('*')
    .eq('id', identifier)
    .eq('user_id', userId)
    .single()

  // If not found by ID, try by conversation ID
  if (!prd) {
    const result = await supabase
      .from('prds')
      .select('*')
      .eq('conversation_id', identifier)
      .eq('user_id', userId)
      .single()
    
    prd = result.data
    error = result.error
  }

  if (error || !prd) {
    return { prd: null }
  }

  // Get conversation state if exists
  let conversationState = null
  if (prd.conversation_id) {
    const { data } = await supabase
      .from('prd_conversation_states')
      .select('*')
      .eq('conversation_id', prd.conversation_id)
      .single()
    
    conversationState = data
  }

  return { prd, conversationState }
}

async function finalizePRD(
  supabase: any,
  userId: string,
  prdId: string
) {
  // Verify user owns the PRD
  const { data: prd, error: prdError } = await supabase
    .from('prds')
    .select('*')
    .eq('id', prdId)
    .eq('user_id', userId)
    .single()

  if (prdError || !prd) {
    throw new Error('PRD not found or access denied')
  }

  // Validate PRD is complete
  const validation = validateCompletePRD(prd)
  if (!validation.valid) {
    return { 
      error: 'PRD is not complete',
      validation 
    }
  }

  // Create version snapshot
  const { error: versionError } = await supabase
    .from('prd_versions')
    .insert({
      prd_id: prdId,
      version_number: prd.version,
      title: prd.title,
      overview: prd.overview,
      core_features: prd.core_features,
      additional_features: prd.additional_features,
      technical_requirements: prd.technical_requirements,
      success_metrics: prd.success_metrics,
      change_summary: 'Finalized version',
      created_by: userId
    })

  if (versionError) {
    throw new Error(`Failed to create version: ${versionError.message}`)
  }

  // Update PRD status
  const { data: updatedPRD, error: updateError } = await supabase
    .from('prds')
    .update({
      status: 'finalized',
      finalized_at: new Date().toISOString(),
      version: prd.version + 1
    })
    .eq('id', prdId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to finalize PRD: ${updateError.message}`)
  }

  return { 
    prd: updatedPRD,
    finalized: true,
    version: prd.version
  }
}

async function generateSuggestions(
  supabase: any,
  conversationId: string,
  section: string,
  context: any
): Promise<{ suggestions: PRDSuggestion[] }> {
  // Get conversation state
  const { data: conversationState } = await supabase
    .from('prd_conversation_states')
    .select('*')
    .eq('conversation_id', conversationId)
    .single()

  const suggestions: PRDSuggestion[] = []

  // Generate contextual suggestions based on section
  switch (section) {
    case 'overview':
      suggestions.push(
        { text: "It's a social app for connecting people with similar interests", category: 'example', section },
        { text: "I want to solve the problem of finding reliable service providers", category: 'continuation', section },
        { text: "My target users are small business owners aged 25-45", category: 'example', section }
      )
      break

    case 'core_features':
      suggestions.push(
        { text: "Add user authentication with email and social login", category: 'example', section },
        { text: "Include real-time chat messaging between users", category: 'example', section },
        { text: "Implement push notifications for important updates", category: 'example', section }
      )
      break

    case 'additional_features':
      suggestions.push(
        { text: "Add dark mode support for better user experience", category: 'example', section },
        { text: "Include analytics dashboard for tracking user activity", category: 'example', section },
        { text: "Implement offline mode with data synchronization", category: 'example', section }
      )
      break

    case 'technical_requirements':
      suggestions.push(
        { text: "Needs to work on both iOS and Android platforms", category: 'continuation', section },
        { text: "Should handle 10,000+ concurrent users", category: 'example', section },
        { text: "Must integrate with Stripe for payment processing", category: 'example', section }
      )
      break

    case 'success_metrics':
      suggestions.push(
        { text: "Achieve 1000 daily active users within 3 months", category: 'example', section },
        { text: "Maintain 4.5+ star rating on app stores", category: 'example', section },
        { text: "Reach 80% user retention rate after 30 days", category: 'example', section }
      )
      break

    default:
      suggestions.push(
        { text: "Tell me more about your app idea", category: 'clarification', section: 'overview' },
        { text: "Let's start with the main problem you're solving", category: 'continuation', section: 'overview' },
        { text: "I have a specific feature in mind", category: 'continuation', section: 'core_features' }
      )
  }

  // Store suggestions in conversation state
  if (conversationState) {
    await supabase
      .from('prd_conversation_states')
      .update({
        last_suggestions: suggestions,
        suggestion_context: context
      })
      .eq('conversation_id', conversationId)
  }

  return { suggestions }
}

function validatePRDSection(section: string, data: any): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = []
  const warnings: string[] = []

  switch (section) {
    case 'overview':
      if (!data.vision || data.vision.length < 10) {
        errors.push('Vision statement is too short or missing')
      }
      if (!data.problem || data.problem.length < 20) {
        errors.push('Problem statement needs more detail')
      }
      if (!data.targetUsers || data.targetUsers.length < 10) {
        errors.push('Target users description is required')
      }
      break

    case 'core_features':
      if (!Array.isArray(data) || data.length < 3) {
        errors.push('At least 3 core features are required')
      }
      data.forEach((feature: any, index: number) => {
        if (!feature.title || !feature.description) {
          errors.push(`Feature ${index + 1} is missing title or description`)
        }
      })
      break

    case 'additional_features':
      if (!Array.isArray(data)) {
        warnings.push('Additional features should be provided as a list')
      }
      break

    case 'technical_requirements':
      if (!data.platforms || data.platforms.length === 0) {
        errors.push('Target platforms must be specified')
      }
      if (!data.performance) {
        warnings.push('Performance requirements not specified')
      }
      break

    case 'success_metrics':
      if (!data.kpis || !Array.isArray(data.kpis) || data.kpis.length === 0) {
        errors.push('At least one KPI must be defined')
      }
      break
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

function calculateCompletion(prd: any): number {
  let completion = 0
  
  // Overview (20%)
  if (prd.overview?.vision && prd.overview?.problem && prd.overview?.targetUsers) {
    completion += 20
  }
  
  // Core features (30%)
  if (Array.isArray(prd.core_features) && prd.core_features.length >= 3) {
    completion += 30
  }
  
  // Additional features (20%)
  if (Array.isArray(prd.additional_features) && prd.additional_features.length > 0) {
    completion += 20
  }
  
  // Technical requirements (15%)
  if (prd.technical_requirements?.platforms && prd.technical_requirements.platforms.length > 0) {
    completion += 15
  }
  
  // Success metrics (15%)
  if (prd.success_metrics?.kpis && Array.isArray(prd.success_metrics.kpis) && prd.success_metrics.kpis.length > 0) {
    completion += 15
  }
  
  return completion
}

function getNextSection(currentSection: string): string {
  const sections = ['overview', 'core_features', 'additional_features', 'technical_requirements', 'success_metrics', 'review']
  const currentIndex = sections.indexOf(currentSection)
  
  if (currentIndex === -1 || currentIndex === sections.length - 1) {
    return 'review'
  }
  
  return sections[currentIndex + 1]
}

function validateCompletePRD(prd: any): { valid: boolean; missingFields: string[] } {
  const missingFields: string[] = []
  
  if (!prd.overview?.vision || !prd.overview?.problem || !prd.overview?.targetUsers) {
    missingFields.push('overview')
  }
  
  if (!Array.isArray(prd.core_features) || prd.core_features.length < 3) {
    missingFields.push('core_features (minimum 3 required)')
  }
  
  if (!prd.technical_requirements?.platforms) {
    missingFields.push('technical_requirements.platforms')
  }
  
  if (!prd.success_metrics?.kpis || !Array.isArray(prd.success_metrics.kpis) || prd.success_metrics.kpis.length === 0) {
    missingFields.push('success_metrics.kpis')
  }
  
  return {
    valid: missingFields.length === 0,
    missingFields
  }
}