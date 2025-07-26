import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { ChatMessage, ChatSession, AIContext } from '@/types/chat'

interface ChatState {
  // Current session
  currentSessionId: string | null
  sessions: ChatSession[]
  
  // AI state
  isTyping: boolean
  context: AIContext
  
  // Actions
  createSession: (title?: string) => ChatSession
  selectSession: (sessionId: string) => void
  deleteSession: (sessionId: string) => void
  
  // Message operations
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => void
  updateMessage: (messageId: string, updates: Partial<ChatMessage>) => void
  deleteMessage: (messageId: string) => void
  
  // AI operations
  setTyping: (isTyping: boolean) => void
  updateContext: (context: Partial<AIContext>) => void
  
  // Utilities
  getCurrentSession: () => ChatSession | null
  getSessionMessages: (sessionId?: string) => ChatMessage[]
}

export const useChatStore = create<ChatState>()(
  devtools(
    persist(
      (set, get) => ({
        // Initial state
        currentSessionId: null,
        sessions: [],
        isTyping: false,
        context: {},
        
        // Session management
        createSession: (title) => {
          const newSession: ChatSession = {
            id: `session-${Date.now()}`,
            title: title || `Chat ${get().sessions.length + 1}`,
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          }
          
          set((state) => ({
            sessions: [...state.sessions, newSession],
            currentSessionId: newSession.id,
          }))
          
          return newSession
        },
        
        selectSession: (sessionId) => {
          set({ currentSessionId: sessionId })
        },
        
        deleteSession: (sessionId) => {
          set((state) => ({
            sessions: state.sessions.filter(s => s.id !== sessionId),
            currentSessionId: state.currentSessionId === sessionId 
              ? state.sessions[0]?.id || null 
              : state.currentSessionId,
          }))
        },
        
        // Message operations
        addMessage: (message) => {
          const newMessage: ChatMessage = {
            ...message,
            id: `msg-${Date.now()}`,
            timestamp: new Date(),
          }
          
          set((state) => ({
            sessions: state.sessions.map(session => 
              session.id === state.currentSessionId
                ? {
                    ...session,
                    messages: [...session.messages, newMessage],
                    updatedAt: new Date(),
                  }
                : session
            ),
          }))
        },
        
        updateMessage: (messageId, updates) => {
          set((state) => ({
            sessions: state.sessions.map(session => ({
              ...session,
              messages: session.messages.map(msg =>
                msg.id === messageId ? { ...msg, ...updates } : msg
              ),
            })),
          }))
        },
        
        deleteMessage: (messageId) => {
          set((state) => ({
            sessions: state.sessions.map(session => ({
              ...session,
              messages: session.messages.filter(msg => msg.id !== messageId),
            })),
          }))
        },
        
        // AI operations
        setTyping: (isTyping) => set({ isTyping }),
        
        updateContext: (context) => {
          set((state) => ({
            context: { ...state.context, ...context },
          }))
        },
        
        // Utilities
        getCurrentSession: () => {
          const state = get()
          return state.sessions.find(s => s.id === state.currentSessionId) || null
        },
        
        getSessionMessages: (sessionId) => {
          const state = get()
          const id = sessionId || state.currentSessionId
          const session = state.sessions.find(s => s.id === id)
          return session?.messages || []
        },
      }),
      {
        name: 'velocity-chat-storage',
        partialize: (state) => ({
          sessions: state.sessions,
          currentSessionId: state.currentSessionId,
        }),
      }
    )
  )
)