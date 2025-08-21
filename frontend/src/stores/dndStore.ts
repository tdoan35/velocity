import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

interface DragData {
  id: string;
  type: 'section' | 'content';
  sectionId?: string;
}

interface DndState {
  // Active drag item
  activeId: string | null;
  activeType: 'section' | 'content' | null;
  activeSectionId: string | null; // For content drags
  
  // Over (hovering) item
  overId: string | null;
  overType: 'section' | 'content' | null;
  
  // Drag state
  isDragging: boolean;
  draggedItem: DragData | null;
}

interface DndActions {
  setActive: (id: string | null, type: 'section' | 'content' | null, sectionId?: string | null) => void;
  setOver: (id: string | null, type: 'section' | 'content' | null) => void;
  setDraggedItem: (item: DragData | null) => void;
  reset: () => void;
}

const initialState: DndState = {
  activeId: null,
  activeType: null,
  activeSectionId: null,
  overId: null,
  overType: null,
  isDragging: false,
  draggedItem: null,
};

export const useDndStore = create<DndState & DndActions>()(
  subscribeWithSelector((set) => ({
    ...initialState,
    
    setActive: (id, type, sectionId = null) => set({
      activeId: id,
      activeType: type,
      activeSectionId: sectionId,
      isDragging: id !== null,
      draggedItem: id ? { id, type: type!, sectionId } : null,
    }),
    
    setOver: (id, type) => set({
      overId: id,
      overType: type,
    }),
    
    setDraggedItem: (item) => set({
      draggedItem: item,
    }),
    
    reset: () => set(initialState),
  }))
);

// Selector hooks for common use cases
export const useIsDragging = () => useDndStore((state) => state.isDragging);
export const useActiveId = () => useDndStore((state) => state.activeId);
export const useDraggedItem = () => useDndStore((state) => state.draggedItem);