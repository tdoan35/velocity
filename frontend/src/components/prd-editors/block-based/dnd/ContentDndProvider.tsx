import React, { useCallback, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  DragEndEvent,
  DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';

export interface ContentLine {
  id: string;
  content: string;
  type?: string;
}

interface ContentDndProviderProps {
  sectionId: string;
  lines: ContentLine[];
  onReorder: (lines: ContentLine[]) => void;
  children: React.ReactNode;
}

export const ContentDndProvider: React.FC<ContentDndProviderProps> = ({
  sectionId,
  lines,
  onReorder,
  children,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);

  // Configure sensors for content dragging
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // Smaller activation distance for content
      },
    })
  );

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    // Ensure we're only handling content within this section
    if (
      over &&
      active.id !== over.id &&
      active.data.current?.sectionId === sectionId &&
      over.data.current?.sectionId === sectionId
    ) {
      const oldIndex = lines.findIndex(l => l.id === active.id);
      const newIndex = lines.findIndex(l => l.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1) {
        const reorderedLines = arrayMove(lines, oldIndex, newIndex);
        onReorder(reorderedLines);
      }
    }
    
    setActiveId(null);
  }, [sectionId, lines, onReorder]);

  // Render drag overlay for content
  const renderDragOverlay = () => {
    if (!activeId) return null;
    
    const line = lines.find(l => l.id === activeId);
    if (!line) return null;
    
    return (
      <div className="bg-white shadow-xl rounded p-2 opacity-90 max-w-md">
        <div 
          className="text-sm text-gray-700 line-clamp-2"
          dangerouslySetInnerHTML={{ 
            __html: line.content.substring(0, 100) + (line.content.length > 100 ? '...' : '') 
          }}
        />
      </div>
    );
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToParentElement, restrictToVerticalAxis]}
    >
      <SortableContext 
        items={lines.map(l => l.id)} 
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
      <DragOverlay>
        {renderDragOverlay()}
      </DragOverlay>
    </DndContext>
  );
};

export default React.memo(ContentDndProvider);