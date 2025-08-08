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

export interface ProjectContext {
  id: string
  name: string
  description?: string
  initialPrompt?: string
  template?: string
  keyDecisions?: string[]
  techStack?: string[]
  createdAt?: string
  updatedAt?: string
}

export const conversationService = {
  async createConversation(
    projectId: string, 
    title?: string,
    initialAgent: string = 'project_manager',
    projectContext?: ProjectContext
  ): Promise<{ conversation: Conversation | null; error: Error | null }> {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        return { conversation: null, error: new Error('User not authenticated') }
      }

      // Use provided context or fetch it
      let contextToUse = projectContext
      if (!contextToUse) {
        const { context: fetchedContext } = await this.getProjectContext(projectId)
        contextToUse = fetchedContext
      }

      const { data: conversation, error } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          project_id: projectId,
          title: title || 'New Design Conversation',
          context: {
            type: 'project_design',
            createdFrom: 'project_design_page',
            projectContext: contextToUse || undefined
          },
          metadata: {
            primaryAgent: initialAgent,
            agentsUsed: [initialAgent],
            lastAgent: initialAgent
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

  async updateConversationContext(conversationId: string, projectId: string): Promise<{ error: Error | null }> {
    try {
      // Get project context
      const { context: projectContext } = await this.getProjectContext(projectId)
      
      if (!projectContext) {
        return { error: null } // Silently continue if context can't be fetched
      }

      // Update conversation with project context
      const { error } = await supabase
        .from('conversations')
        .update({
          'context.projectContext': projectContext,
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)

      if (error) {
        console.error('Error updating conversation context:', error)
        return { error: error as Error }
      }

      return { error: null }
    } catch (error) {
      console.error('Unexpected error updating conversation context:', error)
      return { error: error as Error }
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
  },

  async getProjectContext(projectId: string): Promise<{ context: ProjectContext | null; error: Error | null }> {
    try {
      // Fetch project details
      const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (projectError || !project) {
        console.error('Error fetching project context:', projectError)
        return { context: null, error: projectError as Error || new Error('Project not found') }
      }

      // Build project context
      const context: ProjectContext = {
        id: project.id,
        name: project.name || project.title || 'Untitled Project',
        description: project.description,
        initialPrompt: project.app_config?.initialPrompt,
        template: project.template_type || project.template || 'blank',
        keyDecisions: project.app_config?.keyDecisions || [],
        techStack: project.app_config?.techStack || [],
        createdAt: project.created_at,
        updatedAt: project.updated_at
      }

      // Cache the context for performance (optional - using sessionStorage)
      if (typeof window !== 'undefined') {
        const cacheKey = `project_context_${projectId}`
        sessionStorage.setItem(cacheKey, JSON.stringify({
          context,
          timestamp: Date.now()
        }))
      }

      return { context, error: null }
    } catch (error) {
      console.error('Unexpected error fetching project context:', error)
      return { context: null, error: error as Error }
    }
  },

  async getCachedProjectContext(projectId: string): Promise<ProjectContext | null> {
    if (typeof window === 'undefined') return null
    
    try {
      const cacheKey = `project_context_${projectId}`
      const cached = sessionStorage.getItem(cacheKey)
      
      if (!cached) return null
      
      const { context, timestamp } = JSON.parse(cached)
      const cacheAge = Date.now() - timestamp
      
      // Cache is valid for 5 minutes
      if (cacheAge < 5 * 60 * 1000) {
        return context
      }
      
      // Clear expired cache
      sessionStorage.removeItem(cacheKey)
      return null
    } catch {
      return null
    }
  },

  async updateConversationTitle(conversationId: string, title: string): Promise<{ conversation: Conversation | null; error: Error | null }> {
    try {
      const { data: conversation, error } = await supabase
        .from('conversations')
        .update({
          title: title.trim(),
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId)
        .select()
        .single()

      if (error) {
        console.error('Error updating conversation title:', error)
        return { conversation: null, error: error as Error }
      }

      return { conversation, error: null }
    } catch (error) {
      console.error('Unexpected error updating conversation title:', error)
      return { conversation: null, error: error as Error }
    }
  },

  async deleteConversation(conversationId: string): Promise<{ error: Error | null }> {
    try {
      // First delete all messages associated with the conversation
      const { error: messagesError } = await supabase
        .from('conversation_messages')
        .delete()
        .eq('conversation_id', conversationId)

      if (messagesError) {
        console.error('Error deleting conversation messages:', messagesError)
        return { error: messagesError as Error }
      }

      // Then delete the conversation itself
      const { error: conversationError } = await supabase
        .from('conversations')
        .delete()
        .eq('id', conversationId)

      if (conversationError) {
        console.error('Error deleting conversation:', conversationError)
        return { error: conversationError as Error }
      }

      return { error: null }
    } catch (error) {
      console.error('Unexpected error deleting conversation:', error)
      return { error: error as Error }
    }
  }
}