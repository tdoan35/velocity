import React, { useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
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

export interface SortableSectionRef {
  getDragHandleProps: () => any;
}

export const SortableSection = React.memo(forwardRef<SortableSectionRef, SortableSectionProps>(({
  id,
  children,
  className = '',
  dragHandleClassName = '',
  disabled = false,
}, ref) => {
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

  // Expose drag handle props via ref
  useImperativeHandle(ref, () => ({
    getDragHandleProps: () => ({ ...attributes, ...listeners })
  }), [attributes, listeners]);

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
      data-sortable-id={id}
    >
      {/* Drop indicator */}
      <DropIndicator
        visible={showDropIndicator}
        position={dropPosition}
      />
      
      {/* Section content */}
      <div>
        {children}
      </div>
    </div>
  );
}));

SortableSection.displayName = 'SortableSection';

export default SortableSection;