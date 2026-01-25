/**
 * SaveIndicator Component
 * Shows auto-save status (Saved, Saving, Error)
 */

import React from 'react';
import { Check, Loader2, AlertCircle } from 'lucide-react';

interface SaveIndicatorProps {
  isSaving: boolean;
  error: string | null;
}

export function SaveIndicator({ isSaving, error }: SaveIndicatorProps) {
  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
        <AlertCircle className="w-4 h-4" />
        <span>Error saving</span>
      </div>
    );
  }

  if (isSaving) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
        <Loader2 className="w-4 h-4 animate-spin" />
        <span>Saving...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
      <Check className="w-4 h-4" />
      <span>Saved</span>
    </div>
  );
}
