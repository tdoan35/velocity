import React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

interface VerticalCollapsiblePanelProps {
  children: React.ReactNode;
  title?: string;
  titleComponent?: React.ReactNode;
  isOpen: boolean;
  onToggle: (isOpen: boolean) => void;
  className?: string;
  defaultHeight?: number;
}

export function VerticalCollapsiblePanel({
  children,
  title = 'Panel',
  titleComponent,
  isOpen,
  onToggle,
  className,
  defaultHeight = 320,
}: VerticalCollapsiblePanelProps) {
  return (
    <div className={cn('flex flex-col bg-transparent', className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-2">
        {titleComponent ? titleComponent : <h3 className="font-medium text-sm">{title}</h3>}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onToggle(!isOpen)}
          className="h-6 w-6 p-0"
        >
          {isOpen ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronUp className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Content */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-200 ease-in-out',
          isOpen ? 'opacity-100' : 'opacity-0'
        )}
        style={{
          height: isOpen ? `${defaultHeight}px` : '0px',
        }}
      >
        <div className="h-full">
          {children}
        </div>
      </div>
    </div>
  );
}