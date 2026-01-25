/**
 * DesignPhaseIndex Page
 * Hub page showing overview of all phases with completion status
 * Entry point for the design workflow
 */

import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DESIGN_PHASES, type PhaseName } from '../../types/design-phases';
import { useDesignPhaseStore } from '../../stores/useDesignPhaseStore';
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
  ArrowRight,
} from 'lucide-react';

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

export function DesignPhaseIndex() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    currentDesignPhase,
    isLoading,
    loadDesignPhase,
    createDesignPhase,
  } = useDesignPhaseStore();

  // Load design phase data on mount
  useEffect(() => {
    if (!projectId) return;

    const initializeDesignPhase = async () => {
      await loadDesignPhase(projectId);

      // If no design phase exists, create one
      if (!currentDesignPhase) {
        try {
          await createDesignPhase({ project_id: projectId });
        } catch (error) {
          console.error('Failed to create design phase:', error);
        }
      }
    };

    initializeDesignPhase();
  }, [projectId, loadDesignPhase, createDesignPhase, currentDesignPhase]);

  // Calculate progress
  const completedPhases = currentDesignPhase?.phases_completed || [];
  const progressPercentage = (completedPhases.length / DESIGN_PHASES.length) * 100;

  // Determine if a phase is accessible
  const isPhaseAccessible = (phaseId: PhaseName, index: number): boolean => {
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
    return currentDesignPhase?.current_phase === phaseId;
  };

  // Handle phase click
  const handlePhaseClick = (phaseId: PhaseName, index: number) => {
    if (!projectId || !isPhaseAccessible(phaseId, index)) return;

    const phaseInfo = DESIGN_PHASES.find((p) => p.id === phaseId);
    if (!phaseInfo) return;

    navigate(`/project/${projectId}/design/${phaseInfo.route}`);
  };

  // Handle start button click
  const handleStart = () => {
    if (!projectId) return;
    const firstPhase = DESIGN_PHASES[0];
    navigate(`/project/${projectId}/design/${firstPhase.route}`);
  };

  // Loading state
  if (isLoading || !currentDesignPhase) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 lg:p-8">
        <div className="max-w-7xl mx-auto">
          {/* Header Skeleton */}
          <div className="mb-8">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/3 mb-4" />
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3 mb-6" />
            <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-full" />
          </div>

          {/* Grid Skeleton */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(7)].map((_, i) => (
              <div
                key={i}
                className="h-48 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  const hasStarted = completedPhases.length > 0 || currentDesignPhase.current_phase !== 'product-vision';

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-100 mb-4">
            Design Your App
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
            Follow these 7 phases to transform your vision into a production-ready application
          </p>

          {/* Progress Bar */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Progress
              </span>
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                {completedPhases.length} / {DESIGN_PHASES.length} phases completed
              </span>
            </div>
            <div className="w-full h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-600 transition-all duration-300"
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          {/* Start Button */}
          {!hasStarted && (
            <button
              onClick={handleStart}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors shadow-md hover:shadow-lg"
            >
              <span>Start Design Process</span>
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Phase Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {DESIGN_PHASES.map((phase, index) => {
            const accessible = isPhaseAccessible(phase.id, index);
            const completed = isPhaseCompleted(phase.id);
            const current = isPhaseCurrent(phase.id);
            const IconComponent = PHASE_ICONS[phase.icon] || FileText;

            return (
              <button
                key={phase.id}
                onClick={() => handlePhaseClick(phase.id, index)}
                disabled={!accessible}
                className={`
                  relative p-6 rounded-lg border-2 text-left transition-all
                  ${
                    current
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg'
                      : completed
                      ? 'border-green-500 bg-green-50 dark:bg-green-900/20 hover:shadow-md'
                      : accessible
                      ? 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-blue-400 hover:shadow-md'
                      : 'border-gray-200 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 opacity-60 cursor-not-allowed'
                  }
                `}
                aria-label={`${phase.label}${current ? ' (current)' : ''}${completed ? ' (completed)' : ''}${!accessible ? ' (locked)' : ''}`}
                aria-current={current ? 'page' : undefined}
                aria-disabled={!accessible}
              >
                {/* Status Badge */}
                <div className="absolute top-4 right-4">
                  {completed ? (
                    <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center">
                      <Check className="w-5 h-5 text-white" />
                    </div>
                  ) : !accessible ? (
                    <div className="w-8 h-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                      <Lock className="w-5 h-5 text-gray-500 dark:text-gray-400" />
                    </div>
                  ) : null}
                </div>

                {/* Phase Icon */}
                <div className="mb-4">
                  <div
                    className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                      current
                        ? 'bg-blue-100 dark:bg-blue-800'
                        : completed
                        ? 'bg-green-100 dark:bg-green-800'
                        : accessible
                        ? 'bg-gray-100 dark:bg-gray-700'
                        : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                  >
                    <IconComponent
                      className={`w-6 h-6 ${
                        current
                          ? 'text-blue-600 dark:text-blue-400'
                          : completed
                          ? 'text-green-600 dark:text-green-400'
                          : accessible
                          ? 'text-gray-600 dark:text-gray-400'
                          : 'text-gray-400 dark:text-gray-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Phase Info */}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <h3
                      className={`text-lg font-semibold ${
                        current
                          ? 'text-blue-900 dark:text-blue-100'
                          : completed
                          ? 'text-green-900 dark:text-green-100'
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
                    className={`text-sm ${
                      current
                        ? 'text-blue-700 dark:text-blue-300'
                        : completed
                        ? 'text-green-700 dark:text-green-300'
                        : accessible
                        ? 'text-gray-600 dark:text-gray-400'
                        : 'text-gray-400 dark:text-gray-500'
                    }`}
                  >
                    {phase.description}
                  </p>

                  {/* Phase Number */}
                  <div className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                    Phase {index + 1} of {DESIGN_PHASES.length}
                  </div>
                </div>

                {/* Current Phase Indicator */}
                {current && (
                  <div className="absolute bottom-4 right-4">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                      Current
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer Note */}
        <div className="mt-8 p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            <span className="text-red-500">*</span> Required phases must be completed before
            exporting your design
          </p>
        </div>
      </div>
    </div>
  );
}
