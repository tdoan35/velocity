import { create } from 'zustand'

interface DragState {
  type: 'none' | 'section' | 'content'
  draggedSectionId: string | null
  draggedContentId: string | null
  dropIndicatorIndex: number | null
  dropIndicatorType: 'section' | 'content' | null
  sourceContainer: string | null
  isValidDrop: boolean
}

interface DragActions {
  startSectionDrag: (sectionId: string) => void
  startContentDrag: (contentId: string, sectionId: string) => void
  setDropIndicator: (index: number, type: 'section' | 'content') => void
  clearDropIndicator: () => void
  resetDragState: () => void
  setValidDrop: (isValid: boolean) => void
}

type DragStore = DragState & DragActions

const initialState: DragState = {
  type: 'none',
  draggedSectionId: null,
  draggedContentId: null,
  dropIndicatorIndex: null,
  dropIndicatorType: null,
  sourceContainer: null,
  isValidDrop: false,
}

export const useDragStore = create<DragStore>((set) => ({
  // Initial state
  ...initialState,

  // Actions
  startSectionDrag: (sectionId: string) => {
    set({
      type: 'section',
      draggedSectionId: sectionId,
      draggedContentId: null,
      sourceContainer: null,
      dropIndicatorIndex: null,
      dropIndicatorType: null,
      isValidDrop: false,
    })
  },
  
  startContentDrag: (contentId: string, sectionId: string) => {
    set({
      type: 'content',
      draggedContentId: contentId,
      sourceContainer: sectionId,
      draggedSectionId: null,
      dropIndicatorIndex: null,
      dropIndicatorType: null,
      isValidDrop: false,
    })
  },
  
  setDropIndicator: (index: number, type: 'section' | 'content') => {
    set({
      dropIndicatorIndex: index,
      dropIndicatorType: type,
      isValidDrop: true,
    })
  },
  
  clearDropIndicator: () => {
    set({
      dropIndicatorIndex: null,
      dropIndicatorType: null,
      isValidDrop: false,
    })
  },
  
  setValidDrop: (isValid: boolean) => {
    set({ isValidDrop: isValid })
  },
  
  resetDragState: () => {
    set(initialState)
  },
}))

// Debug utilities for development
export const dragStateDebug = {
  logState: () => {
    const state = useDragStore.getState()
    console.log('🔍 Drag State:', {
      type: state.type,
      draggedSectionId: state.draggedSectionId,
      draggedContentId: state.draggedContentId,
      dropIndicatorIndex: state.dropIndicatorIndex,
      dropIndicatorType: state.dropIndicatorType,
      sourceContainer: state.sourceContainer,
      isValidDrop: state.isValidDrop,
    })
  },
  
  isDragging: () => {
    const state = useDragStore.getState()
    return state.type !== 'none'
  },
  
  getDraggedId: () => {
    const state = useDragStore.getState()
    return state.type === 'section' 
      ? state.draggedSectionId 
      : state.draggedContentId
  }
}