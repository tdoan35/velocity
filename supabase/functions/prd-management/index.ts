// Supabase Edge Function for PRD management with flexible sections
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { logger } from '../_shared/logger.ts'
import { createContentExtractionService } from '../_shared/ai/content-extraction-service.ts'
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
  validateRichTextContent,
  extractTextFromHtml,
  AGENT_SECTION_CONFIGS
} from '../shared/prd-sections-config.ts'

interface PRDRequest {
  action: 'create' | 'update' | 'get' | 'finalize' | 'generateSuggestions' | 'validateSection' | 
          'updateSection' | 'addSection' | 'removeSection' | 'reorderSections' | 'updateSectionOrders' | 'getAgentStatus' |
          'initializeSections' | 'extractStructuredData' | 'resetToDefault' | 'updateSectionTitle'
  conversationId?: string
  projectId?: string
  prdId?: string
  sectionId?: string
  data?: any
  context?: any
  agent?: AgentType
  title?: string
  required?: boolean
  newOrder?: number
  sections?: Array<{ id: string; order: number }>
  sectionData?: {
    title: string
    agent: AgentType
    required?: boolean
    content?: { html: string; text: string }
    order?: number
    id?: string
    insertAfter?: string
  }
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
    const { action, conversationId, projectId, prdId, sectionId, data, context, agent, title, required, newOrder, sectionData } = body

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
        response = await updatePRDSectionFlexible(supabase, authResult.userId, prdId!, sectionId!, data)
        break

      case 'updateSection':
        response = await updatePRDSectionFlexible(supabase, authResult.userId, prdId!, sectionId!, data)
        break

      case 'addSection':
        // Support both new sectionData structure and legacy parameters
        if (sectionData) {
          response = await addPRDSectionEnhanced(supabase, authResult.userId, prdId!, sectionData)
        } else {
          // Legacy support
          response = await addPRDSection(supabase, authResult.userId, prdId!, title!, agent!, required)
        }
        break

      case 'removeSection':
        response = await removePRDSection(supabase, authResult.userId, prdId!, sectionId!)
        break

      case 'reorderSections':
        response = await reorderPRDSections(supabase, authResult.userId, prdId!, sectionId!, newOrder!)
        break

      case 'updateSectionOrders':
        response = await updatePRDSectionOrders(supabase, authResult.userId, prdId!, body.sections!)
        break

      case 'get':
        response = await getPRD(supabase, authResult.userId, prdId || conversationId, projectId)
        break

      case 'finalize':
        response = await finalizePRD(supabase, authResult.userId, prdId!)
        break

      case 'generateSuggestions':
        response = await generateSuggestions(supabase, prdId!, sectionId!, agent, context)
        break

      case 'validateSection':
        response = await validatePRDSectionFlexible(prdId!, sectionId!, data, supabase)
        break

      case 'getAgentStatus':
        response = await getAgentStatus(supabase, authResult.userId, prdId!, agent)
        break

      case 'initializeSections':
        response = await initializeSectionsForPRD(supabase, authResult.userId, prdId!)
        break

      case 'extractStructuredData':
        response = await extractStructuredDataFromSection(supabase, authResult.userId, prdId!, sectionId!)
        break

      case 'resetToDefault':
        response = await resetPRDToDefault(supabase, authResult.userId, prdId!)
        break

      case 'updateSectionTitle':
        response = await updatePRDSectionTitle(supabase, authResult.userId, prdId!, sectionId!, title!)
        break

      default:
        return new Response(JSON.stringify({ error: 'Invalid action' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }

    // Broadcast PRD update via Supabase Realtime if PRD was modified
    if (['update', 'updateSection', 'addSection', 'removeSection', 'reorderSections', 'updateSectionOrders', 'resetToDefault', 'updateSectionTitle'].includes(action) && projectId) {
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
  data: { html: string; text: string }
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

async function addPRDSectionEnhanced(
  supabase: any,
  userId: string,
  prdId: string,
  sectionData: {
    title: string
    agent: AgentType
    required?: boolean
    content?: { html: string; text: string }
    order?: number
    id?: string
    insertAfter?: string
  }
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
  
  // Pass through the insertAfter parameter to preserve insertion intent
  const updatedSections = addCustomSection(sections, {
    ...sectionData,
    insertAfter: sectionData.insertAfter
  })

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

  // Find the actual newly created section by ID instead of assuming it's at the end
  // The section ID should be provided in sectionData.id from the frontend
  const newSection = updatedSections.find(s => s.id === sectionData.id)
  
  if (!newSection) {
    throw new Error(`Failed to find newly created section with ID: ${sectionData.id}`)
  }
  
  return { 
    prd: updatedPRD,
    newSection: newSection,
    allSections: updatedSections, // NEW: Return all sections for frontend state sync
    enhanced: true
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
  // Legacy function - redirect to enhanced version
  return addPRDSectionEnhanced(supabase, userId, prdId, {
    title,
    agent,
    required
  })
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

async function updatePRDSectionOrders(
  supabase: any,
  userId: string,
  prdId: string,
  sectionOrders: Array<{ id: string; order: number }>
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
  
  // Update section orders
  const updatedSections = sections.map(section => {
    const newOrderInfo = sectionOrders.find(so => so.id === section.id)
    return newOrderInfo 
      ? { ...section, order: newOrderInfo.order }
      : section
  }).sort((a, b) => a.order - b.order)

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
    throw new Error(`Failed to update section orders: ${updateError.message}`)
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
  data: { html: string; text: string },
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

  // Use the rich text validation helper
  const validationResult = validateRichTextContent(data)
  const errors = [...validationResult.errors]
  const warnings = [...validationResult.warnings]

  // Section-specific validation using content analysis
  const htmlLower = data.html.toLowerCase()
  
  switch (sectionId) {
    case 'overview':
      if (!htmlLower.includes('<h2>vision</h2>') && !htmlLower.includes('vision')) {
        warnings.push('Overview should include a Vision section')
      }
      if (!htmlLower.includes('<h2>problem</h2>') && !htmlLower.includes('problem')) {
        warnings.push('Overview should include a Problem section')
      }
      if (!htmlLower.includes('<h2>target users</h2>') && !htmlLower.includes('target')) {
        warnings.push('Overview should include Target Users')
      }
      break

    case 'core_features':
      if (!htmlLower.includes('<ul>') && !htmlLower.includes('<ol>')) {
        warnings.push('Core features should be structured as a list')
      }
      // Check if there are at least some list items
      const listItems = (data.html.match(/<li>/gi) || []).length
      if (listItems < 3) {
        warnings.push('Consider adding at least 3 core features')
      }
      break

    case 'ui_design_patterns':
      if (!htmlLower.includes('design') && !htmlLower.includes('component')) {
        warnings.push('UI Design section should describe design patterns')
      }
      break

    case 'technical_architecture':
      if (!htmlLower.includes('platform') && !htmlLower.includes('tech')) {
        warnings.push('Technical Architecture should specify platforms and tech stack')
      }
      break

    case 'tech_integrations':
      if (!htmlLower.includes('service') && !htmlLower.includes('api') && !htmlLower.includes('integration')) {
        warnings.push('Tech Integrations should specify external services or APIs')
      }
      break
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}

async function initializeSectionsForPRD(
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

  // Check if sections already exist
  if (prd.sections && prd.sections.length > 0) {
    return { 
      prd,
      message: 'Sections already initialized'
    }
  }

  // Initialize with default sections using the imported function
  const defaultSections = initializePRDSections()
  
  const { data: updatedPRD, error: updateError } = await supabase
    .from('prds')
    .update({
      sections: defaultSections,
      updated_at: new Date().toISOString()
    })
    .eq('id', prdId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to initialize sections: ${updateError.message}`)
  }

  return { 
    prd: updatedPRD,
    sections: defaultSections,
    initialized: true
  }
}

async function extractStructuredDataFromSection(
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

  // Initialize the content extraction service
  const extractionService = createContentExtractionService()
  
  // Extract structured data from the rich text content
  const structuredData = await extractionService.extractStructuredData(
    section.content.html,
    sectionId
  )
  
  // Validate the extracted data
  const validation = extractionService.validateExtractedData(structuredData, sectionId)
  
  // Check if content is still template
  const isTemplate = extractionService.isTemplateContent(section.content.html)
  
  return {
    sectionId,
    sectionTitle: section.title,
    agent: section.agent,
    status: section.status,
    isTemplate,
    structuredData,
    validation,
    richTextContent: section.content,
    message: 'Structured data extracted successfully from rich text content'
  }
}

async function resetPRDToDefault(
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

  // Initialize default sections
  const defaultSections = initializePRDSections()
  
  const { data: updatedPRD, error: updateError } = await supabase
    .from('prds')
    .update({
      sections: defaultSections,
      completion_percentage: 0,
      status: 'draft',
      last_section_completed: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', prdId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to reset PRD: ${updateError.message}`)
  }

  return { 
    prd: updatedPRD,
    sections: defaultSections,
    reset: true,
    message: 'PRD reset to default template sections successfully'
  }
}

async function updatePRDSectionTitle(
  supabase: any,
  userId: string,
  prdId: string,
  sectionId: string,
  newTitle: string
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
  const sectionIndex = sections.findIndex(s => s.id === sectionId)
  
  if (sectionIndex === -1) {
    throw new Error(`Section ${sectionId} not found`)
  }

  const section = sections[sectionIndex]
  
  // Only allow renaming custom sections
  if (!section.isCustom) {
    throw new Error('Only custom sections can be renamed')
  }

  // Update the section title
  sections[sectionIndex] = {
    ...section,
    title: newTitle.trim()
  }

  // Save updated sections to database
  const { data: updatedPRD, error: updateError } = await supabase
    .from('prds')
    .update({
      sections: sections,
      updated_at: new Date().toISOString()
    })
    .eq('id', prdId)
    .select()
    .single()

  if (updateError) {
    throw new Error(`Failed to update section title: ${updateError.message}`)
  }

  return {
    prd: updatedPRD,
    updatedSection: sections[sectionIndex],
    message: `Section title updated to "${newTitle}" successfully`
  }
}

