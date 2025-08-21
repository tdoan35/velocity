import { create } from 'zustand'
import type { JSONContent } from '@tiptap/core'
import { supabase } from '@/lib/supabase'

export type SectionStatus = 'pending' | 'in_progress' | 'completed'
export type AgentType = 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper'

export interface PRDSection {
  id: string
  title: string
  order: number
  agent: AgentType
  required: boolean
  content: {
    editorJSON?: JSONContent
    structuredData?: Record<string, any>
    template?: Record<string, any>
  }
  status: SectionStatus
  isCustom: boolean
  description?: string
  metadata?: {
    lastModified: string
    modifiedBy?: string
    version: number
  }
}

interface PRDEditorState {
  // State
  prdId: string | null
  projectId: string | null
  sections: PRDSection[]
  activeSection: string | null
  isLoading: boolean
  isSaving: boolean
  lastSaved: Date | null
  hasUnsavedChanges: boolean
  
  // Actions
  initializePRD: (prdId: string, projectId: string) => Promise<void>
  loadSections: (sections: PRDSection[]) => void
  updateSectionContent: (sectionId: string, content: JSONContent) => void
  updateSectionStatus: (sectionId: string, status: SectionStatus) => void
  reorderSections: (fromIndex: number, toIndex: number) => void
  addCustomSection: (title: string, agent: AgentType, afterId?: string) => void
  removeSection: (sectionId: string) => void
  setActiveSection: (sectionId: string | null) => void
  
  // Persistence
  saveToBackend: () => Promise<void>
  loadFromBackend: (prdId: string) => Promise<void>
  
  // Utilities
  getSectionById: (sectionId: string) => PRDSection | undefined
  getCompletionPercentage: () => number
  reset: () => void
}

const initialState = {
  prdId: null,
  projectId: null,
  sections: [],
  activeSection: null,
  isLoading: false,
  isSaving: false,
  lastSaved: null,
  hasUnsavedChanges: false,
}

export const usePRDEditorStore = create<PRDEditorState>((set, get) => ({
  ...initialState,

  initializePRD: async (prdId: string, projectId: string) => {
    set({
      prdId,
      projectId,
      isLoading: true
    })
    
    await get().loadFromBackend(prdId)
  },

  loadSections: (sections: PRDSection[]) => {
    set({
      sections: sections.map((section, index) => ({
        ...section,
        order: section.order ?? index,
        metadata: section.metadata || {
          lastModified: new Date().toISOString(),
          version: 1,
        },
      })),
      isLoading: false,
      hasUnsavedChanges: false
    })
  },

  updateSectionContent: (sectionId: string, content: JSONContent) => {
    set(state => ({
      sections: state.sections.map(section => 
        section.id === sectionId
          ? {
              ...section,
              content: {
                ...section.content,
                editorJSON: content
              },
              metadata: {
                ...section.metadata,
                lastModified: new Date().toISOString(),
                version: (section.metadata?.version || 0) + 1,
              }
            }
          : section
      ),
      hasUnsavedChanges: true
    }))
  },

  updateSectionStatus: (sectionId: string, status: SectionStatus) => {
    set(state => ({
      sections: state.sections.map(section =>
        section.id === sectionId
          ? { ...section, status }
          : section
      ),
      hasUnsavedChanges: true
    }))
  },

  reorderSections: (fromIndex: number, toIndex: number) => {
    set(state => {
      const newSections = [...state.sections]
      const [removed] = newSections.splice(fromIndex, 1)
      newSections.splice(toIndex, 0, removed)
      
      // Update order values
      const orderedSections = newSections.map((section, index) => ({
        ...section,
        order: index
      }))
      
      return {
        sections: orderedSections,
        hasUnsavedChanges: true
      }
    })
  },

  addCustomSection: (title: string, agent: AgentType, afterId?: string) => {
    const newSection: PRDSection = {
      id: `custom_${Date.now()}`,
      title,
      order: 0,
      agent,
      required: false,
      content: {
        editorJSON: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: 'Start typing here...' }]
            }
          ]
        }
      },
      status: 'pending',
      isCustom: true,
      metadata: {
        lastModified: new Date().toISOString(),
        version: 1
      }
    }

    set(state => {
      const sections = [...state.sections]
      if (afterId) {
        const index = sections.findIndex(s => s.id === afterId)
        if (index >= 0) {
          sections.splice(index + 1, 0, newSection)
        } else {
          sections.push(newSection)
        }
      } else {
        sections.push(newSection)
      }
      
      // Update order values
      const orderedSections = sections.map((section, index) => ({
        ...section,
        order: index
      }))
      
      return {
        sections: orderedSections,
        hasUnsavedChanges: true
      }
    })
  },

  removeSection: (sectionId: string) => {
    set(state => ({
      sections: state.sections.filter(s => s.id !== sectionId),
      hasUnsavedChanges: true
    }))
  },

  setActiveSection: (sectionId: string | null) => {
    set({ activeSection: sectionId })
  },

  saveToBackend: async () => {
    const state = get()
    if (!state.prdId || !state.projectId) return
    
    set({ isSaving: true })
    
    try {
      // Transform sections for backend
      const sectionsForBackend = state.sections.map(section => ({
        id: section.id,
        title: section.title,
        order: section.order,
        agent: section.agent,
        required: section.required,
        content: section.content.structuredData || section.content,
        status: section.status,
        isCustom: section.isCustom
      }))
      
      const { error } = await supabase.rpc('update_prd_sections', {
        p_prd_id: state.prdId,
        p_sections: sectionsForBackend
      })
      
      if (error) throw error
      
      set({
        isSaving: false,
        hasUnsavedChanges: false,
        lastSaved: new Date()
      })
    } catch (error) {
      console.error('Failed to save PRD:', error)
      set({ isSaving: false })
    }
  },

  loadFromBackend: async (prdId: string) => {
    try {
      const { data, error } = await supabase
        .from('prds')
        .select('*')
        .eq('id', prdId)
        .single()
      
      if (error) throw error
      
      if (data?.sections) {
        get().loadSections(data.sections)
      } else {
        // Load default sections
        get().loadSections(getDefaultSections())
      }
    } catch (error) {
      console.error('Failed to load PRD:', error)
      // Load default sections as fallback
      get().loadSections(getDefaultSections())
    }
  },

  getSectionById: (sectionId: string) => {
    return get().sections.find(s => s.id === sectionId)
  },

  getCompletionPercentage: () => {
    const state = get()
    if (state.sections.length === 0) return 0
    
    const completedCount = state.sections.filter(s => s.status === 'completed').length
    return Math.round((completedCount / state.sections.length) * 100)
  },

  reset: () => {
    set(initialState)
  }
}))

// Default sections for new PRDs
function getDefaultSections(): PRDSection[] {
  return [
    {
      id: 'overview',
      title: 'Project Overview',
      order: 0,
      agent: 'project_manager',
      required: true,
      content: {},
      status: 'pending',
      isCustom: false,
      description: 'High-level vision, problem statement, and target users'
    },
    {
      id: 'core_features',
      title: 'Core Features',
      order: 1,
      agent: 'project_manager',
      required: true,
      content: {},
      status: 'pending',
      isCustom: false,
      description: 'Key features and functionality'
    },
    {
      id: 'user_interface',
      title: 'User Interface Design',
      order: 2,
      agent: 'design_assistant',
      required: true,
      content: {},
      status: 'pending',
      isCustom: false,
      description: 'Visual design and user experience'
    },
    {
      id: 'technical_arch',
      title: 'Technical Architecture',
      order: 3,
      agent: 'engineering_assistant',
      required: true,
      content: {},
      status: 'pending',
      isCustom: false,
      description: 'System design and technical implementation'
    },
    {
      id: 'configuration',
      title: 'Configuration & Setup',
      order: 4,
      agent: 'config_helper',
      required: false,
      content: {},
      status: 'pending',
      isCustom: false,
      description: 'Environment setup and deployment configuration'
    }
  ]
}