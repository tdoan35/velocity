// Feature gating middleware for subscription-based access control
import { quotaManager } from './quota-manager.ts'
import { createLogger } from './logger.ts'

interface GateCheckResult {
  allowed: boolean
  reason?: string
  requiredTier?: string
  upgradeUrl?: string
  alternativeFeatures?: string[]
}

interface FeatureGateOptions {
  gracefulDegradation?: boolean
  logUsage?: boolean
  customMessage?: string
}

export class FeatureGate {
  private logger: any
  private featureCache: Map<string, any> = new Map()
  private readonly CACHE_TTL = 300000 // 5 minutes

  // Feature definitions with fallbacks
  private readonly FEATURE_HIERARCHY = {
    'advanced_components': ['basic_components'],
    'quality_analysis': ['code_optimization'],
    'custom_ai_models': ['code_generation'],
    'priority_generation': ['code_generation'],
    'advanced_analytics': [],
    'team_collaboration': [],
    'export_production': ['preview'],
    'white_label': []
  }

  constructor() {
    this.logger = createLogger({ context: 'FeatureGate' })
  }

  // Main middleware function
  middleware(featureKey: string, options: FeatureGateOptions = {}) {
    return async (req: Request, handler: (req: Request) => Promise<Response>) => {
      const authHeader = req.headers.get('authorization')
      const userId = await this.extractUserId(authHeader)

      if (!userId) {
        return new Response(JSON.stringify({ 
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const gateResult = await this.check(userId, featureKey, options)

      if (!gateResult.allowed) {
        return this.createBlockedResponse(gateResult, options)
      }

      // Log feature usage if enabled
      if (options.logUsage) {
        await this.logFeatureUsage(userId, featureKey)
      }

      // Add feature context to request
      const modifiedReq = this.addFeatureContext(req, featureKey, gateResult)
      
      return handler(modifiedReq)
    }
  }

  async check(
    userId: string,
    featureKey: string,
    options: FeatureGateOptions = {}
  ): Promise<GateCheckResult> {
    try {
      // Check cache first
      const cacheKey = `${userId}:${featureKey}`
      const cached = this.getCached(cacheKey)
      if (cached) return cached

      // Check feature access
      const hasAccess = await quotaManager.checkFeatureAccess(userId, featureKey)

      if (hasAccess) {
        const result = { allowed: true }
        this.setCache(cacheKey, result)
        return result
      }

      // Get required tier for this feature
      const requiredTier = await this.getRequiredTier(featureKey)
      
      // Check for alternative features if graceful degradation is enabled
      let alternativeFeatures: string[] = []
      if (options.gracefulDegradation) {
        alternativeFeatures = await this.getAlternativeFeatures(userId, featureKey)
      }

      const result: GateCheckResult = {
        allowed: false,
        reason: options.customMessage || `This feature requires ${requiredTier} tier or higher`,
        requiredTier,
        upgradeUrl: this.getUpgradeUrl(userId, requiredTier),
        alternativeFeatures
      }

      this.setCache(cacheKey, result)

      await this.logger.info('Feature access denied', {
        userId,
        featureKey,
        requiredTier,
        hasAlternatives: alternativeFeatures.length > 0
      })

      return result

    } catch (error) {
      await this.logger.error('Feature gate check error', {
        userId,
        featureKey,
        error: error.message
      })

      // Fail closed for security
      return {
        allowed: false,
        reason: 'Unable to verify feature access'
      }
    }
  }

  async checkMultiple(
    userId: string,
    featureKeys: string[]
  ): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {}

    // Check all features in parallel
    const checks = await Promise.all(
      featureKeys.map(async key => ({
        key,
        result: await this.check(userId, key)
      }))
    )

    checks.forEach(({ key, result }) => {
      results[key] = result.allowed
    })

    return results
  }

  // Quota-aware feature check
  async checkWithQuota(
    userId: string,
    featureKey: string,
    estimatedTokens: number
  ): Promise<GateCheckResult> {
    // First check feature access
    const featureCheck = await this.check(userId, featureKey)
    if (!featureCheck.allowed) {
      return featureCheck
    }

    // Then check quota
    const quotaCheck = await quotaManager.checkQuota(userId, estimatedTokens)
    if (!quotaCheck.allowed) {
      return {
        allowed: false,
        reason: `Insufficient tokens. Need ${estimatedTokens}, have ${quotaCheck.remaining}`,
        requiredTier: this.getNextTierWithSufficientQuota(quotaCheck.tier, estimatedTokens),
        upgradeUrl: this.getUpgradeUrl(userId)
      }
    }

    return { allowed: true }
  }

  // Create a degraded feature response
  async createDegradedResponse(
    userId: string,
    originalFeature: string,
    fallbackFeature: string,
    data: any
  ): Promise<Response> {
    const degradedData = await this.applyDegradation(originalFeature, fallbackFeature, data)

    return new Response(JSON.stringify({
      ...degradedData,
      _degraded: true,
      _originalFeature: originalFeature,
      _fallbackFeature: fallbackFeature,
      _upgradeUrl: this.getUpgradeUrl(userId)
    }), {
      headers: {
        'Content-Type': 'application/json',
        'X-Feature-Degraded': 'true',
        'X-Original-Feature': originalFeature,
        'X-Fallback-Feature': fallbackFeature
      }
    })
  }

  // Create quota-limited response with graceful degradation
  async createQuotaLimitedResponse(
    userId: string,
    feature: string,
    requestedTokens: number,
    quotaInfo: any,
    data?: any
  ): Promise<Response> {
    // Check for graceful degradation options
    const degradationOptions = await this.getQuotaDegradationOptions(feature, quotaInfo)
    
    if (degradationOptions.canDegrade) {
      // Apply degradation to reduce token usage
      const degradedData = await this.applyQuotaDegradation(feature, data, degradationOptions)
      
      return new Response(JSON.stringify({
        ...degradedData,
        _quotaLimited: true,
        _degradationApplied: degradationOptions.applied,
        _originalTokens: requestedTokens,
        _reducedTokens: degradationOptions.reducedTokens,
        _quotaInfo: {
          remaining: quotaInfo.remaining,
          limit: quotaInfo.limit,
          resetAt: quotaInfo.periodEnd
        },
        _suggestions: degradationOptions.suggestions,
        _upgradeUrl: this.getUpgradeUrl(userId, quotaInfo.tier)
      }), {
        headers: {
          'Content-Type': 'application/json',
          'X-Quota-Limited': 'true',
          'X-Tokens-Remaining': quotaInfo.remaining.toString(),
          'X-Quota-Reset': quotaInfo.periodEnd
        }
      })
    }

    // No degradation possible - return quota exceeded response
    return new Response(JSON.stringify({
      error: 'Quota exceeded',
      code: 'QUOTA_EXCEEDED',
      message: `Insufficient tokens. Need ${requestedTokens}, have ${quotaInfo.remaining}`,
      quotaInfo: {
        requested: requestedTokens,
        remaining: quotaInfo.remaining,
        limit: quotaInfo.limit,
        resetAt: quotaInfo.periodEnd,
        percentUsed: quotaInfo.percentUsed
      },
      suggestions: [
        'Try a simpler request',
        'Wait for quota reset',
        `Upgrade to ${this.getRecommendedTier(quotaInfo.tier, requestedTokens)}`
      ],
      upgradeUrl: this.getUpgradeUrl(userId, quotaInfo.tier)
    }), {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': quotaInfo.limit.toString(),
        'X-RateLimit-Remaining': quotaInfo.remaining.toString(),
        'X-RateLimit-Reset': quotaInfo.periodEnd,
        'Retry-After': this.calculateRetryAfter(quotaInfo.periodEnd)
      }
    })
  }

  // Private methods

  private async extractUserId(authHeader: string | null): Promise<string | null> {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null
    }

    try {
      // In production, validate JWT and extract user ID
      // For now, mock implementation
      const token = authHeader.substring(7)
      // Decode JWT and get user ID
      return 'mock-user-id'
    } catch {
      return null
    }
  }

  private async getRequiredTier(featureKey: string): Promise<string> {
    // This would query the feature_gates table
    // For now, use a mapping
    const tierMap: Record<string, string> = {
      'code_generation': 'free',
      'advanced_components': 'starter',
      'code_optimization': 'starter',
      'quality_analysis': 'pro',
      'team_collaboration': 'pro',
      'custom_ai_models': 'pro',
      'priority_generation': 'pro',
      'export_production': 'starter',
      'advanced_analytics': 'pro',
      'white_label': 'enterprise'
    }

    return tierMap[featureKey] || 'pro'
  }

  private async getAlternativeFeatures(
    userId: string,
    blockedFeature: string
  ): Promise<string[]> {
    const alternatives = this.FEATURE_HIERARCHY[blockedFeature] || []
    
    // Check which alternatives the user has access to
    const accessChecks = await Promise.all(
      alternatives.map(async alt => ({
        feature: alt,
        hasAccess: await quotaManager.checkFeatureAccess(userId, alt)
      }))
    )

    return accessChecks
      .filter(check => check.hasAccess)
      .map(check => check.feature)
  }

  private async applyDegradation(
    originalFeature: string,
    fallbackFeature: string,
    data: any
  ): Promise<any> {
    // Apply feature-specific degradation logic
    switch (originalFeature) {
      case 'advanced_components':
        if (fallbackFeature === 'basic_components') {
          // Simplify component complexity
          return {
            ...data,
            components: data.components?.filter((c: any) => !c.advanced),
            complexity: 'basic'
          }
        }
        break

      case 'quality_analysis':
        if (fallbackFeature === 'code_optimization') {
          // Provide basic optimization without deep analysis
          return {
            ...data,
            analysis: 'basic',
            optimizations: data.optimizations?.slice(0, 3)
          }
        }
        break

      case 'export_production':
        if (fallbackFeature === 'preview') {
          // Provide preview-only export
          return {
            ...data,
            exportType: 'preview',
            watermark: true,
            expiresIn: 24 * 60 * 60 // 24 hours
          }
        }
        break
    }

    return data
  }

  private createBlockedResponse(
    gateResult: GateCheckResult,
    options: FeatureGateOptions
  ): Response {
    const responseData = {
      error: 'Feature not available',
      code: 'FEATURE_UNAVAILABLE',
      reason: gateResult.reason,
      requiredTier: gateResult.requiredTier,
      upgradeUrl: gateResult.upgradeUrl
    }

    if (gateResult.alternativeFeatures && gateResult.alternativeFeatures.length > 0) {
      responseData['alternatives'] = gateResult.alternativeFeatures
      responseData['message'] = 'Alternative features are available'
    }

    return new Response(JSON.stringify(responseData), {
      status: 403,
      headers: {
        'Content-Type': 'application/json',
        'X-Required-Tier': gateResult.requiredTier || '',
        'X-Upgrade-Url': gateResult.upgradeUrl || ''
      }
    })
  }

  private addFeatureContext(req: Request, featureKey: string, gateResult: any): Request {
    // Clone request and add feature context
    const headers = new Headers(req.headers)
    headers.set('X-Feature-Key', featureKey)
    headers.set('X-Feature-Allowed', 'true')
    
    return new Request(req.url, {
      method: req.method,
      headers,
      body: req.body
    })
  }

  private async logFeatureUsage(userId: string, featureKey: string): Promise<void> {
    try {
      // Log to analytics
      await this.logger.info('Feature used', {
        userId,
        featureKey,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      // Don't block on logging errors
    }
  }

  private getUpgradeUrl(userId: string, targetTier?: string): string {
    const baseUrl = Deno.env.get('APP_URL') || 'https://app.velocity.dev'
    const params = new URLSearchParams({
      source: 'feature_gate',
      user: userId
    })
    
    if (targetTier) {
      params.append('tier', targetTier)
    }

    return `${baseUrl}/upgrade?${params.toString()}`
  }

  private getNextTierWithSufficientQuota(currentTier: string, requiredTokens: number): string {
    const tierLimits = {
      free: 100000,
      starter: 500000,
      pro: 2000000,
      enterprise: -1
    }

    const tierOrder = ['free', 'starter', 'pro', 'enterprise']
    const currentIndex = tierOrder.indexOf(currentTier)

    for (let i = currentIndex + 1; i < tierOrder.length; i++) {
      const tier = tierOrder[i]
      const limit = tierLimits[tier]
      
      if (limit === -1 || limit >= requiredTokens) {
        return tier
      }
    }

    return 'enterprise'
  }

  private async getQuotaDegradationOptions(
    feature: string,
    quotaInfo: any
  ): Promise<any> {
    const options = {
      canDegrade: false,
      applied: [],
      reducedTokens: 0,
      suggestions: []
    }

    // Feature-specific degradation strategies
    switch (feature) {
      case 'code_generation':
        if (quotaInfo.remaining > 1000) {
          options.canDegrade = true
          options.applied.push('reduced_context_window')
          options.applied.push('simplified_generation')
          options.reducedTokens = Math.min(quotaInfo.remaining - 100, 2000)
          options.suggestions.push('Generated with reduced context for quota conservation')
        }
        break

      case 'quality_analysis':
        if (quotaInfo.remaining > 500) {
          options.canDegrade = true
          options.applied.push('basic_analysis_only')
          options.applied.push('skip_security_scan')
          options.reducedTokens = 800
          options.suggestions.push('Performing basic analysis only due to quota limits')
        }
        break

      case 'advanced_components':
        if (quotaInfo.remaining > 300) {
          options.canDegrade = true
          options.applied.push('basic_component_generation')
          options.applied.push('no_animations')
          options.reducedTokens = 500
          options.suggestions.push('Generating simplified components to conserve quota')
        }
        break

      case 'code_optimization':
        if (quotaInfo.remaining > 200) {
          options.canDegrade = true
          options.applied.push('quick_optimization')
          options.applied.push('skip_deep_analysis')
          options.reducedTokens = 400
          options.suggestions.push('Running quick optimization pass only')
        }
        break
    }

    // Add general suggestions
    if (!options.canDegrade) {
      options.suggestions.push(`Need ${Math.ceil(quotaInfo.remaining / 100) * 100} more tokens`)
      options.suggestions.push('Consider upgrading your plan for more tokens')
      options.suggestions.push('Try again after ' + new Date(quotaInfo.periodEnd).toLocaleDateString())
    }

    return options
  }

  private async applyQuotaDegradation(
    feature: string,
    data: any,
    degradationOptions: any
  ): Promise<any> {
    const degraded = { ...data }

    switch (feature) {
      case 'code_generation':
        if (degradationOptions.applied.includes('reduced_context_window')) {
          degraded.maxContextTokens = 1000
          degraded.contextFiles = data.contextFiles?.slice(0, 3) || []
        }
        if (degradationOptions.applied.includes('simplified_generation')) {
          degraded.generationOptions = {
            ...degraded.generationOptions,
            complexity: 'simple',
            includeComments: false,
            includeTests: false
          }
        }
        break

      case 'quality_analysis':
        degraded.analysisDepth = 'basic'
        degraded.includeSecurityScan = false
        degraded.includePerformanceMetrics = false
        degraded.suggestionsLimit = 3
        break

      case 'advanced_components':
        degraded.componentComplexity = 'basic'
        degraded.includeAnimations = false
        degraded.includeAccessibility = false
        degraded.maxComponents = 1
        break

      case 'code_optimization':
        degraded.optimizationLevel = 'quick'
        degraded.includeRefactoring = false
        degraded.includeBundleOptimization = false
        break
    }

    degraded._degradationNotice = `This response has been modified to fit within your remaining quota (${degradationOptions.reducedTokens} tokens)`

    return degraded
  }

  private calculateRetryAfter(periodEnd: string): string {
    const resetTime = new Date(periodEnd).getTime()
    const now = Date.now()
    const secondsUntilReset = Math.max(0, Math.ceil((resetTime - now) / 1000))
    return secondsUntilReset.toString()
  }

  private getRecommendedTier(currentTier: string, neededTokens: number): string {
    if (neededTokens <= 500000) return 'starter'
    if (neededTokens <= 2000000) return 'pro'
    return 'enterprise'
  }

  private getCached(key: string): any {
    const cached = this.featureCache.get(key)
    if (!cached) return null

    if (Date.now() - cached.timestamp > this.CACHE_TTL) {
      this.featureCache.delete(key)
      return null
    }

    return cached.data
  }

  private setCache(key: string, data: any): void {
    this.featureCache.set(key, {
      data,
      timestamp: Date.now()
    })

    // Limit cache size
    if (this.featureCache.size > 1000) {
      const firstKey = this.featureCache.keys().next().value
      this.featureCache.delete(firstKey)
    }
  }
}

// Export singleton instance
export const featureGate = new FeatureGate()

// Export convenience functions
export const requireFeature = (featureKey: string, options?: FeatureGateOptions) => 
  featureGate.middleware(featureKey, options)

export const checkFeature = (userId: string, featureKey: string) =>
  featureGate.check(userId, featureKey)

export const checkFeatures = (userId: string, featureKeys: string[]) =>
  featureGate.checkMultiple(userId, featureKeys)