/**
 * PhaseNav Component
 * Vertical navigation sidebar showing all 7 design phases with completion status
 */

import React, { useState } from 'react';
import { DESIGN_PHASES, type PhaseName, type DesignPhaseInfo } from '../../types/design-phases';
import {
  Lightbulb,
  Map,
  Database,
  Palette,
  Layout,
  FileText,
  Download,
  Check,
  Lock,
  Menu,
  X,
} from 'lucide-react';

interface PhaseNavProps {
  projectId: string;
  currentPhase: PhaseName;
  completedPhases: PhaseName[];
  onPhaseSelect: (phase: PhaseName) => void;
}

// Icon mapping
const PHASE_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  Lightbulb,
  Map,
  Database,
  Palette,
  Layout,
  FileText,
  Download,
};

export function PhaseNav({
  projectId,
  currentPhase,
  completedPhases,
  onPhaseSelect,
}: PhaseNavProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Determine if a phase is accessible
  const isPhaseAccessible = (phase: DesignPhaseInfo, index: number): boolean => {
    // First phase is always accessible
    if (index === 0) return true;

    // A phase is accessible if the previous phase is completed
    const previousPhase = DESIGN_PHASES[index - 1];
    return completedPhases.includes(previousPhase.id);
  };

  // Determine if a phase is completed
  const isPhaseCompleted = (phaseId: PhaseName): boolean => {
    return completedPhases.includes(phaseId);
  };

  // Determine if a phase is current
  const isPhaseCurrent = (phaseId: PhaseName): boolean => {
    return currentPhase === phaseId;
  };

  // Handle phase selection
  const handlePhaseClick = (phase: DesignPhaseInfo, index: number) => {
    if (isPhaseAccessible(phase, index)) {
      onPhaseSelect(phase.id);
      setIsMobileMenuOpen(false);
    }
  };

  // Render a single phase item
  const renderPhaseItem = (phase: DesignPhaseInfo, index: number) => {
    const accessible = isPhaseAccessible(phase, index);
    const completed = isPhaseCompleted(phase.id);
    const current = isPhaseCurrent(phase.id);
    const IconComponent = PHASE_ICONS[phase.icon] || FileText;

    return (
      <button
        key={phase.id}
        onClick={() => handlePhaseClick(phase, index)}
        disabled={!accessible}
        className={`
          w-full flex items-start gap-3 p-3 rounded-lg text-left transition-all
          ${current ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500' : ''}
          ${!current && accessible ? 'hover:bg-gray-50 dark:hover:bg-gray-800' : ''}
          ${!accessible ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        `}
        aria-label={`${phase.label}${current ? ' (current)' : ''}${completed ? ' (completed)' : ''}${!accessible ? ' (locked)' : ''}`}
        aria-current={current ? 'page' : undefined}
        aria-disabled={!accessible}
      >
        {/* Icon or Status Indicator */}
        <div className="flex-shrink-0 mt-0.5">
          {completed ? (
            <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
          ) : !accessible ? (
            <div className="w-5 h-5 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
              <Lock className="w-3 h-3 text-gray-500 dark:text-gray-400" />
            </div>
          ) : (
            <IconComponent
              className={`w-5 h-5 ${
                current
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400'
              }`}
            />
          )}
        </div>

        {/* Phase Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3
              className={`text-sm font-medium ${
                current
                  ? 'text-blue-900 dark:text-blue-100'
                  : accessible
                  ? 'text-gray-900 dark:text-gray-100'
                  : 'text-gray-500 dark:text-gray-400'
              }`}
            >
              {phase.label}
            </h3>
            {phase.required && (
              <span className="text-xs text-red-500 dark:text-red-400">*</span>
            )}
          </div>
          <p
            className={`text-xs mt-0.5 ${
              current
                ? 'text-blue-700 dark:text-blue-300'
                : accessible
                ? 'text-gray-600 dark:text-gray-400'
                : 'text-gray-400 dark:text-gray-500'
            }`}
          >
            {phase.description}
          </p>
        </div>

        {/* Phase Number */}
        <div className="flex-shrink-0 text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          {index + 1}
        </div>
      </button>
    );
  };

  return (
    <>
      {/* Mobile Menu Toggle */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
        aria-label="Toggle phase navigation menu"
        aria-expanded={isMobileMenuOpen}
      >
        {isMobileMenuOpen ? (
          <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
        ) : (
          <Menu className="w-5 h-5 text-gray-700 dark:text-gray-300" />
        )}
      </button>

      {/* Navigation Sidebar */}
      <nav
        className={`
          fixed lg:static inset-y-0 left-0 z-40
          w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700
          transform transition-transform duration-200 ease-in-out
          ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
        aria-label="Design phase navigation"
      >
        <div className="h-full overflow-y-auto p-4">
          {/* Header */}
          <div className="mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Design Phases
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Complete each phase to build your app
            </p>
          </div>

          {/* Phase List */}
          <div className="space-y-2">
            {DESIGN_PHASES.map((phase, index) => renderPhaseItem(phase, index))}
          </div>

          {/* Footer Note */}
          <div className="mt-6 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <span className="text-red-500">*</span> Required phases
            </p>
          </div>
        </div>
      </nav>

      {/* Mobile Overlay */}
      {isMobileMenuOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </>
  );
}
