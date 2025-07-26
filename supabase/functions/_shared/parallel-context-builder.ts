// Parallel context builder for optimized performance
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { createLogger } from './logger.ts'

interface BuildContextOptions {
  projectId: string
  userId: string
  targetComponent?: string
  includePatterns?: boolean
  includeHistory?: boolean
  includeStructure?: boolean
  includeDependencies?: boolean
  maxItems?: number
  cacheKey?: string
}

interface ContextResult {
  patterns: any[]
  history: any[]
  structure: any[]
  dependencies: any[]
  metadata: {
    buildTime: number
    cacheHit: boolean
    itemCounts: Record<string, number>
  }
}

export class ParallelContextBuilder {
  private supabase: any
  private logger: any
  private cache: Map<string, { data: any; timestamp: number }> = new Map()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
    this.logger = createLogger({ context: 'ParallelContextBuilder' })
  }

  async buildContext(options: BuildContextOptions): Promise<ContextResult> {
    const startTime = Date.now()
    const cacheKey = options.cacheKey || this.generateCacheKey(options)

    // Check cache first
    const cached = this.getFromCache(cacheKey)
    if (cached) {
      await this.logger.info('Context cache hit', { cacheKey, buildTime: 0 })
      return {
        ...cached,
        metadata: {
          ...cached.metadata,
          buildTime: 0,
          cacheHit: true
        }
      }
    }

    // Build promises for parallel execution
    const promises: Promise<any>[] = []
    const labels: string[] = []

    if (options.includePatterns !== false) {
      promises.push(this.fetchPatterns(options))
      labels.push('patterns')
    }

    if (options.includeHistory) {
      promises.push(this.fetchHistory(options))
      labels.push('history')
    }

    if (options.includeStructure !== false) {
      promises.push(this.fetchStructure(options))
      labels.push('structure')
    }

    if (options.includeDependencies) {
      promises.push(this.fetchDependencies(options))
      labels.push('dependencies')
    }

    // Execute all queries in parallel
    const results = await Promise.allSettled(promises)
    
    // Process results
    const context: ContextResult = {
      patterns: [],
      history: [],
      structure: [],
      dependencies: [],
      metadata: {
        buildTime: Date.now() - startTime,
        cacheHit: false,
        itemCounts: {}
      }
    }

    results.forEach((result, index) => {
      const label = labels[index]
      if (result.status === 'fulfilled') {
        context[label as keyof ContextResult] = result.value
        context.metadata.itemCounts[label] = Array.isArray(result.value) ? result.value.length : 0
      } else {
        this.logger.error(`Failed to fetch ${label}`, { error: result.reason })
        context[label as keyof ContextResult] = []
        context.metadata.itemCounts[label] = 0
      }
    })

    // Cache the result
    this.setCache(cacheKey, context)

    await this.logger.info('Context built successfully', {
      buildTime: context.metadata.buildTime,
      itemCounts: context.metadata.itemCounts
    })

    return context
  }

  private async fetchPatterns(options: BuildContextOptions): Promise<any[]> {
    const { projectId, targetComponent, maxItems = 10 } = options

    let query = this.supabase
      .from('code_patterns')
      .select(`
        id,
        name,
        description,
        pattern_type,
        code_template,
        usage_count,
        effectiveness_score,
        metadata
      `)
      .eq('project_id', projectId)
      .order('usage_count', { ascending: false })
      .limit(maxItems)

    if (targetComponent) {
      query = query.eq('component_type', targetComponent)
    }

    const { data, error } = await query

    if (error) throw error
    return data || []
  }

  private async fetchHistory(options: BuildContextOptions): Promise<any[]> {
    const { projectId, userId, maxItems = 5 } = options

    const { data, error } = await this.supabase
      .from('code_generations')
      .select(`
        id,
        prompt,
        code,
        component_type,
        quality_score,
        created_at
      `)
      .eq('project_id', projectId)
      .eq('user_id', userId)
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(maxItems)

    if (error) throw error
    return data || []
  }

  private async fetchStructure(options: BuildContextOptions): Promise<any[]> {
    const { projectId } = options

    // Fetch project structure in parallel
    const [filesResult, foldersResult] = await Promise.allSettled([
      this.supabase
        .from('project_files')
        .select('path, file_type, size, last_modified')
        .eq('project_id', projectId)
        .order('path'),
      
      this.supabase
        .from('project_structure')
        .select('folder_path, file_count, total_size')
        .eq('project_id', projectId)
        .order('folder_path')
    ])

    const files = filesResult.status === 'fulfilled' ? filesResult.value.data : []
    const folders = foldersResult.status === 'fulfilled' ? foldersResult.value.data : []

    return {
      files: files || [],
      folders: folders || [],
      summary: {
        totalFiles: files?.length || 0,
        totalFolders: folders?.length || 0
      }
    } as any
  }

  private async fetchDependencies(options: BuildContextOptions): Promise<any[]> {
    const { projectId } = options

    const { data, error } = await this.supabase
      .from('project_dependencies')
      .select(`
        name,
        version,
        type,
        dev_dependency
      `)
      .eq('project_id', projectId)
      .order('name')

    if (error) throw error
    return data || []
  }

  private generateCacheKey(options: BuildContextOptions): string {
    const parts = [
      options.projectId,
      options.userId,
      options.targetComponent || 'none',
      options.includePatterns ? 'p' : '',
      options.includeHistory ? 'h' : '',
      options.includeStructure ? 's' : '',
      options.includeDependencies ? 'd' : '',
      options.maxItems || 10
    ]
    return parts.join(':')
  }

  private getFromCache(key: string): any | null {
    const cached = this.cache.get(key)
    if (!cached) return null

    const age = Date.now() - cached.timestamp
    if (age > this.CACHE_TTL) {
      this.cache.delete(key)
      return null
    }

    return cached.data
  }

  private setCache(key: string, data: any): void {
    // Limit cache size
    if (this.cache.size > 100) {
      const oldestKey = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp)[0][0]
      this.cache.delete(oldestKey)
    }

    this.cache.set(key, {
      data,
      timestamp: Date.now()
    })
  }

  // Method to warm up cache with common contexts
  async warmCache(projectId: string, userId: string): Promise<void> {
    const commonComponents = ['screen', 'component', 'navigation', 'api', 'state']
    
    const warmupPromises = commonComponents.map(component =>
      this.buildContext({
        projectId,
        userId,
        targetComponent: component,
        includePatterns: true,
        includeStructure: true,
        maxItems: 5
      })
    )

    await Promise.allSettled(warmupPromises)
    await this.logger.info('Cache warmed up', { projectId, components: commonComponents.length })
  }

  // Method to invalidate cache for a project
  invalidateCache(projectId: string): void {
    const keysToDelete: string[] = []
    
    this.cache.forEach((_, key) => {
      if (key.startsWith(projectId)) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => this.cache.delete(key))
    this.logger.info('Cache invalidated', { projectId, keysDeleted: keysToDelete.length })
  }

  // Method to get cache statistics
  getCacheStats(): any {
    const stats = {
      size: this.cache.size,
      memoryUsage: 0,
      oldestEntry: Infinity,
      newestEntry: 0,
      hitRate: 0 // Would need to track hits/misses for accurate rate
    }

    this.cache.forEach((value) => {
      const age = Date.now() - value.timestamp
      stats.oldestEntry = Math.min(stats.oldestEntry, value.timestamp)
      stats.newestEntry = Math.max(stats.newestEntry, value.timestamp)
      stats.memoryUsage += JSON.stringify(value.data).length
    })

    return stats
  }
}

// Export singleton instance
let instance: ParallelContextBuilder | null = null

export function getContextBuilder(): ParallelContextBuilder {
  if (!instance) {
    instance = new ParallelContextBuilder(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
  }
  return instance
}