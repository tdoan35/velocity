// Supabase Edge Function for comprehensive quality scoring system
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { createLogger } from '../_shared/logger.ts'

interface QualityScoringRequest {
  action: 'score' | 'update_weights' | 'get_benchmarks' | 'compare' | 'get_recommendations'
  targetType: 'code' | 'prompt' | 'response' | 'project'
  targetId: string
  content?: string
  metadata?: {
    language?: string
    framework?: string
    componentType?: string
    complexity?: number
    userFeedback?: any
  }
  weights?: QualityWeights
  compareWith?: string // ID for comparison
}

interface QualityWeights {
  syntaxCorrectness: number
  semanticAccuracy: number
  bestPractices: number
  performance: number
  security: number
  maintainability: number
  documentation: number
  userSatisfaction: number
}

interface QualityScore {
  overall: number
  breakdown: {
    syntaxCorrectness: number
    semanticAccuracy: number
    bestPractices: number
    performance: number
    security: number
    maintainability: number
    documentation: number
    userSatisfaction: number
  }
  confidence: number
  factors: Array<{
    name: string
    score: number
    weight: number
    impact: number
    details: string
  }>
  recommendations: Array<{
    category: string
    priority: 'high' | 'medium' | 'low'
    description: string
    estimatedImprovement: number
  }>
  benchmarks?: {
    percentile: number
    averageForType: number
    topPerformers: number
  }
}

const DEFAULT_WEIGHTS: QualityWeights = {
  syntaxCorrectness: 0.2,
  semanticAccuracy: 0.15,
  bestPractices: 0.15,
  performance: 0.1,
  security: 0.15,
  maintainability: 0.1,
  documentation: 0.05,
  userSatisfaction: 0.1
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

    const logger = createLogger({ 
      userId: authResult.userId,
      requestId: crypto.randomUUID()
    })

    const body: QualityScoringRequest = await req.json()
    const { action, targetType, targetId, content, metadata, weights, compareWith } = body

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let response: any

    switch (action) {
      case 'score':
        response = await calculateQualityScore(
          supabase,
          targetType,
          targetId,
          content,
          metadata,
          weights || DEFAULT_WEIGHTS,
          authResult.userId,
          logger
        )
        break

      case 'update_weights':
        response = await updateScoringWeights(
          supabase,
          authResult.userId,
          weights || DEFAULT_WEIGHTS
        )
        break

      case 'get_benchmarks':
        response = await getBenchmarks(
          supabase,
          targetType,
          metadata
        )
        break

      case 'compare':
        response = await compareQuality(
          supabase,
          targetId,
          compareWith!,
          targetType
        )
        break

      case 'get_recommendations':
        response = await getQualityRecommendations(
          supabase,
          targetId,
          targetType
        )
        break

      default:
        throw new Error(`Unknown action: ${action}`)
    }

    await logger.info('Quality scoring processed', {
      userId: authResult.userId,
      action,
      targetType,
      targetId
    })

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    const logger = createLogger({ requestId: crypto.randomUUID() })
    await logger.logError(error as Error, 'Quality scoring error')
    return new Response(JSON.stringify({ 
      error: 'Quality scoring failed',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function calculateQualityScore(
  supabase: any,
  targetType: string,
  targetId: string,
  content?: string,
  metadata?: any,
  weights?: QualityWeights,
  userId?: string,
  logger?: any
): Promise<QualityScore> {
  const startTime = Date.now()

  // Get or analyze content
  let targetContent = content
  let targetMetadata = metadata

  if (!targetContent) {
    const fetchResult = await fetchTargetContent(supabase, targetType, targetId)
    targetContent = fetchResult.content
    targetMetadata = { ...targetMetadata, ...fetchResult.metadata }
  }

  // Calculate individual scores
  const scores = {
    syntaxCorrectness: await scoreSyntaxCorrectness(targetContent, targetMetadata),
    semanticAccuracy: await scoreSemanticAccuracy(targetContent, targetMetadata),
    bestPractices: await scoreBestPractices(targetContent, targetMetadata),
    performance: await scorePerformance(targetContent, targetMetadata),
    security: await scoreSecurity(targetContent, targetMetadata),
    maintainability: await scoreMaintainability(targetContent, targetMetadata),
    documentation: await scoreDocumentation(targetContent, targetMetadata),
    userSatisfaction: await scoreUserSatisfaction(supabase, targetId, targetType)
  }

  // Apply weights and calculate overall score
  const factors: any[] = []
  let weightedSum = 0
  let totalWeight = 0

  Object.entries(scores).forEach(([factor, score]) => {
    const weight = weights![factor as keyof QualityWeights]
    const impact = score * weight
    weightedSum += impact
    totalWeight += weight

    factors.push({
      name: factor,
      score,
      weight,
      impact,
      details: getFactorDetails(factor, score)
    })
  })

  const overall = totalWeight > 0 ? weightedSum / totalWeight : 0

  // Calculate confidence based on available data
  const confidence = calculateConfidence(scores, targetMetadata)

  // Generate recommendations
  const recommendations = generateRecommendations(scores, weights!)

  // Get benchmarks if requested
  const benchmarks = await calculateBenchmarks(
    supabase,
    targetType,
    overall,
    targetMetadata
  )

  // Store the score
  await supabase.from('quality_scores').insert({
    target_id: targetId,
    target_type: targetType,
    user_id: userId,
    overall_score: overall,
    score_breakdown: scores,
    weights_used: weights,
    confidence,
    metadata: targetMetadata,
    created_at: new Date().toISOString()
  })

  // Log performance
  if (logger) {
    await logger.logPerformance('quality_scoring', startTime, {
      targetType,
      overall,
      confidence
    })
  }

  return {
    overall,
    breakdown: scores,
    confidence,
    factors,
    recommendations,
    benchmarks
  }
}

async function scoreSyntaxCorrectness(content: string, metadata: any): Promise<number> {
  // Validate syntax based on language
  const language = metadata?.language || 'javascript'
  
  try {
    switch (language) {
      case 'javascript':
      case 'typescript':
        // Use a simple syntax check (in production, use proper parser)
        new Function(content)
        return 1.0
      
      case 'jsx':
      case 'tsx':
        // Check for basic React Native patterns
        const hasValidJSX = content.includes('return') && 
                           (content.includes('<') && content.includes('>'))
        const hasImports = content.includes('import')
        const hasExports = content.includes('export')
        
        if (hasValidJSX && hasImports && hasExports) return 1.0
        if (hasValidJSX && (hasImports || hasExports)) return 0.8
        if (hasValidJSX) return 0.6
        return 0.3
        
      default:
        // Basic syntax patterns
        const hasValidStructure = content.split('\n').length > 1
        const hasIndentation = content.includes('  ') || content.includes('\t')
        return hasValidStructure && hasIndentation ? 0.8 : 0.5
    }
  } catch (error) {
    return 0.0
  }
}

async function scoreSemanticAccuracy(content: string, metadata: any): Promise<number> {
  let score = 0.5 // Base score

  // Check if content matches expected patterns for the component type
  const componentType = metadata?.componentType
  
  if (componentType) {
    const expectedPatterns = getExpectedPatterns(componentType)
    let matchCount = 0
    
    expectedPatterns.forEach(pattern => {
      if (content.includes(pattern)) matchCount++
    })
    
    score = matchCount / expectedPatterns.length
  }

  // Additional checks
  if (metadata?.framework === 'react-native') {
    // React Native specific patterns
    const rnPatterns = ['StyleSheet', 'View', 'Text', 'TouchableOpacity']
    const rnMatches = rnPatterns.filter(p => content.includes(p)).length
    score = (score + (rnMatches / rnPatterns.length)) / 2
  }

  return Math.min(1.0, score)
}

async function scoreBestPractices(content: string, metadata: any): Promise<number> {
  const violations = []
  
  // React Native best practices
  if (metadata?.framework === 'react-native') {
    // Check for inline styles
    if (/style\s*=\s*\{\{/.test(content)) {
      violations.push('inline-styles')
    }
    
    // Check for key prop in lists
    if (content.includes('.map(') && !content.includes('key=')) {
      violations.push('missing-key-prop')
    }
    
    // Check for proper imports
    if (!content.includes("from 'react-native'")) {
      violations.push('missing-rn-import')
    }
    
    // Check for proper component naming
    if (!/export\s+(?:default\s+)?(?:function|const)\s+[A-Z]/.test(content)) {
      violations.push('component-naming')
    }
  }

  // General best practices
  if (content.includes('console.log')) violations.push('console-logs')
  if (content.includes('// TODO')) violations.push('todos')
  if (!/\n\s*\/\*\*|\n\s*\/\//.test(content)) violations.push('no-comments')

  // Calculate score (deduct for violations)
  const maxViolations = 7
  const score = Math.max(0, 1 - (violations.length / maxViolations))
  
  return score
}

async function scorePerformance(content: string, metadata: any): Promise<number> {
  let score = 1.0

  // Check for performance anti-patterns
  const antiPatterns = [
    { pattern: /\.map\([^)]+\)\.map\(/, penalty: 0.1 }, // Chained maps
    { pattern: /style\s*=\s*\{\{/, penalty: 0.15 }, // Inline styles
    { pattern: /new\s+Array\(\d{4,}\)/, penalty: 0.2 }, // Large arrays
    { pattern: /setInterval|setTimeout.*\d{1,2}(?!\d)/, penalty: 0.1 }, // Fast timers
    { pattern: /JSON\.parse.*JSON\.stringify/, penalty: 0.1 }, // Deep cloning
  ]

  antiPatterns.forEach(({ pattern, penalty }) => {
    if (pattern.test(content)) {
      score -= penalty
    }
  })

  // Check for performance optimizations
  const optimizations = [
    { pattern: /React\.memo|useMemo|useCallback/, bonus: 0.1 },
    { pattern: /StyleSheet\.create/, bonus: 0.1 },
    { pattern: /FlatList|VirtualizedList/, bonus: 0.05 },
  ]

  optimizations.forEach(({ pattern, bonus }) => {
    if (pattern.test(content)) {
      score = Math.min(1.0, score + bonus)
    }
  })

  return Math.max(0, score)
}

async function scoreSecurity(content: string, metadata: any): Promise<number> {
  let score = 1.0
  const securityIssues = []

  // Check for security vulnerabilities
  const vulnerabilities = [
    { pattern: /eval\s*\(/, severity: 0.3, type: 'eval-usage' },
    { pattern: /dangerouslySetInnerHTML/, severity: 0.2, type: 'dangerous-html' },
    { pattern: /http:\/\//, severity: 0.15, type: 'insecure-protocol' },
    { pattern: /(api_key|apiKey|API_KEY)\s*[:=]\s*["'][^"']+["']/, severity: 0.25, type: 'hardcoded-secrets' },
    { pattern: /localStorage\.setItem.*password/, severity: 0.2, type: 'password-storage' },
  ]

  vulnerabilities.forEach(({ pattern, severity, type }) => {
    if (pattern.test(content)) {
      score -= severity
      securityIssues.push(type)
    }
  })

  // Check for security best practices
  if (content.includes('https://')) score = Math.min(1.0, score + 0.05)
  if (content.includes('sanitize') || content.includes('escape')) score = Math.min(1.0, score + 0.05)

  return Math.max(0, score)
}

async function scoreMaintainability(content: string, metadata: any): Promise<number> {
  const lines = content.split('\n')
  let score = 1.0

  // Check code complexity
  const functionCount = (content.match(/function\s+\w+|const\s+\w+\s*=\s*(?:\([^)]*\)|async)/g) || []).length
  const avgLinesPerFunction = lines.length / (functionCount || 1)
  
  if (avgLinesPerFunction > 50) score -= 0.2
  else if (avgLinesPerFunction > 30) score -= 0.1

  // Check nesting depth
  let maxNesting = 0
  let currentNesting = 0
  
  lines.forEach(line => {
    currentNesting += (line.match(/\{/g) || []).length
    currentNesting -= (line.match(/\}/g) || []).length
    maxNesting = Math.max(maxNesting, currentNesting)
  })
  
  if (maxNesting > 5) score -= 0.15
  else if (maxNesting > 3) score -= 0.05

  // Check naming conventions
  const hasDescriptiveNames = /const\s+[a-z][a-zA-Z]{3,}/.test(content)
  if (!hasDescriptiveNames) score -= 0.1

  // Check modularity
  const hasExports = content.includes('export')
  const hasImports = content.includes('import')
  if (hasExports && hasImports) score = Math.min(1.0, score + 0.1)

  return Math.max(0, score)
}

async function scoreDocumentation(content: string, metadata: any): Promise<number> {
  let score = 0

  // Check for various documentation types
  const docPatterns = [
    { pattern: /\/\*\*[\s\S]*?\*\//, weight: 0.3 }, // JSDoc comments
    { pattern: /\/\/\s*\w{5,}/, weight: 0.2 }, // Inline comments
    { pattern: /@param|@returns|@throws/, weight: 0.2 }, // JSDoc tags
    { pattern: /Props\s*=\s*\{[\s\S]*?\}/, weight: 0.15 }, // Type definitions
    { pattern: /README|readme/, weight: 0.15 }, // README references
  ]

  docPatterns.forEach(({ pattern, weight }) => {
    if (pattern.test(content)) {
      score += weight
    }
  })

  // Check comment density
  const commentLines = (content.match(/\/\/|\/\*|\*\//g) || []).length
  const totalLines = content.split('\n').length
  const commentRatio = commentLines / totalLines

  if (commentRatio > 0.1) score = Math.min(1.0, score + 0.2)
  else if (commentRatio > 0.05) score = Math.min(1.0, score + 0.1)

  return Math.min(1.0, score)
}

async function scoreUserSatisfaction(supabase: any, targetId: string, targetType: string): Promise<number> {
  // Get user feedback data
  const { data: feedback } = await supabase
    .from('user_feedback')
    .select('rating, feedback_type')
    .eq('target_id', targetId)
    .eq('target_type', targetType)

  if (!feedback || feedback.length === 0) {
    // No feedback yet, return neutral score
    return 0.7
  }

  // Calculate average rating
  const ratings = feedback.map(f => f.rating).filter(Boolean)
  const avgRating = ratings.length > 0 
    ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
    : 0

  // Normalize to 0-1 scale (assuming 5-star rating)
  const normalizedRating = avgRating / 5

  // Adjust based on feedback types
  const positiveCount = feedback.filter(f => f.feedback_type === 'positive').length
  const negativeCount = feedback.filter(f => f.feedback_type === 'negative').length
  const totalFeedback = positiveCount + negativeCount

  if (totalFeedback > 0) {
    const positiveRatio = positiveCount / totalFeedback
    // Weighted average of rating and positive ratio
    return (normalizedRating * 0.7) + (positiveRatio * 0.3)
  }

  return normalizedRating
}

function calculateConfidence(scores: any, metadata: any): number {
  // Base confidence on how much data we have
  let confidence = 0.5

  // Increase confidence based on available data
  if (metadata?.language) confidence += 0.1
  if (metadata?.framework) confidence += 0.1
  if (metadata?.componentType) confidence += 0.1
  if (metadata?.userFeedback) confidence += 0.1

  // Adjust based on score consistency
  const scoreValues = Object.values(scores) as number[]
  const avgScore = scoreValues.reduce((sum, s) => sum + s, 0) / scoreValues.length
  const variance = scoreValues.reduce((sum, s) => sum + Math.pow(s - avgScore, 2), 0) / scoreValues.length
  
  // Lower variance = higher confidence
  if (variance < 0.1) confidence += 0.1

  return Math.min(1.0, confidence)
}

function generateRecommendations(scores: any, weights: QualityWeights): any[] {
  const recommendations = []

  // Identify lowest scoring factors
  const factors = Object.entries(scores)
    .map(([name, score]) => ({ name, score: score as number }))
    .sort((a, b) => a.score - b.score)

  // Generate recommendations for low scores
  factors.slice(0, 3).forEach(({ name, score }) => {
    if (score < 0.7) {
      const weight = weights[name as keyof QualityWeights]
      const potentialImprovement = (1.0 - score) * weight

      recommendations.push({
        category: name,
        priority: score < 0.5 ? 'high' : 'medium',
        description: getRecommendation(name, score),
        estimatedImprovement: potentialImprovement
      })
    }
  })

  return recommendations.sort((a, b) => b.estimatedImprovement - a.estimatedImprovement)
}

function getRecommendation(factor: string, score: number): string {
  const recommendations: Record<string, Record<string, string>> = {
    syntaxCorrectness: {
      low: 'Fix syntax errors and ensure code compiles without issues',
      medium: 'Review syntax for consistency and correctness'
    },
    semanticAccuracy: {
      low: 'Ensure code implements the intended functionality correctly',
      medium: 'Verify that all requirements are properly addressed'
    },
    bestPractices: {
      low: 'Apply framework-specific best practices and conventions',
      medium: 'Review code against established coding standards'
    },
    performance: {
      low: 'Optimize performance-critical sections and remove bottlenecks',
      medium: 'Consider performance optimizations like memoization'
    },
    security: {
      low: 'Address critical security vulnerabilities immediately',
      medium: 'Review code for potential security issues'
    },
    maintainability: {
      low: 'Refactor complex code and improve modularity',
      medium: 'Enhance code structure and reduce complexity'
    },
    documentation: {
      low: 'Add comprehensive documentation and comments',
      medium: 'Improve existing documentation coverage'
    }
  }

  const level = score < 0.5 ? 'low' : 'medium'
  return recommendations[factor]?.[level] || 'Improve this quality aspect'
}

// Helper functions
function getExpectedPatterns(componentType: string): string[] {
  const patterns: Record<string, string[]> = {
    screen: ['View', 'SafeAreaView', 'useEffect', 'useState'],
    component: ['View', 'Text', 'props', 'return'],
    navigation: ['navigation', 'navigate', 'route', 'params'],
    api: ['fetch', 'async', 'await', 'try', 'catch'],
    state: ['useState', 'useReducer', 'dispatch', 'context'],
    styling: ['StyleSheet', 'styles', 'flex', 'backgroundColor']
  }

  return patterns[componentType] || []
}

function getFactorDetails(factor: string, score: number): string {
  if (score >= 0.9) return 'Excellent'
  if (score >= 0.7) return 'Good'
  if (score >= 0.5) return 'Needs improvement'
  return 'Poor'
}

async function fetchTargetContent(supabase: any, targetType: string, targetId: string): Promise<any> {
  let table = ''
  let contentField = ''

  switch (targetType) {
    case 'code':
      table = 'code_generations'
      contentField = 'code'
      break
    case 'prompt':
      table = 'prompt_templates'
      contentField = 'template'
      break
    case 'response':
      table = 'ai_responses'
      contentField = 'response'
      break
    case 'project':
      // For projects, get aggregated content
      const { data } = await supabase
        .from('code_generations')
        .select('code')
        .eq('project_id', targetId)
        .limit(10)
      
      return {
        content: data?.map(d => d.code).join('\n\n'),
        metadata: { isAggregate: true }
      }
  }

  const { data, error } = await supabase
    .from(table)
    .select(`${contentField}, metadata`)
    .eq('id', targetId)
    .single()

  if (error) throw error

  return {
    content: data[contentField],
    metadata: data.metadata || {}
  }
}

async function calculateBenchmarks(
  supabase: any,
  targetType: string,
  score: number,
  metadata: any
): Promise<any> {
  // Get similar scores for comparison
  let query = supabase
    .from('quality_scores')
    .select('overall_score')
    .eq('target_type', targetType)

  if (metadata?.componentType) {
    query = query.eq('metadata->componentType', metadata.componentType)
  }

  const { data } = await query

  if (!data || data.length === 0) return null

  const scores = data.map(d => d.overall_score).sort((a, b) => a - b)
  const position = scores.filter(s => s < score).length
  const percentile = (position / scores.length) * 100

  return {
    percentile: Math.round(percentile),
    averageForType: scores.reduce((sum, s) => sum + s, 0) / scores.length,
    topPerformers: scores[Math.floor(scores.length * 0.9)] || score
  }
}