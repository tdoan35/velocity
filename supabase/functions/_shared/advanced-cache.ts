// Advanced caching system with incremental updates and intelligent invalidation
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { createLogger } from './logger.ts'

interface CacheEntry {
  key: string
  value: any
  metadata: {
    created: number
    lastAccessed: number
    accessCount: number
    size: number
    ttl: number
    tags: string[]
    dependencies?: string[]
    version?: number
  }
}

interface CacheOptions {
  ttl?: number // Time to live in seconds
  tags?: string[]
  dependencies?: string[] // Other cache keys this entry depends on
  compress?: boolean
  maxSize?: number // Max size in bytes
  priority?: 'low' | 'medium' | 'high'
}

interface CacheStats {
  entries: number
  memoryUsage: number
  hitRate: number
  missRate: number
  evictions: number
  compressionRatio: number
}

export class AdvancedCache {
  private memoryCache: Map<string, CacheEntry> = new Map()
  private accessLog: Map<string, number[]> = new Map() // Track access patterns
  private dependencyGraph: Map<string, Set<string>> = new Map() // Track dependencies
  private supabase: any
  private logger: any
  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    writes: 0
  }

  // Configuration
  private readonly MAX_MEMORY = 100 * 1024 * 1024 // 100MB
  private readonly DEFAULT_TTL = 3600 // 1 hour
  private readonly COMPRESSION_THRESHOLD = 1024 // 1KB

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
    this.logger = createLogger({ context: 'AdvancedCache' })
    
    // Start background tasks
    this.startMaintenanceTasks()
  }

  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now()
    
    // Check memory cache first
    const memoryEntry = this.memoryCache.get(key)
    if (memoryEntry && this.isValid(memoryEntry)) {
      this.stats.hits++
      this.updateAccessLog(key)
      memoryEntry.metadata.lastAccessed = Date.now()
      memoryEntry.metadata.accessCount++
      
      await this.logger.debug('Cache hit (memory)', { 
        key, 
        accessTime: Date.now() - startTime 
      })
      
      return memoryEntry.value
    }

    // Check database cache
    try {
      const { data, error } = await this.supabase
        .from('cache_entries')
        .select('*')
        .eq('key', key)
        .single()

      if (error || !data) {
        this.stats.misses++
        return null
      }

      // Validate TTL
      const age = Date.now() - new Date(data.created_at).getTime()
      if (age > data.ttl * 1000) {
        await this.delete(key)
        this.stats.misses++
        return null
      }

      // Decompress if needed
      let value = data.value
      if (data.compressed) {
        value = await this.decompress(value)
      }

      // Store in memory cache for faster access
      this.setMemoryCache(key, value, {
        ttl: data.ttl,
        tags: data.tags,
        dependencies: data.dependencies
      })

      this.stats.hits++
      this.updateAccessLog(key)

      await this.logger.debug('Cache hit (database)', { 
        key, 
        accessTime: Date.now() - startTime 
      })

      return value

    } catch (error) {
      await this.logger.error('Cache get error', { key, error: error.message })
      this.stats.misses++
      return null
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const startTime = Date.now()
    this.stats.writes++

    const ttl = options.ttl || this.DEFAULT_TTL
    const size = JSON.stringify(value).length
    const shouldCompress = options.compress !== false && size > this.COMPRESSION_THRESHOLD

    // Compress if needed
    let storedValue = value
    if (shouldCompress) {
      storedValue = await this.compress(value) as T
    }

    // Store in memory cache
    this.setMemoryCache(key, value, options)

    // Update dependency graph
    if (options.dependencies) {
      this.updateDependencies(key, options.dependencies)
    }

    // Store in database
    try {
      await this.supabase.from('cache_entries').upsert({
        key,
        value: storedValue,
        compressed: shouldCompress,
        ttl,
        tags: options.tags || [],
        dependencies: options.dependencies || [],
        priority: options.priority || 'medium',
        size,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      await this.logger.debug('Cache set', { 
        key, 
        size, 
        compressed: shouldCompress,
        writeTime: Date.now() - startTime 
      })

    } catch (error) {
      await this.logger.error('Cache set error', { key, error: error.message })
      throw error
    }
  }

  async update<T>(key: string, updater: (current: T | null) => T): Promise<void> {
    const current = await this.get<T>(key)
    const updated = updater(current)
    
    // Get existing metadata
    const existing = this.memoryCache.get(key)
    const options: CacheOptions = existing ? {
      ttl: existing.metadata.ttl,
      tags: existing.metadata.tags,
      dependencies: existing.metadata.dependencies
    } : {}

    await this.set(key, updated, options)
  }

  async delete(key: string): Promise<void> {
    // Remove from memory
    this.memoryCache.delete(key)
    this.accessLog.delete(key)

    // Remove from dependency graph
    this.dependencyGraph.delete(key)
    this.dependencyGraph.forEach(deps => deps.delete(key))

    // Remove from database
    try {
      await this.supabase
        .from('cache_entries')
        .delete()
        .eq('key', key)

      await this.logger.debug('Cache delete', { key })
    } catch (error) {
      await this.logger.error('Cache delete error', { key, error: error.message })
    }
  }

  async invalidate(options: { tag?: string; pattern?: string; dependencies?: string[] }): Promise<number> {
    let keysToInvalidate = new Set<string>()

    // Invalidate by tag
    if (options.tag) {
      this.memoryCache.forEach((entry, key) => {
        if (entry.metadata.tags.includes(options.tag!)) {
          keysToInvalidate.add(key)
        }
      })

      // Also check database
      const { data } = await this.supabase
        .from('cache_entries')
        .select('key')
        .contains('tags', [options.tag])

      data?.forEach(item => keysToInvalidate.add(item.key))
    }

    // Invalidate by pattern
    if (options.pattern) {
      const regex = new RegExp(options.pattern)
      this.memoryCache.forEach((_, key) => {
        if (regex.test(key)) {
          keysToInvalidate.add(key)
        }
      })

      // Also check database
      const { data } = await this.supabase
        .from('cache_entries')
        .select('key')
        .like('key', options.pattern.replace(/\*/g, '%'))

      data?.forEach(item => keysToInvalidate.add(item.key))
    }

    // Invalidate dependencies
    if (options.dependencies) {
      options.dependencies.forEach(dep => {
        const dependents = this.dependencyGraph.get(dep)
        if (dependents) {
          dependents.forEach(key => keysToInvalidate.add(key))
        }
      })
    }

    // Delete all invalidated keys
    const invalidatePromises = Array.from(keysToInvalidate).map(key => this.delete(key))
    await Promise.all(invalidatePromises)

    await this.logger.info('Cache invalidated', { 
      count: keysToInvalidate.size,
      options 
    })

    return keysToInvalidate.size
  }

  async warmup(keys: string[], fetcher: (key: string) => Promise<any>): Promise<void> {
    const startTime = Date.now()
    
    const warmupPromises = keys.map(async key => {
      const cached = await this.get(key)
      if (!cached) {
        try {
          const value = await fetcher(key)
          await this.set(key, value)
        } catch (error) {
          await this.logger.error('Cache warmup error', { key, error: error.message })
        }
      }
    })

    await Promise.all(warmupPromises)

    await this.logger.info('Cache warmup completed', { 
      keys: keys.length,
      duration: Date.now() - startTime 
    })
  }

  getStats(): CacheStats {
    const totalAccesses = this.stats.hits + this.stats.misses
    let memoryUsage = 0
    let totalCompressed = 0
    let totalUncompressed = 0

    this.memoryCache.forEach(entry => {
      memoryUsage += entry.metadata.size
      if (entry.metadata.size > this.COMPRESSION_THRESHOLD) {
        totalCompressed += JSON.stringify(entry.value).length
        totalUncompressed += entry.metadata.size
      }
    })

    return {
      entries: this.memoryCache.size,
      memoryUsage,
      hitRate: totalAccesses > 0 ? this.stats.hits / totalAccesses : 0,
      missRate: totalAccesses > 0 ? this.stats.misses / totalAccesses : 0,
      evictions: this.stats.evictions,
      compressionRatio: totalUncompressed > 0 ? totalCompressed / totalUncompressed : 1
    }
  }

  // Private methods

  private setMemoryCache(key: string, value: any, options: CacheOptions): void {
    const size = JSON.stringify(value).length
    
    // Check memory limit and evict if needed
    if (this.getMemoryUsage() + size > this.MAX_MEMORY) {
      this.evictLRU()
    }

    const entry: CacheEntry = {
      key,
      value,
      metadata: {
        created: Date.now(),
        lastAccessed: Date.now(),
        accessCount: 1,
        size,
        ttl: options.ttl || this.DEFAULT_TTL,
        tags: options.tags || [],
        dependencies: options.dependencies,
        version: Date.now()
      }
    }

    this.memoryCache.set(key, entry)
  }

  private isValid(entry: CacheEntry): boolean {
    const age = Date.now() - entry.metadata.created
    return age < entry.metadata.ttl * 1000
  }

  private updateAccessLog(key: string): void {
    const log = this.accessLog.get(key) || []
    log.push(Date.now())
    
    // Keep only last 100 accesses
    if (log.length > 100) {
      log.shift()
    }
    
    this.accessLog.set(key, log)
  }

  private updateDependencies(key: string, dependencies: string[]): void {
    dependencies.forEach(dep => {
      if (!this.dependencyGraph.has(dep)) {
        this.dependencyGraph.set(dep, new Set())
      }
      this.dependencyGraph.get(dep)!.add(key)
    })
  }

  private evictLRU(): void {
    let lruKey = ''
    let lruTime = Infinity

    // Find least recently used entry
    this.memoryCache.forEach((entry, key) => {
      // Skip high priority items
      if (entry.metadata.tags.includes('high-priority')) return
      
      if (entry.metadata.lastAccessed < lruTime) {
        lruTime = entry.metadata.lastAccessed
        lruKey = key
      }
    })

    if (lruKey) {
      this.memoryCache.delete(lruKey)
      this.accessLog.delete(lruKey)
      this.stats.evictions++
      
      this.logger.debug('Cache eviction', { key: lruKey })
    }
  }

  private getMemoryUsage(): number {
    let usage = 0
    this.memoryCache.forEach(entry => {
      usage += entry.metadata.size
    })
    return usage
  }

  private async compress(value: any): Promise<string> {
    // Simple compression using base64 encoding
    // In production, use proper compression like gzip
    const json = JSON.stringify(value)
    return btoa(json)
  }

  private async decompress(compressed: string): Promise<any> {
    // Simple decompression
    const json = atob(compressed)
    return JSON.parse(json)
  }

  private startMaintenanceTasks(): void {
    // Clean expired entries every 5 minutes
    setInterval(async () => {
      try {
        await this.cleanExpiredEntries()
      } catch (error) {
        await this.logger.error('Maintenance task error', { error: error.message })
      }
    }, 5 * 60 * 1000)

    // Log stats every hour
    setInterval(async () => {
      const stats = this.getStats()
      await this.logger.info('Cache statistics', stats)
    }, 60 * 60 * 1000)
  }

  private async cleanExpiredEntries(): Promise<void> {
    const now = Date.now()
    const keysToDelete: string[] = []

    this.memoryCache.forEach((entry, key) => {
      if (!this.isValid(entry)) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => {
      this.memoryCache.delete(key)
      this.accessLog.delete(key)
    })

    // Clean database entries
    const cutoff = new Date(now - this.DEFAULT_TTL * 1000).toISOString()
    await this.supabase
      .from('cache_entries')
      .delete()
      .lt('created_at', cutoff)

    if (keysToDelete.length > 0) {
      await this.logger.debug('Cleaned expired entries', { count: keysToDelete.length })
    }
  }
}

// Export singleton instance
let instance: AdvancedCache | null = null

export function getAdvancedCache(): AdvancedCache {
  if (!instance) {
    instance = new AdvancedCache(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
  }
  return instance
}