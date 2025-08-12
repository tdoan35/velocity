import { supabase } from '@/lib/supabase'
import type { FlexiblePRDSection, AgentType } from './prdService'

export interface PRDUpdateEvent {
  prdId: string
  action: string
  sectionId?: string
  userId: string
  timestamp: string
}

export interface AgentHandoff {
  fromAgent: AgentType
  toAgent: AgentType
  message: string
  nextSectionId: string
}

export interface ConversationState {
  prdId: string
  conversationId: string
  currentAgent: AgentType
  currentSection: string
  completedSections: string[]
  pendingSections: string[]
}

class PRDSyncService {
  private channels: Map<string, any> = new Map()
  private listeners: Map<string, Set<(event: PRDUpdateEvent) => void>> = new Map()
  private conversationStates: Map<string, ConversationState> = new Map()

  /**
   * Subscribe to PRD updates for a specific project
   */
  async subscribeToPRDUpdates(
    projectId: string,
    onUpdate: (event: PRDUpdateEvent) => void
  ): Promise<() => void> {
    // Create a unique channel for this project
    const channelName = `prd_changes:${projectId}`
    
    // Check if we already have a channel for this project
    if (this.channels.has(channelName)) {
      // Add listener to existing channel
      const listeners = this.listeners.get(channelName) || new Set()
      listeners.add(onUpdate)
      this.listeners.set(channelName, listeners)
      
      return () => {
        const listeners = this.listeners.get(channelName)
        if (listeners) {
          listeners.delete(onUpdate)
          if (listeners.size === 0) {
            this.unsubscribeFromPRDUpdates(projectId)
          }
        }
      }
    }

    // Create new channel
    const channel = supabase.channel(channelName)
      .on(
        'broadcast',
        { event: 'prd_updated' },
        (payload) => {
          const event = payload.payload as PRDUpdateEvent
          const listeners = this.listeners.get(channelName)
          if (listeners) {
            listeners.forEach(listener => listener(event))
          }
        }
      )
      .subscribe()

    this.channels.set(channelName, channel)
    const listeners = new Set<(event: PRDUpdateEvent) => void>([onUpdate])
    this.listeners.set(channelName, listeners)

    // Return unsubscribe function
    return () => {
      const listeners = this.listeners.get(channelName)
      if (listeners) {
        listeners.delete(onUpdate)
        if (listeners.size === 0) {
          this.unsubscribeFromPRDUpdates(projectId)
        }
      }
    }
  }

  /**
   * Unsubscribe from PRD updates for a specific project
   */
  async unsubscribeFromPRDUpdates(projectId: string): Promise<void> {
    const channelName = `prd_changes:${projectId}`
    const channel = this.channels.get(channelName)
    
    if (channel) {
      await supabase.removeChannel(channel)
      this.channels.delete(channelName)
      this.listeners.delete(channelName)
    }
  }

  /**
   * Broadcast a PRD update event
   */
  async broadcastPRDUpdate(
    projectId: string,
    event: Omit<PRDUpdateEvent, 'timestamp'>
  ): Promise<void> {
    const channelName = `prd_changes:${projectId}`
    const channel = this.channels.get(channelName) || supabase.channel(channelName)
    
    await channel.send({
      type: 'broadcast',
      event: 'prd_updated',
      payload: {
        ...event,
        timestamp: new Date().toISOString()
      }
    })
  }

  /**
   * Subscribe to conversation state changes
   */
  async subscribeToConversationState(
    conversationId: string,
    onStateChange: (state: ConversationState) => void
  ): Promise<() => void> {
    // Create realtime subscription for conversation state
    const subscription = supabase
      .channel(`conversation:${conversationId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'prd_conversation_states',
          filter: `conversation_id=eq.${conversationId}`
        },
        (payload) => {
          if (payload.new) {
            const state = this.mapDatabaseToConversationState(payload.new)
            this.conversationStates.set(conversationId, state)
            onStateChange(state)
          }
        }
      )
      .subscribe()

    // Load initial state
    const { data: initialState } = await supabase
      .from('prd_conversation_states')
      .select('*')
      .eq('conversation_id', conversationId)
      .single()

    if (initialState) {
      const state = this.mapDatabaseToConversationState(initialState)
      this.conversationStates.set(conversationId, state)
      onStateChange(state)
    }

    // Return unsubscribe function
    return () => {
      supabase.removeChannel(subscription)
      this.conversationStates.delete(conversationId)
    }
  }

  /**
   * Update conversation state
   */
  async updateConversationState(
    conversationId: string,
    updates: Partial<ConversationState>
  ): Promise<void> {
    const currentState = this.conversationStates.get(conversationId)
    if (!currentState) {
      throw new Error('Conversation state not found')
    }

    const newState = { ...currentState, ...updates }
    
    await supabase
      .from('prd_conversation_states')
      .upsert({
        conversation_id: conversationId,
        prd_id: newState.prdId,
        current_section: newState.currentSection,
        current_agent: newState.currentAgent,
        metadata: {
          completedSections: newState.completedSections,
          pendingSections: newState.pendingSections
        },
        updated_at: new Date().toISOString()
      })
  }

  /**
   * Sync PRD section from editor to conversation
   */
  async syncSectionToConversation(
    conversationId: string,
    section: FlexiblePRDSection
  ): Promise<void> {
    const state = this.conversationStates.get(conversationId)
    if (!state) {
      throw new Error('Conversation state not found')
    }

    // Update the conversation with the section content
    await this.updateConversationState(conversationId, {
      currentSection: section.id,
      currentAgent: section.agent,
      completedSections: section.status === 'completed' 
        ? [...state.completedSections, section.id]
        : state.completedSections
    })

    // Broadcast the update
    await this.broadcastPRDUpdate(state.prdId, {
      prdId: state.prdId,
      action: 'section_synced',
      sectionId: section.id,
      userId: (await supabase.auth.getUser()).data.user?.id || ''
    })
  }

  /**
   * Sync PRD section from conversation to editor
   */
  async syncSectionFromConversation(
    prdId: string,
    sectionId: string,
    content: any
  ): Promise<void> {
    // Call the edge function to update the section
    const { data, error } = await supabase.functions.invoke('prd-management', {
      body: {
        action: 'updateSection',
        prdId,
        sectionId,
        data: content
      }
    })

    if (error) {
      throw error
    }

    return data
  }

  /**
   * Handle agent handoff
   */
  async handleAgentHandoff(
    conversationId: string,
    fromAgent: AgentType,
    toAgent: AgentType,
    nextSectionId: string
  ): Promise<AgentHandoff> {
    const state = this.conversationStates.get(conversationId)
    if (!state) {
      throw new Error('Conversation state not found')
    }

    // Get handoff message from configuration
    const handoffMessages: Record<string, string> = {
      'project_manager_to_design_assistant': 
        "Great! We've defined the project vision and core features. Now let me hand you over to our Design Assistant who will help you create the UI design patterns and user experience flows.",
      'design_assistant_to_engineering_assistant':
        "Excellent! The design patterns and user flows are defined. Let me hand you over to our Engineering Assistant who will help you plan the technical architecture.",
      'engineering_assistant_to_config_helper':
        "Perfect! The technical architecture is planned. Now let me hand you over to our Config Helper who will help you set up the necessary integrations.",
      'config_helper_to_complete':
        "Congratulations! Your PRD is now complete with all technical integrations configured. You can review and edit any section, or start building your application."
    }

    const handoffKey = `${fromAgent}_to_${toAgent}`
    const message = handoffMessages[handoffKey] || 
      `Transitioning from ${fromAgent.replace('_', ' ')} to ${toAgent.replace('_', ' ')}.`

    // Update conversation state
    await this.updateConversationState(conversationId, {
      currentAgent: toAgent,
      currentSection: nextSectionId,
      completedSections: [...state.completedSections, state.currentSection]
    })

    return {
      fromAgent,
      toAgent,
      message,
      nextSectionId
    }
  }

  /**
   * Get the next incomplete section for an agent
   */
  async getNextIncompleteSection(
    prdId: string,
    agent: AgentType
  ): Promise<FlexiblePRDSection | null> {
    const { data, error } = await supabase.functions.invoke('prd-management', {
      body: {
        action: 'getAgentStatus',
        prdId,
        agent
      }
    })

    if (error || !data) {
      return null
    }

    // Find the first incomplete required section for this agent
    const incompleteSections = data.sections.filter(
      (s: FlexiblePRDSection) => s.required && s.status !== 'completed'
    )

    return incompleteSections[0] || null
  }

  /**
   * Check if all sections for an agent are complete
   */
  async areAgentSectionsComplete(
    prdId: string,
    agent: AgentType
  ): Promise<boolean> {
    const { data, error } = await supabase.functions.invoke('prd-management', {
      body: {
        action: 'getAgentStatus',
        prdId,
        agent
      }
    })

    if (error || !data) {
      return false
    }

    return data.isComplete
  }

  /**
   * Map database record to ConversationState
   */
  private mapDatabaseToConversationState(record: any): ConversationState {
    return {
      prdId: record.prd_id,
      conversationId: record.conversation_id,
      currentAgent: record.current_agent || 'project_manager',
      currentSection: record.current_section || 'overview',
      completedSections: record.metadata?.completedSections || [],
      pendingSections: record.metadata?.pendingSections || []
    }
  }

  /**
   * Clean up all subscriptions
   */
  async cleanup(): Promise<void> {
    // Unsubscribe from all channels
    for (const [channelName, channel] of this.channels) {
      await supabase.removeChannel(channel)
    }
    
    this.channels.clear()
    this.listeners.clear()
    this.conversationStates.clear()
  }
}

export const prdSyncService = new PRDSyncService()