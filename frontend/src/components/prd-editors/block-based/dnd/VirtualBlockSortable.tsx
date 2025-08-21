import React, { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { cn } from '@/lib/utils';
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types';

interface VirtualBlockSortableProps {
  virtualBlock: VirtualContentBlock;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * Wrapper component for making virtual blocks sortable with @dnd-kit
 * Integrates virtual block data with the drag and drop system
 */
export const VirtualBlockSortable = React.memo<VirtualBlockSortableProps>(({
  virtualBlock,
  children,
  disabled = false,
  className = ''
}) => {
  const sortable = useSortable({
    id: virtualBlock.id,
    disabled,
    data: {
      type: 'virtual-block',
      blockType: virtualBlock.type,
      sectionId: virtualBlock.sectionId || 'unknown',
      virtualBlock: virtualBlock,
      // Additional metadata for drag operations
      position: virtualBlock.position,
      content: virtualBlock.content
    }
  });

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    active
  } = sortable;

  // Memoize drag styles to prevent unnecessary recalculations
  const style = useMemo(() => ({
    transform: CSS.Transform.toString(transform),
    transition,
    // Add z-index for dragging blocks to appear above others
    zIndex: isDragging ? 50 : 1,
    // Maintain relative positioning for proper layout
    position: 'relative' as const
  }), [transform, transition, isDragging]);

  // Determine if this block is being dragged over
  const isDragTarget = isOver && active && active.id !== virtualBlock.id;

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      data-block-id={virtualBlock.id}
      data-block-type={virtualBlock.type}
      data-virtual-block="true"
      className={cn(
        'virtual-block-container group',
        // Visual feedback during drag operations
        isDragging && 'opacity-50 scale-[0.98] shadow-lg',
        isDragTarget && 'ring-2 ring-blue-400 ring-offset-2',
        // Smooth transitions for better UX
        'transition-all duration-200',
        className
      )}
      style={style}
    >
      {/* Drag handle - positioned absolute to not interfere with content */}
      <div
        className={cn(
          'absolute left-0 top-1/2 -translate-y-1/2 -ml-8 p-1',
          'cursor-move opacity-0 group-hover:opacity-100',
          'hover:bg-gray-100 rounded transition-all duration-200',
          'z-10', // Ensure drag handle is above content
          isDragging && 'opacity-100' // Show drag handle while dragging
        )}
        {...listeners}
      >
        <div className="w-4 h-4 flex items-center justify-center">
          <div className="w-1 h-1 bg-gray-400 rounded-full"></div>
          <div className="w-1 h-1 bg-gray-400 rounded-full ml-0.5"></div>
        </div>
      </div>

      {/* Block content */}
      <div className={cn(
        'virtual-block-content',
        // Add visual feedback for block type
        virtualBlock.type === 'heading_1' && 'border-l-4 border-blue-500 pl-4',
        virtualBlock.type === 'heading_2' && 'border-l-4 border-green-500 pl-4',
        virtualBlock.type === 'heading_3' && 'border-l-4 border-yellow-500 pl-4',
        virtualBlock.type === 'bullet_list' && 'border-l-4 border-purple-500 pl-4',
        virtualBlock.type === 'numbered_list' && 'border-l-4 border-indigo-500 pl-4',
        virtualBlock.type === 'quote' && 'border-l-4 border-gray-500 pl-4',
        virtualBlock.type === 'code' && 'border-l-4 border-red-500 pl-4',
        // Reduce border opacity during drag
        isDragging && 'border-opacity-30'
      )}>
        {children}
      </div>

      {/* Drop indicator - shows where the block will be dropped */}
      {isDragTarget && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full"></div>
          <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500 rounded-full"></div>
        </div>
      )}
    </div>
  );
});

VirtualBlockSortable.displayName = 'VirtualBlockSortable';

export default VirtualBlockSortable;