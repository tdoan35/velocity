import React, { useState, useCallback, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
  Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  arrayMove,
} from '@dnd-kit/sortable';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import { type FlexiblePRDSection } from '@/services/prdService';
import { DragOverlay } from './DragOverlay';

interface PRDDndProviderProps {
  sections: FlexiblePRDSection[];
  onSectionReorder: (sections: FlexiblePRDSection[]) => void;
  children: React.ReactNode;
}

interface DragData {
  type: 'section';
  sectionId?: string;
}

export const PRDDndProvider: React.FC<PRDDndProviderProps> = ({
  sections,
  onSectionReorder,
  children,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeData, setActiveData] = useState<DragData | null>(null);

  // Configure sensors for drag activation
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Prevent accidental drags
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);
    setActiveData(active.data.current as DragData || null);
  }, []);

  // Handle drag over (for visual feedback)
  const handleDragOver = useCallback((event: DragOverEvent) => {
    // This can be used for additional visual feedback during drag
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      setActiveId(null);
      setActiveData(null);
      return;
    }

    // Check if we're handling a section drag
    if (activeData?.type === 'section') {
      const oldIndex = sections.findIndex(s => s.id === active.id);
      const newIndex = sections.findIndex(s => s.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedSections = arrayMove(sections, oldIndex, newIndex);
        onSectionReorder(reorderedSections);
      }
    }
    
    setActiveId(null);
    setActiveData(null);
  }, [activeData, sections, onSectionReorder]);

  // Memoize section IDs for SortableContext
  const sectionIds = useMemo(() => sections.map(s => s.id), [sections]);

  // Modifiers for drag constraints
  const modifiers = useMemo<Modifier[]>(
    () => [restrictToVerticalAxis, restrictToParentElement],
    []
  );

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      modifiers={modifiers}
    >
      <SortableContext 
        items={sectionIds} 
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
      <DragOverlay
        activeId={activeId}
        activeType={activeData?.type || null}
        sections={sections}
      />
    </DndContext>
  );
};

// Export a memo version for performance
export default React.memo(PRDDndProvider);