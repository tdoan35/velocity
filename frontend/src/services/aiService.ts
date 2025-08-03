import { supabase } from '../lib/supabase'

interface GenerateCodeRequest {
  prompt: string
  projectId?: string
  context?: {
    projectStructure?: string[]
    currentFile?: string
    userHistory?: string[]
    preferences?: Record<string, any>
  }
  options?: {
    temperature?: number
    maxTokens?: number
    stream?: boolean
    analyzeQuality?: boolean
    autoEnhance?: boolean
    targetQualityScore?: number
  }
}

interface StreamChunk {
  type: 'code' | 'progress' | 'error' | 'metadata'
  content?: string
  delta?: string
  phase?: string
  message?: string
  metadata?: any
}

export const aiService = {
  async generateCode(request: GenerateCodeRequest): Promise<ReadableStream<StreamChunk>> {
    const { data: { session } } = await supabase.auth.getSession()
    
    if (!session) {
      throw new Error('Not authenticated')
    }

    const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`
      },
      body: JSON.stringify({
        ...request,
        options: {
          ...request.options,
          stream: true // Always stream for better UX
        }
      })
    })

    if (!response.ok) {
      const error = await response.text()
      throw new Error(`AI generation failed: ${error}`)
    }

    return response.body!
  },

  async parseStreamResponse(
    stream: ReadableStream<StreamChunk>,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<string> {
    const reader = stream.getReader()
    const decoder = new TextDecoder()
    let fullResponse = ''
    
    try {
      while (true) {
        const { done, value } = await reader.read()
        
        if (done) break
        
        const text = decoder.decode(value, { stream: true })
        const lines = text.split('\n').filter(line => line.trim())
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            
            if (data === '[DONE]') {
              continue
            }
            
            try {
              const chunk = JSON.parse(data) as StreamChunk
              onChunk(chunk)
              
              // Accumulate code content
              if (chunk.type === 'code' && (chunk.content || chunk.delta)) {
                fullResponse += chunk.content || chunk.delta || ''
              }
            } catch (e) {
              console.error('Error parsing chunk:', e, data)
            }
          }
        }
      }
    } finally {
      reader.releaseLock()
    }
    
    return fullResponse
  },

  // Simplified method for chat conversations
  async generateChatResponse(
    prompt: string,
    projectId: string,
    conversationHistory?: Array<{ role: string; content: string }>
  ): Promise<ReadableStream<StreamChunk>> {
    // Build context from conversation history
    const userHistory = conversationHistory
      ?.filter(msg => msg.role === 'user')
      .map(msg => msg.content)
      .slice(-5) // Last 5 user messages
    
    return this.generateCode({
      prompt,
      projectId,
      context: {
        userHistory,
        preferences: {
          conversationType: 'design_assistant',
          responseStyle: 'conversational'
        }
      },
      options: {
        temperature: 0.8,
        maxTokens: 2048,
        stream: true
      }
    })
  }
}