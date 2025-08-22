import React from 'react';
import { cn } from '@/lib/utils';

interface DropIndicatorProps {
  visible: boolean;
  position: 'top' | 'bottom';
  className?: string;
}

export const DropIndicator: React.FC<DropIndicatorProps> = ({
  visible,
  position,
  className = '',
}) => {
  if (!visible) return null;

  return (
    <div
      className={cn(
        'absolute left-0 right-0 h-0.5 bg-blue-500 transition-opacity z-20',
        position === 'top' ? '-top-1' : '-bottom-1',
        visible ? 'opacity-100' : 'opacity-0',
        className
      )}
    >
      {/* Drop indicator dot */}
      <div className="absolute left-2 -top-1 w-2 h-2 bg-blue-500 rounded-full" />
    </div>
  );
};

export default DropIndicator;