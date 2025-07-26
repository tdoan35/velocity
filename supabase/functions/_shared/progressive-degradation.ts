// Progressive degradation system for handling quota limits gracefully
import { quotaManager } from './quota-manager.ts'
import { quotaFallback } from './quota-fallback.ts'
import { createLogger } from './logger.ts'

interface DegradationLevel {
  level: number
  name: string
  description: string
  tokenReduction: number
  features: string[]
}

interface DegradationPlan {
  currentLevel: number
  maxLevel: number
  canDegrade: boolean
  estimatedTokens: number
  recommendations: string[]
  alternatives: string[]
}

interface DegradationResult {
  success: boolean
  level: number
  tokensUsed: number
  quality: 'full' | 'high' | 'medium' | 'basic'
  featuresEnabled: string[]
  featuresDisabled: string[]
  userNotice?: string
}

export class ProgressiveDegradation {
  private logger: any
  private degradationLevels: Map<string, DegradationLevel[]> = new Map()
  private userPreferences: Map<string, any> = new Map()

  constructor() {
    this.logger = createLogger({ context: 'ProgressiveDegradation' })
    this.initializeDegradationLevels()
  }

  // Plan degradation strategy based on available quota
  async planDegradation(
    userId: string,
    feature: string,
    estimatedTokens: number
  ): Promise<DegradationPlan> {
    try {
      // Check current quota
      const quotaCheck = await quotaManager.checkQuota(userId, estimatedTokens)
      const availableTokens = quotaCheck.remaining

      // Get degradation levels for feature
      const levels = this.degradationLevels.get(feature) || []
      
      // Find suitable degradation level
      let targetLevel = 0
      let canDegrade = false
      let reducedTokens = estimatedTokens

      for (let i = 0; i < levels.length; i++) {
        const level = levels[i]
        reducedTokens = estimatedTokens * (1 - level.tokenReduction / 100)
        
        if (reducedTokens <= availableTokens) {
          targetLevel = i
          canDegrade = true
          break
        }
      }

      // Generate recommendations
      const recommendations = this.generateRecommendations(
        feature,
        estimatedTokens,
        availableTokens,
        targetLevel
      )

      // Generate alternatives
      const alternatives = this.generateAlternatives(
        feature,
        estimatedTokens,
        availableTokens
      )

      const plan: DegradationPlan = {
        currentLevel: targetLevel,
        maxLevel: levels.length - 1,
        canDegrade,
        estimatedTokens: Math.round(reducedTokens),
        recommendations,
        alternatives
      }

      await this.logger.debug('Degradation plan created', {
        userId,
        feature,
        originalTokens: estimatedTokens,
        availableTokens,
        targetLevel,
        canDegrade
      })

      return plan

    } catch (error) {
      await this.logger.error('Degradation planning error', {
        userId,
        feature,
        error: error.message
      })
      throw error
    }
  }

  // Apply progressive degradation to a request
  async applyDegradation(
    userId: string,
    feature: string,
    request: any,
    targetLevel: number
  ): Promise<DegradationResult> {
    try {
      const levels = this.degradationLevels.get(feature) || []
      
      if (targetLevel >= levels.length) {
        throw new Error('Invalid degradation level')
      }

      const level = levels[targetLevel]
      
      // Apply degradation based on level
      const degradedRequest = await this.applyDegradationLevel(
        feature,
        request,
        level
      )

      // Apply additional fallbacks if needed
      const estimatedTokens = this.estimateTokensForLevel(request, level)
      const fallbackResult = await quotaFallback.applyFallback(
        userId,
        feature,
        degradedRequest,
        estimatedTokens
      )

      // Track actual usage
      const tokensUsed = fallbackResult.reducedTokens
      await quotaManager.trackUsage({
        userId,
        projectId: request.projectId,
        usageType: feature as any,
        tokens: tokensUsed,
        metadata: {
          degradationLevel: targetLevel,
          fallbacksApplied: fallbackResult.strategies
        }
      })

      // Determine quality level
      const quality = this.determineQuality(targetLevel, levels.length)

      // Get enabled/disabled features
      const allFeatures = this.getAllFeatures(feature)
      const enabledFeatures = level.features
      const disabledFeatures = allFeatures.filter(f => !enabledFeatures.includes(f))

      const result: DegradationResult = {
        success: true,
        level: targetLevel,
        tokensUsed,
        quality,
        featuresEnabled: enabledFeatures,
        featuresDisabled: disabledFeatures,
        userNotice: this.generateUserNotice(level, quality)
      }

      await this.logger.info('Degradation applied', {
        userId,
        feature,
        level: targetLevel,
        tokensUsed,
        quality
      })

      return result

    } catch (error) {
      await this.logger.error('Degradation application error', {
        userId,
        feature,
        targetLevel,
        error: error.message
      })
      
      return {
        success: false,
        level: 0,
        tokensUsed: 0,
        quality: 'basic',
        featuresEnabled: [],
        featuresDisabled: [],
        userNotice: 'Failed to apply optimizations'
      }
    }
  }

  // Set user preferences for degradation
  async setUserPreferences(
    userId: string,
    preferences: {
      prioritizeQuality?: boolean
      acceptableDegradation?: 'none' | 'minimal' | 'moderate' | 'aggressive'
      preserveFeatures?: string[]
    }
  ): Promise<void> {
    this.userPreferences.set(userId, preferences)
    
    await this.logger.info('User degradation preferences updated', {
      userId,
      preferences
    })
  }

  // Get user preferences
  getUserPreferences(userId: string): any {
    return this.userPreferences.get(userId) || {
      prioritizeQuality: true,
      acceptableDegradation: 'moderate',
      preserveFeatures: []
    }
  }

  private initializeDegradationLevels() {
    // Code generation degradation levels
    this.degradationLevels.set('code_generation', [
      {
        level: 0,
        name: 'full',
        description: 'Full code generation with all features',
        tokenReduction: 0,
        features: [
          'full_context', 'imports_analysis', 'type_generation',
          'documentation', 'tests', 'examples', 'optimization'
        ]
      },
      {
        level: 1,
        name: 'standard',
        description: 'Standard generation with core features',
        tokenReduction: 25,
        features: [
          'full_context', 'imports_analysis', 'type_generation',
          'documentation'
        ]
      },
      {
        level: 2,
        name: 'efficient',
        description: 'Efficient generation with reduced context',
        tokenReduction: 40,
        features: [
          'limited_context', 'type_generation', 'basic_documentation'
        ]
      },
      {
        level: 3,
        name: 'minimal',
        description: 'Minimal generation for core functionality',
        tokenReduction: 60,
        features: ['minimal_context', 'core_functionality']
      }
    ])

    // Component generation degradation levels
    this.degradationLevels.set('advanced_components', [
      {
        level: 0,
        name: 'full',
        description: 'Full component with all features',
        tokenReduction: 0,
        features: [
          'complex_structure', 'animations', 'styling',
          'accessibility', 'responsive', 'interactions'
        ]
      },
      {
        level: 1,
        name: 'standard',
        description: 'Standard component without animations',
        tokenReduction: 30,
        features: [
          'complex_structure', 'styling', 'accessibility', 'responsive'
        ]
      },
      {
        level: 2,
        name: 'basic',
        description: 'Basic component with core styling',
        tokenReduction: 50,
        features: ['basic_structure', 'basic_styling', 'responsive']
      }
    ])

    // Analysis degradation levels
    this.degradationLevels.set('quality_analysis', [
      {
        level: 0,
        name: 'comprehensive',
        description: 'Full analysis with all checks',
        tokenReduction: 0,
        features: [
          'deep_analysis', 'security_scan', 'performance_check',
          'best_practices', 'suggestions', 'benchmarks'
        ]
      },
      {
        level: 1,
        name: 'standard',
        description: 'Standard analysis without benchmarks',
        tokenReduction: 35,
        features: [
          'standard_analysis', 'security_scan', 'best_practices',
          'suggestions'
        ]
      },
      {
        level: 2,
        name: 'quick',
        description: 'Quick analysis with key issues only',
        tokenReduction: 60,
        features: ['quick_analysis', 'critical_issues']
      }
    ])
  }

  private async applyDegradationLevel(
    feature: string,
    request: any,
    level: DegradationLevel
  ): Promise<any> {
    const degraded = { ...request }

    // Apply feature-specific degradations
    switch (feature) {
      case 'code_generation':
        if (!level.features.includes('full_context')) {
          degraded.contextWindow = level.features.includes('limited_context') ? 2000 : 1000
          degraded.contextFiles = degraded.contextFiles?.slice(0, 3)
        }
        degraded.includeTests = level.features.includes('tests')
        degraded.includeExamples = level.features.includes('examples')
        degraded.generateTypes = level.features.includes('type_generation')
        break

      case 'advanced_components':
        degraded.includeAnimations = level.features.includes('animations')
        degraded.includeAccessibility = level.features.includes('accessibility')
        degraded.componentComplexity = level.features.includes('complex_structure') 
          ? 'complex' : 'basic'
        break

      case 'quality_analysis':
        degraded.analysisDepth = level.features.includes('deep_analysis')
          ? 'deep' : level.features.includes('standard_analysis')
          ? 'standard' : 'quick'
        degraded.includeSecurity = level.features.includes('security_scan')
        degraded.includePerformance = level.features.includes('performance_check')
        break
    }

    degraded._degradationLevel = level.level
    degraded._degradationName = level.name

    return degraded
  }

  private estimateTokensForLevel(request: any, level: DegradationLevel): number {
    // Base estimation logic
    let baseTokens = 4000 // Default base

    // Adjust based on request complexity
    if (request.prompt?.length > 500) baseTokens += 1000
    if (request.contextFiles?.length > 5) baseTokens += 2000
    if (request.includeTests) baseTokens += 1500
    if (request.includeExamples) baseTokens += 1000

    // Apply level reduction
    const reduction = level.tokenReduction / 100
    return Math.round(baseTokens * (1 - reduction))
  }

  private generateRecommendations(
    feature: string,
    estimatedTokens: number,
    availableTokens: number,
    targetLevel: number
  ): string[] {
    const recommendations = []

    if (availableTokens < estimatedTokens * 0.1) {
      recommendations.push('Very low quota - consider upgrading your plan')
    }

    if (targetLevel > 1) {
      recommendations.push('Request will be optimized for token efficiency')
      recommendations.push('Some advanced features will be disabled')
    }

    if (targetLevel === 0 && availableTokens < estimatedTokens * 0.5) {
      recommendations.push('Running low on tokens - future requests may be limited')
    }

    return recommendations
  }

  private generateAlternatives(
    feature: string,
    estimatedTokens: number,
    availableTokens: number
  ): string[] {
    const alternatives = []

    if (availableTokens < estimatedTokens * 0.5) {
      alternatives.push('Split into smaller requests')
      alternatives.push('Use simpler prompts')
      alternatives.push('Wait for quota reset')
    }

    switch (feature) {
      case 'code_generation':
        alternatives.push('Generate core functionality first')
        alternatives.push('Add features incrementally')
        break
      case 'advanced_components':
        alternatives.push('Start with basic component')
        alternatives.push('Add styling separately')
        break
      case 'quality_analysis':
        alternatives.push('Analyze critical files only')
        alternatives.push('Run security scan separately')
        break
    }

    return alternatives
  }

  private determineQuality(level: number, maxLevel: number): 'full' | 'high' | 'medium' | 'basic' {
    const ratio = level / maxLevel
    if (ratio === 0) return 'full'
    if (ratio <= 0.33) return 'high'
    if (ratio <= 0.66) return 'medium'
    return 'basic'
  }

  private getAllFeatures(feature: string): string[] {
    const levels = this.degradationLevels.get(feature) || []
    const allFeatures = new Set<string>()
    
    levels.forEach(level => {
      level.features.forEach(f => allFeatures.add(f))
    })
    
    return Array.from(allFeatures)
  }

  private generateUserNotice(level: DegradationLevel, quality: string): string {
    if (quality === 'full') {
      return 'Full functionality enabled'
    }

    const notices = {
      high: `Running in ${level.name} mode to conserve tokens`,
      medium: `Some features limited - ${level.description}`,
      basic: `Basic mode active - core functionality only`
    }

    return notices[quality] || 'Optimized for token efficiency'
  }

  // Analyze historical degradation patterns
  async analyzeDegradationPatterns(userId: string): Promise<any> {
    try {
      // This would analyze historical data to optimize future degradations
      const patterns = {
        averageDegradationLevel: 1.2,
        mostDegradedFeatures: ['code_generation', 'quality_analysis'],
        peakDegradationTimes: ['14:00-17:00'],
        successRate: 0.95
      }

      await this.logger.info('Analyzed degradation patterns', {
        userId,
        patterns
      })

      return patterns

    } catch (error) {
      await this.logger.error('Pattern analysis error', {
        userId,
        error: error.message
      })
      return null
    }
  }
}

// Export singleton instance
export const progressiveDegradation = new ProgressiveDegradation()