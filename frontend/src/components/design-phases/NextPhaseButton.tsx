/**
 * NextPhaseButton Component
 * Button for navigating to the next phase with different states
 */

import React, { useState } from 'react';
import { DESIGN_PHASES, type PhaseName } from '../../types/design-phases';
import { ArrowRight, CheckCircle } from 'lucide-react';

interface NextPhaseButtonProps {
  currentPhase: PhaseName;
  canProceed: boolean;
  onProceed: () => void;
  reason?: string; // Why can't proceed
}

export function NextPhaseButton({
  currentPhase,
  canProceed,
  onProceed,
  reason,
}: NextPhaseButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  // Find current phase index
  const currentPhaseIndex = DESIGN_PHASES.findIndex((p) => p.id === currentPhase);
  const isLastPhase = currentPhaseIndex === DESIGN_PHASES.length - 1;
  const nextPhase = !isLastPhase ? DESIGN_PHASES[currentPhaseIndex + 1] : null;

  // Determine button text
  const buttonText = isLastPhase
    ? 'Finish Design'
    : `Continue to ${nextPhase?.label}`;

  // Determine button icon
  const ButtonIcon = isLastPhase ? CheckCircle : ArrowRight;

  return (
    <div className="relative inline-block">
      <button
        onClick={onProceed}
        disabled={!canProceed}
        className={`
          flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all
          ${
            canProceed
              ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-md hover:shadow-lg'
              : 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
          }
        `}
        onMouseEnter={() => !canProceed && setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        aria-label={canProceed ? buttonText : `Cannot proceed: ${reason || 'Requirements not met'}`}
        aria-disabled={!canProceed}
      >
        <span>{buttonText}</span>
        <ButtonIcon className="w-5 h-5" />
      </button>

      {/* Tooltip when disabled */}
      {!canProceed && showTooltip && (
        <div
          className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-sm rounded-lg shadow-lg whitespace-nowrap z-50"
          role="tooltip"
        >
          {reason || 'Complete all required fields to continue'}
          <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
        </div>
      )}
    </div>
  );
}
