import { supabase } from '../lib/supabase'

export interface TitleGenerationResult {
  title: string
  method: 'ai' | 'rules' | 'fallback'
  confidence: number
}

/**
 * Generate a concise project title using AI
 */
async function generateAITitle(prompt: string): Promise<{ title: string; confidence: number } | null> {
  try {
    const { data, error } = await supabase.functions.invoke('generate-project-title', {
      body: { prompt }
    })

    if (error) {
      console.warn('AI title generation failed:', error)
      return null
    }

    return {
      title: data.title || null,
      confidence: data.confidence || 0.8
    }
  } catch (error) {
    console.warn('AI title generation error:', error)
    return null
  }
}

/**
 * Generate a title using rule-based text processing
 */
function generateRuleBasedTitle(prompt: string): { title: string; confidence: number } {
  // Clean and normalize the prompt
  const cleaned = prompt
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  // Common words to filter out
  const stopWords = new Set([
    'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
    'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
    'to', 'was', 'will', 'with', 'can', 'could', 'should', 'would',
    'make', 'create', 'build', 'develop', 'design', 'implement',
    'simple', 'basic', 'easy', 'quick', 'small', 'new', 'modern',
    'i', 'want', 'need', 'like', 'please', 'help', 'me', 'my'
  ])

  // Split into words and filter
  const words = cleaned.split(' ')
    .filter(word => word.length > 2 && !stopWords.has(word))
    .slice(0, 5) // Take up to 5 meaningful words

  if (words.length === 0) {
    return { title: 'Untitled Project', confidence: 0.3 }
  }

  // Capitalize each word
  const titleWords = words.map(word => 
    word.charAt(0).toUpperCase() + word.slice(1)
  )

  // Join words, limit to 3-5 words for conciseness
  const title = titleWords.slice(0, Math.min(5, titleWords.length)).join(' ')
  
  // Higher confidence for more words found
  const confidence = Math.min(0.7, 0.4 + (titleWords.length * 0.1))

  return { title, confidence }
}

/**
 * Generate a concise project title using hybrid approach
 * 1. Try AI generation first
 * 2. Fallback to rule-based extraction
 * 3. Final fallback to "Untitled Project"
 */
export async function generateProjectTitle(prompt: string): Promise<TitleGenerationResult> {
  if (!prompt || prompt.trim().length === 0) {
    return {
      title: 'Untitled Project',
      method: 'fallback',
      confidence: 0.3
    }
  }

  // Try AI generation first
  const aiResult = await generateAITitle(prompt)
  if (aiResult && aiResult.title && aiResult.title.length > 0) {
    return {
      title: aiResult.title,
      method: 'ai',
      confidence: aiResult.confidence
    }
  }

  // Fallback to rule-based generation
  const ruleResult = generateRuleBasedTitle(prompt)
  if (ruleResult.title !== 'Untitled Project') {
    return {
      title: ruleResult.title,
      method: 'rules',
      confidence: ruleResult.confidence
    }
  }

  // Final fallback
  return {
    title: 'Untitled Project',
    method: 'fallback',
    confidence: 0.3
  }
}

/**
 * Sanitize title to ensure it meets requirements
 */
export function sanitizeTitle(title: string): string {
  return title
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters except hyphens
    .replace(/\s+/g, ' ') // Normalize whitespace
    .slice(0, 50) // Limit to 50 characters
}