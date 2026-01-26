/**
 * SectionCard Component
 * Card component for displaying section summary in the overview grid
 */

import React from 'react';
import { FileText, Clock, CheckCircle, Circle, Image as ImageIcon } from 'lucide-react';
import type { DesignSection, SectionStatus } from '../../../types/design-phases';

interface SectionCardProps {
  section: DesignSection;
  onClick: () => void;
}

// Status configuration for badge display
const STATUS_CONFIG: Record<SectionStatus, { label: string; color: string; icon: React.ElementType }> = {
  pending: {
    label: 'Pending',
    color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400',
    icon: Circle,
  },
  'in-progress': {
    label: 'In Progress',
    color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    icon: Clock,
  },
  completed: {
    label: 'Completed',
    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle,
  },
};

export function SectionCard({ section, onClick }: SectionCardProps) {
  const status = section.status || 'pending';
  const statusConfig = STATUS_CONFIG[status];
  const StatusIcon = statusConfig.icon;

  // Get first screen design thumbnail if available
  const thumbnail = section.screen_designs?.[0];
  const hasScreenshot = section.screenshots?.length > 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="
        w-full text-left p-4 rounded-lg border
        bg-white dark:bg-gray-800
        border-gray-200 dark:border-gray-700
        hover:border-blue-300 dark:hover:border-blue-600
        hover:shadow-md
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        dark:focus:ring-offset-gray-900
        transition-all duration-200
        group
      "
    >
      {/* Thumbnail or Placeholder */}
      <div className="mb-3 aspect-video rounded-md overflow-hidden bg-gray-100 dark:bg-gray-700">
        {thumbnail ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-blue-900/20 dark:to-indigo-900/20">
            <div className="text-center">
              <FileText className="w-8 h-8 mx-auto text-blue-400 dark:text-blue-500" />
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 truncate px-2">
                {thumbnail.name}
              </p>
            </div>
          </div>
        ) : hasScreenshot ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-purple-50 to-pink-100 dark:from-purple-900/20 dark:to-pink-900/20">
            <div className="text-center">
              <ImageIcon className="w-8 h-8 mx-auto text-purple-400 dark:text-purple-500" />
              <p className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                {section.screenshots.length} screenshot{section.screenshots.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <div className="text-center text-gray-400 dark:text-gray-500">
              <FileText className="w-8 h-8 mx-auto" />
              <p className="text-xs mt-1">No designs yet</p>
            </div>
          </div>
        )}
      </div>

      {/* Section Info */}
      <div className="space-y-2">
        {/* Title */}
        <h3 className="font-medium text-gray-900 dark:text-gray-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors line-clamp-1">
          {section.title}
        </h3>

        {/* Description */}
        {section.description && (
          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2">
            {section.description}
          </p>
        )}

        {/* Status Badge */}
        <div className="flex items-center justify-between pt-2">
          <span
            className={`
              inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium
              ${statusConfig.color}
            `}
          >
            <StatusIcon className="w-3 h-3" />
            {statusConfig.label}
          </span>

          {/* Order indicator */}
          <span className="text-xs text-gray-400 dark:text-gray-500">
            #{section.order_index + 1}
          </span>
        </div>
      </div>
    </button>
  );
}
