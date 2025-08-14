/**
 * Drag detection utilities for PRD Editor
 * Provides reliable drag type detection and validation logic
 */

export type DragType = 'section' | 'content' | 'unknown'
export type DropZoneType = 'section' | 'content'

/**
 * Reliably detects drag type using dataTransfer.types array
 * This method works during dragover events, unlike getData()
 */
export const getDragType = (dataTransfer: DataTransfer): DragType => {
  // Use types array for reliable detection during dragover
  const types = Array.from(dataTransfer.types)
  
  if (types.includes('application/x-prd-section')) {
    return 'section'
  }
  
  if (types.includes('application/x-tiptap-content')) {
    return 'content'
  }
  
  return 'unknown'
}

/**
 * Validates if a drop operation is allowed based on drag and drop contexts
 */
export const isValidDrop = (
  dragType: DragType,
  dropZoneType: DropZoneType,
  sourceContainer?: string,
  targetContainer?: string
): boolean => {
  switch (dragType) {
    case 'section':
      // Sections can only be dropped in section drop zones
      return dropZoneType === 'section'
    
    case 'content':
      // Content can only be dropped within the same section
      return dropZoneType === 'content' && 
             sourceContainer === targetContainer &&
             sourceContainer !== undefined
    
    default:
      return false
  }
}

/**
 * Sets up drag data with proper MIME types and payload
 */
export const setupSectionDragData = (
  dataTransfer: DataTransfer,
  sectionId: string,
  sourceIndex: number
) => {
  const dragData = {
    sectionId,
    sourceIndex,
    timestamp: Date.now()
  }
  
  dataTransfer.setData('application/x-prd-section', JSON.stringify(dragData))
  dataTransfer.effectAllowed = 'move'
}

/**
 * Sets up content drag data with proper MIME types and payload
 */
export const setupContentDragData = (
  dataTransfer: DataTransfer,
  contentId: string,
  sourceSectionId: string,
  sourceIndex?: number
) => {
  const dragData = {
    contentId,
    sourceSectionId,
    sourceIndex,
    timestamp: Date.now()
  }
  
  dataTransfer.setData('application/x-tiptap-content', JSON.stringify(dragData))
  dataTransfer.effectAllowed = 'move'
}

/**
 * Safely extracts drag data during drop events
 */
export const extractSectionDragData = (dataTransfer: DataTransfer) => {
  try {
    const data = dataTransfer.getData('application/x-prd-section')
    return data ? JSON.parse(data) : null
  } catch (error) {
    console.error('Failed to parse section drag data:', error)
    return null
  }
}

/**
 * Safely extracts content drag data during drop events
 */
export const extractContentDragData = (dataTransfer: DataTransfer) => {
  try {
    const data = dataTransfer.getData('application/x-tiptap-content')
    return data ? JSON.parse(data) : null
  } catch (error) {
    console.error('Failed to parse content drag data:', error)
    return null
  }
}

/**
 * Gets the appropriate drop effect for visual feedback
 */
export const getDropEffect = (
  dragType: DragType,
  isValid: boolean
): DataTransfer['dropEffect'] => {
  if (!isValid) return 'none'
  
  switch (dragType) {
    case 'section':
    case 'content':
      return 'move'
    default:
      return 'none'
  }
}

/**
 * Calculates drop index based on mouse position and target element
 */
export const calculateDropIndex = (
  e: DragEvent,
  containerElement: HTMLElement,
  childSelector: string
): number => {
  const children = Array.from(containerElement.querySelectorAll(childSelector))
  const mouseY = e.clientY
  
  for (let i = 0; i < children.length; i++) {
    const child = children[i] as HTMLElement
    const rect = child.getBoundingClientRect()
    const midPoint = rect.top + rect.height / 2
    
    if (mouseY < midPoint) {
      return i
    }
  }
  
  // If mouse is below all children, insert at the end
  return children.length
}

import { dragLogger } from './dragLogger'

/**
 * Debug utilities for drag operations (enhanced with logger)
 */
export const dragDebug = {
  logDragStart: (type: DragType, id: string, extra?: any) => {
    dragLogger.start(type, id, extra)
  },
  
  logDragOver: (type: DragType, targetId: string, valid: boolean, extra?: any) => {
    dragLogger.over(type, targetId, valid, extra)
  },
  
  logDrop: (type: DragType, sourceId: string, targetId: string, extra?: any) => {
    dragLogger.drop(type, sourceId, targetId, extra)
  },
  
  logDragEnd: (type: DragType, successful: boolean, extra?: any) => {
    dragLogger.end(type, 'unknown', successful, extra)
  },
  
  logError: (message: string, context?: any) => {
    dragLogger.error(message, context)
  }
}

/**
 * Validation helpers
 */
export const validateDragOperation = {
  /**
   * Ensures section drag is not happening during content drag
   */
  canStartSectionDrag: (currentDragType: string): boolean => {
    return currentDragType === 'none'
  },
  
  /**
   * Ensures content drag is not happening during section drag
   */
  canStartContentDrag: (currentDragType: string): boolean => {
    return currentDragType === 'none'
  },
  
  /**
   * Validates drop zone compatibility
   */
  isCompatibleDropZone: (
    dragType: DragType,
    dropZoneType: DropZoneType,
    sourceSection?: string,
    targetSection?: string
  ): boolean => {
    if (dragType === 'unknown') return false
    
    return isValidDrop(dragType, dropZoneType, sourceSection, targetSection)
  }
}