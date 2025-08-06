import { useEffect, useRef, useState } from 'react'
import { MessageSquarePlus, History, FileCode, Bot, User, Settings, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EnhancedTextarea } from '@/components/ui/enhanced-textarea'
import { MarkdownMessage } from './markdown-message'
import { TypingIndicator } from './typing-indicator'
import { useAIChatStream } from '@/hooks/useAIChatStream'
import type { AgentType } from '@/types/ai'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'

interface EnhancedChatInterfaceProps {
  projectId: string
  conversationId?: string
  className?: string
  onApplyCode?: (code: string) => void
  activeAgent?: 'project_manager' | 'design_assistant' | 'code_generator' | 'config_helper'
  onAgentChange?: (agent: 'project_manager' | 'design_assistant' | 'code_generator' | 'config_helper') => void
}

const agentConfig: Record<AgentType, { label: string; icon: any; color: string }> = {
  project: { label: 'Project Manager', icon: '📊', color: 'bg-blue-500' },
  ui: { label: 'UI/UX Designer', icon: '🎨', color: 'bg-purple-500' },
  code: { label: 'Code Generator', icon: '💻', color: 'bg-green-500' },
  config: { label: 'Config Helper', icon: '⚙️', color: 'bg-orange-500' },
}

export function EnhancedChatInterface({
  projectId,
  conversationId: initialConversationId,
  className,
  onApplyCode,
  activeAgent,
  onAgentChange,
}: EnhancedChatInterfaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const [showHistory, setShowHistory] = useState(false)
  const { toast } = useToast()

  const {
    messages,
    input,
    isLoading,
    error,
    conversationId,
    currentAgent,
    isInitializing,
    handleInputChange,
    handleSubmit,
    reload,
    stop,
    switchAgent,
    updateContext,
  } = useAIChatStream({
    conversationId: initialConversationId,
    projectId,
    initialAgent: activeAgent ? 
      (activeAgent === 'project_manager' ? 'project' :
       activeAgent === 'design_assistant' ? 'ui' :
       activeAgent === 'code_generator' ? 'code' :
       activeAgent === 'config_helper' ? 'config' : 'project') : 'project',
    onStreamStart: () => {
      // Scroll to bottom when streaming starts
      scrollToBottom()
    },
    onStreamEnd: (usage) => {
      console.log('Stream ended with usage:', usage)
    },
  })

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Handle agent changes from parent
  useEffect(() => {
    if (activeAgent && onAgentChange) {
      const mappedAgent = 
        activeAgent === 'project_manager' ? 'project' :
        activeAgent === 'design_assistant' ? 'ui' :
        activeAgent === 'code_generator' ? 'code' :
        activeAgent === 'config_helper' ? 'config' : 'project'
      
      switchAgent(mappedAgent as AgentType)
    }
  }, [activeAgent, switchAgent, onAgentChange])

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
      
      // Escape to close history
      if (e.key === 'Escape' && showHistory) {
        setShowHistory(false)
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [showHistory])

  // Handle errors
  useEffect(() => {
    if (error) {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    }
  }, [error, toast])

  const handleAgentSwitch = (agent: AgentType) => {
    switchAgent(agent)
    toast({
      title: 'Agent Switched',
      description: `Now talking to ${agentConfig[agent].label}`,
    })
  }

  const renderMessage = (message: any) => {
    const isAssistant = message.role === 'assistant'
    const agentType = message.metadata?.agentType || currentAgent
    const agent = agentConfig[agentType as AgentType] || agentConfig.project

    return (
      <div
        key={message.id}
        className={cn(
          'flex gap-3',
          !isAssistant && 'flex-row-reverse'
        )}
      >
        <div className="flex-shrink-0">
          {isAssistant ? (
            <div className={cn(
              'w-8 h-8 rounded-full flex items-center justify-center text-white',
              agent.color
            )}>
              <span className="text-sm">{agent.icon}</span>
            </div>
          ) : (
            <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="w-4 h-4" />
            </div>
          )}
        </div>
        
        <div className={cn(
          'flex-1 space-y-1',
          !isAssistant && 'flex flex-col items-end'
        )}>
          {isAssistant && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">
                {agent.label}
              </span>
              <span className="text-xs text-muted-foreground">
                {new Date(message.createdAt).toLocaleTimeString()}
              </span>
            </div>
          )}
          
          <div className={cn(
            'rounded-lg p-3 max-w-[80%]',
            isAssistant 
              ? 'bg-muted' 
              : 'bg-primary text-primary-foreground'
          )}>
            {isAssistant && message.content.includes('```') ? (
              <MarkdownMessage
                content={message.content}
                onApplyCode={onApplyCode}
              />
            ) : (
              <p className="text-sm whitespace-pre-wrap">{message.content}</p>
            )}
          </div>
          
          {!isAssistant && (
            <span className="text-xs text-muted-foreground">
              {new Date(message.createdAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>
    )
  }

  if (isInitializing) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <div className="text-center space-y-2">
          <Bot className="w-8 h-8 animate-pulse mx-auto" />
          <p className="text-sm text-muted-foreground">Initializing chat...</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">AI Design Assistant</h2>
          <Badge variant="secondary" className="text-xs">
            {agentConfig[currentAgent].icon} {agentConfig[currentAgent].label}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <Settings className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Switch Agent</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {Object.entries(agentConfig).map(([key, config]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => handleAgentSwitch(key as AgentType)}
                  className={cn(
                    'flex items-center gap-2',
                    currentAgent === key && 'bg-accent'
                  )}
                >
                  <span>{config.icon}</span>
                  <span>{config.label}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowHistory(!showHistory)}
          >
            <History className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      {/* Messages */}
      <ScrollArea ref={scrollRef} className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <div className="space-y-4">
                <Bot className="w-12 h-12 mx-auto opacity-50" />
                <div>
                  <p className="text-sm font-medium">
                    Welcome to Velocity AI Assistant
                  </p>
                  <p className="text-xs mt-2">
                    I can help you design, build, and deploy your mobile app
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleInputChange({ target: { value: 'Help me plan my app structure' } } as any)
                      handleSubmit()
                    }}
                  >
                    Plan Structure
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleInputChange({ target: { value: 'Suggest a UI design for my app' } } as any)
                      handleSubmit()
                    }}
                  >
                    Design UI
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      handleInputChange({ target: { value: 'Generate code for a login screen' } } as any)
                      handleSubmit()
                    }}
                  >
                    Generate Code
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map(renderMessage)}
              {isLoading && <TypingIndicator />}
            </>
          )}
        </div>
      </ScrollArea>
      
      {/* Input */}
      <div className="border-t p-4">
        <EnhancedTextarea
          ref={inputRef}
          value={input}
          onChange={(value) => {
            const event = { target: { value } } as React.ChangeEvent<HTMLTextAreaElement>
            handleInputChange(event)
          }}
          onSubmit={() => handleSubmit()}
          disabled={isLoading}
          isLoading={isLoading}
          placeholder={`Ask ${agentConfig[currentAgent].label} anything...`}
          submitIcon={Send}
          minHeight="60px"
          showAttachButton={false}
          showHelperText={true}
          showCommands={true}
        />
        {isLoading && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={stop}
            className="absolute right-2 top-2"
          >
            Stop
          </Button>
        )}
        
        {error && (
          <div className="mt-2 text-xs text-destructive">
            {error.message}. 
            <Button
              variant="link"
              size="sm"
              onClick={reload}
              className="text-xs h-auto p-0 ml-1"
            >
              Try again
            </Button>
          </div>
        )}
      </div>
      
      {/* Session history sidebar */}
      {showHistory && (
        <div className="absolute right-0 top-0 h-full w-64 border-l bg-background shadow-lg z-50">
          <div className="p-4 border-b flex items-center justify-between">
            <h3 className="font-semibold">Chat History</h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowHistory(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-4 text-center text-sm text-muted-foreground">
              <p>Chat history coming soon</p>
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

// Import X icon
import { X } from 'lucide-react'