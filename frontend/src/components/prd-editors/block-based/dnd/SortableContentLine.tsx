import React, { useCallback, useMemo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

interface SortableContentLineProps {
  id: string;
  sectionId: string;
  children: React.ReactNode;
  onSelect?: (id: string) => void;
  className?: string;
  dragHandleClassName?: string;
  disabled?: boolean;
}

export const SortableContentLine = React.memo<SortableContentLineProps>(({
  id,
  sectionId,
  children,
  onSelect,
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
  } = useSortable({
    id,
    disabled,
    data: {
      type: 'content',
      sectionId,
    },
  });

  // Handle click for selection
  const handleClick = useCallback(() => {
    if (onSelect && !isDragging) {
      onSelect(id);
    }
  }, [id, onSelect, isDragging]);

  // Memoize style to prevent unnecessary recalculations
  const style = useMemo(() => ({
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: 'relative' as const,
  }), [transform, transition, isDragging]);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group ${className} ${isDragging ? 'z-50' : ''}`}
      onClick={handleClick}
    >
      {/* Drag handle - only visible on hover */}
      <div
        className={`absolute left-0 top-1/2 -translate-y-1/2 -ml-6 p-0.5 cursor-move 
          opacity-0 group-hover:opacity-100 hover:bg-gray-100 rounded transition-all 
          ${dragHandleClassName}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4 text-gray-400 hover:text-gray-600" />
      </div>
      
      {/* Content line */}
      {children}
    </div>
  );
});

SortableContentLine.displayName = 'SortableContentLine';

export default SortableContentLine;