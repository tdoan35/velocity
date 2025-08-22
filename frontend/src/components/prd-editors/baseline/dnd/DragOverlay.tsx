import React from 'react';
import { DragOverlay as DnDKitDragOverlay } from '@dnd-kit/core';
import { Card, CardHeader } from '@/components/ui/card';
import { FileText, GripVertical } from 'lucide-react';
import { type FlexiblePRDSection } from '@/services/prdService';

interface DragOverlayProps {
  activeId: string | null;
  activeType: string | null;
  sections: FlexiblePRDSection[];
}

export const DragOverlay: React.FC<DragOverlayProps> = ({
  activeId,
  activeType,
  sections,
}) => {
  const renderDragOverlay = () => {
    if (!activeId || activeType !== 'section') return null;

    const section = sections.find(s => s.id === activeId);
    if (!section) return null;

    return (
      <Card className="bg-white dark:bg-gray-800 shadow-lg border-2 border-blue-400 opacity-95 rotate-2 scale-105">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <GripVertical className="w-4 h-4 text-gray-400" />
            <FileText className="w-4 h-4 text-gray-500" />
            <h3 className="font-medium text-base">
              {section.title}
            </h3>
            {section.required && (
              <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                Required
              </span>
            )}
          </div>
        </CardHeader>
      </Card>
    );
  };

  return (
    <DnDKitDragOverlay>
      {renderDragOverlay()}
    </DnDKitDragOverlay>
  );
};

export default DragOverlay;