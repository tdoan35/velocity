import { useState, useCallback, useRef, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { type FlexiblePRDSection } from '@/services/prdService'
import { type JSONContent } from '@tiptap/react'

// Section types
export type SectionType = 
  | 'overview'
  | 'core_features'
  | 'additional_features'
  | 'ui_design_patterns'
  | 'ux_flows'
  | 'technical_architecture'
  | 'tech_integrations'
  | 'custom'

// Section status
export type SectionStatus = 'pending' | 'in_progress' | 'completed' | 'review'

// Single source of truth for section data
export interface PRDSection {
  id: string                    // Stable UUID
  type: SectionType             // Section type
  title: string                 // Display title
  order: number                 // Display order
  content: JSONContent          // TipTap JSON content
  status: SectionStatus         // Completion status
  agent?: string                // Assigned agent
  required: boolean             // Is required
  createdAt: string            // ISO timestamp
  updatedAt: string            // ISO timestamp
  version: number              // Version for conflict detection
}

// State management for sections
export interface PRDSectionState {
  sections: PRDSection[]
  version: number
  isLoading: boolean
  error: Error | null
  isDirty: boolean
}

// Action types for reducer
export type PRDSectionAction = 
  | { type: 'LOAD_SECTIONS', payload: PRDSection[] }
  | { type: 'UPDATE_SECTION', payload: { id: string, content: JSONContent } }
  | { type: 'UPDATE_SECTION_STATUS', payload: { id: string, status: SectionStatus } }
  | { type: 'ADD_SECTION', payload: PRDSection }
  | { type: 'REMOVE_SECTION', payload: string }
  | { type: 'REORDER_SECTIONS', payload: { fromIndex: number, toIndex: number } }
  | { type: 'SET_ERROR', payload: Error }
  | { type: 'SET_LOADING', payload: boolean }
  | { type: 'SET_DIRTY', payload: boolean }
  | { type: 'INCREMENT_VERSION' }

// Reducer for predictable state transitions
export function prdSectionReducer(state: PRDSectionState, action: PRDSectionAction): PRDSectionState {
  switch (action.type) {
    case 'LOAD_SECTIONS':
      return { 
        ...state, 
        sections: action.payload, 
        version: state.version + 1, 
        isLoading: false,
        isDirty: false,
        error: null
      }
      
    case 'UPDATE_SECTION': {
      const updatedSections = state.sections.map(section => 
        section.id === action.payload.id 
          ? { 
              ...section, 
              content: action.payload.content, 
              updatedAt: new Date().toISOString(),
              version: section.version + 1
            } 
          : section
      )
      return {
        ...state,
        sections: updatedSections,
        version: state.version + 1,
        isDirty: true
      }
    }
    
    case 'UPDATE_SECTION_STATUS': {
      const updatedSections = state.sections.map(section => 
        section.id === action.payload.id 
          ? { 
              ...section, 
              status: action.payload.status, 
              updatedAt: new Date().toISOString(),
              version: section.version + 1
            } 
          : section
      )
      return {
        ...state,
        sections: updatedSections,
        version: state.version + 1,
        isDirty: true
      }
    }
    
    case 'ADD_SECTION': {
      const newSection = {
        ...action.payload,
        order: state.sections.length + 1
      }
      return {
        ...state,
        sections: [...state.sections, newSection],
        version: state.version + 1,
        isDirty: true
      }
    }
    
    case 'REMOVE_SECTION': {
      const filteredSections = state.sections.filter(s => s.id !== action.payload)
      // Re-order remaining sections
      const reorderedSections = filteredSections.map((section, index) => ({
        ...section,
        order: index + 1
      }))
      return {
        ...state,
        sections: reorderedSections,
        version: state.version + 1,
        isDirty: true
      }
    }
    
    case 'REORDER_SECTIONS': {
      const { fromIndex, toIndex } = action.payload
      const newSections = [...state.sections]
      const [removed] = newSections.splice(fromIndex, 1)
      newSections.splice(toIndex, 0, removed)
      // Update order values
      const reorderedSections = newSections.map((section, index) => ({
        ...section,
        order: index + 1
      }))
      return {
        ...state,
        sections: reorderedSections,
        version: state.version + 1,
        isDirty: true
      }
    }
    
    case 'SET_ERROR':
      return { ...state, error: action.payload, isLoading: false }
      
    case 'SET_LOADING':
      return { ...state, isLoading: action.payload }
      
    case 'SET_DIRTY':
      return { ...state, isDirty: action.payload }
      
    case 'INCREMENT_VERSION':
      return { ...state, version: state.version + 1 }
      
    default:
      return state
  }
}

// Convert legacy FlexiblePRDSection to new PRDSection format
export function convertLegacySection(legacy: FlexiblePRDSection): PRDSection {
  // Generate stable ID if not present
  const stableId = legacy.id || uuidv4()
  
  // Convert content to TipTap JSON if it's HTML or structured data
  let jsonContent: JSONContent = {
    type: 'doc',
    content: []
  }
  
  if (legacy.content) {
    if (typeof legacy.content === 'string') {
      // HTML string - needs parsing
      jsonContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: legacy.content
              }
            ]
          }
        ]
      }
    } else if (legacy.content.content && typeof legacy.content.content === 'string') {
      // Nested HTML content
      jsonContent = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: legacy.content.content
              }
            ]
          }
        ]
      }
    } else {
      // Structured content - convert to formatted JSON
      jsonContent = convertStructuredToJSON(legacy.content, legacy.id as SectionType)
    }
  }
  
  return {
    id: stableId,
    type: determineSectionType(legacy),
    title: legacy.title,
    order: legacy.order,
    content: jsonContent,
    status: (legacy.status || 'pending') as SectionStatus,
    agent: legacy.agent,
    required: legacy.required || false,
    createdAt: legacy.createdAt || new Date().toISOString(),
    updatedAt: legacy.updatedAt || new Date().toISOString(),
    version: 1
  }
}

// Determine section type from legacy section
function determineSectionType(section: FlexiblePRDSection): SectionType {
  const typeMap: Record<string, SectionType> = {
    'overview': 'overview',
    'core_features': 'core_features',
    'additional_features': 'additional_features',
    'ui_design_patterns': 'ui_design_patterns',
    'ux_flows': 'ux_flows',
    'technical_architecture': 'technical_architecture',
    'tech_integrations': 'tech_integrations'
  }
  return typeMap[section.id] || 'custom'
}

// Convert structured content to TipTap JSON
function convertStructuredToJSON(content: any, sectionType: SectionType): JSONContent {
  const doc: JSONContent = {
    type: 'doc',
    content: []
  }
  
  switch (sectionType) {
    case 'overview':
      if (content.vision) {
        doc.content?.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Vision' }]
        })
        doc.content?.push({
          type: 'paragraph',
          content: [{ type: 'text', text: content.vision }]
        })
      }
      if (content.problem) {
        doc.content?.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Problem Statement' }]
        })
        doc.content?.push({
          type: 'paragraph',
          content: [{ type: 'text', text: content.problem }]
        })
      }
      if (content.targetUsers?.length > 0) {
        doc.content?.push({
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Target Users' }]
        })
        doc.content?.push({
          type: 'bulletList',
          content: content.targetUsers.map((user: string) => ({
            type: 'listItem',
            content: [{
              type: 'paragraph',
              content: [{ type: 'text', text: user }]
            }]
          }))
        })
      }
      break
      
    case 'core_features':
    case 'additional_features':
      if (content.features?.length > 0) {
        content.features.forEach((feature: any, index: number) => {
          doc.content?.push({
            type: 'heading',
            attrs: { level: 3 },
            content: [{ 
              type: 'text', 
              text: `${index + 1}. ${feature.title || feature.name || 'Feature'}` 
            }]
          })
          if (feature.description) {
            doc.content?.push({
              type: 'paragraph',
              content: [{ type: 'text', text: feature.description }]
            })
          }
          if (feature.priority) {
            doc.content?.push({
              type: 'paragraph',
              content: [{ 
                type: 'text', 
                text: `Priority: ${feature.priority}`,
                marks: [{ type: 'italic' }]
              }]
            })
          }
        })
      }
      break
      
    default:
      // For other sections, add as paragraphs
      if (typeof content === 'object') {
        doc.content?.push({
          type: 'codeBlock',
          content: [{ 
            type: 'text', 
            text: JSON.stringify(content, null, 2) 
          }]
        })
      }
  }
  
  return doc
}

// Create a new section with stable ID
export function createNewSection(
  type: SectionType, 
  title: string,
  agent?: string,
  required: boolean = false
): PRDSection {
  return {
    id: uuidv4(),
    type,
    title,
    order: 0, // Will be set by reducer based on current sections
    content: {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: `Content for ${title}...`
            }
          ]
        }
      ]
    },
    status: 'pending',
    agent,
    required,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    version: 1
  }
}

// Custom hook for managing PRD sections
export function usePRDSections(initialSections: FlexiblePRDSection[] = []) {
  // Convert legacy sections to new format
  const convertedSections = initialSections.map(convertLegacySection)
  
  // Initialize state
  const [state, dispatch] = useState<PRDSectionState>({
    sections: convertedSections,
    version: 1,
    isLoading: false,
    error: null,
    isDirty: false
  })
  
  // Track section timers for debounced saves
  const sectionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())
  
  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      sectionTimers.current.forEach(timer => clearTimeout(timer))
      sectionTimers.current.clear()
    }
  }, [])
  
  // Load sections
  const loadSections = useCallback((sections: FlexiblePRDSection[]) => {
    const converted = sections.map(convertLegacySection)
    dispatch({ type: 'LOAD_SECTIONS', payload: converted })
  }, [])
  
  // Update section content
  const updateSectionContent = useCallback((sectionId: string, content: JSONContent) => {
    dispatch({ type: 'UPDATE_SECTION', payload: { id: sectionId, content } })
  }, [])
  
  // Update section status
  const updateSectionStatus = useCallback((sectionId: string, status: SectionStatus) => {
    dispatch({ type: 'UPDATE_SECTION_STATUS', payload: { id: sectionId, status } })
  }, [])
  
  // Add new section
  const addSection = useCallback((type: SectionType, title: string, agent?: string, required: boolean = false) => {
    const newSection = createNewSection(type, title, agent, required)
    dispatch({ type: 'ADD_SECTION', payload: newSection })
    return newSection
  }, [])
  
  // Remove section
  const removeSection = useCallback((sectionId: string) => {
    dispatch({ type: 'REMOVE_SECTION', payload: sectionId })
  }, [])
  
  // Reorder sections
  const reorderSections = useCallback((fromIndex: number, toIndex: number) => {
    dispatch({ type: 'REORDER_SECTIONS', payload: { fromIndex, toIndex } })
  }, [])
  
  // Get section by ID
  const getSectionById = useCallback((sectionId: string) => {
    return state.sections.find(s => s.id === sectionId)
  }, [state.sections])
  
  // Check for duplicate sections
  const hasDuplicates = useCallback(() => {
    const ids = new Set<string>()
    for (const section of state.sections) {
      if (ids.has(section.id)) {
        return true
      }
      ids.add(section.id)
    }
    return false
  }, [state.sections])
  
  // Remove duplicate sections
  const removeDuplicates = useCallback(() => {
    const seen = new Set<string>()
    const unique: PRDSection[] = []
    
    for (const section of state.sections) {
      if (!seen.has(section.id)) {
        seen.add(section.id)
        unique.push(section)
      }
    }
    
    if (unique.length !== state.sections.length) {
      dispatch({ type: 'LOAD_SECTIONS', payload: unique })
      return true // Had duplicates
    }
    return false // No duplicates
  }, [state.sections])
  
  return {
    // State
    sections: state.sections,
    version: state.version,
    isLoading: state.isLoading,
    error: state.error,
    isDirty: state.isDirty,
    
    // Actions
    loadSections,
    updateSectionContent,
    updateSectionStatus,
    addSection,
    removeSection,
    reorderSections,
    
    // Utilities
    getSectionById,
    hasDuplicates,
    removeDuplicates,
    
    // Direct dispatch for advanced usage
    dispatch
  }
}