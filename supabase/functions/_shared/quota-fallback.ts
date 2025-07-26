// Quota fallback strategies for graceful degradation
import { quotaManager } from './quota-manager.ts'
import { createLogger } from './logger.ts'

interface FallbackStrategy {
  name: string
  description: string
  tokenSavings: number
  qualityImpact: 'minimal' | 'moderate' | 'significant'
  apply: (request: any) => any
}

interface FallbackResult {
  applied: boolean
  strategies: string[]
  originalTokens: number
  reducedTokens: number
  qualityImpact: string
  modifiedRequest: any
}

export class QuotaFallbackHandler {
  private logger: any
  private strategies: Map<string, FallbackStrategy[]> = new Map()

  constructor() {
    this.logger = createLogger({ context: 'QuotaFallback' })
    this.initializeStrategies()
  }

  // Apply fallback strategies to fit within quota
  async applyFallback(
    userId: string,
    feature: string,
    request: any,
    estimatedTokens: number
  ): Promise<FallbackResult> {
    try {
      // Check current quota
      const quotaCheck = await quotaManager.checkQuota(userId, estimatedTokens)
      
      if (quotaCheck.allowed) {
        return {
          applied: false,
          strategies: [],
          originalTokens: estimatedTokens,
          reducedTokens: estimatedTokens,
          qualityImpact: 'none',
          modifiedRequest: request
        }
      }

      // Get available tokens
      const availableTokens = quotaCheck.remaining
      if (availableTokens <= 0) {
        throw new Error('No tokens remaining')
      }

      // Apply strategies progressively
      const appliedStrategies: string[] = []
      let modifiedRequest = { ...request }
      let currentEstimate = estimatedTokens
      let qualityImpact: 'minimal' | 'moderate' | 'significant' = 'minimal'

      const featureStrategies = this.strategies.get(feature) || []
      
      for (const strategy of featureStrategies) {
        if (currentEstimate <= availableTokens) break

        // Apply strategy
        modifiedRequest = strategy.apply(modifiedRequest)
        appliedStrategies.push(strategy.name)
        currentEstimate -= strategy.tokenSavings

        // Track quality impact
        if (strategy.qualityImpact === 'significant' || 
            (qualityImpact === 'minimal' && strategy.qualityImpact === 'moderate')) {
          qualityImpact = strategy.qualityImpact
        }

        await this.logger.debug('Applied fallback strategy', {
          strategy: strategy.name,
          tokenSavings: strategy.tokenSavings,
          newEstimate: currentEstimate
        })
      }

      // Check if we've reduced enough
      const success = currentEstimate <= availableTokens

      await this.logger.info('Quota fallback applied', {
        userId,
        feature,
        originalTokens: estimatedTokens,
        reducedTokens: currentEstimate,
        availableTokens,
        strategies: appliedStrategies,
        success
      })

      return {
        applied: true,
        strategies: appliedStrategies,
        originalTokens: estimatedTokens,
        reducedTokens: currentEstimate,
        qualityImpact,
        modifiedRequest: success ? modifiedRequest : request
      }

    } catch (error) {
      await this.logger.error('Fallback application error', {
        userId,
        feature,
        error: error.message
      })
      throw error
    }
  }

  // Check if fallback is possible for a feature
  canApplyFallback(feature: string, currentTokens: number, availableTokens: number): boolean {
    const strategies = this.strategies.get(feature) || []
    
    let potentialSavings = 0
    for (const strategy of strategies) {
      potentialSavings += strategy.tokenSavings
      if (currentTokens - potentialSavings <= availableTokens) {
        return true
      }
    }

    return false
  }

  // Get fallback options for a feature
  getFallbackOptions(feature: string): FallbackStrategy[] {
    return this.strategies.get(feature) || []
  }

  // Estimate token savings from applying all strategies
  estimateMaxSavings(feature: string): number {
    const strategies = this.strategies.get(feature) || []
    return strategies.reduce((total, strategy) => total + strategy.tokenSavings, 0)
  }

  private initializeStrategies() {
    // Code generation strategies
    this.strategies.set('code_generation', [
      {
        name: 'reduce_context_window',
        description: 'Limit context to most relevant files',
        tokenSavings: 2000,
        qualityImpact: 'minimal',
        apply: (req) => ({
          ...req,
          contextFiles: req.contextFiles?.slice(0, 3) || [],
          maxContextTokens: 2000
        })
      },
      {
        name: 'disable_imports_analysis',
        description: 'Skip automatic import resolution',
        tokenSavings: 500,
        qualityImpact: 'minimal',
        apply: (req) => ({
          ...req,
          analyzeImports: false
        })
      },
      {
        name: 'simplify_code_style',
        description: 'Generate more concise code',
        tokenSavings: 800,
        qualityImpact: 'moderate',
        apply: (req) => ({
          ...req,
          codeStyle: 'concise',
          includeComments: false,
          includeJSDoc: false
        })
      },
      {
        name: 'disable_type_generation',
        description: 'Skip TypeScript type generation',
        tokenSavings: 600,
        qualityImpact: 'moderate',
        apply: (req) => ({
          ...req,
          generateTypes: false,
          strictTypes: false
        })
      },
      {
        name: 'limit_generation_scope',
        description: 'Generate core functionality only',
        tokenSavings: 1500,
        qualityImpact: 'significant',
        apply: (req) => ({
          ...req,
          scope: 'core',
          includeHelpers: false,
          includeTests: false,
          includeExamples: false
        })
      }
    ])

    // Component generation strategies
    this.strategies.set('advanced_components', [
      {
        name: 'simplify_component_structure',
        description: 'Generate basic component structure',
        tokenSavings: 1000,
        qualityImpact: 'minimal',
        apply: (req) => ({
          ...req,
          componentComplexity: 'basic',
          useHooks: false
        })
      },
      {
        name: 'disable_styling',
        description: 'Skip style generation',
        tokenSavings: 800,
        qualityImpact: 'moderate',
        apply: (req) => ({
          ...req,
          includeStyles: false,
          styleSystem: 'none'
        })
      },
      {
        name: 'disable_animations',
        description: 'Skip animation code',
        tokenSavings: 600,
        qualityImpact: 'moderate',
        apply: (req) => ({
          ...req,
          includeAnimations: false,
          includeTransitions: false
        })
      },
      {
        name: 'minimal_props',
        description: 'Generate minimal prop interface',
        tokenSavings: 400,
        qualityImpact: 'significant',
        apply: (req) => ({
          ...req,
          propComplexity: 'minimal',
          includeDefaultProps: false
        })
      }
    ])

    // Analysis strategies
    this.strategies.set('quality_analysis', [
      {
        name: 'skip_deep_analysis',
        description: 'Perform surface-level analysis only',
        tokenSavings: 1200,
        qualityImpact: 'moderate',
        apply: (req) => ({
          ...req,
          analysisDepth: 'shallow',
          maxIssues: 10
        })
      },
      {
        name: 'disable_security_scan',
        description: 'Skip security vulnerability scan',
        tokenSavings: 800,
        qualityImpact: 'moderate',
        apply: (req) => ({
          ...req,
          includeSecurity: false
        })
      },
      {
        name: 'limit_suggestions',
        description: 'Provide top suggestions only',
        tokenSavings: 500,
        qualityImpact: 'minimal',
        apply: (req) => ({
          ...req,
          maxSuggestions: 3,
          includeExamples: false
        })
      }
    ])

    // Optimization strategies
    this.strategies.set('code_optimization', [
      {
        name: 'quick_optimization',
        description: 'Apply quick wins only',
        tokenSavings: 1000,
        qualityImpact: 'minimal',
        apply: (req) => ({
          ...req,
          optimizationLevel: 'quick',
          maxPasses: 1
        })
      },
      {
        name: 'skip_refactoring',
        description: 'Skip code refactoring',
        tokenSavings: 800,
        qualityImpact: 'moderate',
        apply: (req) => ({
          ...req,
          includeRefactoring: false
        })
      },
      {
        name: 'disable_benchmarks',
        description: 'Skip performance benchmarking',
        tokenSavings: 600,
        qualityImpact: 'minimal',
        apply: (req) => ({
          ...req,
          runBenchmarks: false,
          comparePerformance: false
        })
      }
    ])
  }

  // Dynamic strategy adjustment based on usage patterns
  async optimizeStrategies(userId: string): Promise<void> {
    try {
      // Get user's usage patterns
      const usageStats = await quotaManager.getUsageStats(userId)
      
      // Analyze which features consume most tokens
      const featureUsage = this.analyzeFeatureUsage(usageStats)
      
      // Adjust strategy priorities based on usage
      for (const [feature, usage] of Object.entries(featureUsage)) {
        if (usage.avgTokensPerRequest > 5000) {
          // High token usage - prioritize more aggressive strategies
          this.reorderStrategies(feature, 'aggressive')
        } else if (usage.frequency > 100 && usage.avgTokensPerRequest > 2000) {
          // Frequent moderate usage - balance quality and savings
          this.reorderStrategies(feature, 'balanced')
        }
      }

      await this.logger.info('Optimized fallback strategies', {
        userId,
        adjustments: Object.keys(featureUsage).length
      })

    } catch (error) {
      await this.logger.error('Strategy optimization error', {
        userId,
        error: error.message
      })
    }
  }

  private analyzeFeatureUsage(stats: any): Record<string, any> {
    // Analyze usage patterns per feature
    const analysis: Record<string, any> = {}
    
    // This would analyze the stats to determine usage patterns
    // For now, returning mock data
    return {
      code_generation: {
        frequency: 150,
        avgTokensPerRequest: 3500,
        peakHours: [14, 15, 16]
      },
      advanced_components: {
        frequency: 80,
        avgTokensPerRequest: 2200,
        peakHours: [10, 11, 14]
      }
    }
  }

  private reorderStrategies(feature: string, mode: 'aggressive' | 'balanced' | 'quality') {
    const strategies = this.strategies.get(feature)
    if (!strategies) return

    // Reorder based on mode
    strategies.sort((a, b) => {
      if (mode === 'aggressive') {
        // Prioritize token savings
        return b.tokenSavings - a.tokenSavings
      } else if (mode === 'quality') {
        // Prioritize quality preservation
        const qualityOrder = { minimal: 0, moderate: 1, significant: 2 }
        return qualityOrder[a.qualityImpact] - qualityOrder[b.qualityImpact]
      } else {
        // Balanced - consider both savings and impact
        const aScore = a.tokenSavings / (qualityOrder[a.qualityImpact] + 1)
        const bScore = b.tokenSavings / (qualityOrder[b.qualityImpact] + 1)
        return bScore - aScore
      }
    })
  }

  // Generate user-friendly explanation of applied fallbacks
  explainFallbacks(result: FallbackResult): string {
    if (!result.applied) {
      return 'Full feature functionality available.'
    }

    const explanations = []
    const savings = result.originalTokens - result.reducedTokens
    const savingsPercent = ((savings / result.originalTokens) * 100).toFixed(0)

    explanations.push(`Optimized request to save ${savingsPercent}% tokens (${savings} tokens saved)`)

    if (result.qualityImpact === 'minimal') {
      explanations.push('Output quality maintained with minor adjustments')
    } else if (result.qualityImpact === 'moderate') {
      explanations.push('Some advanced features disabled to fit quota')
    } else {
      explanations.push('Core functionality preserved, advanced features limited')
    }

    if (result.strategies.length > 0) {
      explanations.push(`Applied optimizations: ${result.strategies.join(', ')}`)
    }

    return explanations.join('. ')
  }
}

// Export singleton instance
export const quotaFallback = new QuotaFallbackHandler()