/**
 * ShellDesignPage
 * Phase 5: Define application shell - navigation structure and layout (Optional Phase)
 */

import React, { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  PhaseLayout,
  NextPhaseButton,
  ShellEditor,
} from '../../components/design-phases';
import { useDesignPhaseStore } from '../../stores/useDesignPhaseStore';
import { DESIGN_PHASES } from '../../types/design-phases';
import type { ShellSpec, RoadmapSection } from '../../types/design-phases';
import { Info, SkipForward, Sparkles, Layout, Menu, Home, Settings, User, FileText } from 'lucide-react';

// Default shell spec values
const DEFAULT_SHELL_SPEC: ShellSpec = {
  overview: '',
  navigationItems: [
    { label: 'Home', icon: 'Home', route: '/', sectionId: '' },
    { label: 'Settings', icon: 'Settings', route: '/settings', sectionId: '' },
  ],
  layoutPattern: 'sidebar-left',
  raw: '',
};

// Generate shell spec from roadmap sections
function generateShellFromSections(sections: RoadmapSection[]): ShellSpec {
  const navItems = sections.map((section, index) => ({
    label: section.title,
    icon: index === 0 ? 'Home' : 'FileText',
    route: `/${section.id}`,
    sectionId: section.id,
  }));

  // Add settings at the end if not present
  if (!navItems.some((item) => item.label.toLowerCase() === 'settings')) {
    navItems.push({
      label: 'Settings',
      icon: 'Settings',
      route: '/settings',
      sectionId: '',
    });
  }

  return {
    overview: `Application shell with ${sections.length} main sections based on the product roadmap.`,
    navigationItems: navItems,
    layoutPattern: 'sidebar-left',
    raw: '',
  };
}

export function ShellDesignPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    currentDesignPhase,
    isSaving,
    updateShellSpec,
    completePhase,
  } = useDesignPhaseStore();

  // Get next phase info
  const nextPhaseInfo = DESIGN_PHASES.find((p) => p.id === 'section-details');

  // Get existing shell spec or use defaults for display
  const shellSpec = currentDesignPhase?.shell_spec || null;
  const displaySpec = shellSpec || DEFAULT_SHELL_SPEC;

  // Get roadmap sections for the editor and AI assist
  const roadmapSections: RoadmapSection[] = useMemo(() => {
    return currentDesignPhase?.product_roadmap?.sections || [];
  }, [currentDesignPhase?.product_roadmap?.sections]);

  // This phase is always optional - can proceed even without data
  const canProceed = true;

  // Check if shell spec has been customized
  const isCustomized = useMemo(() => {
    if (!shellSpec) return false;
    return (
      shellSpec.navigationItems.length !== DEFAULT_SHELL_SPEC.navigationItems.length ||
      shellSpec.layoutPattern !== DEFAULT_SHELL_SPEC.layoutPattern ||
      shellSpec.overview.trim() !== ''
    );
  }, [shellSpec]);

  // Handle shell spec change
  const handleShellChange = useCallback(
    async (newSpec: ShellSpec) => {
      try {
        await updateShellSpec(newSpec);
      } catch (error) {
        console.error('Failed to save shell spec:', error);
      }
    },
    [updateShellSpec]
  );

  // Handle proceed to next phase
  const handleProceed = useCallback(async () => {
    if (!projectId) return;

    try {
      // If no shell spec set, save defaults
      if (!shellSpec) {
        await updateShellSpec(DEFAULT_SHELL_SPEC);
      }
      await completePhase();
      navigate(`/project/${projectId}/design/${nextPhaseInfo?.route || 'section-details'}`);
    } catch (error) {
      console.error('Failed to complete phase:', error);
    }
  }, [projectId, shellSpec, updateShellSpec, completePhase, navigate, nextPhaseInfo]);

  // Handle skip phase
  const handleSkip = useCallback(async () => {
    if (!projectId) return;

    try {
      // Save defaults when skipping
      await updateShellSpec(DEFAULT_SHELL_SPEC);
      await completePhase();
      navigate(`/project/${projectId}/design/${nextPhaseInfo?.route || 'section-details'}`);
    } catch (error) {
      console.error('Failed to skip phase:', error);
    }
  }, [projectId, updateShellSpec, completePhase, navigate, nextPhaseInfo]);

  // Handle AI assist - generate nav structure from roadmap sections
  const handleAIAssist = useCallback(async () => {
    if (roadmapSections.length === 0) {
      console.log('No roadmap sections available for AI assist');
      return;
    }

    try {
      const generatedSpec = generateShellFromSections(roadmapSections);
      await updateShellSpec(generatedSpec);
    } catch (error) {
      console.error('Failed to generate shell from sections:', error);
    }
  }, [roadmapSections, updateShellSpec]);

  // Get icon component for preview
  const getIconForName = (iconName: string) => {
    const iconMap: Record<string, React.ElementType> = {
      Home,
      Settings,
      User,
      FileText,
      Menu,
    };
    return iconMap[iconName] || FileText;
  };

  return (
    <PhaseLayout onAIAssist={handleAIAssist}>
      {/* Optional Phase Banner */}
      <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
        <div className="flex items-start gap-3">
          <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-amber-900 dark:text-amber-100">
              Optional Phase
            </h4>
            <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
              Define your app's navigation structure and layout pattern.
              Skip to use a default left sidebar layout.
            </p>
            <button
              onClick={handleSkip}
              className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
            >
              <SkipForward className="w-4 h-4" />
              Skip with defaults
            </button>
          </div>
        </div>
      </div>

      {/* Phase Introduction */}
      <div className="mb-6">
        <p className="text-gray-600 dark:text-gray-400">
          Design the navigation and layout structure for your application.
          Define how users will move between different sections of your app.
        </p>
      </div>

      {/* AI Suggestion Hint */}
      {roadmapSections.length > 0 && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-start gap-3">
            <Sparkles className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                AI Navigation Generator
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Click the AI Assist button to automatically generate a navigation structure
                based on your {roadmapSections.length} roadmap section{roadmapSections.length !== 1 ? 's' : ''}.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-8">
        {/* Shell Editor */}
        <ShellEditor
          shellSpec={displaySpec}
          sections={roadmapSections}
          onChange={handleShellChange}
          disabled={isSaving}
        />

        {/* Visual Preview */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Layout className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Layout Preview
            </h3>
          </div>

          <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            {/* Preview Container */}
            <div
              className={`
                relative w-full h-64 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden
                bg-gray-50 dark:bg-gray-900
                ${displaySpec.layoutPattern === 'sidebar-left' ? 'flex' : ''}
                ${displaySpec.layoutPattern === 'sidebar-right' ? 'flex flex-row-reverse' : ''}
              `}
            >
              {/* Sidebar Preview (Left or Right) */}
              {(displaySpec.layoutPattern === 'sidebar-left' || displaySpec.layoutPattern === 'sidebar-right') && (
                <div className="w-48 h-full bg-gray-100 dark:bg-gray-800 border-r border-gray-300 dark:border-gray-600 p-3">
                  <div className="space-y-1">
                    {displaySpec.navigationItems.slice(0, 6).map((item, index) => {
                      const IconComponent = getIconForName(item.icon);
                      return (
                        <div
                          key={index}
                          className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                        >
                          <IconComponent className="w-3.5 h-3.5" />
                          <span className="truncate">{item.label || 'Nav Item'}</span>
                        </div>
                      );
                    })}
                    {displaySpec.navigationItems.length > 6 && (
                      <div className="text-xs text-gray-400 dark:text-gray-500 px-2 py-1">
                        +{displaySpec.navigationItems.length - 6} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Top Navigation Preview */}
              {displaySpec.layoutPattern === 'top-nav' && (
                <div className="absolute top-0 left-0 right-0 h-10 bg-gray-100 dark:bg-gray-800 border-b border-gray-300 dark:border-gray-600 flex items-center px-3 gap-4">
                  {displaySpec.navigationItems.slice(0, 5).map((item, index) => {
                    const IconComponent = getIconForName(item.icon);
                    return (
                      <div
                        key={index}
                        className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300"
                      >
                        <IconComponent className="w-3.5 h-3.5" />
                        <span>{item.label || 'Nav'}</span>
                      </div>
                    );
                  })}
                  {displaySpec.navigationItems.length > 5 && (
                    <div className="text-xs text-gray-400 dark:text-gray-500">
                      +{displaySpec.navigationItems.length - 5}
                    </div>
                  )}
                </div>
              )}

              {/* Bottom Navigation Preview */}
              {displaySpec.layoutPattern === 'bottom-nav' && (
                <div className="absolute bottom-0 left-0 right-0 h-12 bg-gray-100 dark:bg-gray-800 border-t border-gray-300 dark:border-gray-600 flex items-center justify-around px-2">
                  {displaySpec.navigationItems.slice(0, 5).map((item, index) => {
                    const IconComponent = getIconForName(item.icon);
                    return (
                      <div
                        key={index}
                        className="flex flex-col items-center gap-0.5 text-gray-700 dark:text-gray-300"
                      >
                        <IconComponent className="w-4 h-4" />
                        <span className="text-[10px] truncate max-w-[48px]">
                          {item.label || 'Nav'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Content Area */}
              <div
                className={`
                  flex-1 flex items-center justify-center
                  ${displaySpec.layoutPattern === 'top-nav' ? 'pt-10' : ''}
                  ${displaySpec.layoutPattern === 'bottom-nav' ? 'pb-12' : ''}
                `}
              >
                <div className="text-center text-gray-400 dark:text-gray-500">
                  <Layout className="w-8 h-8 mx-auto mb-2" />
                  <p className="text-sm">Content Area</p>
                </div>
              </div>
            </div>

            {/* Layout Type Label */}
            <div className="mt-4 text-center">
              <span className="inline-flex items-center gap-2 px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 rounded-full text-gray-700 dark:text-gray-300">
                <Layout className="w-4 h-4" />
                {displaySpec.layoutPattern === 'sidebar-left' && 'Left Sidebar Layout'}
                {displaySpec.layoutPattern === 'sidebar-right' && 'Right Sidebar Layout'}
                {displaySpec.layoutPattern === 'top-nav' && 'Top Navigation Layout'}
                {displaySpec.layoutPattern === 'bottom-nav' && 'Bottom Navigation Layout'}
                {displaySpec.layoutPattern === 'no-nav' && 'No Navigation Layout'}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* Next Phase Button */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          {/* Status hint */}
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {isCustomized ? (
              <span className="text-green-600 dark:text-green-400">
                Shell customized - {displaySpec.navigationItems.length} nav items
              </span>
            ) : (
              <span>
                Using default layout (can be customized)
              </span>
            )}
          </div>

          {/* Next Phase Button - Always enabled since phase is optional */}
          <NextPhaseButton
            currentPhase="application-shell"
            canProceed={canProceed}
            onProceed={handleProceed}
          />
        </div>
      </div>
    </PhaseLayout>
  );
}
