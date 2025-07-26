// Optimized embedding generation with batching and caching
import { createLogger } from './logger.ts'
import { getAdvancedCache } from './advanced-cache.ts'

interface EmbeddingRequest {
  id: string
  text: string
  model?: string
  priority?: 'low' | 'normal' | 'high'
  callback?: (embedding: number[] | null, error?: Error) => void
}

interface BatchOptions {
  maxBatchSize?: number
  maxWaitTime?: number // ms
  model?: string
}

export class EmbeddingBatcher {
  private queue: Map<string, EmbeddingRequest[]> = new Map() // Grouped by model
  private processing: Map<string, boolean> = new Map()
  private timers: Map<string, number> = new Map()
  private logger: any
  private cache: any
  private stats = {
    totalRequests: 0,
    totalBatches: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0
  }

  // Configuration
  private readonly DEFAULT_MODEL = 'text-embedding-ada-002'
  private readonly MAX_BATCH_SIZE = 100
  private readonly MAX_WAIT_TIME = 100 // ms
  private readonly MAX_TEXT_LENGTH = 8000 // tokens approximately

  constructor() {
    this.logger = createLogger({ context: 'EmbeddingBatcher' })
    this.cache = getAdvancedCache()
  }

  async getEmbedding(
    text: string,
    options: { model?: string; priority?: 'low' | 'normal' | 'high' } = {}
  ): Promise<number[]> {
    const model = options.model || this.DEFAULT_MODEL
    this.stats.totalRequests++

    // Check cache first
    const cacheKey = this.getCacheKey(text, model)
    const cached = await this.cache.get<number[]>(cacheKey)
    
    if (cached) {
      this.stats.cacheHits++
      await this.logger.debug('Embedding cache hit', { textLength: text.length })
      return cached
    }

    this.stats.cacheMisses++

    // For high priority requests, process immediately
    if (options.priority === 'high') {
      return this.processImmediate(text, model)
    }

    // Add to batch queue
    return new Promise((resolve, reject) => {
      const request: EmbeddingRequest = {
        id: crypto.randomUUID(),
        text: text.substring(0, this.MAX_TEXT_LENGTH),
        model,
        priority: options.priority || 'normal',
        callback: (embedding, error) => {
          if (error) reject(error)
          else if (embedding) resolve(embedding)
          else reject(new Error('No embedding generated'))
        }
      }

      this.addToQueue(request)
    })
  }

  async getEmbeddings(
    texts: string[],
    options: BatchOptions = {}
  ): Promise<number[][]> {
    const model = options.model || this.DEFAULT_MODEL
    const maxBatchSize = options.maxBatchSize || this.MAX_BATCH_SIZE
    
    // Split into chunks if needed
    const chunks: string[][] = []
    for (let i = 0; i < texts.length; i += maxBatchSize) {
      chunks.push(texts.slice(i, i + maxBatchSize))
    }

    // Process chunks in parallel
    const results = await Promise.all(
      chunks.map(chunk => this.processBatch(chunk, model))
    )

    // Flatten results
    return results.flat()
  }

  getStats(): any {
    return {
      ...this.stats,
      queueSizes: Object.fromEntries(
        Array.from(this.queue.entries()).map(([model, requests]) => [model, requests.length])
      ),
      avgBatchSize: this.stats.totalBatches > 0 
        ? Math.round(this.stats.totalRequests / this.stats.totalBatches)
        : 0,
      cacheHitRate: this.stats.totalRequests > 0
        ? (this.stats.cacheHits / this.stats.totalRequests)
        : 0
    }
  }

  // Private methods

  private addToQueue(request: EmbeddingRequest): void {
    const model = request.model!
    
    if (!this.queue.has(model)) {
      this.queue.set(model, [])
    }
    
    // Add to queue
    const requests = this.queue.get(model)!
    
    // Sort by priority
    if (request.priority === 'high') {
      requests.unshift(request)
    } else {
      requests.push(request)
    }

    // Check if should process
    if (requests.length >= this.MAX_BATCH_SIZE) {
      this.processBatchForModel(model)
    } else if (!this.timers.has(model)) {
      // Set timer for max wait time
      const timer = setTimeout(() => {
        this.timers.delete(model)
        this.processBatchForModel(model)
      }, this.MAX_WAIT_TIME)
      
      this.timers.set(model, timer)
    }
  }

  private async processBatchForModel(model: string): Promise<void> {
    // Check if already processing
    if (this.processing.get(model)) return
    
    const requests = this.queue.get(model)
    if (!requests || requests.length === 0) return

    // Clear timer if exists
    const timer = this.timers.get(model)
    if (timer) {
      clearTimeout(timer)
      this.timers.delete(model)
    }

    // Take batch
    const batch = requests.splice(0, this.MAX_BATCH_SIZE)
    if (requests.length === 0) {
      this.queue.delete(model)
    }

    // Mark as processing
    this.processing.set(model, true)

    try {
      const texts = batch.map(r => r.text)
      const embeddings = await this.processBatch(texts, model)
      
      // Deliver results
      batch.forEach((request, index) => {
        const embedding = embeddings[index]
        if (embedding && request.callback) {
          request.callback(embedding)
          
          // Cache the result
          this.cacheEmbedding(request.text, model, embedding)
        }
      })

      this.stats.totalBatches++

      await this.logger.info('Batch processed', {
        model,
        batchSize: batch.length,
        queueRemaining: requests.length
      })

    } catch (error) {
      this.stats.errors++
      
      // Deliver errors
      batch.forEach(request => {
        if (request.callback) {
          request.callback(null, error as Error)
        }
      })

      await this.logger.error('Batch processing error', {
        model,
        batchSize: batch.length,
        error: error.message
      })
    } finally {
      this.processing.set(model, false)
      
      // Process next batch if queue not empty
      if (this.queue.get(model)?.length) {
        setTimeout(() => this.processBatchForModel(model), 10)
      }
    }
  }

  private async processImmediate(text: string, model: string): Promise<number[]> {
    const embeddings = await this.processBatch([text], model)
    const embedding = embeddings[0]
    
    if (embedding) {
      await this.cacheEmbedding(text, model, embedding)
    }
    
    return embedding
  }

  private async processBatch(texts: string[], model: string): Promise<number[][]> {
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY')
    if (!OPENAI_API_KEY) {
      throw new Error('OpenAI API key not configured')
    }

    const startTime = Date.now()

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model,
          input: texts
        })
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`OpenAI API error: ${error}`)
      }

      const result = await response.json()
      const embeddings = result.data.map((d: any) => d.embedding)

      await this.logger.debug('Embeddings generated', {
        model,
        count: texts.length,
        duration: Date.now() - startTime
      })

      return embeddings

    } catch (error) {
      await this.logger.error('OpenAI API error', {
        model,
        count: texts.length,
        error: error.message
      })
      throw error
    }
  }

  private getCacheKey(text: string, model: string): string {
    // Create a stable cache key
    const normalized = text.trim().toLowerCase()
    return `embedding:${model}:${this.hashText(normalized)}`
  }

  private hashText(text: string): string {
    // Simple hash function for cache key
    let hash = 0
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return hash.toString(36)
  }

  private async cacheEmbedding(text: string, model: string, embedding: number[]): Promise<void> {
    const cacheKey = this.getCacheKey(text, model)
    
    try {
      await this.cache.set(cacheKey, embedding, {
        ttl: 86400 * 7, // 7 days
        tags: ['embedding', model],
        compress: true
      })
    } catch (error) {
      await this.logger.error('Cache write error', { error: error.message })
    }
  }

  // Utility method to pre-warm cache with common embeddings
  async warmCache(texts: string[], model: string = this.DEFAULT_MODEL): Promise<void> {
    const uncached = []
    
    // Check which texts are not cached
    for (const text of texts) {
      const cacheKey = this.getCacheKey(text, model)
      const exists = await this.cache.get(cacheKey)
      if (!exists) {
        uncached.push(text)
      }
    }

    if (uncached.length === 0) {
      await this.logger.info('All embeddings already cached', { count: texts.length })
      return
    }

    // Generate embeddings for uncached texts
    await this.logger.info('Warming embedding cache', { 
      total: texts.length,
      uncached: uncached.length 
    })

    await this.getEmbeddings(uncached, { model })
  }

  // Method to handle similar text detection
  async findSimilar(
    text: string,
    candidates: Array<{ id: string; text: string }>,
    options: { 
      model?: string; 
      threshold?: number;
      topK?: number;
    } = {}
  ): Promise<Array<{ id: string; similarity: number }>> {
    const model = options.model || this.DEFAULT_MODEL
    const threshold = options.threshold || 0.8
    const topK = options.topK || 10

    // Get embeddings for all texts
    const [queryEmbedding, ...candidateEmbeddings] = await this.getEmbeddings(
      [text, ...candidates.map(c => c.text)],
      { model }
    )

    // Calculate similarities
    const similarities = candidateEmbeddings.map((embedding, index) => ({
      id: candidates[index].id,
      similarity: this.cosineSimilarity(queryEmbedding, embedding)
    }))

    // Filter and sort
    return similarities
      .filter(s => s.similarity >= threshold)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0

    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i]
      normA += a[i] * a[i]
      normB += b[i] * b[i]
    }

    normA = Math.sqrt(normA)
    normB = Math.sqrt(normB)

    if (normA === 0 || normB === 0) return 0

    return dotProduct / (normA * normB)
  }
}

// Export singleton instance
export const embeddingBatcher = new EmbeddingBatcher()