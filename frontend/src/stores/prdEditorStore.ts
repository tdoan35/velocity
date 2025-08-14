import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
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

export const usePRDEditorStore = create<PRDEditorState>()(
  immer((set, get) => ({
    ...initialState,

    initializePRD: async (prdId: string, projectId: string) => {
      set((state) => {
        state.prdId = prdId
        state.projectId = projectId
        state.isLoading = true
      })
      
      await get().loadFromBackend(prdId)
    },

    loadSections: (sections: PRDSection[]) => {
      set((state) => {
        state.sections = sections.map((section, index) => ({
          ...section,
          order: section.order ?? index,
          metadata: section.metadata || {
            lastModified: new Date().toISOString(),
            version: 1,
          },
        }))
        state.isLoading = false
        state.hasUnsavedChanges = false
      })
    },

    updateSectionContent: (sectionId: string, content: JSONContent) => {
      set((state) => {
        const section = state.sections.find((s) => s.id === sectionId)
        if (section) {
          section.content.editorJSON = content
          section.metadata = {
            ...section.metadata,
            lastModified: new Date().toISOString(),
            version: (section.metadata?.version || 0) + 1,
          }
          state.hasUnsavedChanges = true
          
          // Auto-update status if content is added
          if (content && section.status === 'pending') {
            section.status = 'in_progress'
          }
        }
      })
    },

    updateSectionStatus: (sectionId: string, status: SectionStatus) => {
      set((state) => {
        const section = state.sections.find((s) => s.id === sectionId)
        if (section) {
          section.status = status
          state.hasUnsavedChanges = true
        }
      })
    },

    reorderSections: (fromIndex: number, toIndex: number) => {
      set((state) => {
        const sections = [...state.sections]
        const [removed] = sections.splice(fromIndex, 1)
        sections.splice(toIndex, 0, removed)
        
        // Update order values
        sections.forEach((section, index) => {
          section.order = index
        })
        
        state.sections = sections
        state.hasUnsavedChanges = true
      })
    },

    addCustomSection: (title: string, agent: AgentType, afterId?: string) => {
      set((state) => {
        const newSection: PRDSection = {
          id: `custom_${Date.now()}`,
          title,
          order: state.sections.length,
          agent,
          required: false,
          content: {
            editorJSON: {
              type: 'doc',
              content: [
                {
                  type: 'heading',
                  attrs: { level: 2 },
                  content: [{ type: 'text', text: title }],
                },
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Start typing here...' }],
                },
              ],
            },
          },
          status: 'pending',
          isCustom: true,
          description: `Custom section created by user`,
          metadata: {
            lastModified: new Date().toISOString(),
            version: 1,
          },
        }

        if (afterId) {
          const index = state.sections.findIndex((s) => s.id === afterId)
          if (index !== -1) {
            state.sections.splice(index + 1, 0, newSection)
            // Update order for all sections
            state.sections.forEach((section, idx) => {
              section.order = idx
            })
          } else {
            state.sections.push(newSection)
          }
        } else {
          state.sections.push(newSection)
        }
        
        state.hasUnsavedChanges = true
      })
    },

    removeSection: (sectionId: string) => {
      set((state) => {
        const index = state.sections.findIndex((s) => s.id === sectionId)
        if (index !== -1) {
          const section = state.sections[index]
          // Don't allow removing required sections
          if (!section.required || section.isCustom) {
            state.sections.splice(index, 1)
            // Update order for remaining sections
            state.sections.forEach((section, idx) => {
              section.order = idx
            })
            state.hasUnsavedChanges = true
          }
        }
      })
    },

    setActiveSection: (sectionId: string | null) => {
      set((state) => {
        state.activeSection = sectionId
      })
    },

    saveToBackend: async () => {
      const state = get()
      if (!state.prdId || !state.hasUnsavedChanges) return

      set((state) => {
        state.isSaving = true
      })

      try {
        // Transform sections for backend
        const sectionsForBackend = state.sections.map((section) => ({
          id: section.id,
          title: section.title,
          order: section.order,
          agent: section.agent,
          required: section.required,
          content: section.content.structuredData || section.content.editorJSON || {},
          status: section.status,
          isCustom: section.isCustom,
          description: section.description,
        }))

        const { error } = await supabase.functions.invoke('prd-management', {
          body: {
            action: 'update',
            prdId: state.prdId,
            data: { sections: sectionsForBackend },
          },
        })

        if (error) throw error

        set((state) => {
          state.isSaving = false
          state.lastSaved = new Date()
          state.hasUnsavedChanges = false
        })
      } catch (error) {
        console.error('Failed to save PRD:', error)
        set((state) => {
          state.isSaving = false
        })
        throw error
      }
    },

    loadFromBackend: async (prdId: string) => {
      set((state) => {
        state.isLoading = true
      })

      try {
        const { data, error } = await supabase.functions.invoke('prd-management', {
          body: {
            action: 'get',
            prdId,
          },
        })

        if (error) throw error

        const sections = data.prd?.sections || []
        
        // Transform backend sections to editor format
        const editorSections: PRDSection[] = sections.map((section: any) => ({
          ...section,
          content: {
            editorJSON: section.content?.editorJSON || null,
            structuredData: section.content,
            template: section.template,
          },
          metadata: {
            lastModified: section.updated_at || new Date().toISOString(),
            version: 1,
          },
        }))

        get().loadSections(editorSections)
      } catch (error) {
        console.error('Failed to load PRD:', error)
        set((state) => {
          state.isLoading = false
        })
        throw error
      }
    },

    getSectionById: (sectionId: string) => {
      return get().sections.find((s) => s.id === sectionId)
    },

    getCompletionPercentage: () => {
      const state = get()
      const requiredSections = state.sections.filter((s) => s.required)
      if (requiredSections.length === 0) return 0
      
      const completedRequired = requiredSections.filter((s) => s.status === 'completed')
      return Math.round((completedRequired.length / requiredSections.length) * 100)
    },

    reset: () => {
      set(initialState)
    },
  }))
)