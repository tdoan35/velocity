// Supabase Edge Function for PRD management with flexible sections
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { logger } from '../_shared/logger.ts'
import {
  PRDSection,
  AgentType,
  initializePRDSections,
  getCurrentAgentFromSections,
  getSectionById,
  updateSectionContent,
  updateSectionStatus,
  addCustomSection,
  reorderSections,
  calculatePRDCompletion,
  getNextAgent,
  areAgentSectionsComplete,
  getAgentPrompts,
  AGENT_SECTION_CONFIGS
} from '../shared/prd-sections-config.ts'

interface PRDRequest {
  action: 'create' | 'update' | 'get' | 'finalize' | 'generateSuggestions' | 'validateSection' | 
          'updateSection' | 'addSection' | 'removeSection' | 'reorderSections' | 'getAgentStatus'
  conversationId?: string
  projectId?: string
  prdId?: string
  sectionId?: string
  section?: string // For backward compatibility
  data?: any
  context?: any
  agent?: AgentType
  title?: string
  required?: boolean
  newOrder?: number
}

interface PRDSuggestion {
  text: string
  category: 'continuation' | 'clarification' | 'example'
  section: string
  agent?: AgentType
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
    const { action, conversationId, projectId, prdId, sectionId, section, data, context, agent, title, required, newOrder } = body

    // Log request
    await logger.info('PRD management request', {
      userId: authResult.userId,
      action,
      conversationId,
      projectId,
      prdId,
      sectionId
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
        // Backward compatibility for old section updates
        if (section && !sectionId) {
          response = await updatePRDSectionLegacy(supabase, authResult.userId, prdId!, section, data)
        } else {
          response = await updatePRDSectionFlexible(supabase, authResult.userId, prdId!, sectionId!, data)
        }
        break

      case 'updateSection':
        response = await updatePRDSectionFlexible(supabase, authResult.userId, prdId!, sectionId!, data)
        break

      case 'addSection':
        response = await addPRDSection(supabase, authResult.userId, prdId!, title!, agent!, required)
        break

      case 'removeSection':
        response = await removePRDSection(supabase, authResult.userId, prdId!, sectionId!)
        break

      case 'reorderSections':
        response = await reorderPRDSections(supabase, authResult.userId, prdId!, sectionId!, newOrder!)
        break

      case 'get':
        response = await getPRD(supabase, authResult.userId, prdId || conversationId, projectId)
        break

      case 'finalize':
        response = await finalizePRD(supabase, authResult.userId, prdId!)
        break

      case 'generateSuggestions':
        response = await generateSuggestions(supabase, prdId!, sectionId || section!, agent, context)
        break

      case 'validateSection':
        response = await validatePRDSectionFlexible(prdId!, sectionId!, data, supabase)
        break

      case 'getAgentStatus':
        response = await getAgentStatus(supabase, authResult.userId, prdId!, agent)
        break

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    // Broadcast PRD update via Supabase Realtime if PRD was modified
    if (['update', 'updateSection', 'addSection', 'removeSection', 'reorderSections'].includes(action) && projectId) {
      const channel = supabase.channel(`prd_changes:${projectId}`)
      await channel.send({
        type: 'broadcast',
        event: 'prd_updated',
        payload: {
          prdId,
          action,
          sectionId,
          userId: authResult.userId,
          timestamp: new Date().toISOString()
        }
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
    .select('id, sections')
    .eq('project_id', projectId)
    .eq('status', 'draft')
    .single()

  if (existingPRD) {
    return { 
      prdId: existingPRD.id, 
      existing: true,
      sections: existingPRD.sections || []
    }
  }

  // Create new PRD with default sections
  const defaultSections = initializePRDSections()
  
  const { data: newPRD, error } = await supabase
    .from('prds')
    .insert({
      user_id: userId,
      project_id: projectId,
      conversation_id: conversationId,
      title: 'Untitled PRD',
      status: 'draft',
      creation_flow_state: 'initialization',
      sections: defaultSections,
      completion_percentage: 0
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
        current_section: 'overview'
      })
  }

  return { 
    prdId: newPRD.id, 
    created: true,
    sections: defaultSections,
    currentAgent: 'project_manager'
  }
}

async function updatePRDSectionFlexible(
  supabase: any,
  userId: string,
  prdId: string,
  sectionId: string,
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

  const sections: PRDSection[] = prd.sections || []
  const section = getSectionById(sections, sectionId)
  
  if (!section) {
    throw new Error(`Section ${sectionId} not found`)
  }

  // Update section content and mark as completed
  const updatedSections = updateSectionContent(sections, sectionId, data)
  const completionPercentage = calculatePRDCompletion(updatedSections)
  const currentAgent = getCurrentAgentFromSections(updatedSections)
  const nextAgent = getNextAgent(currentAgent)

  // Update PRD with new sections
  const updateData = {
    sections: updatedSections,
    completion_percentage: completionPercentage,
    last_section_completed: sectionId,
    updated_at: new Date().toISOString()
  }

  // Update PRD status based on completion
  if (completionPercentage === 100 && prd.status === 'draft') {
    updateData['status'] = 'review'
  } else if (prd.status === 'draft') {
    updateData['status'] = 'in_progress'
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

  // Check if current agent's required sections are complete
  const agentComplete = areAgentSectionsComplete(updatedSections, section.agent)

  return { 
    prd: updatedPRD,
    section: section,
    completionPercentage,
    currentAgent,
    nextAgent,
    agentComplete,
    handoffPrompt: agentComplete ? AGENT_SECTION_CONFIGS[section.agent].handoffPrompt : null
  }
}

async function addPRDSection(
  supabase: any,
  userId: string,
  prdId: string,
  title: string,
  agent: AgentType,
  required?: boolean
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

  const sections: PRDSection[] = prd.sections || []
  const updatedSections = addCustomSection(sections, title, agent, required)

  const { data: updatedPRD, error: updateError } = await supabase
    .from('prds')
    .update({
      sections: updatedSections,
      updated_at: new Date().toISOString()
    })
    .eq('id', prdId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to add section: ${updateError.message}`)
  }

  return { 
    prd: updatedPRD,
    newSection: updatedSections[updatedSections.length - 1]
  }
}

async function removePRDSection(
  supabase: any,
  userId: string,
  prdId: string,
  sectionId: string
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

  const sections: PRDSection[] = prd.sections || []
  const section = getSectionById(sections, sectionId)
  
  if (!section) {
    throw new Error(`Section ${sectionId} not found`)
  }

  if (section.required && !section.isCustom) {
    throw new Error('Cannot remove required default sections')
  }

  // Remove the section
  const updatedSections = sections.filter(s => s.id !== sectionId)
  const completionPercentage = calculatePRDCompletion(updatedSections)

  const { data: updatedPRD, error: updateError } = await supabase
    .from('prds')
    .update({
      sections: updatedSections,
      completion_percentage: completionPercentage,
      updated_at: new Date().toISOString()
    })
    .eq('id', prdId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to remove section: ${updateError.message}`)
  }

  return { 
    prd: updatedPRD,
    removed: true
  }
}

async function reorderPRDSections(
  supabase: any,
  userId: string,
  prdId: string,
  sectionId: string,
  newOrder: number
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

  const sections: PRDSection[] = prd.sections || []
  const updatedSections = reorderSections(sections, sectionId, newOrder)

  const { data: updatedPRD, error: updateError } = await supabase
    .from('prds')
    .update({
      sections: updatedSections,
      updated_at: new Date().toISOString()
    })
    .eq('id', prdId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to reorder sections: ${updateError.message}`)
  }

  return { 
    prd: updatedPRD,
    reordered: true
  }
}

async function getPRD(
  supabase: any,
  userId: string,
  identifier?: string,
  projectId?: string
) {
  // If projectId is provided, get PRD by project
  if (projectId && !identifier) {
    const { data: prd, error } = await supabase
      .from('prds')
      .select('*')
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (error || !prd) {
      return { prd: null }
    }

    const currentAgent = prd.sections ? getCurrentAgentFromSections(prd.sections) : 'project_manager'
    
    return { 
      prd,
      currentAgent,
      agentPrompts: getAgentPrompts(currentAgent)
    }
  }

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

  const currentAgent = prd.sections ? getCurrentAgentFromSections(prd.sections) : 'project_manager'

  return { 
    prd, 
    conversationState,
    currentAgent,
    agentPrompts: getAgentPrompts(currentAgent)
  }
}

async function getAgentStatus(
  supabase: any,
  userId: string,
  prdId: string,
  agent?: AgentType
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

  const sections: PRDSection[] = prd.sections || []
  const currentAgent = agent || getCurrentAgentFromSections(sections)
  const agentSections = sections.filter(s => s.agent === currentAgent)
  const requiredSections = agentSections.filter(s => s.required)
  const completedSections = requiredSections.filter(s => s.status === 'completed')
  const isComplete = areAgentSectionsComplete(sections, currentAgent)
  const nextAgent = getNextAgent(currentAgent)

  return {
    agent: currentAgent,
    sections: agentSections,
    requiredCount: requiredSections.length,
    completedCount: completedSections.length,
    isComplete,
    nextAgent,
    prompts: getAgentPrompts(currentAgent)
  }
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
  const sections: PRDSection[] = prd.sections || []
  const requiredSections = sections.filter(s => s.required)
  const incompleteSections = requiredSections.filter(s => s.status !== 'completed')
  
  if (incompleteSections.length > 0) {
    return { 
      error: 'PRD is not complete',
      incompleteSections: incompleteSections.map(s => ({
        id: s.id,
        title: s.title,
        agent: s.agent
      }))
    }
  }

  // Create version snapshot
  const { error: versionError } = await supabase
    .from('prd_versions')
    .insert({
      prd_id: prdId,
      version_number: prd.version,
      title: prd.title,
      sections: prd.sections,
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
  prdId: string,
  sectionId: string,
  agent?: AgentType,
  context?: any
): Promise<{ suggestions: PRDSuggestion[] }> {
  // Get PRD sections
  const { data: prd } = await supabase
    .from('prds')
    .select('sections')
    .eq('id', prdId)
    .single()

  const sections: PRDSection[] = prd?.sections || []
  const section = getSectionById(sections, sectionId)
  
  if (!section) {
    return { suggestions: [] }
  }

  const agentType = agent || section.agent
  const suggestions: PRDSuggestion[] = []

  // Generate contextual suggestions based on section and agent
  switch (sectionId) {
    case 'overview':
      suggestions.push(
        { text: "It's a social app for connecting people with similar interests", category: 'example', section: sectionId, agent: agentType },
        { text: "I want to solve the problem of finding reliable service providers", category: 'continuation', section: sectionId, agent: agentType },
        { text: "My target users are small business owners aged 25-45", category: 'example', section: sectionId, agent: agentType }
      )
      break

    case 'core_features':
      suggestions.push(
        { text: "Add user authentication with email and social login", category: 'example', section: sectionId, agent: agentType },
        { text: "Include real-time chat messaging between users", category: 'example', section: sectionId, agent: agentType },
        { text: "Implement push notifications for important updates", category: 'example', section: sectionId, agent: agentType }
      )
      break

    case 'ui_design_patterns':
      suggestions.push(
        { text: "Use a card-based layout for better mobile experience", category: 'example', section: sectionId, agent: agentType },
        { text: "Implement a dark mode option for user preference", category: 'example', section: sectionId, agent: agentType },
        { text: "Follow Material Design 3 guidelines for consistency", category: 'example', section: sectionId, agent: agentType }
      )
      break

    case 'technical_architecture':
      suggestions.push(
        { text: "Use React Native for cross-platform mobile development", category: 'example', section: sectionId, agent: agentType },
        { text: "Implement microservices architecture for scalability", category: 'example', section: sectionId, agent: agentType },
        { text: "Use PostgreSQL with Redis for caching", category: 'example', section: sectionId, agent: agentType }
      )
      break

    case 'tech_integrations':
      suggestions.push(
        { text: "Integrate Stripe for payment processing", category: 'example', section: sectionId, agent: agentType },
        { text: "Use SendGrid for transactional emails", category: 'example', section: sectionId, agent: agentType },
        { text: "Implement Google Analytics for usage tracking", category: 'example', section: sectionId, agent: agentType }
      )
      break

    default:
      // Generic suggestions
      suggestions.push(
        { text: "Tell me more about this section", category: 'clarification', section: sectionId, agent: agentType },
        { text: "Let's continue with the next requirement", category: 'continuation', section: sectionId, agent: agentType },
        { text: "I have a specific idea for this", category: 'continuation', section: sectionId, agent: agentType }
      )
  }

  return { suggestions }
}

async function validatePRDSectionFlexible(
  prdId: string,
  sectionId: string,
  data: any,
  supabase: any
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  const { data: prd } = await supabase
    .from('prds')
    .select('sections')
    .eq('id', prdId)
    .single()

  const sections: PRDSection[] = prd?.sections || []
  const section = getSectionById(sections, sectionId)
  
  if (!section) {
    return {
      valid: false,
      errors: [`Section ${sectionId} not found`],
      warnings: []
    }
  }

  const errors: string[] = []
  const warnings: string[] = []

  // Validate based on section template structure
  switch (sectionId) {
    case 'overview':
      if (!data.vision || data.vision.length < 10) {
        errors.push('Vision statement is too short or missing')
      }
      if (!data.problem || data.problem.length < 20) {
        errors.push('Problem statement needs more detail')
      }
      if (!data.targetUsers || data.targetUsers.length === 0) {
        errors.push('Target users must be specified')
      }
      break

    case 'core_features':
      if (!data.features || !Array.isArray(data.features) || data.features.length < 3) {
        errors.push('At least 3 core features are required')
      }
      break

    case 'ui_design_patterns':
      if (!data.designSystem || !data.patterns) {
        warnings.push('Design system and patterns should be defined')
      }
      break

    case 'technical_architecture':
      if (!data.platforms || data.platforms.length === 0) {
        errors.push('Target platforms must be specified')
      }
      if (!data.techStack) {
        errors.push('Technology stack must be defined')
      }
      break

    case 'tech_integrations':
      if (!data.integrations || data.integrations.length === 0) {
        warnings.push('No integrations specified')
      }
      break
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

// Legacy function for backward compatibility
async function updatePRDSectionLegacy(
  supabase: any,
  userId: string,
  prdId: string,
  sectionName: string,
  data: any
) {
  // Map old section names to new section IDs
  const sectionMapping: Record<string, string> = {
    'overview': 'overview',
    'core_features': 'core_features',
    'additional_features': 'additional_features',
    'technical_requirements': 'technical_architecture',
    'success_metrics': 'success_metrics'
  }

  const sectionId = sectionMapping[sectionName]
  if (!sectionId) {
    throw new Error(`Invalid section name: ${sectionName}`)
  }

  return updatePRDSectionFlexible(supabase, userId, prdId, sectionId, data)
}