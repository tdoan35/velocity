import { useEffect, useRef, useState, useCallback } from 'react'
import { MessageSquarePlus, History, Bot, Settings, Send, Users, Sparkles, Code2, Plus, ArrowDown, Edit, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { EnhancedTextarea } from '@/components/ui/enhanced-textarea'
import { MarkdownMessage } from './markdown-message'
import { TypingIndicator } from './typing-indicator'
import { SuggestedResponses } from './suggested-responses'
import { useAIChatStream, type SuggestedResponse } from '@/hooks/useAIChatStream'
import type { AgentType } from '@/types/ai'
import type { DesignPhaseType } from '@/types/design-phases'
import { cn } from '@/lib/utils'
import type { ProjectContext } from '@/services/conversationService'
import { conversationService } from '@/services/conversationService'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToast } from '@/hooks/use-toast'

interface EnhancedChatInterfaceProps {
  projectId: string
  conversationId?: string
  className?: string
  onApplyCode?: (code: string) => void
  activeAgent?: 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper'
  onAgentChange?: (agent: 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper') => void
  conversationTitle?: string
  onNewConversation?: () => void
  onToggleHistory?: () => void
  isHistoryOpen?: boolean
  onConversationCreated?: (conversationId: string) => void
  onTitleGenerated?: (title: string) => void
  onConversationTitleUpdated?: (title: string) => void
  initialMessage?: string
  projectContext?: ProjectContext
  onInitialMessageSent?: () => void
  designPhase?: DesignPhaseType
  onPhaseComplete?: (phase: DesignPhaseType, output: any) => void
  phaseContext?: Record<string, any>
  sectionId?: string
}

const phaseLabels: Record<DesignPhaseType, string> = {
  product_vision: 'Product Vision',
  product_roadmap: 'Product Roadmap',
  data_model: 'Data Model',
  design_tokens: 'Design Tokens',
  design_shell: 'App Shell',
  shape_section: 'Section Design',
  sample_data: 'Sample Data',
}

const agentConfig: Record<AgentType, { label: string; icon: any; color: string }> = {
  project_manager: { label: 'Project Manager', icon: '📊', color: 'bg-blue-500' },
  design_assistant: { label: 'UI/UX Designer', icon: '🎨', color: 'bg-purple-500' },
  engineering_assistant: { label: 'Engineering Assistant', icon: '💻', color: 'bg-green-500' },
  config_helper: { label: 'Config Helper', icon: '⚙️', color: 'bg-orange-500' },
}

export function EnhancedChatInterface({
  projectId,
  conversationId: initialConversationId,
  className,
  onApplyCode,
  activeAgent,
  onAgentChange,
  conversationTitle,
  onNewConversation,
  onToggleHistory,
  isHistoryOpen = false,
  onConversationCreated,
  onTitleGenerated,
  onConversationTitleUpdated,
  initialMessage,
  projectContext,
  onInitialMessageSent,
  designPhase,
  onPhaseComplete,
  phaseContext,
  sectionId,
}: EnhancedChatInterfaceProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef(false)
  const { toast } = useToast()
  const [hasSubmittedInitial, setHasSubmittedInitial] = useState(false)
  const onInitialMessageSentRef = useRef(onInitialMessageSent)
  onInitialMessageSentRef.current = onInitialMessageSent
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState("")
  const [isSavingTitle, setIsSavingTitle] = useState(false)

  const {
    messages,
    input,
    isLoading,
    error,
    conversationId,
    currentAgent,
    isInitializing,
    suggestedResponses,
    handleInputChange,
    handleSubmit,
    reload,
    stop,
    switchAgent,
  } = useAIChatStream({
    conversationId: initialConversationId,
    projectId,
    initialAgent: activeAgent || 'project_manager',
    projectContext,
    designPhase,
    phaseContext,
    sectionId,
    onPhaseComplete,
    onStreamStart: () => {
      // Force auto-scroll when streaming starts
      setShouldAutoScroll(true)
      scrollToBottom(true)
    },
    onStreamEnd: (usage) => {
      console.log('Stream ended with usage:', usage)
      // Ensure we scroll to bottom when stream ends
      setTimeout(() => scrollToBottom(true), 100)
    },
    onConversationCreated,
    onTitleGenerated,
  })

  // Discover the actual scrollable viewport inside the Radix ScrollArea
  useEffect(() => {
    if (!scrollRef.current) return
    viewportRef.current = scrollRef.current.querySelector<HTMLDivElement>(
      '[data-radix-scroll-area-viewport]'
    )
  }, [])

  // Auto-scroll to bottom — uses 'instant' to avoid animation-triggered scroll events
  const scrollToBottom = useCallback((force = false) => {
    if (force || shouldAutoScroll) {
      isScrollingRef.current = true
      messagesEndRef.current?.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'end' })
      requestAnimationFrame(() => { isScrollingRef.current = false })
    }
  }, [shouldAutoScroll])

  // Handle scroll events — reads from the actual viewport element
  const handleScroll = useCallback(() => {
    if (isScrollingRef.current) return
    const viewport = viewportRef.current
    if (!viewport) return
    const { scrollTop, scrollHeight, clientHeight } = viewport
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100
    setShouldAutoScroll(prev => prev === isNearBottom ? prev : isNearBottom)
  }, [])

  // Scroll on content/loading changes
  useEffect(() => {
    if (messages.length === 0) return
    if (isLoading) setShouldAutoScroll(true)
    const timer = setTimeout(() => scrollToBottom(), 50)
    return () => clearTimeout(timer)
  }, [messages.length, isLoading])

  // Scroll on conversation switch
  useEffect(() => {
    setShouldAutoScroll(true)
    const timer = setTimeout(() => scrollToBottom(true), 150)
    return () => clearTimeout(timer)
  }, [conversationId])

  // Attach scroll listener to the actual viewport element
  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.addEventListener('scroll', handleScroll, { passive: true })
    return () => viewport.removeEventListener('scroll', handleScroll)
  }, [handleScroll])

  // Reset initial message guard when a new initial message arrives
  useEffect(() => {
    if (initialMessage) {
      setHasSubmittedInitial(false)
    }
  }, [initialMessage])

  // Auto-submit initial message if provided and not already submitted
  useEffect(() => {
    if (initialMessage && !hasSubmittedInitial && !isLoading && !isInitializing && conversationId) {
      // Delay slightly to ensure everything is ready
      const timer = setTimeout(() => {
        console.log('Auto-submitting initial message:', initialMessage)
        handleSubmit(null, initialMessage)
        setHasSubmittedInitial(true)
        onInitialMessageSentRef.current?.()
      }, 1000)

      return () => clearTimeout(timer)
    }
  }, [initialMessage, hasSubmittedInitial, isLoading, isInitializing, conversationId, handleSubmit])

  // Suggested responses are now provided by the hook via structured data
  // No need to extract from message text

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Handle agent changes from parent
  useEffect(() => {
    if (activeAgent && onAgentChange) {
      switchAgent(activeAgent as AgentType)
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
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleSelectSuggestion = (suggestion: SuggestedResponse) => {
    // Set the input value to the suggestion text
    handleInputChange({ target: { value: suggestion.text } } as any)
    
    // Suggestions will be cleared automatically by the hook after submission
    
    // Focus the input for any additional edits
    inputRef.current?.focus()
    
    // Ensure auto-scroll is enabled for the next message
    setShouldAutoScroll(true)
    
    // Optionally auto-submit (uncomment if desired)
    // setTimeout(() => handleSubmit(), 100)
  }

  // Handle conversation title editing
  const handleTitleEdit = () => {
    if (conversationTitle) {
      setTitleInput(conversationTitle)
      setIsEditingTitle(true)
      // Focus input and set cursor at end after popover opens
      setTimeout(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus()
          const length = titleInputRef.current.value.length
          titleInputRef.current.setSelectionRange(length, length)
        }
      }, 100)
    }
  }

  const handleTitleSave = async () => {
    if (!conversationId || !titleInput.trim() || titleInput === conversationTitle || conversationId.startsWith('temp-')) {
      setIsEditingTitle(false)
      return
    }

    setIsSavingTitle(true)
    try {
      const { conversation, error } = await conversationService.updateConversationTitle(conversationId, titleInput.trim())
      
      if (!error && conversation) {
        onConversationTitleUpdated?.(titleInput.trim())
        toast({
          title: 'Success',
          description: 'Conversation title updated',
        })
      } else {
        toast({
          title: 'Error',
          description: 'Failed to update conversation title',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error updating conversation title:', error)
      toast({
        title: 'Error',
        description: 'Failed to update conversation title',
        variant: 'destructive',
      })
    } finally {
      setIsSavingTitle(false)
      setIsEditingTitle(false)
    }
  }

  const renderMessage = (message: any, index: number) => {
    const isAssistant = message.role === 'assistant'
    const agentType = message.metadata?.agentType || currentAgent
    const agent = designPhase
      ? { label: phaseLabels[designPhase] || 'Design Phase', icon: '✨', color: 'bg-emerald-500' }
      : (agentConfig[agentType as AgentType] || agentConfig.project_manager)
    
    // Check if this is the last assistant message and has suggested responses
    const isLastAssistantMessage = isAssistant &&
      index === messages.length - 1 &&
      !isLoading &&
      Array.isArray(suggestedResponses) && suggestedResponses.length > 0

    return (
      <div key={message.id} className="space-y-2">
        <div
          className={cn(
            'flex gap-3 w-full',
            !isAssistant && 'flex-row-reverse'
          )}
        >
          <div className={cn(
            'flex-1 space-y-1 min-w-0',
            !isAssistant && 'flex flex-col items-end'
          )}>
            {isAssistant && (
              <div className="flex items-center gap-2 px-2 flex-wrap">
                <span className="text-xs font-medium text-muted-foreground">
                  {agent.label}
                </span>
              </div>
            )}
            
            <div className={cn(
              'rounded-lg p-2 max-w-full',
              isAssistant ? 'bg-transparent' : 'bg-muted'
            )}>
              {isAssistant && message.content.includes('```') ? (
                <MarkdownMessage
                  content={message.content}
                  onApplyCode={onApplyCode}
                  className="text-sm"
                />
              ) : (
                <p className={cn(
                  "whitespace-pre-wrap break-words overflow-wrap-anywhere",
                  "text-sm"
                )}>{message.content}</p>
              )}
            </div>
          </div>
        </div>
        
        {/* Show suggested responses right below the last assistant message */}
        {isLastAssistantMessage && (
          <div className="mt-2">
            <SuggestedResponses
              suggestions={suggestedResponses.map(s => ({
                ...s,
                category: s.category || 'continuation'
              }))}
              onSelectSuggestion={handleSelectSuggestion}
              disabled={isLoading}
              isLoading={isLoading}
            />
          </div>
        )}
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

  // Helper function to get agent info
  const getAgentInfo = (agentType?: string) => {
    switch (agentType) {
      case 'project_manager':
        return { icon: Users, color: 'emerald', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-500', label: 'Project Manager' }
      case 'design_assistant':
        return { icon: Sparkles, color: 'blue', bgColor: 'bg-blue-500/10', textColor: 'text-blue-500', label: 'Design Assistant' }
      case 'engineering_assistant':
        return { icon: Code2, color: 'purple', bgColor: 'bg-purple-500/10', textColor: 'text-purple-500', label: 'Engineering Assistant' }
      case 'config_helper':
        return { icon: Settings, color: 'orange', bgColor: 'bg-orange-500/10', textColor: 'text-orange-500', label: 'Config Helper' }
      default:
        return { icon: MessageSquarePlus, color: 'gray', bgColor: 'bg-gray-500/10', textColor: 'text-gray-500', label: 'AI Assistant' }
    }
  }

  const agentInfo = designPhase
    ? { icon: Sparkles, color: 'emerald', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-500', label: phaseLabels[designPhase] || 'Design Phase' }
    : getAgentInfo(activeAgent || currentAgent)
  const AgentIcon = agentInfo.icon

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Header */}
      <div className="p-4 pl-5 border-b border-gray-300  dark:border-gray-700/50 bg-transparent flex-shrink-0">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full ${agentInfo.bgColor} flex items-center justify-center flex-shrink-0`}>
              <AgentIcon className={`w-4 h-4 ${agentInfo.textColor}`} />
            </div>
            {/* Make conversation title clickable with popover */}
            {conversationId && !conversationId.startsWith('temp-') ? (
              <Popover open={isEditingTitle} onOpenChange={setIsEditingTitle}>
                <PopoverTrigger asChild>
                  <button 
                    onClick={handleTitleEdit}
                    className="group text-left cursor-pointer hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md px-2 py-0.5 transition-colors flex items-center gap-1.5"
                  >
                    <h2 className="text-lg font-semibold">
                      {conversationTitle || 'Chat Conversation'}
                    </h2>
                    <Edit className="w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-opacity" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 px-3 pt-1">
                  <div className="space-y-1">
                    <Label htmlFor="conversation-title" className="text-xs text-muted-foreground">Conversation title</Label>
                    <div className="flex gap-1.5 items-center">
                      <Input
                        id="conversation-title"
                        ref={titleInputRef}
                        value={titleInput}
                        onChange={(e) => setTitleInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleTitleSave()
                          } else if (e.key === 'Escape') {
                            setIsEditingTitle(false)
                          }
                        }}
                        placeholder="Enter conversation title"
                        className="flex-1 bg-background h-8 text-sm"
                        disabled={isSavingTitle}
                      />
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={handleTitleSave}
                        disabled={isSavingTitle || !titleInput.trim() || titleInput === conversationTitle}
                        className="h-8 w-8"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </PopoverContent>
              </Popover>
            ) : (
              <h2 className="text-lg font-semibold">
                {conversationTitle || 'Chat Conversation'}
              </h2>
            )}
          </div>
          <div className="flex items-center gap-2">
            <div className={`px-2 py-1 rounded-md ${agentInfo.bgColor} flex items-center gap-1`}>
              <span className={`text-xs font-medium ${agentInfo.textColor}`}>
                {agentInfo.label}
              </span>
            </div>
            {onNewConversation && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onNewConversation}
                title="New Conversation"
              >
                <Plus className="w-4 h-4" />
              </Button>
            )}
            {onToggleHistory && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onToggleHistory}
                title={isHistoryOpen ? "Show AI Agents" : "Show Chat History"}
              >
                {isHistoryOpen ? (
                  <Users className="w-4 h-4" />
                ) : (
                  <History className="w-4 h-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Messages */}
      <ScrollArea
        ref={scrollRef}
        className="flex-1 p-4 overflow-hidden"
      >
        <div className="space-y-4 w-full max-w-full overflow-wrap-anywhere">
          {messages.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              <div className="space-y-4">
                {designPhase ? (
                  <>
                    <Sparkles className="w-12 h-12 mx-auto opacity-50" />
                    <div>
                      <p className="text-sm font-medium">
                        {phaseLabels[designPhase]}
                      </p>
                      <p className="text-xs mt-2">
                        {designPhase === 'product_vision'
                          ? 'Describe your app idea and I\'ll help you define the product vision.'
                          : designPhase === 'product_roadmap'
                          ? 'I\'ll help you break your product into development sections.'
                          : 'Let\'s work on this design phase together.'}
                      </p>
                    </div>
                  </>
                ) : (
                  <>
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
                          setShouldAutoScroll(true)
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
                          setShouldAutoScroll(true)
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
                          setShouldAutoScroll(true)
                          handleInputChange({ target: { value: 'Generate code for a login screen' } } as any)
                          handleSubmit()
                        }}
                      >
                        Generate Code
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : (
            <>
              {messages.map((message, index) => renderMessage(message, index))}
              {isLoading && <TypingIndicator />}
            </>
          )}
          {/* Invisible element to mark the end of messages for scrolling */}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>
      
      {/* Scroll to bottom button */}
      {!shouldAutoScroll && messages.length > 0 && (
        <div className="absolute bottom-36 right-6 z-10">
          <Button
            variant="secondary"
            size="icon"
            className="rounded-full shadow-lg"
            onClick={() => {
              setShouldAutoScroll(true)
              scrollToBottom(true)
            }}
            title="Scroll to bottom"
          >
            <ArrowDown className="h-4 w-4" />
          </Button>
        </div>
      )}
      
      {/* Input */}
      <div className="border-t border-gray-300 dark:border-gray-700/50 p-4 flex-shrink-0">
        <EnhancedTextarea
          ref={inputRef}
          value={input}
          onChange={(value) => {
            const event = { target: { value } } as React.ChangeEvent<HTMLTextAreaElement>
            handleInputChange(event)
          }}
          onSubmit={() => {
            setShouldAutoScroll(true)
            handleSubmit()
          }}
          disabled={isLoading}
          isLoading={isLoading}
          placeholder={designPhase ? `Describe your ${phaseLabels[designPhase]?.toLowerCase() || 'idea'}...` : `Ask ${agentConfig[currentAgent].label} anything...`}
          submitIcon={Send}
          minHeight="60px"
          showAttachButton={false}
          showHelperText={false}
          showCommands={false}
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
    </div>
  )
}