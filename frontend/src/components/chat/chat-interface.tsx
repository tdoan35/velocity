import { useEffect, useRef, useState } from 'react'
import { MessageSquarePlus, History, FileCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { MessageBubble } from './message-bubble'
import { TypingIndicator } from './typing-indicator'
import { ChatInput } from './chat-input'
import { MarkdownMessage } from './markdown-message'
import { useChatStore } from '@/stores/useChatStore'
import { useEditorStore } from '@/stores/useEditorStore'
import type { ChatMessage } from '@/types/chat'
import { cn } from '@/lib/utils'

interface ChatInterfaceProps {
  className?: string
  onApplyCode?: (code: string) => void
}

export function ChatInterface({ className, onApplyCode }: ChatInterfaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [fileContext, setFileContext] = useState<{
    fileName: string
    fileId: string
    content: string
  } | null>(null)
  
  const {
    currentSessionId,
    sessions,
    isTyping,
    createSession,
    selectSession,
    addMessage,
    getCurrentSession,
    updateContext,
  } = useChatStore()
  
  const { activeTabId, tabs } = useEditorStore()
  
  const currentSession = getCurrentSession()
  const messages = currentSession?.messages || []
  
  // Initialize session if none exists
  useEffect(() => {
    if (!currentSessionId && sessions.length === 0) {
      createSession('New Chat')
    }
  }, [currentSessionId, sessions.length, createSession])
  
  // Update context when active file changes
  useEffect(() => {
    const activeTab = tabs.find(tab => tab.id === activeTabId)
    if (activeTab) {
      updateContext({
        currentFile: {
          id: activeTab.id,
          path: activeTab.filePath,
          content: activeTab.content,
          language: getLanguageFromPath(activeTab.filePath),
        },
        openFiles: tabs.map(tab => ({
          id: tab.id,
          path: tab.filePath,
        })),
      })
    }
  }, [activeTabId, tabs, updateContext])
  
  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, isTyping])
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + K to focus chat input
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
      }
      
      // Ctrl/Cmd + H to toggle history
      if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
        e.preventDefault()
        setShowHistory(prev => !prev)
      }
      
      // Ctrl/Cmd + N for new chat
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault()
        createSession()
      }
      
      // Escape to close history
      if (e.key === 'Escape' && showHistory) {
        setShowHistory(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [createSession, showHistory])
  
  const handleSubmit = async (message: string) => {
    // Add user message
    addMessage({
      role: 'user',
      content: message,
      metadata: fileContext ? {
        fileContext: {
          fileId: fileContext.fileId,
          filePath: fileContext.fileName,
          language: getLanguageFromPath(fileContext.fileName),
        },
      } : undefined,
    })
    
    // Clear file context after sending
    setFileContext(null)
    
    // Simulate AI response (in real app, this would call an API)
    setTimeout(() => {
      simulateAIResponse(message)
    }, 1000)
  }
  
  const simulateAIResponse = (userMessage: string) => {
    // This is a mock implementation - replace with actual AI API call
    const activeTab = tabs.find(tab => tab.id === activeTabId)
    const fileType = activeTab ? getLanguageFromPath(activeTab.filePath) : 'general'
    
    // Context-aware responses based on file type
    const contextualResponses: Record<string, Record<string, string>> = {
      typescript: {
        '/explain': generateTypeScriptExplanation(activeTab?.content || ''),
        '/refactor': generateTypeScriptRefactoring(activeTab?.content || ''),
        '/test': generateTypeScriptTests(activeTab?.content || ''),
      },
      javascript: {
        '/explain': generateJavaScriptExplanation(activeTab?.content || ''),
        '/refactor': generateJavaScriptRefactoring(activeTab?.content || ''),
        '/test': generateJavaScriptTests(activeTab?.content || ''),
      },
    }
    
    const mockResponses: Record<string, string> = {
      '/help': `Here are the available commands:
      
- **/explain** - Get an explanation of the current code
- **/refactor** - Get refactoring suggestions
- **/debug** - Get help debugging issues
- **/test** - Generate test cases
- **/docs** - Generate documentation

You can also ask any coding question or request help with your React Native project!`,
      
      '/explain': `Looking at your current file, here's what it does:

\`\`\`typescript
// This component creates a reusable Button
export function Button({ title, onPress, variant = 'primary' }: ButtonProps) {
  // Renders a TouchableOpacity with custom styling
  // The variant prop determines the color scheme
}
\`\`\`

The component accepts:
- **title**: The button text
- **onPress**: Click handler function  
- **variant**: Visual style (primary/secondary)`,
      
      default: `I understand you're working on a React Native project. Here's a helpful tip:

\`\`\`typescript
// Use StyleSheet.create for better performance
const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
})
\`\`\`

Feel free to ask me anything about React Native development!`,
    }
    
    // Check for contextual responses first
    let responseContent = mockResponses.default
    
    if (userMessage.startsWith('/')) {
      const command = userMessage.split(' ')[0]
      
      // Try contextual response based on file type
      if (contextualResponses[fileType] && contextualResponses[fileType][command]) {
        responseContent = contextualResponses[fileType][command]
      } else if (mockResponses[command]) {
        responseContent = mockResponses[command]
      }
    }
    
    addMessage({
      role: 'assistant',
      content: responseContent,
      metadata: {
        codeBlocks: extractCodeBlocksFromResponse(responseContent),
      },
    })
  }
  
  const handleAttachCurrentFile = () => {
    const activeTab = tabs.find(tab => tab.id === activeTabId)
    if (activeTab) {
      setFileContext({
        fileName: activeTab.filePath,
        fileId: activeTab.id,
        content: activeTab.content,
      })
    }
  }
  
  const renderMessage = (message: ChatMessage) => {
    if (message.role === 'assistant' && message.content.includes('```')) {
      return (
        <MarkdownMessage
          content={message.content}
          codeBlocks={message.metadata?.codeBlocks}
          onApplyCode={onApplyCode}
        />
      )
    }
    return <p className="text-sm whitespace-pre-wrap">{message.content}</p>
  }
  
  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">AI Assistant</h2>
          {currentSession && (
            <span className="text-sm text-muted-foreground">
              {currentSession.title}
            </span>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => createSession()}
          >
            <MessageSquarePlus className="h-4 w-4" />
          </Button>
          {activeTabId && (
            <Button
              variant="ghost"
              size="icon"
              onClick={handleAttachCurrentFile}
            >
              <FileCode className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      
      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <p className="text-sm">Start a conversation with AI</p>
              <p className="text-xs mt-2">
                Use / to see available commands
              </p>
            </div>
          ) : (
            messages.map((message) => (
              <div key={message.id}>
                {message.role === 'assistant' ? (
                  <div className="flex gap-3">
                    <div className="flex-shrink-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="w-5 h-5 text-primary" />
                      </div>
                    </div>
                    <div className="flex-1 max-w-[80%]">
                      {renderMessage(message)}
                    </div>
                  </div>
                ) : (
                  <MessageBubble message={message} />
                )}
              </div>
            ))
          )}
          {isTyping && <TypingIndicator />}
        </div>
      </ScrollArea>
      
      {/* Input */}
      <div className="border-t p-4">
        <ChatInput
          ref={inputRef}
          onSubmit={handleSubmit}
          disabled={isTyping}
          fileContext={fileContext ? {
            fileName: fileContext.fileName.split('/').pop() || fileContext.fileName,
            onRemove: () => setFileContext(null),
          } : undefined}
        />
      </div>
      
      {/* Session history sidebar */}
      {showHistory && (
        <div className="absolute right-0 top-0 h-full w-64 border-l bg-background shadow-lg">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Chat History</h3>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => {
                    selectSession(session.id)
                    setShowHistory(false)
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-md text-sm hover:bg-accent',
                    session.id === currentSessionId && 'bg-accent'
                  )}
                >
                  <div className="font-medium">{session.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {session.messages.length} messages
                  </div>
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

// Import Bot icon since it's used in the component
import { Bot } from 'lucide-react'

function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() || ''
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescript',
    js: 'javascript',
    jsx: 'javascript',
    py: 'python',
    java: 'java',
    css: 'css',
    html: 'html',
  }
  return langMap[ext] || 'plaintext'
}

function extractCodeBlocksFromResponse(content: string) {
  const regex = /```(\w+)?\n([\s\S]*?)```/g
  const blocks = []
  let match
  
  while ((match = regex.exec(content)) !== null) {
    blocks.push({
      id: `block-${Date.now()}-${blocks.length}`,
      language: match[1] || 'plaintext',
      code: match[2].trim(),
    })
  }
  
  return blocks
}

// Helper functions for contextual responses
function generateTypeScriptExplanation(_content: string): string {
  // Basic analysis of TypeScript code
  const hasInterface = _content.includes('interface')
  const hasType = _content.includes('type')
  const hasClass = _content.includes('class')
  const hasFunction = _content.includes('function') || _content.includes('=>')
  
  return `Looking at your TypeScript file, I can see:

${hasInterface ? '- **Interfaces**: Type definitions for object shapes\n' : ''}
${hasType ? '- **Type Aliases**: Custom type definitions\n' : ''}
${hasClass ? '- **Classes**: Object-oriented components\n' : ''}
${hasFunction ? '- **Functions**: Business logic implementations\n' : ''}

\`\`\`typescript
// Example from your code
${_content.split('\n').slice(0, 10).join('\n')}
// ...
\`\`\`

This appears to be a well-structured TypeScript module with proper type safety.`
}

function generateTypeScriptRefactoring(_content: string): string {
  return `Here are some refactoring suggestions for your TypeScript code:

1. **Use const assertions for literal types**:
\`\`\`typescript
// Before
const config = { mode: 'production' }

// After  
const config = { mode: 'production' } as const
\`\`\`

2. **Extract complex types**:
\`\`\`typescript
// Consider extracting inline types
type AppConfig = {
  mode: 'production' | 'development'
  features: string[]
}
\`\`\`

3. **Use optional chaining**:
\`\`\`typescript
// Safer property access
const value = data?.user?.settings?.theme
\`\`\`

These improvements will enhance type safety and code maintainability.`
}

function generateTypeScriptTests(_content: string): string {
  return `Here's a test suite for your TypeScript code:

\`\`\`typescript
import { describe, it, expect } from 'vitest'
import { Button } from './Button'

describe('Button Component', () => {
  it('should render with title', () => {
    const button = Button({ 
      title: 'Click me',
      onPress: () => {}
    })
    expect(button).toBeDefined()
  })
  
  it('should handle press events', () => {
    const mockPress = vi.fn()
    const button = Button({
      title: 'Test',
      onPress: mockPress
    })
    
    // Simulate press
    button.props.onPress()
    expect(mockPress).toHaveBeenCalled()
  })
})
\`\`\`

This covers basic functionality and event handling.`
}

function generateJavaScriptExplanation(_content: string): string {
  return `Analyzing your JavaScript file:

${_content.includes('export') ? '- **ES6 Modules**: Modern module syntax\n' : ''}
${_content.includes('async') ? '- **Async/Await**: Asynchronous operations\n' : ''}
${_content.includes('=>') ? '- **Arrow Functions**: Concise function syntax\n' : ''}

Your code follows modern JavaScript patterns and best practices.`
}

function generateJavaScriptRefactoring(_content: string): string {
  return `JavaScript refactoring suggestions:

1. **Use destructuring**:
\`\`\`javascript
// Extract properties directly
const { name, age } = user
\`\`\`

2. **Template literals**:
\`\`\`javascript
// More readable string formatting
const message = \`Hello, \${name}!\`
\`\`\`

These patterns improve code readability.`
}

function generateJavaScriptTests(_content: string): string {
  return `JavaScript test examples:

\`\`\`javascript
import { test, expect } from 'vitest'

test('component functionality', () => {
  // Test implementation
  expect(true).toBe(true)
})
\`\`\`

Add comprehensive tests for better code quality.`
}