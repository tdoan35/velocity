// Core application types
export interface Project {
  id: string
  name: string
  description: string
  createdAt: Date
  updatedAt: Date
  template?: string
  status: 'draft' | 'generating' | 'ready' | 'error'
}

export interface FileNode {
  id: string
  name: string
  path: string
  type: 'file' | 'directory'
  content?: string
  children?: FileNode[]
  parentId?: string
}

export interface EditorTab {
  id: string
  fileId: string
  filePath: string
  content: string
  isDirty: boolean
  cursor?: {
    line: number
    column: number
  }
}

export interface UserPreferences {
  theme: 'light' | 'dark' | 'system'
  editorFontSize: number
  editorTheme: string
  autoSave: boolean
  autoSaveDelay: number
  showLineNumbers: boolean
  wordWrap: boolean
  tabSize: number
}

export interface AIChat {
  id: string
  projectId: string
  messages: AIMessage[]
  isLoading: boolean
}

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  codeBlocks?: CodeBlock[]
}

export interface CodeBlock {
  id: string
  language: string
  code: string
  filePath?: string
}

export interface AppNotification {
  id: string
  type: 'info' | 'success' | 'warning' | 'error'
  title: string
  message?: string
  duration?: number
  timestamp: Date
}