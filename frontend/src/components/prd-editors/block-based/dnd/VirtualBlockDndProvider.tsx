import React, { useCallback, useState, useMemo } from 'react';
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import type {
  DragEndEvent,
  DragStartEvent,
  DragOverEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types';
import type { VirtualBlockManager } from '@/lib/virtual-blocks/VirtualBlockManager';
import { VirtualBlockDragOverlay } from './VirtualBlockDragOverlay';

export interface ContentLine {
  id: string;
  content: string;
  type?: string;
}

interface VirtualBlockDndProviderProps {
  sectionId: string;
  lines?: ContentLine[]; // Legacy content lines
  virtualBlocks?: VirtualContentBlock[]; // Virtual blocks
  virtualBlockManager?: VirtualBlockManager;
  onReorder?: (lines: ContentLine[]) => void; // Legacy reorder
  onVirtualBlockReorder?: (blocks: VirtualContentBlock[]) => void; // Virtual block reorder
  onVirtualBlockMove?: (fromIndex: number, toIndex: number) => void; // Alternative move handler
  children: React.ReactNode;
  disabled?: boolean;
}

/**
 * Enhanced DnD provider that supports both legacy content lines and virtual blocks
 */
export const VirtualBlockDndProvider: React.FC<VirtualBlockDndProviderProps> = ({
  sectionId,
  lines = [],
  virtualBlocks = [],
  virtualBlockManager,
  onReorder,
  onVirtualBlockReorder,
  onVirtualBlockMove,
  children,
  disabled = false,
}) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeBlock, setActiveBlock] = useState<VirtualContentBlock | null>(null);

  // Configure sensors with better activation constraints
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8, // Slightly higher distance to prevent accidental drags
        tolerance: 5,
        delay: 100, // Small delay to distinguish from clicks
      },
    })
  );

  // Create sortable items array (supports both virtual blocks and content lines)
  const sortableItems = useMemo(() => {
    if (virtualBlocks.length > 0) {
      return virtualBlocks.map(block => block.id);
    }
    return lines.map(line => line.id);
  }, [virtualBlocks, lines]);

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    const { active } = event;
    setActiveId(active.id as string);

    // If dragging a virtual block, store the block data
    if (active.data.current?.type === 'virtual-block') {
      const block = active.data.current.virtualBlock as VirtualContentBlock;
      setActiveBlock(block);
      console.log('Started dragging virtual block:', block.id, block.type);
    } else {
      setActiveBlock(null);
    }
  }, []);

  // Handle drag over (for visual feedback)
  const handleDragOver = useCallback((event: DragOverEvent) => {
    // Could add additional logic for drag over feedback
    // For now, the visual feedback is handled by individual sortable components
  }, []);

  // Handle drag end
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over || active.id === over.id) {
      setActiveId(null);
      setActiveBlock(null);
      return;
    }

    // Ensure we're handling drags within the same section
    const activeSectionId = active.data.current?.sectionId;
    const overSectionId = over.data.current?.sectionId;
    
    if (activeSectionId !== sectionId || overSectionId !== sectionId) {
      console.warn('Cross-section drag not supported yet');
      setActiveId(null);
      setActiveBlock(null);
      return;
    }

    // Handle virtual block reordering
    if (active.data.current?.type === 'virtual-block' && virtualBlocks.length > 0) {
      const oldIndex = virtualBlocks.findIndex(block => block.id === active.id);
      const newIndex = virtualBlocks.findIndex(block => block.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        console.log('Reordering virtual blocks:', { oldIndex, newIndex, activeId: active.id, overId: over.id });
        
        // Use the move handler if provided
        if (onVirtualBlockMove) {
          onVirtualBlockMove(oldIndex, newIndex);
        } 
        // Otherwise use the reorder handler
        else if (onVirtualBlockReorder) {
          const reorderedBlocks = arrayMove(virtualBlocks, oldIndex, newIndex);
          onVirtualBlockReorder(reorderedBlocks);
        }
        // Fallback: try to handle with virtual block manager
        else if (virtualBlockManager) {
          try {
            virtualBlockManager.reorderBlocks(oldIndex, newIndex);
            console.log('Virtual block reorder handled by manager');
          } catch (error) {
            console.error('Error reordering virtual blocks:', error);
          }
        }
      }
    }
    // Handle legacy content line reordering
    else if (active.data.current?.type === 'content' && lines.length > 0) {
      const oldIndex = lines.findIndex(line => line.id === active.id);
      const newIndex = lines.findIndex(line => line.id === over.id);
      
      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex && onReorder) {
        const reorderedLines = arrayMove(lines, oldIndex, newIndex);
        onReorder(reorderedLines);
        console.log('Reordered content lines:', { oldIndex, newIndex });
      }
    }
    
    setActiveId(null);
    setActiveBlock(null);
  }, [
    sectionId, 
    virtualBlocks, 
    lines, 
    onVirtualBlockReorder, 
    onVirtualBlockMove, 
    onReorder, 
    virtualBlockManager
  ]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      modifiers={[restrictToParentElement, restrictToVerticalAxis]}
      // Disable if explicitly disabled or no items to sort
      disabled={disabled || sortableItems.length === 0}
    >
      <SortableContext 
        items={sortableItems} 
        strategy={verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
      
      {/* Enhanced drag overlay with virtual block support */}
      <VirtualBlockDragOverlay 
        activeBlock={activeBlock}
      />
    </DndContext>
  );
};

export default React.memo(VirtualBlockDndProvider);