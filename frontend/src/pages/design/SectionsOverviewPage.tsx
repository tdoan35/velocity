/**
 * SectionsOverviewPage
 * Phase 6: Overview of all sections from roadmap with status and navigation
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import {
  PhaseLayout,
  NextPhaseButton,
  SectionCard,
} from '../../components/design-phases';
import { useDesignPhaseStore } from '../../stores/useDesignPhaseStore';
import { DESIGN_PHASES } from '../../types/design-phases';
import type { SectionStatus } from '../../types/design-phases';
import { FileText, Map, Filter, CheckCircle, Clock, Circle
} from 'lucide-react';

// Filter tab configuration
type FilterTab = 'all' | SectionStatus;

interface FilterOption {
  id: FilterTab;
  label: string;
  icon: React.ElementType;
}

const FILTER_OPTIONS: FilterOption[] = [
  { id: 'all', label: 'All', icon: Filter },
  { id: 'pending', label: 'Pending', icon: Circle },
  { id: 'in-progress', label: 'In Progress', icon: Clock },
  { id: 'completed', label: 'Completed', icon: CheckCircle },
];

export function SectionsOverviewPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    sections,
    isLoadingSections,
    completePhase,
  } = useDesignPhaseStore();

  // Get next phase info
  const nextPhaseInfo = DESIGN_PHASES.find((p) => p.id === 'export');

  // Filter state
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all');

  // Sort sections by order_index
  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => a.order_index - b.order_index);
  }, [sections]);

  // Filter sections based on active filter
  const filteredSections = useMemo(() => {
    if (activeFilter === 'all') {
      return sortedSections;
    }
    return sortedSections.filter((section) => section.status === activeFilter);
  }, [sortedSections, activeFilter]);

  // Calculate progress
  const progress = useMemo(() => {
    const total = sections.length;
    const completed = sections.filter((s) => s.status === 'completed').length;
    const inProgress = sections.filter((s) => s.status === 'in-progress').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, inProgress, percentage };
  }, [sections]);

  // Check if can proceed (at least one section completed or all sections defined)
  const canProceed = sections.length > 0 && progress.completed >= 1;

  // Handle section card click
  const handleSectionClick = useCallback(
    (sectionId: string) => {
      if (!projectId) return;
      navigate(`/project/${projectId}/design/sections/${sectionId}`);
    },
    [projectId, navigate]
  );

  // Handle proceed to next phase
  const handleProceed = useCallback(async () => {
    if (!projectId) return;

    try {
      await completePhase();
      navigate(`/project/${projectId}/design/${nextPhaseInfo?.route || 'export'}`);
    } catch (error) {
      console.error('Failed to complete phase:', error);
    }
  }, [projectId, completePhase, navigate, nextPhaseInfo]);

  // Handle AI assist
  const handleAIAssist = useCallback(() => {
    // TODO: Implement AI assist for section content suggestions
    console.log('AI Assist clicked - to be implemented');
  }, []);

  // Get filter counts
  const filterCounts = useMemo(() => {
    return {
      all: sections.length,
      pending: sections.filter((s) => s.status === 'pending').length,
      'in-progress': sections.filter((s) => s.status === 'in-progress').length,
      completed: sections.filter((s) => s.status === 'completed').length,
    };
  }, [sections]);

  return (
    <PhaseLayout onAIAssist={handleAIAssist}>
      {/* Phase Introduction */}
      <div className="mb-6">
        <p className="text-gray-600 dark:text-gray-400">
          Design each section of your application. Click on a section card to define
          its specifications, screens, and sample data.
        </p>
      </div>

      {/* Empty State */}
      {sections.length === 0 && !isLoadingSections ? (
        <div className="text-center py-16 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-lg">
          <FileText className="w-12 h-12 mx-auto text-gray-400 dark:text-gray-500 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
            No Sections Defined
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
            Sections are created from your product roadmap. Go back to the roadmap
            phase to define the sections of your application.
          </p>
          <Link
            to={`/project/${projectId}/design/product-roadmap`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Map className="w-4 h-4" />
            Go to Roadmap
          </Link>
        </div>
      ) : (
        <>
          {/* Progress Bar */}
          <div className="mb-6 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Section Progress
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {progress.completed} of {progress.total} completed ({progress.percentage}%)
              </span>
            </div>
            <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-500"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
            {progress.inProgress > 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {progress.inProgress} section{progress.inProgress !== 1 ? 's' : ''} in progress
              </p>
            )}
          </div>

          {/* Filter Tabs */}
          <div className="mb-6 flex items-center gap-2 overflow-x-auto pb-2">
            {FILTER_OPTIONS.map((option) => {
              const isActive = activeFilter === option.id;
              const count = filterCounts[option.id];
              const Icon = option.icon;

              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setActiveFilter(option.id)}
                  className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium
                    whitespace-nowrap transition-colors
                    ${
                      isActive
                        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'
                    }
                  `}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {option.label}
                  <span
                    className={`
                      ml-1 px-1.5 py-0.5 rounded text-xs
                      ${
                        isActive
                          ? 'bg-blue-200 dark:bg-blue-800'
                          : 'bg-gray-200 dark:bg-gray-700'
                      }
                    `}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Sections Grid */}
          {isLoadingSections ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="animate-pulse p-4 rounded-lg border border-gray-200 dark:border-gray-700"
                >
                  <div className="aspect-video bg-gray-200 dark:bg-gray-700 rounded-md mb-3" />
                  <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2" />
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2" />
                  <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : filteredSections.length === 0 ? (
            <div className="text-center py-12 text-gray-500 dark:text-gray-400">
              <Filter className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>No sections match the current filter.</p>
              <button
                type="button"
                onClick={() => setActiveFilter('all')}
                className="mt-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Show all sections
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSections.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  onClick={() => handleSectionClick(section.section_id)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Next Phase Button */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          {/* Status hint */}
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {sections.length === 0 ? (
              <span>Define sections in the roadmap phase first</span>
            ) : progress.completed === progress.total ? (
              <span className="text-green-600 dark:text-green-400">
                All sections completed - ready to export
              </span>
            ) : canProceed ? (
              <span>
                {progress.completed} of {progress.total} sections completed
              </span>
            ) : (
              <span>Complete at least one section to proceed</span>
            )}
          </div>

          {/* Next Phase Button */}
          <NextPhaseButton
            currentPhase="section-details"
            canProceed={canProceed}
            onProceed={handleProceed}
            reason={!canProceed ? 'Complete at least one section to proceed' : undefined}
          />
        </div>
      </div>
    </PhaseLayout>
  );
}
