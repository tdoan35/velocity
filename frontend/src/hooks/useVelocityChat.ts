import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useChat } from '@ai-sdk/react'
import type { UIMessage } from 'ai'
import type { AgentType, AIMessage, ChatStatus, FileOperation } from '../types/ai'
import type { DesignPhaseType } from '../types/design-phases'
import { conversationService, type ProjectContext } from '../services/conversationService'
import { supabase, supabaseUrl } from '../lib/supabase'
import { useToast } from './use-toast'
import {
  VelocityChatTransport,
  RateLimitError,
  type SuggestedResponse,
  type StructuredEventData,
} from '../lib/velocity-chat-transport'

export type { SuggestedResponse }

interface UseVelocityChatOptions {
  conversationId?: string
  projectId?: string
  initialAgent?: AgentType
  projectContext?: ProjectContext
  designPhase?: DesignPhaseType
  phaseContext?: Record<string, any>
  sectionId?: string
  onPhaseComplete?: (phase: DesignPhaseType, output: any) => void
  onStreamStart?: () => void
  onStreamEnd?: (usage: any) => void
  onConversationCreated?: (conversationId: string) => void
  onTitleGenerated?: (title: string) => void
  onFileOperation?: (op: FileOperation) => void
  onBuildStatus?: (status: { step: string; filesCompleted: number; filesTotal: number }) => void
}

/** Convert DB messages to AI SDK UIMessage format */
function toUIMessages(messages: AIMessage[]): UIMessage[] {
  return messages.map(m => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    parts: [{ type: 'text' as const, text: m.content }],
  }))
}

/** Extract text content from a UIMessage */
function getMessageText(message: UIMessage): string {
  return message.parts
    ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map(p => p.text)
    .join('') || ''
}

export function useVelocityChat({
  conversationId: initialConversationId,
  projectId,
  initialAgent = 'project_manager',
  projectContext,
  designPhase,
  phaseContext,
  sectionId,
  onPhaseComplete,
  onStreamStart,
  onStreamEnd,
  onConversationCreated,
  onTitleGenerated,
  onFileOperation,
  onBuildStatus,
}: UseVelocityChatOptions = {}) {
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId)
  const [input, setInput] = useState('')
  const [currentAgent, setCurrentAgent] = useState<AgentType>(initialAgent)
  const [isInitializing, setIsInitializing] = useState(false)
  const [suggestedResponses, setSuggestedResponses] = useState<SuggestedResponse[]>([])
  const { toast } = useToast()

  // Stable chat ID for useChat — stays constant during temp→real transitions
  // so the AI SDK doesn't discard the in-flight streaming response.
  // Changes only for genuine conversation switches (when the parent passes
  // a truly different initialConversationId).
  const [chatId, setChatId] = useState(initialConversationId || 'pending')

  // Flag: when sendMessage resolves a temp ID to a real one, this prevents
  // the reset effect from clearing messages and switching the chat instance.
  const pendingTransitionRef = useRef(false)

  // Use refs for props that change every render to keep callbacks stable
  const latestRef = useRef({
    onStreamStart, onStreamEnd, onPhaseComplete,
    onConversationCreated, onTitleGenerated,
    onFileOperation, onBuildStatus,
    designPhase, phaseContext, sectionId, projectContext,
  })
  latestRef.current = {
    onStreamStart, onStreamEnd, onPhaseComplete,
    onConversationCreated, onTitleGenerated,
    onFileOperation, onBuildStatus,
    designPhase, phaseContext, sectionId, projectContext,
  }

  // Ref to track the real conversation ID (may differ during temp->real transition)
  const actualConversationIdRef = useRef<string | undefined>(conversationId)
  actualConversationIdRef.current = conversationId

  // Structured data callback for the transport
  const handleStructuredData = useCallback((data: StructuredEventData) => {
    if (Array.isArray(data.suggestedResponses) && data.suggestedResponses.length > 0) {
      setSuggestedResponses(data.suggestedResponses)
    }
    if (data.conversationTitle) {
      latestRef.current.onTitleGenerated?.(data.conversationTitle)
    }
    if (data.phaseOutput && data.phaseComplete && latestRef.current.designPhase) {
      latestRef.current.onPhaseComplete?.(latestRef.current.designPhase, data.phaseOutput)
    }
    if (data.usage) {
      latestRef.current.onStreamEnd?.(data.usage)
      // Update conversation tokens
      const convId = actualConversationIdRef.current
      if (convId && data.usage.totalTokens) {
        conversationService.updateConversationTokens(convId, data.usage.totalTokens)
      }
    }
  }, [])

  // Build transport - recreated when key options change
  // conversationId is passed as a getter so that when sendMessage resolves a
  // temp-xxx ID to a real one (synchronously updating the ref), the transport
  // picks up the real ID even before the React re-render.
  const transport = useMemo(() => {
    if (!conversationId) return undefined

    return new VelocityChatTransport({
      supabaseUrl,
      getAccessToken: async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) throw new Error('Not authenticated')
        return session.access_token
      },
      conversationId: () => actualConversationIdRef.current || conversationId,
      projectId,
      agentType: currentAgent,
      designPhase: latestRef.current.designPhase,
      sectionId: latestRef.current.sectionId,
      context: () => ({
        projectId,
        ...(latestRef.current.phaseContext || {}),
        projectContext: latestRef.current.projectContext || undefined,
      }),
      onStructuredData: handleStructuredData,
      onFileOperation: (...args) => latestRef.current.onFileOperation?.(...args),
      onBuildStatus: (...args) => latestRef.current.onBuildStatus?.(...args),
    })
  }, [conversationId, projectId, currentAgent, designPhase, sectionId, handleStructuredData])

  // useChat from AI SDK
  const chat = useChat({
    id: chatId,
    transport: transport || undefined,
    onError: (error) => {
      const isRateLimit = error instanceof RateLimitError
      toast({
        title: isRateLimit ? 'Rate Limit Reached' : 'Error',
        description: error.message || 'Failed to send message',
        variant: 'destructive',
        duration: isRateLimit ? 8000 : undefined,
      })
    },
    onFinish: () => {
      // Stream has ended - scroll handling is done by the component
    },
  })

  const { messages: uiMessages, setMessages: setUIMessages, status, error, stop: sdkStop } = chat

  // Convert UIMessages to AIMessage format for the component
  const messages: AIMessage[] = useMemo(() => {
    return uiMessages.map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: getMessageText(m),
      createdAt: new Date(),
      metadata: { agentType: currentAgent },
    }))
  }, [uiMessages, currentAgent])

  // Notify when streaming starts
  useEffect(() => {
    if (status === 'streaming') {
      latestRef.current.onStreamStart?.()
    }
  }, [status])

  // Load conversation messages from DB
  const loadConversationMessages = useCallback(async (convId: string) => {
    try {
      setIsInitializing(true)
      const { messages: dbMessages } = await conversationService.getConversationMessages(convId)
      if (dbMessages.length > 0) {
        const formatted: AIMessage[] = dbMessages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          createdAt: new Date(msg.created_at),
          metadata: msg.metadata,
        }))

        // Set as UIMessages for the SDK
        setUIMessages(toUIMessages(formatted))

        // Extract suggested responses from the last assistant message
        const lastAssistant = formatted.filter(m => m.role === 'assistant').pop()
        if (Array.isArray(lastAssistant?.metadata?.suggestedResponses)) {
          setSuggestedResponses(lastAssistant.metadata.suggestedResponses)
        } else {
          setSuggestedResponses([])
        }
      }
    } catch (err) {
      console.error('Error loading messages:', err)
    } finally {
      setIsInitializing(false)
    }
  }, [setUIMessages])

  // Reset conversation when initialConversationId changes
  useEffect(() => {
    // During a temp→real transition (triggered by sendMessage creating a real
    // conversation), the parent updates the prop.  We must NOT clear messages
    // or switch the useChat instance — the stream is still in progress.
    if (pendingTransitionRef.current) {
      pendingTransitionRef.current = false
      // Just sync the conversation ID state; everything else stays as-is.
      setConversationId(initialConversationId)
      return
    }

    // Genuine conversation switch — full reset.
    setChatId(initialConversationId || 'pending')
    setConversationId(initialConversationId)
    setUIMessages([])

    if (initialConversationId && !initialConversationId.startsWith('temp-')) {
      loadConversationMessages(initialConversationId)
    } else if (initialConversationId?.startsWith('temp-')) {
      setUIMessages([])
      setIsInitializing(false)
    }
  }, [initialConversationId, setUIMessages, loadConversationMessages])

  // Initialize conversation if needed (when projectId is set but no conversationId)
  useEffect(() => {
    if (!conversationId && projectId) {
      initializeConversation()
    }
  }, [projectId])

  const initializeConversation = async () => {
    if (!projectId) return

    setIsInitializing(true)
    try {
      const { conversation: existing } = await conversationService.getConversationByProjectId(projectId)

      if (existing) {
        setConversationId(existing.id)
        const { messages: dbMessages } = await conversationService.getConversationMessages(existing.id)
        if (dbMessages.length > 0) {
          const formatted: AIMessage[] = dbMessages.map(msg => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            createdAt: new Date(msg.created_at),
            metadata: msg.metadata,
          }))
          setUIMessages(toUIMessages(formatted))

          const lastAssistant = formatted.filter(m => m.role === 'assistant').pop()
          if (Array.isArray(lastAssistant?.metadata?.suggestedResponses)) {
            setSuggestedResponses(lastAssistant.metadata.suggestedResponses)
          } else {
            setSuggestedResponses([])
          }
        }
      } else {
        const { conversation, error } = await conversationService.createConversation(
          projectId,
          'AI Design Assistant',
          currentAgent,
          latestRef.current.projectContext
        )
        if (error || !conversation) {
          throw error || new Error('Failed to create conversation')
        }
        setConversationId(conversation.id)
      }
    } catch (err) {
      console.error('Error initializing conversation:', err)
      toast({
        title: 'Error',
        description: 'Failed to initialize conversation',
        variant: 'destructive',
      })
    } finally {
      setIsInitializing(false)
    }
  }

  // Send a message: saves to DB first, then delegates to useChat
  const sendMessage = useCallback(async (e?: React.FormEvent<HTMLFormElement> | null, overrideMessage?: string) => {
    e?.preventDefault()

    const messageToSend = overrideMessage || input
    if (!messageToSend.trim() || !conversationId) return

    // Resolve temp conversation ID to a real one
    let actualConversationId = conversationId
    if (conversationId.startsWith('temp-')) {
      try {
        const activeDesignPhase = latestRef.current.designPhase
        const activeSectionId = latestRef.current.sectionId
        let conversation: Awaited<ReturnType<typeof conversationService.createConversation>>['conversation']
        let error: Awaited<ReturnType<typeof conversationService.createConversation>>['error']

        if (activeDesignPhase && activeSectionId) {
          ({ conversation, error } = await conversationService.createSectionPhaseConversation(
            projectId,
            activeDesignPhase,
            activeSectionId,
            'Chat Conversation',
            latestRef.current.projectContext
          ))
        } else if (activeDesignPhase) {
          ({ conversation, error } = await conversationService.createPhaseConversation(
            projectId,
            activeDesignPhase,
            'Chat Conversation',
            latestRef.current.projectContext
          ))
        } else {
          ({ conversation, error } = await conversationService.createConversation(
            projectId,
            'Chat Conversation',
            currentAgent,
            latestRef.current.projectContext
          ))
        }

        if (error || !conversation) {
          throw error || new Error('Failed to create conversation')
        }

        actualConversationId = conversation.id
        // Update the ref synchronously so the transport getter picks up the
        // real ID immediately — setConversationId schedules a React state
        // update that won't take effect until the next render, but
        // chat.sendMessage() below runs before that render.
        actualConversationIdRef.current = conversation.id
        // Signal the reset effect to skip clearing messages when the parent
        // prop changes from temp→real (the stream is about to start).
        pendingTransitionRef.current = true
        setConversationId(conversation.id)
        latestRef.current.onConversationCreated?.(conversation.id)
      } catch (err) {
        console.error('Error creating conversation:', err)
        toast({
          title: 'Error',
          description: 'Failed to create conversation',
          variant: 'destructive',
        })
        return
      }
    }

    // Clear input and suggestions
    if (!overrideMessage) {
      setInput('')
    }
    setSuggestedResponses([])

    // Save user message to DB
    const userMetadata = { agentType: currentAgent }
    try {
      await conversationService.addMessage(
        actualConversationId,
        'user',
        messageToSend.trim(),
        userMetadata
      )
    } catch (err) {
      console.error('Error saving user message:', err)
    }

    // Send via AI SDK useChat
    try {
      await chat.sendMessage({
        role: 'user',
        parts: [{ type: 'text', text: messageToSend.trim() }],
      })
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error in chat stream:', err)
        const isRateLimit = err instanceof RateLimitError
        toast({
          title: isRateLimit ? 'Rate Limit Reached' : 'Error',
          description: err.message || 'Failed to send message',
          variant: 'destructive',
          duration: isRateLimit ? 8000 : undefined,
        })
      }
    }
  }, [input, conversationId, currentAgent, projectId, chat, toast])

  // Regenerate: replay the last user message
  const regenerate = useCallback(async () => {
    if (uiMessages.length === 0) return

    // Remove the last assistant message
    const lastUserIdx = uiMessages.findLastIndex(m => m.role === 'user')
    if (lastUserIdx === -1) return

    const trimmed = uiMessages.slice(0, lastUserIdx + 1)
    setUIMessages(trimmed)
    setSuggestedResponses([])

    try {
      await chat.regenerate()
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Error regenerating:', err)
      }
    }
  }, [uiMessages, setUIMessages, chat])

  const stop = useCallback(async () => {
    try {
      await sdkStop()
    } catch {
      // Ignore abort errors
    }
  }, [sdkStop])

  const switchAgent = useCallback((newAgent: AgentType) => {
    setCurrentAgent(newAgent)
  }, [])

  // Compatibility: handleInputChange for components that use event-based onChange
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value)
  }, [])

  // Derived state
  const isLoading = status === 'submitted' || status === 'streaming'

  return {
    // State
    messages,
    input,
    isLoading,
    status: status as ChatStatus,
    error: error || null,
    conversationId,
    currentAgent,
    isInitializing,
    suggestedResponses,

    // Actions
    sendMessage,
    handleSubmit: sendMessage,
    handleInputChange,
    setInput,
    regenerate,
    reload: regenerate,
    stop,
    switchAgent,
    setMessages: setUIMessages,
  }
}
