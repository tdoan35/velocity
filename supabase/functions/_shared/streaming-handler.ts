// Streaming response handler for real-time code generation feedback
import { createLogger } from './logger.ts'

interface StreamChunk {
  type: 'start' | 'progress' | 'code' | 'complete' | 'error'
  data: any
  timestamp: string
  sequenceNumber: number
}

interface StreamOptions {
  onChunk?: (chunk: StreamChunk) => void
  chunkSize?: number
  includeMetadata?: boolean
  compressionEnabled?: boolean
}

export class StreamingHandler {
  private logger: any
  private encoder: TextEncoder
  private sequenceNumber: number = 0

  constructor() {
    this.logger = createLogger({ context: 'StreamingHandler' })
    this.encoder = new TextEncoder()
  }

  createStreamResponse(
    generator: AsyncGenerator<any, void, unknown>,
    options: StreamOptions = {}
  ): Response {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Send initial chunk
          controller.enqueue(this.createChunk('start', {
            timestamp: new Date().toISOString(),
            options: {
              chunkSize: options.chunkSize,
              includeMetadata: options.includeMetadata
            }
          }))

          // Process generator chunks
          for await (const data of generator) {
            const chunk = this.createChunk(data.type || 'progress', data)
            controller.enqueue(chunk)

            if (options.onChunk) {
              options.onChunk(JSON.parse(new TextDecoder().decode(chunk)))
            }
          }

          // Send completion chunk
          controller.enqueue(this.createChunk('complete', {
            timestamp: new Date().toISOString(),
            totalChunks: this.sequenceNumber
          }))

        } catch (error) {
          // Send error chunk
          controller.enqueue(this.createChunk('error', {
            error: error.message,
            timestamp: new Date().toISOString()
          }))
          
          await this.logger.error('Streaming error', { error: error.message })
        } finally {
          controller.close()
        }
      }
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // Disable Nginx buffering
      }
    })
  }

  async* streamCodeGeneration(
    prompt: string,
    context: any,
    apiCall: (prompt: string, context: any) => Promise<any>
  ): AsyncGenerator<any, void, unknown> {
    const startTime = Date.now()

    try {
      // Yield initial progress
      yield {
        type: 'progress',
        phase: 'initialization',
        message: 'Starting code generation...',
        progress: 0
      }

      // Yield context building progress
      yield {
        type: 'progress',
        phase: 'context',
        message: 'Building context...',
        progress: 10,
        contextSize: JSON.stringify(context).length
      }

      // Make API call with streaming support
      const response = await apiCall(prompt, context)

      // If response supports streaming
      if (response.body && typeof response.body.getReader === 'function') {
        yield* this.streamApiResponse(response)
      } else {
        // Non-streaming response
        yield {
          type: 'code',
          content: response.code,
          language: response.language || 'typescript',
          progress: 90
        }
      }

      // Yield completion metrics
      yield {
        type: 'progress',
        phase: 'complete',
        message: 'Code generation complete',
        progress: 100,
        duration: Date.now() - startTime
      }

    } catch (error) {
      yield {
        type: 'error',
        error: error.message,
        phase: 'generation',
        duration: Date.now() - startTime
      }
      throw error
    }
  }

  private async* streamApiResponse(response: Response): AsyncGenerator<any, void, unknown> {
    const reader = response.body!.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let totalChunks = 0

    try {
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        
        // Keep the last incomplete line in buffer
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line)
              totalChunks++

              yield {
                type: 'code',
                content: data.content,
                delta: data.delta,
                progress: Math.min(90, 20 + (totalChunks * 2)),
                chunkIndex: totalChunks
              }
            } catch (e) {
              // Skip malformed JSON
              await this.logger.debug('Skipped malformed chunk', { line })
            }
          }
        }
      }

      // Process any remaining buffer
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer)
          yield {
            type: 'code',
            content: data.content,
            progress: 90,
            chunkIndex: totalChunks + 1
          }
        } catch (e) {
          // Ignore final buffer errors
        }
      }
    } finally {
      reader.releaseLock()
    }
  }

  private createChunk(type: string, data: any): Uint8Array {
    const chunk: StreamChunk = {
      type: type as any,
      data,
      timestamp: new Date().toISOString(),
      sequenceNumber: this.sequenceNumber++
    }

    const eventData = `data: ${JSON.stringify(chunk)}\n\n`
    return this.encoder.encode(eventData)
  }

  // Method to handle chunked code streaming with syntax validation
  async* streamWithValidation(
    codeGenerator: AsyncGenerator<string, void, unknown>,
    language: string = 'typescript'
  ): AsyncGenerator<any, void, unknown> {
    let accumulatedCode = ''
    let lastValidCode = ''
    let chunkCount = 0

    for await (const codeChunk of codeGenerator) {
      accumulatedCode += codeChunk
      chunkCount++

      // Validate syntax periodically (every 5 chunks)
      if (chunkCount % 5 === 0) {
        const isValid = await this.validateSyntax(accumulatedCode, language)
        
        if (isValid) {
          lastValidCode = accumulatedCode
          yield {
            type: 'code',
            content: codeChunk,
            accumulated: accumulatedCode,
            syntaxValid: true,
            progress: Math.min(90, 20 + (chunkCount * 2))
          }
        } else {
          yield {
            type: 'code',
            content: codeChunk,
            accumulated: lastValidCode,
            syntaxValid: false,
            syntaxError: 'Incomplete syntax',
            progress: Math.min(90, 20 + (chunkCount * 2))
          }
        }
      } else {
        yield {
          type: 'code',
          content: codeChunk,
          progress: Math.min(90, 20 + (chunkCount * 2))
        }
      }
    }

    // Final validation
    const finalValid = await this.validateSyntax(accumulatedCode, language)
    yield {
      type: 'validation',
      syntaxValid: finalValid,
      finalCode: finalValid ? accumulatedCode : lastValidCode,
      totalChunks: chunkCount
    }
  }

  private async validateSyntax(code: string, language: string): Promise<boolean> {
    // Simple validation - in production, use proper parsers
    try {
      switch (language) {
        case 'javascript':
        case 'typescript':
          // Check for basic syntax markers
          const openBraces = (code.match(/\{/g) || []).length
          const closeBraces = (code.match(/\}/g) || []).length
          const openParens = (code.match(/\(/g) || []).length
          const closeParens = (code.match(/\)/g) || []).length
          
          return openBraces === closeBraces && openParens === closeParens
        
        default:
          return true // Skip validation for other languages
      }
    } catch (error) {
      return false
    }
  }

  // Method to create a progress tracker for multi-step operations
  createProgressTracker(totalSteps: number): (step: number, message: string) => any {
    return (step: number, message: string) => ({
      type: 'progress',
      step,
      totalSteps,
      progress: Math.round((step / totalSteps) * 100),
      message
    })
  }

  // Method to batch small chunks for efficiency
  async* batchChunks(
    source: AsyncGenerator<any, void, unknown>,
    batchSize: number = 5,
    maxDelay: number = 100
  ): AsyncGenerator<any, void, unknown> {
    let batch: any[] = []
    let lastEmit = Date.now()

    for await (const item of source) {
      batch.push(item)

      const shouldEmit = batch.length >= batchSize || 
                        (Date.now() - lastEmit) > maxDelay

      if (shouldEmit && batch.length > 0) {
        yield {
          type: 'batch',
          items: batch,
          batchSize: batch.length
        }
        batch = []
        lastEmit = Date.now()
      }
    }

    // Emit remaining items
    if (batch.length > 0) {
      yield {
        type: 'batch',
        items: batch,
        batchSize: batch.length,
        final: true
      }
    }
  }
}

// Export singleton instance
export const streamingHandler = new StreamingHandler()