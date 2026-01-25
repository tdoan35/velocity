/**
 * PhaseLayout Component
 * Wrapper layout for all design phase pages with navigation and header
 */

import React, { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PhaseNav } from './PhaseNav';
import { PhaseHeader } from './PhaseHeader';
import { DESIGN_PHASES, type PhaseName } from '../../types/design-phases';
import { useDesignPhaseStore } from '../../stores/useDesignPhaseStore';

interface PhaseLayoutProps {
  children: React.ReactNode;
  onAIAssist?: () => void;
}

export function PhaseLayout({
  children,
  onAIAssist,
}: PhaseLayoutProps) {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    currentDesignPhase,
    isLoading,
    isSaving,
    error,
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
  }, [projectId, loadDesignPhase, createDesignPhase]);

  // Handle phase navigation
  const handlePhaseSelect = (phase: PhaseName) => {
    if (!projectId) return;

    // Find the phase info
    const phaseInfo = DESIGN_PHASES.find((p) => p.id === phase);
    if (!phaseInfo) return;

    // Navigate to the phase route
    navigate(`/project/${projectId}/design/${phaseInfo.route}`);
  };

  // Get current phase info
  const currentPhaseInfo = DESIGN_PHASES.find(
    (p) => p.id === currentDesignPhase?.current_phase
  );

  // Loading state
  if (isLoading || !currentDesignPhase) {
    return (
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        {/* Sidebar Skeleton */}
        <div className="hidden lg:block w-80 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-700">
          <div className="p-4 space-y-4">
            <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-3/4" />
            <div className="space-y-2 mt-8">
              {[...Array(7)].map((_, i) => (
                <div
                  key={i}
                  className="h-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"
                />
              ))}
            </div>
          </div>
        </div>

        {/* Content Skeleton */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-1/3 mb-4" />
            <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3 mb-8" />
            <div className="space-y-4">
              <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      {/* Phase Navigation Sidebar */}
      <PhaseNav
        projectId={projectId!}
        currentPhase={currentDesignPhase.current_phase}
        completedPhases={currentDesignPhase.phases_completed}
        onPhaseSelect={handlePhaseSelect}
      />

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto lg:ml-0">
        <div className="max-w-5xl mx-auto p-6 lg:p-8">
          {/* Phase Header */}
          {currentPhaseInfo && (
            <PhaseHeader
              phase={currentPhaseInfo}
              isSaving={isSaving}
              saveError={error}
              onAIAssist={onAIAssist}
            />
          )}

          {/* Page Content */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
