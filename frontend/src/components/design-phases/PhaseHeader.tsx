/**
 * PhaseHeader Component
 * Header for each phase page showing title, description, and action buttons
 */

import React from 'react';
import type { DesignPhaseInfo } from '../../types/design-phases';
import { SaveIndicator } from './SaveIndicator';
import { Sparkles } from 'lucide-react';

interface PhaseHeaderProps {
  phase: DesignPhaseInfo;
  isSaving: boolean;
  saveError: string | null;
  onAIAssist?: () => void;
}

export function PhaseHeader({
  phase,
  isSaving,
  saveError,
  onAIAssist,
}: PhaseHeaderProps) {
  return (
    <div className="mb-8">
      <div className="flex items-start justify-between gap-4 mb-2">
        {/* Phase Title and Description */}
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100">
            {phase.label}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">
            {phase.description}
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-4">
          {/* Save Indicator */}
          <SaveIndicator isSaving={isSaving} error={saveError} />

          {/* AI Assist Button */}
          {onAIAssist && (
            <button
              onClick={onAIAssist}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
              aria-label={`Get AI assistance for ${phase.label}`}
            >
              <Sparkles className="w-4 h-4" />
              <span className="hidden sm:inline">AI Assist</span>
            </button>
          )}
        </div>
      </div>

      {/* Required Phase Indicator */}
      {phase.required && (
        <p className="text-sm text-red-600 dark:text-red-400 mt-2">
          * This is a required phase
        </p>
      )}
    </div>
  );
}
