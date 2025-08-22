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
        'relative group',
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
      
      {/* Drag handle - center aligned with card header */}
      <div
        className={cn(
          'absolute left-2 p-1 cursor-move opacity-0 group-hover:opacity-100 transition-opacity',
          'hover:bg-gray-100 dark:hover:bg-gray-700 rounded z-10',
          dragHandleClassName,
          disabled && 'opacity-30 cursor-not-allowed'
        )}
        style={{ top: '1.5rem' }} // Center align with CardHeader content (~9rem header height / 2 = ~2.25rem)
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-400" />
      </div>
      
      {/* Section content with left padding for drag handle */}
      <div className="pl-8">
        {children}
      </div>
    </div>
  );
});

SortableSection.displayName = 'SortableSection';

export default SortableSection;