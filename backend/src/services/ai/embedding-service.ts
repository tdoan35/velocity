import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { z } from 'zod';

// Configuration schema
const EmbeddingConfigSchema = z.object({
  model: z.string().default('text-embedding-3-small'),
  dimensions: z.number().default(1536),
  batchSize: z.number().default(20),
  similarityThreshold: z.number().default(0.92),
  cacheExpiration: z.number().default(86400), // 24 hours in seconds
});

type EmbeddingConfig = z.infer<typeof EmbeddingConfigSchema>;

// Content types for embeddings
export type ContentType = 'prompt' | 'response' | 'code_snippet' | 'component' | 'pattern';

// Embedding result interface
export interface EmbeddingResult {
  id: string;
  content: string;
  contentType: ContentType;
  embedding: number[];
  metadata?: Record<string, any>;
}

// Similarity search result
export interface SimilarityResult {
  id: string;
  content: string;
  contentType: ContentType;
  similarity: number;
  metadata?: Record<string, any>;
}

// Cache result interface
export interface CacheResult {
  id: string;
  response: string;
  similarity: number;
  metadata?: Record<string, any>;
}

export class EmbeddingService {
  private supabase: ReturnType<typeof createClient>;
  private openai: OpenAI;
  private config: EmbeddingConfig;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    openaiApiKey: string,
    config?: Partial<EmbeddingConfig>
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.openai = new OpenAI({ apiKey: openaiApiKey });
    this.config = EmbeddingConfigSchema.parse(config || {});
  }

  /**
   * Generate embedding for a single text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: this.config.model,
        input: text,
        dimensions: this.config.dimensions,
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  /**
   * Generate embeddings for multiple texts in batches
   */
  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    const embeddings: number[][] = [];
    
    // Process in batches to avoid API limits
    for (let i = 0; i < texts.length; i += this.config.batchSize) {
      const batch = texts.slice(i, i + this.config.batchSize);
      
      try {
        const response = await this.openai.embeddings.create({
          model: this.config.model,
          input: batch,
          dimensions: this.config.dimensions,
        });

        embeddings.push(...response.data.map(d => d.embedding));
      } catch (error) {
        console.error('Error generating batch embeddings:', error);
        throw new Error('Failed to generate embeddings');
      }
    }

    return embeddings;
  }

  /**
   * Store embedding in database
   */
  async storeEmbedding(
    projectId: string,
    userId: string,
    content: string,
    contentType: ContentType,
    embedding: number[],
    metadata?: Record<string, any>
  ): Promise<EmbeddingResult> {
    const { data, error } = await this.supabase
      .from('ai_embeddings')
      .insert({
        project_id: projectId,
        user_id: userId,
        content,
        content_type: contentType,
        embedding,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error storing embedding:', error);
      throw new Error('Failed to store embedding');
    }

    return {
      id: data.id,
      content: data.content,
      contentType: data.content_type,
      embedding: data.embedding,
      metadata: data.metadata,
    };
  }

  /**
   * Find similar embeddings using vector similarity search
   */
  async findSimilar(
    queryEmbedding: number[],
    options?: {
      similarityThreshold?: number;
      maxResults?: number;
      projectId?: string;
      contentType?: ContentType;
    }
  ): Promise<SimilarityResult[]> {
    const threshold = options?.similarityThreshold || this.config.similarityThreshold;
    const maxResults = options?.maxResults || 10;

    const { data, error } = await this.supabase.rpc('find_similar_embeddings', {
      query_embedding: queryEmbedding,
      similarity_threshold: threshold,
      max_results: maxResults,
      p_project_id: options?.projectId || null,
      p_content_type: options?.contentType || null,
    });

    if (error) {
      console.error('Error finding similar embeddings:', error);
      throw new Error('Failed to find similar embeddings');
    }

    return data.map((row: any) => ({
      id: row.id,
      content: row.content,
      contentType: row.content_type,
      similarity: row.similarity,
      metadata: row.metadata,
    }));
  }

  /**
   * Check cache for similar query
   */
  async checkCache(
    queryText: string,
    queryEmbedding?: number[],
    cacheKey?: string
  ): Promise<CacheResult | null> {
    // Generate embedding if not provided
    const embedding = queryEmbedding || await this.generateEmbedding(queryText);

    const { data, error } = await this.supabase.rpc('find_cached_response', {
      query_embedding: embedding,
      similarity_threshold: this.config.similarityThreshold,
      p_cache_key: cacheKey || null,
    });

    if (error || !data || data.length === 0) {
      return null;
    }

    return {
      id: data[0].id,
      response: data[0].response,
      similarity: data[0].similarity,
      metadata: data[0].metadata,
    };
  }

  /**
   * Store response in cache
   */
  async cacheResponse(
    queryText: string,
    response: string,
    metadata?: Record<string, any>,
    expiresInSeconds?: number
  ): Promise<void> {
    // Generate embeddings for both query and response
    const [queryEmbedding, responseEmbedding] = await this.generateEmbeddings([
      queryText,
      response,
    ]);

    // Generate cache key
    const cacheKey = this.generateCacheKey(queryText);
    
    // Calculate expiration
    const expiresAt = expiresInSeconds 
      ? new Date(Date.now() + expiresInSeconds * 1000).toISOString()
      : null;

    const { error } = await this.supabase
      .from('ai_cache')
      .upsert({
        cache_key: cacheKey,
        query_embedding: queryEmbedding,
        response,
        response_embedding: responseEmbedding,
        expires_at: expiresAt,
        metadata: metadata || {},
      });

    if (error) {
      console.error('Error caching response:', error);
      throw new Error('Failed to cache response');
    }
  }

  /**
   * Find similar code patterns
   */
  async findSimilarPatterns(
    queryText: string,
    patternType?: string,
    maxResults: number = 5
  ): Promise<Array<{
    id: string;
    patternType: string;
    name: string;
    codeTemplate: string;
    similarity: number;
    successRate: number;
  }>> {
    const embedding = await this.generateEmbedding(queryText);

    const { data, error } = await this.supabase.rpc('find_similar_patterns', {
      query_embedding: embedding,
      p_pattern_type: patternType || null,
      max_results: maxResults,
    });

    if (error) {
      console.error('Error finding similar patterns:', error);
      throw new Error('Failed to find similar patterns');
    }

    return data.map((row: any) => ({
      id: row.id,
      patternType: row.pattern_type,
      name: row.name,
      codeTemplate: row.code_template,
      similarity: row.similarity,
      successRate: parseFloat(row.success_rate),
    }));
  }

  /**
   * Store code pattern with embedding
   */
  async storeCodePattern(
    patternType: string,
    name: string,
    description: string,
    codeTemplate: string,
    tags: string[] = []
  ): Promise<void> {
    // Generate embedding from description and code
    const embeddingText = `${name} ${description} ${codeTemplate}`;
    const embedding = await this.generateEmbedding(embeddingText);

    const { error } = await this.supabase
      .from('ai_code_patterns')
      .insert({
        pattern_type: patternType,
        name,
        description,
        code_template: codeTemplate,
        embedding,
        tags,
      });

    if (error) {
      console.error('Error storing code pattern:', error);
      throw new Error('Failed to store code pattern');
    }
  }

  /**
   * Track performance metrics
   */
  async trackMetric(
    projectId: string,
    metricType: 'cache_hit' | 'query_time' | 'embedding_time' | 'generation_time',
    value: number,
    metadata?: Record<string, any>
  ): Promise<void> {
    const { error } = await this.supabase
      .from('ai_performance_metrics')
      .insert({
        project_id: projectId,
        metric_type: metricType,
        value,
        metadata: metadata || {},
      });

    if (error) {
      console.error('Error tracking metric:', error);
      // Don't throw - metrics are non-critical
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(projectId?: string): Promise<{
    totalCacheEntries: number;
    averageHitRate: number;
    topPatterns: Array<{ pattern: string; hitCount: number }>;
  }> {
    // Get total cache entries
    let query = this.supabase
      .from('ai_cache')
      .select('id', { count: 'exact', head: true });

    if (projectId) {
      query = query.eq('metadata->>project_id', projectId);
    }

    const { count: totalCacheEntries } = await query;

    // Get cache hit metrics
    const { data: hitMetrics } = await this.supabase
      .from('ai_performance_metrics')
      .select('value')
      .eq('metric_type', 'cache_hit')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

    const averageHitRate = hitMetrics && hitMetrics.length > 0
      ? hitMetrics.reduce((sum, m) => sum + m.value, 0) / hitMetrics.length
      : 0;

    // Get top patterns (simplified for now)
    const topPatterns: Array<{ pattern: string; hitCount: number }> = [];

    return {
      totalCacheEntries: totalCacheEntries || 0,
      averageHitRate,
      topPatterns,
    };
  }

  /**
   * Clean up expired cache entries
   */
  async cleanupExpiredCache(): Promise<number> {
    const { data, error } = await this.supabase.rpc('cleanup_expired_cache');

    if (error) {
      console.error('Error cleaning up cache:', error);
      return 0;
    }

    return data || 0;
  }

  /**
   * Generate cache key from query text
   */
  private generateCacheKey(text: string): string {
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `cache_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Batch process embeddings for a project
   */
  async batchProcessEmbeddings(
    projectId: string,
    userId: string,
    items: Array<{
      content: string;
      contentType: ContentType;
      metadata?: Record<string, any>;
    }>
  ): Promise<void> {
    const startTime = Date.now();

    // Extract texts for embedding
    const texts = items.map(item => item.content);
    
    // Generate embeddings in batches
    const embeddings = await this.generateEmbeddings(texts);

    // Store embeddings
    const promises = items.map((item, index) =>
      this.storeEmbedding(
        projectId,
        userId,
        item.content,
        item.contentType,
        embeddings[index],
        item.metadata
      )
    );

    await Promise.all(promises);

    // Track performance metric
    const processingTime = Date.now() - startTime;
    await this.trackMetric(projectId, 'embedding_time', processingTime, {
      batch_size: items.length,
      average_time: processingTime / items.length,
    });
  }
}