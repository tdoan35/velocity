import React, { useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import { DropIndicator } from './DropIndicator';
import { cn } from '@/lib/utils';

interface SortableSectionProps {
  id: string;
  children: React.ReactNode;
  className?: string;
  dragHandleClassName?: string;
  disabled?: boolean;
}

export const SortableSection: React.FC<SortableSectionProps> = React.memo(({
  id,
  children,
  className = '',
  dragHandleClassName = '',
  disabled = false,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
    over,
    active,
  } = useSortable({
    id,
    disabled,
    data: {
      type: 'section',
    },
  });

  // Memoize style to prevent unnecessary recalculations
  const style = useMemo(() => ({
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
  }), [transform, transition, isDragging]);

  // Determine drop indicator position
  const showDropIndicator = isOver && active?.id !== id;
  const dropPosition = over?.id === id && active?.id ? 
    (active.id < id ? 'top' : 'bottom') : 'bottom';

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative',
        className,
        isDragging && 'z-50 opacity-50',
        isOver && !isDragging && 'ring-2 ring-blue-400 ring-opacity-50'
      )}
    >
      {/* Drop indicator */}
      <DropIndicator
        visible={showDropIndicator}
        position={dropPosition}
      />
      
      {/* Drag handle */}
      <div
        className={cn(
          'absolute left-0 top-4 -ml-8 p-1 cursor-move',
          'hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors',
          dragHandleClassName,
          disabled && 'opacity-30 cursor-not-allowed'
        )}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400" />
      </div>
      
      {/* Section content */}
      {children}
    </div>
  );
});

SortableSection.displayName = 'SortableSection';

export default SortableSection;