import { useState, useCallback, useRef, useEffect } from 'react';
import type { AgentType, ChatContext, AIMessage } from '../types/ai';
import { conversationService } from '../services/conversationService';
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
  suggestedResponses?: SuggestedResponse[];
  metadata?: {
    confidence?: number;
    sources?: string[];
    relatedTopics?: string[];
  };
}

interface UseAIChatStreamOptions {
  conversationId?: string;
  projectId?: string;
  initialAgent?: AgentType;
  onStreamStart?: () => void;
  onStreamEnd?: (usage: any) => void;
  onConversationCreated?: (conversationId: string) => void;
}

// Map internal agent types to backend agent types
function mapAgentTypeToBackend(agentType: AgentType): string {
  const agentMap: Record<AgentType, string> = {
    'project': 'project_manager',
    'ui': 'design_assistant',
    'engineering': 'engineering_assistant',
    'config': 'config_helper'
  };
  return agentMap[agentType] || 'project_manager';
}

export function useAIChatStream({
  conversationId: initialConversationId,
  projectId,
  initialAgent = 'project',
  onStreamStart,
  onStreamEnd,
  onConversationCreated,
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
        }
      } else {
        // Create new conversation
        const { conversation, error } = await conversationService.createConversation(
          projectId,
          'AI Design Assistant',
          currentAgent
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

  const handleSubmit = useCallback(async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    
    if (!input.trim() || !conversationId) return;

    // Check if we have a temporary conversation ID and need to create a real one
    let actualConversationId = conversationId;
    if (conversationId.startsWith('temp-')) {
      try {
        // Create a real conversation
        const { conversation, error } = await conversationService.createConversation(
          projectId,
          'Chat Conversation',
          currentAgent
        );
        
        if (error || !conversation) {
          throw error || new Error('Failed to create conversation');
        }
        
        actualConversationId = conversation.id;
        setConversationId(conversation.id);
        
        // Notify parent component of the new conversation ID
        onConversationCreated?.(conversation.id);
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
      content: input.trim(),
      createdAt: new Date(),
      metadata: { agentType: currentAgent },
    };

    // Add user message to UI immediately
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    setError(null);
    setSuggestedResponses([]); // Clear previous suggestions

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    try {
      onStreamStart?.();

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
          context,
          agentType: mapAgentTypeToBackend(currentAgent),
          action: 'continue',
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
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
                      const lastMessage = newMessages[newMessages.length - 1];
                      if (lastMessage && lastMessage.role === 'assistant') {
                        lastMessage.content = accumulatedContent;
                        // Store structured data in metadata
                        lastMessage.metadata = {
                          ...lastMessage.metadata,
                          ...currentStructuredResponse.metadata,
                          suggestedResponses: currentStructuredResponse.suggestedResponses,
                        };
                      }
                      return newMessages;
                    });
                  }
                  
                  // Update suggested responses
                  if (currentStructuredResponse.suggestedResponses) {
                    setSuggestedResponses(currentStructuredResponse.suggestedResponses);
                  }
                }
                // Handle legacy text response (fallback)
                else if (data.type === 'text' && data.content) {
                  accumulatedContent += data.content;
                  // Update the assistant message in real-time
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage && lastMessage.role === 'assistant') {
                      lastMessage.content = accumulatedContent;
                    }
                    return newMessages;
                  });
                }
                
                if (data.type === 'done' && data.done) {
                  // Clear suggested responses before setting new ones
                  if (data.finalObject?.suggestedResponses) {
                    setSuggestedResponses(data.finalObject.suggestedResponses);
                  }
                  
                  // Update conversation tokens if available
                  if (data.usage?.totalTokens) {
                    await conversationService.updateConversationTokens(
                      actualConversationId,
                      data.usage.totalTokens
                    );
                  }
                  
                  onStreamEnd?.(data.usage);
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
                  const lastMessage = newMessages[newMessages.length - 1];
                  if (lastMessage && lastMessage.role === 'assistant') {
                    lastMessage.content = accumulatedContent;
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
        setError(error);
        toast({
          title: 'Error',
          description: error.message || 'Failed to send message',
          variant: 'destructive',
        });
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  }, [input, conversationId, currentAgent, context, onStreamStart, onStreamEnd, toast]);

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