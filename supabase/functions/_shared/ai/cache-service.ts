import { createClient } from '@supabase/supabase-js';
import { EmbeddingService } from './embedding-service';
import { z } from 'zod';
import Redis from 'ioredis';

// Cache configuration schema
const CacheConfigSchema = z.object({
  similarityThreshold: z.number().min(0).max(1).default(0.95),
  adaptiveThreshold: z.boolean().default(true),
  thresholdAdjustmentRate: z.number().default(0.01),
  minThreshold: z.number().default(0.90),
  maxThreshold: z.number().default(0.98),
  targetHitRate: z.number().default(0.75), // 75% target hit rate
  expirationSeconds: z.number().default(86400), // 24 hours
  warmingEnabled: z.boolean().default(true),
  redisEnabled: z.boolean().default(true),
});

type CacheConfig = z.infer<typeof CacheConfigSchema>;

// Cache analytics interface
export interface CacheAnalytics {
  hitRate: number;
  totalQueries: number;
  cacheHits: number;
  cacheMisses: number;
  averageSimilarity: number;
  currentThreshold: number;
  recommendedThreshold: number;
}

// Cache entry interface
export interface CacheEntry {
  id: string;
  query: string;
  response: string;
  similarity: number;
  hitCount: number;
  lastHitAt: Date;
  expiresAt?: Date;
  metadata?: Record<string, any>;
}

export class CacheService {
  private supabase: ReturnType<typeof createClient>;
  private embeddingService: EmbeddingService;
  private redis?: Redis;
  private config: CacheConfig;
  private currentThreshold: number;
  private analyticsBuffer: Array<{ hit: boolean; similarity?: number }> = [];

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    embeddingService: EmbeddingService,
    redisUrl?: string,
    config?: Partial<CacheConfig>
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.embeddingService = embeddingService;
    this.config = CacheConfigSchema.parse(config || {});
    this.currentThreshold = this.config.similarityThreshold;

    // Initialize Redis if enabled and URL provided
    if (this.config.redisEnabled && redisUrl) {
      this.redis = new Redis(redisUrl);
      this.redis.on('error', (err) => {
        console.error('Redis error:', err);
        // Disable Redis on error
        this.config.redisEnabled = false;
      });
    }
  }

  /**
   * Check cache for a similar query
   */
  async checkCache(
    projectId: string,
    query: string,
    options?: {
      useRedis?: boolean;
      customThreshold?: number;
    }
  ): Promise<CacheEntry | null> {
    const startTime = Date.now();
    const threshold = options?.customThreshold || this.currentThreshold;

    try {
      // Try Redis first if enabled
      if (this.config.redisEnabled && this.redis && options?.useRedis !== false) {
        const redisResult = await this.checkRedisCache(projectId, query);
        if (redisResult) {
          this.recordCacheHit(true, 1.0); // Exact match
          await this.trackCacheMetric(projectId, 'cache_hit', Date.now() - startTime);
          return redisResult;
        }
      }

      // Generate embedding for the query
      const queryEmbedding = await this.embeddingService.generateEmbedding(query);

      // Check vector similarity cache
      const cacheResult = await this.embeddingService.checkCache(
        query,
        queryEmbedding,
        this.generateCacheKey(projectId, query)
      );

      if (cacheResult && cacheResult.similarity >= threshold) {
        // Cache hit
        this.recordCacheHit(true, cacheResult.similarity);
        
        // Store in Redis for faster future access
        if (this.config.redisEnabled && this.redis) {
          await this.storeInRedis(projectId, query, cacheResult.response, cacheResult.metadata);
        }

        await this.trackCacheMetric(projectId, 'cache_hit', Date.now() - startTime, {
          similarity: cacheResult.similarity,
          threshold: threshold,
        });

        return {
          id: cacheResult.id,
          query,
          response: cacheResult.response,
          similarity: cacheResult.similarity,
          hitCount: 0, // Will be updated by the database
          lastHitAt: new Date(),
          metadata: cacheResult.metadata,
        };
      }

      // Cache miss
      this.recordCacheHit(false, cacheResult?.similarity);
      await this.trackCacheMetric(projectId, 'cache_miss', Date.now() - startTime, {
        similarity: cacheResult?.similarity || 0,
        threshold: threshold,
      });

      return null;
    } catch (error) {
      console.error('Cache check error:', error);
      return null;
    }
  }

  /**
   * Store a response in cache
   */
  async storeInCache(
    projectId: string,
    query: string,
    response: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    try {
      // Store in vector cache
      await this.embeddingService.cacheResponse(
        query,
        response,
        {
          ...metadata,
          project_id: projectId,
          stored_at: new Date().toISOString(),
        },
        this.config.expirationSeconds
      );

      // Store in Redis if enabled
      if (this.config.redisEnabled && this.redis) {
        await this.storeInRedis(projectId, query, response, metadata);
      }

      // Trigger cache warming if enabled
      if (this.config.warmingEnabled) {
        this.triggerCacheWarming(projectId);
      }
    } catch (error) {
      console.error('Cache store error:', error);
      // Don't throw - caching failures shouldn't break the main flow
    }
  }

  /**
   * Get cache analytics
   */
  async getCacheAnalytics(
    projectId: string,
    timeRange: '1h' | '24h' | '7d' = '24h'
  ): Promise<CacheAnalytics> {
    const timeRangeMap = {
      '1h': '1 hour',
      '24h': '24 hours',
      '7d': '7 days',
    };

    const interval = timeRangeMap[timeRange];

    // Get cache metrics from database
    const { data: metrics } = await this.supabase
      .from('ai_performance_metrics')
      .select('metric_type, value, metadata')
      .eq('project_id', projectId)
      .in('metric_type', ['cache_hit', 'cache_miss'])
      .gte('created_at', `now() - interval '${interval}'`);

    if (!metrics || metrics.length === 0) {
      return this.getDefaultAnalytics();
    }

    // Calculate statistics
    const hits = metrics.filter(m => m.metric_type === 'cache_hit');
    const misses = metrics.filter(m => m.metric_type === 'cache_miss');
    const totalQueries = hits.length + misses.length;
    const hitRate = totalQueries > 0 ? hits.length / totalQueries : 0;

    // Calculate average similarity for hits
    const avgSimilarity = hits.length > 0
      ? hits.reduce((sum, h) => sum + (h.metadata?.similarity || 1), 0) / hits.length
      : 0;

    // Calculate recommended threshold
    const recommendedThreshold = this.calculateRecommendedThreshold(
      hitRate,
      avgSimilarity,
      metrics
    );

    return {
      hitRate,
      totalQueries,
      cacheHits: hits.length,
      cacheMisses: misses.length,
      averageSimilarity: avgSimilarity,
      currentThreshold: this.currentThreshold,
      recommendedThreshold,
    };
  }

  /**
   * Warm the cache with common queries
   */
  async warmCache(
    projectId: string,
    commonQueries?: string[]
  ): Promise<void> {
    try {
      // If no queries provided, get from analytics
      if (!commonQueries || commonQueries.length === 0) {
        commonQueries = await this.getCommonQueries(projectId);
      }

      // Process queries in parallel batches
      const batchSize = 5;
      for (let i = 0; i < commonQueries.length; i += batchSize) {
        const batch = commonQueries.slice(i, i + batchSize);
        await Promise.all(
          batch.map(query => this.checkCache(projectId, query))
        );
      }

      console.log(`Cache warmed with ${commonQueries.length} queries`);
    } catch (error) {
      console.error('Cache warming error:', error);
    }
  }

  /**
   * Adjust similarity threshold based on performance
   */
  async adjustThreshold(): Promise<void> {
    if (!this.config.adaptiveThreshold || this.analyticsBuffer.length < 100) {
      return;
    }

    // Calculate current hit rate
    const hits = this.analyticsBuffer.filter(a => a.hit).length;
    const hitRate = hits / this.analyticsBuffer.length;

    // Adjust threshold based on hit rate vs target
    if (hitRate < this.config.targetHitRate) {
      // Lower threshold to increase hit rate
      this.currentThreshold = Math.max(
        this.config.minThreshold,
        this.currentThreshold - this.config.thresholdAdjustmentRate
      );
    } else if (hitRate > this.config.targetHitRate + 0.1) {
      // Raise threshold to maintain quality
      this.currentThreshold = Math.min(
        this.config.maxThreshold,
        this.currentThreshold + this.config.thresholdAdjustmentRate
      );
    }

    // Clear buffer
    this.analyticsBuffer = [];

    console.log(`Adjusted cache threshold to ${this.currentThreshold} (hit rate: ${hitRate})`);
  }

  /**
   * Clear expired cache entries
   */
  async clearExpiredCache(): Promise<number> {
    const deletedCount = await this.embeddingService.cleanupExpiredCache();

    // Clear Redis expired entries if enabled
    if (this.config.redisEnabled && this.redis) {
      // Redis handles expiration automatically
    }

    return deletedCount;
  }

  /**
   * Invalidate cache for a specific project
   */
  async invalidateProjectCache(projectId: string): Promise<void> {
    // Clear from vector database
    const { error } = await this.supabase
      .from('ai_cache')
      .delete()
      .eq('metadata->>project_id', projectId);

    if (error) {
      console.error('Error invalidating project cache:', error);
    }

    // Clear from Redis
    if (this.config.redisEnabled && this.redis) {
      const keys = await this.redis.keys(`cache:${projectId}:*`);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  async getCacheStats(projectId?: string): Promise<{
    totalEntries: number;
    redisEntries: number;
    avgHitRate: number;
    avgResponseTime: number;
    topQueries: Array<{ query: string; hits: number }>;
  }> {
    const stats = await this.embeddingService.getCacheStats(projectId);

    // Get Redis stats if enabled
    let redisEntries = 0;
    if (this.config.redisEnabled && this.redis) {
      const keys = await this.redis.keys(projectId ? `cache:${projectId}:*` : 'cache:*');
      redisEntries = keys.length;
    }

    // Get response time metrics
    const { data: timeMetrics } = await this.supabase
      .from('ai_performance_metrics')
      .select('value')
      .in('metric_type', ['cache_hit', 'cache_miss'])
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const avgResponseTime = timeMetrics && timeMetrics.length > 0
      ? timeMetrics.reduce((sum, m) => sum + m.value, 0) / timeMetrics.length
      : 0;

    return {
      totalEntries: stats.totalCacheEntries,
      redisEntries,
      avgHitRate: stats.averageHitRate,
      avgResponseTime,
      topQueries: stats.topPatterns.map(p => ({ query: p.pattern, hits: p.hitCount })),
    };
  }

  /**
   * Private helper methods
   */

  private generateCacheKey(projectId: string, query: string): string {
    return `${projectId}:${this.hashString(query)}`;
  }

  private hashString(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  private async checkRedisCache(
    projectId: string,
    query: string
  ): Promise<CacheEntry | null> {
    if (!this.redis) return null;

    try {
      const key = `cache:${this.generateCacheKey(projectId, query)}`;
      const cached = await this.redis.get(key);

      if (cached) {
        const data = JSON.parse(cached);
        return {
          id: data.id || 'redis-cache',
          query,
          response: data.response,
          similarity: 1.0, // Exact match
          hitCount: data.hitCount || 0,
          lastHitAt: new Date(),
          metadata: data.metadata,
        };
      }
    } catch (error) {
      console.error('Redis cache check error:', error);
    }

    return null;
  }

  private async storeInRedis(
    projectId: string,
    query: string,
    response: string,
    metadata?: Record<string, any>
  ): Promise<void> {
    if (!this.redis) return;

    try {
      const key = `cache:${this.generateCacheKey(projectId, query)}`;
      const data = {
        id: `redis-${Date.now()}`,
        response,
        metadata,
        hitCount: 1,
        storedAt: new Date().toISOString(),
      };

      await this.redis.setex(
        key,
        this.config.expirationSeconds,
        JSON.stringify(data)
      );
    } catch (error) {
      console.error('Redis cache store error:', error);
    }
  }

  private recordCacheHit(hit: boolean, similarity?: number): void {
    this.analyticsBuffer.push({ hit, similarity });

    // Trigger threshold adjustment if buffer is full
    if (this.analyticsBuffer.length >= 100) {
      this.adjustThreshold();
    }
  }

  private async trackCacheMetric(
    projectId: string,
    metricType: 'cache_hit' | 'cache_miss',
    responseTime: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    await this.embeddingService.trackMetric(
      projectId,
      metricType as any,
      responseTime,
      metadata
    );
  }

  private calculateRecommendedThreshold(
    hitRate: number,
    avgSimilarity: number,
    metrics: any[]
  ): number {
    // If hit rate is too low, recommend lower threshold
    if (hitRate < this.config.targetHitRate - 0.1) {
      return Math.max(
        this.config.minThreshold,
        this.currentThreshold - 0.05
      );
    }

    // If hit rate is too high but similarity is low, recommend higher threshold
    if (hitRate > this.config.targetHitRate + 0.1 && avgSimilarity < 0.95) {
      return Math.min(
        this.config.maxThreshold,
        this.currentThreshold + 0.02
      );
    }

    // Otherwise, fine-tune based on similarity distribution
    const similarities = metrics
      .filter(m => m.metadata?.similarity)
      .map(m => m.metadata.similarity);

    if (similarities.length > 0) {
      // Find threshold that would achieve target hit rate
      similarities.sort((a, b) => b - a);
      const targetIndex = Math.floor(similarities.length * this.config.targetHitRate);
      return similarities[targetIndex] || this.currentThreshold;
    }

    return this.currentThreshold;
  }

  private async getCommonQueries(projectId: string, limit: number = 20): Promise<string[]> {
    // Get frequently accessed embeddings
    const { data } = await this.supabase
      .from('ai_embeddings')
      .select('content')
      .eq('project_id', projectId)
      .eq('content_type', 'prompt')
      .order('access_count', { ascending: false })
      .limit(limit);

    return data?.map(d => d.content) || [];
  }

  private triggerCacheWarming(projectId: string): void {
    // Debounce warming to avoid excessive calls
    if (this.config.warmingEnabled) {
      setTimeout(() => {
        this.warmCache(projectId).catch(console.error);
      }, 5000); // 5 second delay
    }
  }

  private getDefaultAnalytics(): CacheAnalytics {
    return {
      hitRate: 0,
      totalQueries: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageSimilarity: 0,
      currentThreshold: this.currentThreshold,
      recommendedThreshold: this.config.similarityThreshold,
    };
  }
}