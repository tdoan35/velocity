export interface ChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
  metadata?: {
    fileContext?: {
      fileId: string
      filePath: string
      language: string
    }
    codeBlocks?: CodeBlock[]
    error?: string
  }
}

export interface CodeBlock {
  id: string
  language: string
  code: string
  fileName?: string
  description?: string
}

export interface ChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: Date
  updatedAt: Date
}

export interface AIContext {
  currentFile?: {
    id: string
    path: string
    content: string
    language: string
  }
  openFiles?: Array<{
    id: string
    path: string
  }>
  projectStructure?: string
}