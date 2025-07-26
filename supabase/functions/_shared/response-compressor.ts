// Response compression middleware for large payloads
import { createLogger } from './logger.ts'

interface CompressionOptions {
  threshold?: number // Minimum size in bytes to compress
  level?: number // Compression level (1-9)
  types?: string[] // MIME types to compress
  encoding?: 'gzip' | 'deflate' | 'br'
}

interface CompressionStats {
  originalSize: number
  compressedSize: number
  compressionRatio: number
  compressionTime: number
  encoding: string
}

export class ResponseCompressor {
  private logger: any
  private stats = {
    totalRequests: 0,
    compressedRequests: 0,
    totalOriginalBytes: 0,
    totalCompressedBytes: 0,
    totalCompressionTime: 0
  }

  // Default configuration
  private readonly DEFAULT_THRESHOLD = 1024 // 1KB
  private readonly DEFAULT_TYPES = [
    'application/json',
    'text/plain',
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
    'application/xml'
  ]

  constructor() {
    this.logger = createLogger({ context: 'ResponseCompressor' })
  }

  createCompressedResponse(
    body: string | Uint8Array,
    headers: Headers,
    options: CompressionOptions = {}
  ): Response {
    const startTime = Date.now()
    this.stats.totalRequests++

    // Check if compression is needed
    const shouldCompress = this.shouldCompress(body, headers, options)
    
    if (!shouldCompress) {
      return new Response(body, { headers })
    }

    try {
      // Get accepted encodings from request
      const acceptEncoding = headers.get('accept-encoding') || ''
      const encoding = this.selectEncoding(acceptEncoding, options.encoding)
      
      if (!encoding) {
        return new Response(body, { headers })
      }

      // Convert to Uint8Array if needed
      const data = typeof body === 'string' 
        ? new TextEncoder().encode(body)
        : body

      // Compress data
      const compressed = this.compress(data, encoding, options.level)
      
      // Update stats
      const stats: CompressionStats = {
        originalSize: data.length,
        compressedSize: compressed.length,
        compressionRatio: 1 - (compressed.length / data.length),
        compressionTime: Date.now() - startTime,
        encoding
      }

      this.updateStats(stats)

      // Set compression headers
      headers.set('content-encoding', encoding)
      headers.set('content-length', compressed.length.toString())
      headers.set('x-original-size', data.length.toString())
      headers.set('x-compression-ratio', stats.compressionRatio.toFixed(2))

      this.logger.debug('Response compressed', {
        encoding,
        originalSize: stats.originalSize,
        compressedSize: stats.compressedSize,
        ratio: `${(stats.compressionRatio * 100).toFixed(1)}%`,
        time: `${stats.compressionTime}ms`
      })

      return new Response(compressed, { headers })

    } catch (error) {
      this.logger.error('Compression error', { error: error.message })
      // Return uncompressed response on error
      return new Response(body, { headers })
    }
  }

  async compressStream(
    stream: ReadableStream,
    headers: Headers,
    options: CompressionOptions = {}
  ): Promise<Response> {
    const acceptEncoding = headers.get('accept-encoding') || ''
    const encoding = this.selectEncoding(acceptEncoding, options.encoding)
    
    if (!encoding) {
      return new Response(stream, { headers })
    }

    // Create compression stream
    const compressionStream = this.createCompressionStream(encoding)
    const compressedStream = stream.pipeThrough(compressionStream)

    // Set headers
    headers.set('content-encoding', encoding)
    headers.delete('content-length') // Can't know compressed size in advance

    return new Response(compressedStream, { headers })
  }

  getStats(): any {
    const avgCompressionRatio = this.stats.compressedRequests > 0
      ? 1 - (this.stats.totalCompressedBytes / this.stats.totalOriginalBytes)
      : 0

    const avgCompressionTime = this.stats.compressedRequests > 0
      ? this.stats.totalCompressionTime / this.stats.compressedRequests
      : 0

    return {
      totalRequests: this.stats.totalRequests,
      compressedRequests: this.stats.compressedRequests,
      compressionRate: this.stats.totalRequests > 0
        ? this.stats.compressedRequests / this.stats.totalRequests
        : 0,
      totalSavedBytes: this.stats.totalOriginalBytes - this.stats.totalCompressedBytes,
      avgCompressionRatio,
      avgCompressionTime,
      totalCompressionTime: this.stats.totalCompressionTime
    }
  }

  // Middleware function for easy integration
  middleware(options: CompressionOptions = {}) {
    return async (req: Request, handler: (req: Request) => Promise<Response>) => {
      const response = await handler(req)
      
      // Check if response should be compressed
      if (!response.body || response.headers.get('content-encoding')) {
        return response
      }

      // Get response body
      const body = await response.arrayBuffer()
      const compressed = this.createCompressedResponse(
        new Uint8Array(body),
        response.headers,
        {
          ...options,
          encoding: this.selectEncoding(
            req.headers.get('accept-encoding') || '',
            options.encoding
          ) as any
        }
      )

      return compressed
    }
  }

  // Private methods

  private shouldCompress(
    body: string | Uint8Array,
    headers: Headers,
    options: CompressionOptions
  ): boolean {
    // Check size threshold
    const size = typeof body === 'string' 
      ? new TextEncoder().encode(body).length
      : body.length
    
    if (size < (options.threshold || this.DEFAULT_THRESHOLD)) {
      return false
    }

    // Check content type
    const contentType = headers.get('content-type')?.split(';')[0] || ''
    const allowedTypes = options.types || this.DEFAULT_TYPES
    
    if (!allowedTypes.some(type => contentType.includes(type))) {
      return false
    }

    // Don't compress if already encoded
    if (headers.get('content-encoding')) {
      return false
    }

    return true
  }

  private selectEncoding(
    acceptEncoding: string,
    preferred?: string
  ): string | null {
    const accepted = acceptEncoding.toLowerCase()
    
    // Use preferred if accepted
    if (preferred && accepted.includes(preferred)) {
      return preferred
    }

    // Select best available encoding
    if (accepted.includes('br')) {
      return 'br' // Brotli is usually best
    }
    if (accepted.includes('gzip')) {
      return 'gzip'
    }
    if (accepted.includes('deflate')) {
      return 'deflate'
    }

    return null
  }

  private compress(
    data: Uint8Array,
    encoding: string,
    level?: number
  ): Uint8Array {
    // In Deno, we can use CompressionStream
    // For now, using a simple implementation
    // In production, use proper compression libraries

    switch (encoding) {
      case 'gzip':
        return this.gzipCompress(data, level)
      case 'deflate':
        return this.deflateCompress(data, level)
      case 'br':
        return this.brotliCompress(data, level)
      default:
        throw new Error(`Unsupported encoding: ${encoding}`)
    }
  }

  private gzipCompress(data: Uint8Array, level: number = 6): Uint8Array {
    // Simplified GZIP compression
    // In production, use pako or similar library
    const stream = new CompressionStream('gzip')
    const writer = stream.writable.getWriter()
    writer.write(data)
    writer.close()
    
    return new Uint8Array() // Placeholder
  }

  private deflateCompress(data: Uint8Array, level: number = 6): Uint8Array {
    // Simplified deflate compression
    const stream = new CompressionStream('deflate')
    const writer = stream.writable.getWriter()
    writer.write(data)
    writer.close()
    
    return new Uint8Array() // Placeholder
  }

  private brotliCompress(data: Uint8Array, level: number = 4): Uint8Array {
    // Brotli compression not natively supported in Deno
    // Would need to use WASM module or external library
    return data // Fallback to uncompressed
  }

  private createCompressionStream(encoding: string): TransformStream {
    switch (encoding) {
      case 'gzip':
        return new CompressionStream('gzip')
      case 'deflate':
        return new CompressionStream('deflate')
      default:
        throw new Error(`Unsupported encoding for streaming: ${encoding}`)
    }
  }

  private updateStats(stats: CompressionStats): void {
    this.stats.compressedRequests++
    this.stats.totalOriginalBytes += stats.originalSize
    this.stats.totalCompressedBytes += stats.compressedSize
    this.stats.totalCompressionTime += stats.compressionTime
  }

  // Utility method to estimate compressed size
  estimateCompressedSize(
    content: string,
    encoding: string = 'gzip'
  ): number {
    // Rough estimates based on typical compression ratios
    const ratios = {
      gzip: 0.3, // 70% reduction
      deflate: 0.35, // 65% reduction
      br: 0.25 // 75% reduction
    }

    const originalSize = new TextEncoder().encode(content).length
    const ratio = ratios[encoding] || 0.5
    
    return Math.floor(originalSize * ratio)
  }

  // Method to analyze content for compression potential
  analyzeCompressionPotential(content: string): {
    potential: 'high' | 'medium' | 'low'
    estimatedRatio: number
    recommendation: string
  } {
    const size = new TextEncoder().encode(content).length
    
    // Check for repetitive patterns
    const uniqueChars = new Set(content).size
    const repetitionRatio = uniqueChars / content.length

    // Check for common compressible patterns
    const hasWhitespace = /\s{2,}/.test(content)
    const hasRepeatedWords = /(\b\w+\b)(?=.*\b\1\b)/.test(content)
    const isJson = content.trim().startsWith('{') || content.trim().startsWith('[')

    let potential: 'high' | 'medium' | 'low'
    let estimatedRatio: number

    if (repetitionRatio < 0.1 || (isJson && size > 5000)) {
      potential = 'high'
      estimatedRatio = 0.2
    } else if (repetitionRatio < 0.3 || hasWhitespace || hasRepeatedWords) {
      potential = 'medium'
      estimatedRatio = 0.4
    } else {
      potential = 'low'
      estimatedRatio = 0.7
    }

    const recommendation = size < 1024
      ? 'Content too small to benefit from compression'
      : potential === 'high'
      ? 'Highly compressible - compression recommended'
      : potential === 'medium'
      ? 'Moderately compressible - compression beneficial'
      : 'Low compression potential - consider if bandwidth is critical'

    return {
      potential,
      estimatedRatio,
      recommendation
    }
  }
}

// Export singleton instance
export const responseCompressor = new ResponseCompressor()