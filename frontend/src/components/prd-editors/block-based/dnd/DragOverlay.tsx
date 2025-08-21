import React from 'react';
import { DragOverlay as DndKitDragOverlay } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { FileText } from 'lucide-react';

interface DragOverlayProps {
  activeId: string | null;
  activeType: 'section' | 'content' | null;
  sections?: any[];
  content?: any;
}

export const DragOverlay: React.FC<DragOverlayProps> = ({
  activeId,
  activeType,
  sections = [],
  content,
}) => {
  const renderOverlayContent = () => {
    if (!activeId || !activeType) return null;

    if (activeType === 'section') {
      const section = sections.find(s => s.id === activeId);
      if (!section) return null;

      return (
        <motion.div
          initial={{ scale: 1.03, rotate: 2 }}
          animate={{ scale: 1.03, rotate: 2 }}
          className={cn(
            "bg-white dark:bg-gray-800",
            "rounded-lg shadow-2xl",
            "border-2 border-blue-500",
            "p-4 opacity-95",
            "backdrop-blur-sm",
            "max-w-xl"
          )}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
              <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                {section.title || 'Untitled Section'}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {section.type || 'custom'} • Order: {section.order}
              </p>
            </div>
            <div className="text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-2 py-1 rounded">
              Moving...
            </div>
          </div>
        </motion.div>
      );
    }

    if (activeType === 'content') {
      return (
        <motion.div
          initial={{ scale: 1.02, rotate: 1 }}
          animate={{ scale: 1.02, rotate: 1 }}
          className={cn(
            "bg-gray-50 dark:bg-gray-700",
            "rounded-md shadow-xl",
            "border border-gray-300 dark:border-gray-600",
            "px-3 py-2 opacity-90",
            "backdrop-blur-sm",
            "max-w-md"
          )}
        >
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
            <span className="text-sm text-gray-600 dark:text-gray-300">
              {content?.text || 'Content Line'}
            </span>
          </div>
        </motion.div>
      );
    }

    return null;
  };

  return (
    <DndKitDragOverlay
      dropAnimation={{
        duration: 250,
        easing: 'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
      }}
    >
      {renderOverlayContent()}
    </DndKitDragOverlay>
  );
};

export default React.memo(DragOverlay);