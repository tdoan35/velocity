import React from 'react';
import { DragOverlay as DndKitDragOverlay } from '@dnd-kit/core';
import { cn } from '@/lib/utils';
import type { VirtualContentBlock, BlockType } from '@/lib/virtual-blocks/types';
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Code,
  Minus,
  AlignLeft
} from 'lucide-react';

interface VirtualBlockDragOverlayProps {
  activeBlock: VirtualContentBlock | null;
}

// Icon mapping for block types
const blockTypeIcons: Record<BlockType, React.ComponentType<{ className?: string }>> = {
  paragraph: AlignLeft,
  heading_1: Heading1,
  heading_2: Heading2,
  heading_3: Heading3,
  bullet_list: List,
  numbered_list: ListOrdered,
  list_item: List,
  quote: Quote,
  code: Code,
  divider: Minus
};

// Visual styling for different block types
const blockTypeStyles: Record<BlockType, string> = {
  paragraph: 'border-gray-400 bg-gray-50',
  heading_1: 'border-blue-500 bg-blue-50',
  heading_2: 'border-green-500 bg-green-50',
  heading_3: 'border-yellow-500 bg-yellow-50',
  bullet_list: 'border-purple-500 bg-purple-50',
  numbered_list: 'border-indigo-500 bg-indigo-50',
  list_item: 'border-purple-400 bg-purple-40',
  quote: 'border-gray-600 bg-gray-100',
  code: 'border-red-500 bg-red-50',
  divider: 'border-gray-500 bg-gray-100'
};

/**
 * Drag overlay component for virtual blocks
 * Provides visual feedback during drag operations
 */
export const VirtualBlockDragOverlay: React.FC<VirtualBlockDragOverlayProps> = ({
  activeBlock
}) => {
  if (!activeBlock) {
    return (
      <DndKitDragOverlay>
        <div></div>
      </DndKitDragOverlay>
    );
  }

  const Icon = blockTypeIcons[activeBlock.type] || Type;
  const styleClass = blockTypeStyles[activeBlock.type] || 'border-gray-400 bg-gray-50';

  return (
    <DndKitDragOverlay>
      <div className={cn(
        'virtual-block-drag-preview',
        'p-4 rounded-lg shadow-xl border-2',
        'backdrop-blur-sm bg-opacity-90',
        'transform rotate-2', // Slight rotation for visual interest
        'max-w-md', // Limit width for readability
        styleClass
      )}>
        {/* Block type header */}
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4" />
          <span className="text-xs font-medium uppercase tracking-wide opacity-70">
            {activeBlock.type.replace('_', ' ')}
          </span>
        </div>

        {/* Block content preview */}
        <div className="text-sm line-clamp-3">
          {activeBlock.content.text || 'Empty block'}
        </div>

        {/* Block metadata */}
        <div className="mt-2 text-xs opacity-60">
          Block ID: {activeBlock.id.slice(0, 8)}...
        </div>
      </div>
    </DndKitDragOverlay>
  );
};

export default VirtualBlockDragOverlay;