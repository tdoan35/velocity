import { supabase } from '../lib/supabase'

export interface Conversation {
  id: string
  user_id: string
  project_id: string | null
  title: string | null
  context: any
  metadata: {
    model: string
    totalTokens: number
  }
  created_at: string
  updated_at: string
}

export interface ConversationMessage {
  id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  metadata: any
  token_count: number | null
  created_at: string
}

export const conversationService = {
  async createConversation(projectId: string, title?: string): Promise<{ conversation: Conversation | null; error: Error | null }> {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        return { conversation: null, error: new Error('User not authenticated') }
      }

      const { data: conversation, error } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          project_id: projectId,
          title: title || 'New Design Conversation',
          context: {
            type: 'project_design',
            createdFrom: 'project_design_page'
          }
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating conversation:', error)
        return { conversation: null, error: error as Error }
      }

      return { conversation, error: null }
    } catch (error) {
      console.error('Unexpected error creating conversation:', error)
      return { conversation: null, error: error as Error }
    }
  },

  async getConversationByProjectId(projectId: string): Promise<{ conversation: Conversation | null; error: Error | null }> {
    try {
      const { data: conversation, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 is "no rows returned"
        console.error('Error fetching conversation:', error)
        return { conversation: null, error: error as Error }
      }

      return { conversation, error: null }
    } catch (error) {
      console.error('Unexpected error fetching conversation:', error)
      return { conversation: null, error: error as Error }
    }
  },

  async getConversationMessages(conversationId: string): Promise<{ messages: ConversationMessage[]; error: Error | null }> {
    try {
      const { data: messages, error } = await supabase
        .from('conversation_messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('created_at', { ascending: true })

      if (error) {
        console.error('Error fetching messages:', error)
        return { messages: [], error: error as Error }
      }

      return { messages: messages || [], error: null }
    } catch (error) {
      console.error('Unexpected error fetching messages:', error)
      return { messages: [], error: error as Error }
    }
  },

  async addMessage(
    conversationId: string, 
    role: 'user' | 'assistant' | 'system', 
    content: string,
    metadata?: any
  ): Promise<{ message: ConversationMessage | null; error: Error | null }> {
    try {
      const { data: message, error } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: conversationId,
          role,
          content,
          metadata: metadata || {}
        })
        .select()
        .single()

      if (error) {
        console.error('Error adding message:', error)
        return { message: null, error: error as Error }
      }

      return { message, error: null }
    } catch (error) {
      console.error('Unexpected error adding message:', error)
      return { message: null, error: error as Error }
    }
  },

  async updateConversationTokens(conversationId: string, tokensToAdd: number): Promise<{ error: Error | null }> {
    try {
      // First get current token count
      const { data: conversation, error: fetchError } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', conversationId)
        .single()

      if (fetchError) {
        return { error: fetchError as Error }
      }

      const currentTokens = conversation?.metadata?.totalTokens || 0
      
      // Update with new token count
      const { error } = await supabase
        .from('conversations')
        .update({
          metadata: {
            ...conversation?.metadata,
            totalTokens: currentTokens + tokensToAdd
          }
        })
        .eq('id', conversationId)

      if (error) {
        console.error('Error updating conversation tokens:', error)
        return { error: error as Error }
      }

      return { error: null }
    } catch (error) {
      console.error('Unexpected error updating tokens:', error)
      return { error: error as Error }
    }
  }
}