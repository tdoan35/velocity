import { useState, useCallback, useRef, useEffect } from 'react';
import type { AgentType, ChatContext, AIMessage } from '../types/ai';
import type { DesignPhaseType } from '../types/design-phases';
import { conversationService, type ProjectContext } from '../services/conversationService';
import { supabase, supabaseUrl } from '../lib/supabase';
import { useToast } from './use-toast';

// Types for structured responses
export interface SuggestedResponse {
  text: string;
  category?: 'continuation' | 'clarification' | 'example';
  section?: string;
}

export interface AssistantResponse {
  message: string;
  conversationTitle?: string;
  suggestedResponses?: SuggestedResponse[];
  metadata?: {
    confidence?: number;
    sources?: string[];
    relatedTopics?: string[];
  };
}

class RateLimitError extends Error {
  retryAfter: number
  constructor(retryAfter: number) {
    const minutes = Math.ceil(retryAfter / 60)
    const timeText = minutes > 1 ? `${minutes} minutes` : 'about a minute'
    super(`You've hit the rate limit. Please wait ${timeText} and try again.`)
    this.name = 'RateLimitError'
    this.retryAfter = retryAfter
  }
}

interface UseAIChatStreamOptions {
  conversationId?: string;
  projectId?: string;
  initialAgent?: AgentType;
  projectContext?: ProjectContext;
  designPhase?: DesignPhaseType;
  /** Additional context fields to send with each request (e.g., productOverview for roadmap phase) */
  phaseContext?: Record<string, any>;
  /** Section ID for section-level phases (shape_section, sample_data) */
  sectionId?: string;
  onPhaseComplete?: (phase: DesignPhaseType, output: any) => void;
  onStreamStart?: () => void;
  onStreamEnd?: (usage: any) => void;
  onConversationCreated?: (conversationId: string) => void;
  onTitleGenerated?: (title: string) => void;
}

export function useAIChatStream({
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
}: UseAIChatStreamOptions = {}) {
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [currentAgent, setCurrentAgent] = useState<AgentType>(initialAgent);
  const [isInitializing, setIsInitializing] = useState(false);
  const [context, setContext] = useState<ChatContext>({ projectId });
  const [error, setError] = useState<Error | null>(null);
  const [suggestedResponses, setSuggestedResponses] = useState<SuggestedResponse[]>([]);
  const { toast } = useToast();
  const abortControllerRef = useRef<AbortController | null>(null);

  // Use refs for props that change every render (inline callbacks, objects)
  // to keep handleSubmit stable and avoid infinite effect re-runs
  const latestRef = useRef({
    onStreamStart, onStreamEnd, onPhaseComplete,
    onConversationCreated, onTitleGenerated,
    designPhase, phaseContext, sectionId, projectContext,
  });
  latestRef.current = {
    onStreamStart, onStreamEnd, onPhaseComplete,
    onConversationCreated, onTitleGenerated,
    designPhase, phaseContext, sectionId, projectContext,
  };

  const loadConversationMessages = async (convId: string) => {
    try {
      setIsInitializing(true);
      const { messages } = await conversationService.getConversationMessages(convId);
      if (messages.length > 0) {
        // Convert messages to AIMessage format
        const formattedMessages: AIMessage[] = messages.map(msg => ({
          id: msg.id,
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
          createdAt: new Date(msg.created_at),
          metadata: msg.metadata,
        }));
        setMessages(formattedMessages);
        
        // Extract suggested responses from the last assistant message
        const lastAssistantMessage = formattedMessages
          .filter(m => m.role === 'assistant')
          .pop();
        
        if (Array.isArray(lastAssistantMessage?.metadata?.suggestedResponses)) {
          setSuggestedResponses(lastAssistantMessage.metadata.suggestedResponses);
        } else {
          // Clear suggestions if none found
          setSuggestedResponses([]);
        }
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    } finally {
      setIsInitializing(false);
    }
  };

  // Reset conversation when initialConversationId changes
  useEffect(() => {
    setConversationId(initialConversationId);
    
    // Clear messages immediately when conversation ID changes
    setMessages([]);
    
    // Load messages if we have a real conversation ID (not temporary)
    if (initialConversationId && !initialConversationId.startsWith('temp-')) {
      loadConversationMessages(initialConversationId);
    } else if (initialConversationId?.startsWith('temp-')) {
      // For temporary conversations, ensure we start fresh
      setMessages([]);
      setIsInitializing(false);
    }
  }, [initialConversationId]);

  // Initialize conversation if needed
  useEffect(() => {
    if (!conversationId && projectId) {
      initializeConversation();
    }
  }, [projectId]); // Removed conversationId from deps to prevent re-initialization

  const initializeConversation = async () => {
    if (!projectId) return;
    
    setIsInitializing(true);
    try {
      // Check if conversation already exists
      const { conversation: existing } = await conversationService.getConversationByProjectId(projectId);
      
      if (existing) {
        setConversationId(existing.id);
        // Load existing messages
        const { messages } = await conversationService.getConversationMessages(existing.id);
        if (messages.length > 0) {
          // Convert messages to AIMessage format
          const formattedMessages: AIMessage[] = messages.map(msg => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            createdAt: new Date(msg.created_at),
            metadata: msg.metadata,
          }));
          setMessages(formattedMessages);
          
          // Extract suggested responses from the last assistant message
          const lastAssistantMessage = formattedMessages
            .filter(m => m.role === 'assistant')
            .pop();
          
          if (Array.isArray(lastAssistantMessage?.metadata?.suggestedResponses)) {
            setSuggestedResponses(lastAssistantMessage.metadata.suggestedResponses);
          } else {
            setSuggestedResponses([]);
          }
        }
      } else {
        // Create new conversation with project context
        const { conversation, error } = await conversationService.createConversation(
          projectId,
          'AI Design Assistant',
          currentAgent,
          projectContext
        );
        
        if (error || !conversation) {
          throw error || new Error('Failed to create conversation');
        }
        
        setConversationId(conversation.id);
      }
    } catch (error) {
      console.error('Error initializing conversation:', error);
      toast({
        title: 'Error',
        description: 'Failed to initialize conversation',
        variant: 'destructive',
      });
    } finally {
      setIsInitializing(false);
    }
  };

  const handleSubmit = useCallback(async (e?: React.FormEvent<HTMLFormElement> | null, overrideMessage?: string) => {
    e?.preventDefault();
    
    const messageToSend = overrideMessage || input;
    if (!messageToSend.trim() || !conversationId) return;

    // Check if we have a temporary conversation ID and need to create a real one
    let actualConversationId = conversationId;
    if (conversationId.startsWith('temp-')) {
      try {
        // Create a real conversation — use phase-aware creation if a designPhase is active
        const activeDesignPhase = latestRef.current.designPhase;
        const activeSectionId = latestRef.current.sectionId;
        let conversation: Awaited<ReturnType<typeof conversationService.createConversation>>['conversation'];
        let error: Awaited<ReturnType<typeof conversationService.createConversation>>['error'];

        if (activeDesignPhase && activeSectionId) {
          ({ conversation, error } = await conversationService.createSectionPhaseConversation(
            projectId,
            activeDesignPhase,
            activeSectionId,
            'Chat Conversation',
            latestRef.current.projectContext
          ));
        } else if (activeDesignPhase) {
          ({ conversation, error } = await conversationService.createPhaseConversation(
            projectId,
            activeDesignPhase,
            'Chat Conversation',
            latestRef.current.projectContext
          ));
        } else {
          ({ conversation, error } = await conversationService.createConversation(
            projectId,
            'Chat Conversation',
            currentAgent,
            latestRef.current.projectContext
          ));
        }

        if (error || !conversation) {
          throw error || new Error('Failed to create conversation');
        }

        actualConversationId = conversation.id;
        setConversationId(conversation.id);

        // Notify parent component of the new conversation ID
        latestRef.current.onConversationCreated?.(conversation.id);
      } catch (error) {
        console.error('Error creating conversation:', error);
        toast({
          title: 'Error',
          description: 'Failed to create conversation',
          variant: 'destructive',
        });
        setIsLoading(false);
        return;
      }
    }

    const userMessage: AIMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: messageToSend.trim(),
      createdAt: new Date(),
      metadata: { agentType: currentAgent },
    };

    // Add user message to UI immediately
    setMessages(prev => [...prev, userMessage]);
    // Only clear input if not using override message
    if (!overrideMessage) {
      setInput('');
    }
    setIsLoading(true);
    setError(null);
    setSuggestedResponses([]); // Clear previous suggestions

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      latestRef.current.onStreamStart?.();

      // Debug: Log the project context being sent
      console.log('🔍 Project context being sent to API:', {
        projectContext: latestRef.current.projectContext,
        hasProjectContext: !!latestRef.current.projectContext,
        projectContextKeys: latestRef.current.projectContext ? Object.keys(latestRef.current.projectContext) : [],
      });

      // Save user message to database
      await conversationService.addMessage(
        actualConversationId,
        'user',
        userMessage.content,
        userMessage.metadata
      );

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Call the conversation edge function with streaming
      const response = await fetch(`${supabaseUrl}/functions/v1/conversation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          conversationId: actualConversationId,
          message: userMessage.content,
          context: {
            ...context,
            ...(latestRef.current.phaseContext || {}),
            projectContext: latestRef.current.projectContext || undefined
          },
          designPhase: latestRef.current.designPhase || undefined,
          sectionId: latestRef.current.sectionId || undefined,
          agentType: latestRef.current.designPhase ? undefined : currentAgent,
          action: 'continue',
          projectId: projectId || undefined,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        if (response.status === 429) {
          let retryAfter = 60;
          try {
            const errorBody = await response.json();
            if (typeof errorBody.retryAfter === 'number') {
              retryAfter = errorBody.retryAfter;
            }
          } catch { /* use default */ }
          throw new RateLimitError(retryAfter);
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage: AIMessage = {
        id: Date.now().toString(),
        role: 'assistant',
        content: '',
        createdAt: new Date(),
        metadata: { agentType: currentAgent },
      };

      // Add empty assistant message to UI
      setMessages(prev => [...prev, assistantMessage]);

      if (reader) {
        let accumulatedContent = '';
        let buffer = '';
        let currentStructuredResponse: Partial<AssistantResponse> | null = null;
        
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          // Decode the chunk and add to buffer
          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          // Process complete lines only
          const lines = buffer.split('\n');
          // Keep the last incomplete line in the buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            // Skip empty lines
            if (line.trim() === '') continue;
            
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              
              // Skip empty data
              if (!dataStr) continue;
              
              try {
                const data = JSON.parse(dataStr);
                
                // Handle structured response (new format)
                if (data.type === 'partial' && data.object) {
                  currentStructuredResponse = data.object as Partial<AssistantResponse>;
                  
                  // Update message content
                  if (currentStructuredResponse.message) {
                    accumulatedContent = currentStructuredResponse.message;
                    setMessages(prev => {
                      const newMessages = [...prev];
                      const lastMessageIndex = newMessages.length - 1;
                      if (lastMessageIndex >= 0 && newMessages[lastMessageIndex].role === 'assistant') {
                        // Create a new message object instead of mutating
                        newMessages[lastMessageIndex] = {
                          ...newMessages[lastMessageIndex],
                          content: accumulatedContent,
                          metadata: {
                            ...newMessages[lastMessageIndex].metadata,
                            ...currentStructuredResponse.metadata,
                            suggestedResponses: Array.isArray(currentStructuredResponse.suggestedResponses) ? currentStructuredResponse.suggestedResponses : [],
                          },
                        };
                      }
                      return newMessages;
                    });
                  }
                  
                  // Handle conversation title (for new conversations)
                  if (currentStructuredResponse.conversationTitle && latestRef.current.onTitleGenerated) {
                    latestRef.current.onTitleGenerated(currentStructuredResponse.conversationTitle);
                  }
                  
                  // Update suggested responses
                  if (Array.isArray(currentStructuredResponse.suggestedResponses)) {
                    setSuggestedResponses(currentStructuredResponse.suggestedResponses);
                  }
                }
                // Handle legacy text response (fallback)
                else if (data.type === 'text' && data.content) {
                  accumulatedContent += data.content;
                  // Update the assistant message in real-time
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessageIndex = newMessages.length - 1;
                    if (lastMessageIndex >= 0 && newMessages[lastMessageIndex].role === 'assistant') {
                      // Create a new message object instead of mutating
                      newMessages[lastMessageIndex] = {
                        ...newMessages[lastMessageIndex],
                        content: accumulatedContent,
                      };
                    }
                    return newMessages;
                  });
                }
                
                if (data.type === 'done' && data.done) {
                  // Clear suggested responses before setting new ones
                  if (Array.isArray(data.finalObject?.suggestedResponses)) {
                    setSuggestedResponses(data.finalObject.suggestedResponses);
                  }

                  // Detect phase completion
                  if (data.finalObject?.phaseOutput && data.finalObject?.phaseComplete && latestRef.current.designPhase) {
                    latestRef.current.onPhaseComplete?.(latestRef.current.designPhase, data.finalObject.phaseOutput);
                  }

                  // Update conversation tokens if available
                  if (data.usage?.totalTokens) {
                    await conversationService.updateConversationTokens(
                      actualConversationId,
                      data.usage.totalTokens
                    );
                  }

                  latestRef.current.onStreamEnd?.(data.usage);
                }
              } catch (error) {
                // Only log if it's not an expected format
                if (dataStr !== '[DONE]') {
                  console.error('Error parsing SSE data:', error, 'Data:', dataStr);
                }
              }
            }
          }
        }
        
        // Process any remaining data in buffer
        if (buffer.trim() && buffer.startsWith('data: ')) {
          const dataStr = buffer.slice(6).trim();
          if (dataStr && dataStr !== '[DONE]') {
            try {
              const data = JSON.parse(dataStr);
              if (data.type === 'text' && data.content) {
                accumulatedContent += data.content;
                setMessages(prev => {
                  const newMessages = [...prev];
                  const lastMessageIndex = newMessages.length - 1;
                  if (lastMessageIndex >= 0 && newMessages[lastMessageIndex].role === 'assistant') {
                    // Create a new message object instead of mutating
                    newMessages[lastMessageIndex] = {
                      ...newMessages[lastMessageIndex],
                      content: accumulatedContent,
                    };
                  }
                  return newMessages;
                });
              }
            } catch (error) {
              console.error('Error parsing final SSE data:', error, 'Data:', dataStr);
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('Stream aborted');
      } else {
        console.error('Error in chat stream:', error);
        // Remove the user message from UI — it was added before the fetch
        setMessages(prev => prev.filter(m => m.id !== userMessage.id));
        setError(error);
        const isRateLimit = error instanceof RateLimitError;
        toast({
          title: isRateLimit ? 'Rate Limit Reached' : 'Error',
          description: error.message || 'Failed to send message',
          variant: 'destructive',
          duration: isRateLimit ? 8000 : undefined,
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [input, conversationId, currentAgent, context, toast, projectId]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setInput(e.target.value);
  }, []);

  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const switchAgent = useCallback((newAgent: AgentType) => {
    setCurrentAgent(newAgent);
  }, []);

  const updateContext = useCallback((newContext: Partial<ChatContext>) => {
    setContext(prev => ({ ...prev, ...newContext }));
  }, []);

  const append = useCallback(async (message: Pick<AIMessage, 'role' | 'content'>) => {
    const aiMessage: AIMessage = {
      id: Date.now().toString(),
      role: message.role,
      content: message.content,
      createdAt: new Date(),
      metadata: { agentType: currentAgent },
    };
    
    setMessages(prev => [...prev, aiMessage]);
    
    // Save to database if we have a conversation
    if (conversationId) {
      await conversationService.addMessage(
        conversationId,
        message.role,
        message.content,
        aiMessage.metadata
      );
    }
  }, [conversationId, currentAgent]);

  const reload = useCallback(async () => {
    if (messages.length === 0) return;
    
    // Get the last user message
    const lastUserMessageIndex = messages.findLastIndex((m: AIMessage) => m.role === 'user');
    if (lastUserMessageIndex === -1) return;
    
    // Remove all messages after the last user message
    const messagesToKeep = messages.slice(0, lastUserMessageIndex + 1);
    setMessages(messagesToKeep);
    
    // Resubmit the last user message
    const lastUserMessage = messages[lastUserMessageIndex];
    setInput(lastUserMessage.content);
    
    // Trigger submit
    handleSubmit();
  }, [messages, handleSubmit]);

  return {
    // State
    messages,
    input,
    isLoading,
    error,
    conversationId,
    currentAgent,
    isInitializing,
    context,
    suggestedResponses,
    
    // Actions
    handleInputChange,
    handleSubmit,
    reload,
    stop,
    append,
    switchAgent,
    updateContext,
    setMessages,
  };
}