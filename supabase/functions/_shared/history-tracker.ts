// User interaction history tracking and analysis

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

export interface InteractionEvent {
  userId: string
  projectId: string
  type: 'prompt' | 'code_generation' | 'refinement' | 'error_fix' | 'explanation'
  data: {
    prompt?: string
    response?: string
    context?: any
    patterns?: string[]
    files?: string[]
    duration?: number
    success?: boolean
  }
  metadata: {
    sessionId?: string
    timestamp: string
    modelVersion?: string
    tokenCount?: number
  }
}

export interface UserPreferences {
  userId: string
  projectId: string
  preferences: {
    codeStyle?: 'verbose' | 'concise' | 'balanced'
    commentLevel?: 'none' | 'minimal' | 'detailed'
    errorHandling?: 'basic' | 'comprehensive'
    testingApproach?: 'unit' | 'integration' | 'e2e' | 'all'
    preferredPatterns?: string[]
    avoidPatterns?: string[]
    language?: 'typescript' | 'javascript'
  }
  learnings: {
    commonMistakes?: string[]
    preferredSolutions?: Record<string, string>
    rejectedSuggestions?: string[]
  }
}

export interface HistoryAnalysis {
  userId: string
  projectId: string
  insights: {
    mostUsedPatterns: Array<{ pattern: string; count: number }>
    commonPromptTypes: Array<{ type: string; count: number }>
    averageSessionDuration: number
    successRate: number
    refinementRate: number
    preferredFileTypes: string[]
    peakUsageHours: number[]
  }
  recommendations: string[]
}

export class HistoryTracker {
  private supabase: any

  constructor() {
    this.supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
  }

  // Track a new interaction
  async trackInteraction(event: InteractionEvent): Promise<void> {
    try {
      // Store the interaction event
      await this.supabase.from('user_interactions').insert({
        user_id: event.userId,
        project_id: event.projectId,
        type: event.type,
        data: event.data,
        metadata: event.metadata,
        created_at: event.metadata.timestamp
      })

      // Update user statistics
      await this.updateUserStats(event)

      // Extract and store patterns if present
      if (event.data.patterns && event.data.patterns.length > 0) {
        await this.trackPatternUsage(event.userId, event.projectId, event.data.patterns)
      }

      // Learn from user feedback
      if (event.type === 'refinement' && event.data.prompt) {
        await this.learnFromRefinement(event)
      }
    } catch (error) {
      console.error('Failed to track interaction:', error)
    }
  }

  // Get recent user history
  async getUserHistory(
    userId: string,
    projectId: string,
    options: {
      limit?: number
      types?: InteractionEvent['type'][]
      since?: string
    } = {}
  ): Promise<InteractionEvent[]> {
    try {
      let query = this.supabase
        .from('user_interactions')
        .select('*')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })

      if (options.limit) {
        query = query.limit(options.limit)
      }

      if (options.types && options.types.length > 0) {
        query = query.in('type', options.types)
      }

      if (options.since) {
        query = query.gte('created_at', options.since)
      }

      const { data, error } = await query

      if (error) throw error

      return data || []
    } catch (error) {
      console.error('Failed to get user history:', error)
      return []
    }
  }

  // Get user preferences
  async getUserPreferences(userId: string, projectId: string): Promise<UserPreferences | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_preferences')
        .select('*')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .single()

      if (error || !data) {
        // Return default preferences
        return {
          userId,
          projectId,
          preferences: {
            codeStyle: 'balanced',
            commentLevel: 'minimal',
            errorHandling: 'comprehensive',
            testingApproach: 'unit',
            language: 'typescript'
          },
          learnings: {}
        }
      }

      return data
    } catch (error) {
      console.error('Failed to get user preferences:', error)
      return null
    }
  }

  // Update user preferences based on interactions
  async updateUserPreferences(
    userId: string,
    projectId: string,
    updates: Partial<UserPreferences['preferences']>
  ): Promise<void> {
    try {
      const existing = await this.getUserPreferences(userId, projectId)
      
      const preferences = {
        ...existing?.preferences,
        ...updates
      }

      await this.supabase
        .from('user_preferences')
        .upsert({
          user_id: userId,
          project_id: projectId,
          preferences,
          updated_at: new Date().toISOString()
        })
    } catch (error) {
      console.error('Failed to update preferences:', error)
    }
  }

  // Analyze user history for insights
  async analyzeUserHistory(userId: string, projectId: string): Promise<HistoryAnalysis> {
    try {
      // Get all interactions for analysis
      const history = await this.getUserHistory(userId, projectId, { limit: 100 })

      // Analyze patterns
      const patternCounts = new Map<string, number>()
      const promptTypeCounts = new Map<string, number>()
      const fileTypes = new Set<string>()
      const hourCounts = new Array(24).fill(0)
      
      let totalDuration = 0
      let successCount = 0
      let refinementCount = 0

      for (const event of history) {
        // Count patterns
        if (event.data.patterns) {
          for (const pattern of event.data.patterns) {
            patternCounts.set(pattern, (patternCounts.get(pattern) || 0) + 1)
          }
        }

        // Count prompt types
        promptTypeCounts.set(event.type, (promptTypeCounts.get(event.type) || 0) + 1)

        // Track file types
        if (event.data.files) {
          for (const file of event.data.files) {
            const ext = file.split('.').pop()
            if (ext) fileTypes.add(ext)
          }
        }

        // Track timing
        const hour = new Date(event.metadata.timestamp).getHours()
        hourCounts[hour]++

        // Track metrics
        if (event.data.duration) totalDuration += event.data.duration
        if (event.data.success) successCount++
        if (event.type === 'refinement') refinementCount++
      }

      // Generate insights
      const insights = {
        mostUsedPatterns: Array.from(patternCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([pattern, count]) => ({ pattern, count })),
        commonPromptTypes: Array.from(promptTypeCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .map(([type, count]) => ({ type, count })),
        averageSessionDuration: history.length > 0 ? totalDuration / history.length : 0,
        successRate: history.length > 0 ? successCount / history.length : 1,
        refinementRate: history.length > 0 ? refinementCount / history.length : 0,
        preferredFileTypes: Array.from(fileTypes),
        peakUsageHours: hourCounts
          .map((count, hour) => ({ hour, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 3)
          .map(item => item.hour)
      }

      // Generate recommendations
      const recommendations = this.generateRecommendations(insights)

      return {
        userId,
        projectId,
        insights,
        recommendations
      }
    } catch (error) {
      console.error('Failed to analyze history:', error)
      return {
        userId,
        projectId,
        insights: {
          mostUsedPatterns: [],
          commonPromptTypes: [],
          averageSessionDuration: 0,
          successRate: 1,
          refinementRate: 0,
          preferredFileTypes: [],
          peakUsageHours: []
        },
        recommendations: []
      }
    }
  }

  // Get contextual suggestions based on history
  async getContextualSuggestions(
    userId: string,
    projectId: string,
    currentPrompt: string
  ): Promise<string[]> {
    try {
      const suggestions: string[] = []

      // Get recent similar prompts
      const history = await this.getUserHistory(userId, projectId, {
        limit: 20,
        types: ['prompt', 'code_generation']
      })

      // Find similar past interactions
      const similarInteractions = history.filter(event => {
        if (!event.data.prompt) return false
        return this.calculateSimilarity(event.data.prompt, currentPrompt) > 0.6
      })

      // Extract successful patterns
      for (const interaction of similarInteractions) {
        if (interaction.data.success && interaction.data.patterns) {
          suggestions.push(`Consider using ${interaction.data.patterns.join(', ')} patterns`)
        }
      }

      // Get user preferences
      const prefs = await this.getUserPreferences(userId, projectId)
      if (prefs?.preferences.preferredPatterns) {
        suggestions.push(`Your preferred patterns: ${prefs.preferences.preferredPatterns.join(', ')}`)
      }

      // Add insights-based suggestions
      const analysis = await this.analyzeUserHistory(userId, projectId)
      if (analysis.insights.mostUsedPatterns.length > 0) {
        const topPattern = analysis.insights.mostUsedPatterns[0]
        suggestions.push(`You frequently use ${topPattern.pattern} pattern`)
      }

      return suggestions.slice(0, 5)
    } catch (error) {
      console.error('Failed to get suggestions:', error)
      return []
    }
  }

  // Private helper methods
  private async updateUserStats(event: InteractionEvent): Promise<void> {
    const stats = {
      total_interactions: 1,
      last_interaction: event.metadata.timestamp
    }

    if (event.type === 'code_generation') {
      stats['total_generations'] = 1
    }
    if (event.data.success) {
      stats['successful_interactions'] = 1
    }
    if (event.metadata.tokenCount) {
      stats['total_tokens'] = event.metadata.tokenCount
    }

    await this.supabase.rpc('increment_user_stats', {
      p_user_id: event.userId,
      p_project_id: event.projectId,
      p_stats: stats
    })
  }

  private async trackPatternUsage(
    userId: string,
    projectId: string,
    patterns: string[]
  ): Promise<void> {
    for (const pattern of patterns) {
      await this.supabase.from('pattern_usage').insert({
        user_id: userId,
        project_id: projectId,
        pattern_name: pattern,
        used_at: new Date().toISOString()
      })
    }
  }

  private async learnFromRefinement(event: InteractionEvent): Promise<void> {
    // Extract learning from refinement prompts
    if (event.data.prompt?.includes('instead') || event.data.prompt?.includes('change')) {
      const learning = {
        user_id: event.userId,
        project_id: event.projectId,
        type: 'refinement',
        original_context: event.data.context,
        refinement_prompt: event.data.prompt,
        learned_at: new Date().toISOString()
      }

      await this.supabase.from('user_learnings').insert(learning)
    }
  }

  private calculateSimilarity(text1: string, text2: string): number {
    // Simple word-based similarity
    const words1 = new Set(text1.toLowerCase().split(/\s+/))
    const words2 = new Set(text2.toLowerCase().split(/\s+/))
    
    const intersection = new Set([...words1].filter(x => words2.has(x)))
    const union = new Set([...words1, ...words2])
    
    return intersection.size / union.size
  }

  private generateRecommendations(insights: HistoryAnalysis['insights']): string[] {
    const recommendations: string[] = []

    // Pattern-based recommendations
    if (insights.mostUsedPatterns.length > 0) {
      const topPattern = insights.mostUsedPatterns[0]
      recommendations.push(
        `You frequently use ${topPattern.pattern}. Consider exploring related patterns for better architecture.`
      )
    }

    // Success rate recommendations
    if (insights.successRate < 0.7) {
      recommendations.push(
        'Your success rate is below 70%. Try providing more context in your prompts.'
      )
    }

    // Refinement recommendations
    if (insights.refinementRate > 0.3) {
      recommendations.push(
        'You refine prompts frequently. Consider being more specific in initial requests.'
      )
    }

    // Time-based recommendations
    if (insights.peakUsageHours.length > 0) {
      const peakHour = insights.peakUsageHours[0]
      recommendations.push(
        `You're most productive at ${peakHour}:00. Schedule complex tasks during this time.`
      )
    }

    // File type recommendations
    if (insights.preferredFileTypes.includes('tsx') && !insights.preferredFileTypes.includes('test')) {
      recommendations.push(
        'Consider adding more test files to improve code quality.'
      )
    }

    return recommendations
  }
}

// Export singleton instance
export const historyTracker = new HistoryTracker()