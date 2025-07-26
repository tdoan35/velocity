// Supabase Edge Function for intelligent prompt optimization
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { rateLimiter } from '../_shared/rate-limiter.ts'
import { logger } from '../_shared/logger.ts'
import { detectPatterns, getBestPractices, REACT_NATIVE_PATTERNS, Pattern } from '../_shared/patterns.ts'

interface OptimizePromptRequest {
  prompt: string
  targetComponent?: 'screen' | 'component' | 'navigation' | 'api' | 'state' | 'styling' | 'storage' | 'animation' | 'gesture'
  projectContext?: {
    techStack?: string[]
    existingPatterns?: string[]
    dependencies?: string[]
    fileStructure?: string[]
    recentFiles?: string[]
    projectName?: string
    currentFile?: string
  }
  previousAttempts?: Array<{
    prompt: string
    feedback?: string
    issues?: string[]
  }>
  maxTokens?: number
  includeExamples?: boolean
  optimization?: 'speed' | 'quality' | 'balanced'
  experimentalFeatures?: boolean
}

interface OptimizePromptResponse {
  optimizedPrompt: string
  template?: string
  suggestions?: string[]
  patterns?: string[]
  estimatedTokens?: number
  confidence?: number
  cached?: boolean
  debugInfo?: any
}

interface ContextSection {
  title: string
  content: string
  priority: number
  tokens: number
  removable: boolean
}

const MAX_TOKENS = {
  'claude-3-opus': 200000,
  'claude-3-sonnet': 200000,
  'claude-3-haiku': 200000,
  'gpt-4': 128000,
  'default': 100000
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
    const rateLimitCheck = await rateLimiter.check(authResult.userId, 'ai-optimization')
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
    const body: OptimizePromptRequest = await req.json()
    const { 
      prompt, 
      targetComponent, 
      projectContext, 
      previousAttempts,
      maxTokens = 4000,
      includeExamples = true,
      optimization = 'balanced',
      experimentalFeatures = false
    } = body

    if (!prompt) {
      return new Response(JSON.stringify({ error: 'Prompt is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Log request
    await logger.info('Prompt optimization request', {
      userId: authResult.userId,
      promptLength: prompt.length,
      targetComponent,
      optimization,
      hasPreviousAttempts: !!previousAttempts?.length
    })

    // Check cache for similar prompts
    const cachedResult = await checkSimilarPrompts(prompt, authResult.userId, targetComponent)
    if (cachedResult && optimization !== 'quality') {
      await logger.info('Cache hit for prompt optimization', {
        userId: authResult.userId,
        similarity: cachedResult.similarity
      })
      
      // Update cache hit count
      await updateCacheHitCount(cachedResult.id)
      
      return new Response(JSON.stringify({
        optimizedPrompt: cachedResult.optimizedPrompt,
        template: cachedResult.templateId,
        patterns: cachedResult.patterns,
        estimatedTokens: estimateTokens(cachedResult.optimizedPrompt),
        confidence: cachedResult.similarity,
        cached: true
      } as OptimizePromptResponse), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Detect patterns in the prompt
    const detectedPatterns = detectPatterns(prompt)
    
    // Get template from database or use built-in
    const template = await getOptimalTemplate(prompt, targetComponent, detectedPatterns)
    
    // Build context sections
    const contextSections = await buildContextSections(
      prompt,
      template,
      projectContext,
      previousAttempts,
      detectedPatterns,
      includeExamples
    )
    
    // Apply dynamic prompt sizing
    const optimizedSections = await optimizeForTokenLimit(
      contextSections,
      maxTokens,
      optimization
    )
    
    // Assemble final prompt
    const optimizedPrompt = assembleOptimizedPrompt(optimizedSections)
    
    // Generate suggestions based on analysis
    const suggestions = generateIntelligentSuggestions(
      prompt,
      template,
      detectedPatterns,
      projectContext
    )
    
    // Calculate confidence score
    const confidence = calculateConfidence(
      prompt,
      template,
      detectedPatterns,
      previousAttempts
    )
    
    // Store in cache with enhanced metadata
    await storeCachedPrompt(
      authResult.userId,
      prompt,
      optimizedPrompt,
      template?.template_id || template?.id,
      targetComponent,
      detectedPatterns.map(p => p.id),
      confidence
    )
    
    // Log success with metrics
    await logger.info('Prompt optimization completed', {
      userId: authResult.userId,
      templateUsed: template?.template_id || template?.id,
      patternsDetected: detectedPatterns.length,
      optimizedLength: optimizedPrompt.length,
      tokenReduction: Math.round((1 - optimizedPrompt.length / prompt.length) * 100),
      confidence
    })

    const response: OptimizePromptResponse = {
      optimizedPrompt,
      template: template?.template_id || template?.id,
      suggestions,
      patterns: detectedPatterns.map(p => p.name),
      estimatedTokens: estimateTokens(optimizedPrompt),
      confidence,
      cached: false
    }
    
    if (experimentalFeatures) {
      response.debugInfo = {
        contextSections: contextSections.map(s => ({ title: s.title, tokens: s.tokens })),
        detectedPatterns: detectedPatterns.map(p => p.id),
        tokenBudget: maxTokens
      }
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    await logger.error('Prompt optimization error', { error: error.message })
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function getOptimalTemplate(
  prompt: string,
  targetComponent?: string,
  patterns?: Pattern[]
): Promise<any> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  // Try to get template from database first
  const { data: dbTemplate } = await supabase.rpc('get_best_template', {
    p_prompt: prompt,
    p_category: targetComponent
  })

  if (dbTemplate && dbTemplate.length > 0) {
    return dbTemplate[0]
  }

  // Fallback to pattern-based template selection
  if (patterns && patterns.length > 0) {
    // Find the most relevant pattern based on category match
    const relevantPattern = patterns.find(p => p.category === targetComponent) || patterns[0]
    
    return {
      template_id: relevantPattern.id,
      name: relevantPattern.name,
      category: relevantPattern.category,
      template_content: generateTemplateFromPattern(relevantPattern, prompt)
    }
  }

  // Default template if nothing matches
  return {
    template_id: 'generic',
    name: 'Generic React Native Component',
    category: 'component',
    template_content: `Create a React Native component based on the following requirements:
{prompt}

Ensure the implementation:
- Uses TypeScript with proper type definitions
- Follows React Native best practices
- Handles both iOS and Android platforms
- Includes proper error handling and loading states
- Has accessibility support`
  }
}

function generateTemplateFromPattern(pattern: Pattern, prompt: string): string {
  const bestPractices = pattern.bestPractices.map(bp => `- ${bp}`).join('\n')
  const components = pattern.components.join(', ')
  
  return `Implement a ${pattern.name} with the following requirements:
${prompt}

Technical Requirements:
- Use these components: ${components}
- Import from: ${pattern.imports.join(', ')}
- Follow these patterns: ${pattern.keywords.join(', ')}

Best Practices:
${bestPractices}

${pattern.examples.length > 0 ? `\nExample patterns:\n${pattern.examples.join('\n')}` : ''}`
}

async function buildContextSections(
  prompt: string,
  template: any,
  projectContext?: any,
  previousAttempts?: any[],
  patterns?: Pattern[],
  includeExamples?: boolean
): Promise<ContextSection[]> {
  const sections: ContextSection[] = []
  
  // Core prompt section (always included)
  sections.push({
    title: 'Requirements',
    content: template?.template_content ? 
      template.template_content.replace('{prompt}', prompt) : 
      prompt,
    priority: 100,
    tokens: estimateTokens(prompt),
    removable: false
  })
  
  // Pattern-based best practices
  if (patterns && patterns.length > 0) {
    const allBestPractices = getBestPractices(patterns)
    const practicesContent = allBestPractices.map(bp => `- ${bp}`).join('\n')
    
    sections.push({
      title: 'Best Practices',
      content: `Follow these React Native best practices:\n${practicesContent}`,
      priority: 90,
      tokens: estimateTokens(practicesContent),
      removable: true
    })
  }
  
  // Project context
  if (projectContext) {
    const contextLines: string[] = []
    
    if (projectContext.techStack?.length > 0) {
      contextLines.push(`Technology Stack: ${projectContext.techStack.join(', ')}`)
    }
    
    if (projectContext.dependencies?.length > 0) {
      contextLines.push(`Available Dependencies: ${projectContext.dependencies.join(', ')}`)
    }
    
    if (projectContext.existingPatterns?.length > 0) {
      contextLines.push(`Follow patterns from: ${projectContext.existingPatterns.join(', ')}`)
    }
    
    if (projectContext.fileStructure?.length > 0) {
      contextLines.push(`Project Structure:\n${projectContext.fileStructure.slice(0, 10).join('\n')}`)
    }
    
    if (contextLines.length > 0) {
      const contextContent = contextLines.join('\n\n')
      sections.push({
        title: 'Project Context',
        content: contextContent,
        priority: 80,
        tokens: estimateTokens(contextContent),
        removable: true
      })
    }
  }
  
  // Learning from previous attempts
  if (previousAttempts && previousAttempts.length > 0) {
    const learnings = previousAttempts
      .filter(a => a.feedback || a.issues?.length > 0)
      .map(a => {
        const parts = []
        if (a.feedback) parts.push(`Feedback: ${a.feedback}`)
        if (a.issues?.length > 0) parts.push(`Issues: ${a.issues.join(', ')}`)
        return parts.join('\n')
      })
      .join('\n\n')
    
    if (learnings) {
      sections.push({
        title: 'Previous Attempts',
        content: `Learn from previous attempts:\n${learnings}`,
        priority: 70,
        tokens: estimateTokens(learnings),
        removable: true
      })
    }
  }
  
  // Code examples (if requested)
  if (includeExamples && patterns && patterns.length > 0) {
    const examples = patterns
      .flatMap(p => p.examples)
      .slice(0, 3)
      .join('\n\n')
    
    if (examples) {
      sections.push({
        title: 'Code Examples',
        content: `Reference these example patterns:\n\`\`\`typescript\n${examples}\n\`\`\``,
        priority: 60,
        tokens: estimateTokens(examples),
        removable: true
      })
    }
  }
  
  // Anti-patterns to avoid
  const antiPatterns = patterns
    ?.flatMap(p => p.antiPatterns || [])
    .filter(Boolean)
  
  if (antiPatterns && antiPatterns.length > 0) {
    sections.push({
      title: 'Anti-patterns',
      content: `Avoid these anti-patterns:\n${antiPatterns.map(ap => `- ${ap}`).join('\n')}`,
      priority: 50,
      tokens: estimateTokens(antiPatterns.join('\n')),
      removable: true
    })
  }
  
  // General guidelines (lowest priority)
  sections.push({
    title: 'General Guidelines',
    content: `General React Native Development Guidelines:
- Use functional components with hooks
- Implement proper TypeScript types
- Handle loading and error states
- Ensure iOS and Android compatibility
- Include accessibility properties
- Follow performance best practices
- Use StyleSheet.create() for styles
- Implement proper key props in lists`,
    priority: 40,
    tokens: estimateTokens('General React Native Development Guidelines...'),
    removable: true
  })
  
  return sections
}

async function optimizeForTokenLimit(
  sections: ContextSection[],
  maxTokens: number,
  optimization: string
): Promise<ContextSection[]> {
  // Sort by priority (highest first)
  const sortedSections = [...sections].sort((a, b) => b.priority - a.priority)
  
  let currentTokens = 0
  const includedSections: ContextSection[] = []
  
  for (const section of sortedSections) {
    // Always include non-removable sections
    if (!section.removable) {
      includedSections.push(section)
      currentTokens += section.tokens
      continue
    }
    
    // Check if we can fit this section
    if (currentTokens + section.tokens <= maxTokens) {
      includedSections.push(section)
      currentTokens += section.tokens
    } else if (optimization === 'quality') {
      // In quality mode, try to compress content instead of removing
      const compressedContent = await compressContent(section.content, maxTokens - currentTokens)
      if (compressedContent) {
        includedSections.push({
          ...section,
          content: compressedContent,
          tokens: estimateTokens(compressedContent)
        })
        currentTokens += estimateTokens(compressedContent)
      }
    }
  }
  
  return includedSections
}

async function compressContent(content: string, targetTokens: number): Promise<string | null> {
  const currentTokens = estimateTokens(content)
  if (currentTokens <= targetTokens) return content
  
  // Simple compression: remove extra whitespace and truncate
  const compressed = content
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s{2,}/g, ' ')
    .trim()
  
  const compressedTokens = estimateTokens(compressed)
  if (compressedTokens <= targetTokens) return compressed
  
  // More aggressive: truncate to fit
  const ratio = targetTokens / compressedTokens
  const targetLength = Math.floor(compressed.length * ratio * 0.9) // 90% to be safe
  
  return compressed.substring(0, targetLength) + '...'
}

function assembleOptimizedPrompt(sections: ContextSection[]): string {
  return sections
    .sort((a, b) => b.priority - a.priority)
    .map(section => {
      if (section.title === 'Requirements') {
        return section.content
      }
      return `\n${section.title}:\n${section.content}`
    })
    .join('\n')
    .trim()
}

function generateIntelligentSuggestions(
  prompt: string,
  template: any,
  patterns: Pattern[],
  projectContext?: any
): string[] {
  const suggestions: string[] = []
  const promptLower = prompt.toLowerCase()
  
  // Check for missing technical requirements
  if (!promptLower.includes('typescript') && !promptLower.includes('types')) {
    suggestions.push('Consider specifying TypeScript requirements for type safety')
  }
  
  if (!promptLower.includes('error') && !promptLower.includes('loading')) {
    suggestions.push('Include error handling and loading state requirements')
  }
  
  if (!promptLower.includes('accessibility') && !promptLower.includes('a11y')) {
    suggestions.push('Add accessibility requirements for inclusive design')
  }
  
  if (!promptLower.includes('test') && !promptLower.includes('testing')) {
    suggestions.push('Consider including testing requirements')
  }
  
  // Pattern-specific suggestions
  if (patterns.length > 0) {
    const mainPattern = patterns[0]
    
    if (mainPattern.category === 'navigation' && !promptLower.includes('deep link')) {
      suggestions.push('Consider adding deep linking requirements for navigation')
    }
    
    if (mainPattern.category === 'api' && !promptLower.includes('cache')) {
      suggestions.push('Include caching strategy for API responses')
    }
    
    if (mainPattern.category === 'state' && !promptLower.includes('persist')) {
      suggestions.push('Specify if state should be persisted')
    }
  }
  
  // Context-based suggestions
  if (projectContext?.dependencies) {
    const deps = projectContext.dependencies.map(d => d.toLowerCase())
    
    if (deps.includes('react-query') && promptLower.includes('api')) {
      suggestions.push('Use React Query for API state management')
    }
    
    if (deps.includes('zustand') && promptLower.includes('state')) {
      suggestions.push('Leverage Zustand for state management')
    }
  }
  
  return suggestions.slice(0, 5) // Limit to 5 most relevant suggestions
}

function calculateConfidence(
  prompt: string,
  template: any,
  patterns: Pattern[],
  previousAttempts?: any[]
): number {
  let confidence = 0.5 // Base confidence
  
  // Template match boosts confidence
  if (template && template.relevance_score) {
    confidence += template.relevance_score * 0.2
  }
  
  // Pattern detection boosts confidence
  if (patterns.length > 0) {
    confidence += Math.min(patterns.length * 0.1, 0.3)
  }
  
  // Previous attempts reduce confidence
  if (previousAttempts && previousAttempts.length > 0) {
    confidence -= previousAttempts.length * 0.05
  }
  
  // Specific keywords boost confidence
  const techKeywords = ['typescript', 'react native', 'expo', 'component', 'screen', 'navigation']
  const keywordMatches = techKeywords.filter(k => prompt.toLowerCase().includes(k)).length
  confidence += keywordMatches * 0.05
  
  return Math.max(0.1, Math.min(0.95, confidence))
}

function estimateTokens(text: string): number {
  // More accurate token estimation
  // Average: 1 token ≈ 4 characters, but code is denser
  const codeMultiplier = text.includes('```') ? 0.3 : 0.25
  return Math.ceil(text.length * codeMultiplier)
}

async function checkSimilarPrompts(
  prompt: string, 
  userId: string,
  targetComponent?: string
): Promise<any> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const embedding = await generateEmbedding(prompt)

    // Enhanced similarity search with component filtering
    const { data, error } = await supabase.rpc('search_similar_prompts', {
      query_embedding: embedding,
      match_threshold: 0.85,
      match_count: 3,
      user_id: userId
    })

    if (error || !data || data.length === 0) {
      return null
    }

    // Filter by target component if specified
    const filtered = targetComponent
      ? data.filter(d => d.target_component === targetComponent)
      : data

    if (filtered.length === 0) return null

    return {
      id: filtered[0].id,
      optimizedPrompt: filtered[0].optimized_prompt,
      templateId: filtered[0].template_id,
      patterns: filtered[0].patterns || [],
      similarity: filtered[0].similarity
    }
  } catch (error) {
    console.error('Cache lookup error:', error)
    return null
  }
}

async function updateCacheHitCount(cacheId: string) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    await supabase
      .from('prompt_optimizations')
      .update({ used_count: supabase.raw('used_count + 1') })
      .eq('id', cacheId)
  } catch (error) {
    console.error('Cache update error:', error)
  }
}

async function storeCachedPrompt(
  userId: string,
  originalPrompt: string,
  optimizedPrompt: string,
  templateId?: string,
  targetComponent?: string,
  patterns?: string[],
  confidence?: number
) {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const embedding = await generateEmbedding(originalPrompt)

    await supabase.from('prompt_optimizations').insert({
      user_id: userId,
      original_prompt: originalPrompt,
      optimized_prompt: optimizedPrompt,
      template_id: templateId,
      embedding,
      target_component: targetComponent,
      patterns,
      confidence,
      created_at: new Date().toISOString()
    })
  } catch (error) {
    console.error('Cache storage error:', error)
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
      input: text.slice(0, 8000) // Limit input size
    })
  })

  if (!response.ok) {
    throw new Error('Failed to generate embedding')
  }

  const result = await response.json()
  return result.data[0].embedding
}