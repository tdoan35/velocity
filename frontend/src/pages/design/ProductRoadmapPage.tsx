/**
 * ProductRoadmapPage
 * Phase 2: Define product roadmap sections for incremental development
 */

import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PhaseLayout, NextPhaseButton, RoadmapEditor } from '../../components/design-phases';
import { useDesignPhaseStore } from '../../stores/useDesignPhaseStore';
import { DESIGN_PHASES } from '../../types/design-phases';
import type { RoadmapSection, ProductRoadmap } from '../../types/design-phases';
import { AlertCircle, Sparkles, Loader2 } from 'lucide-react';

const MIN_SECTIONS = 1;
const RECOMMENDED_MIN = 3;
const RECOMMENDED_MAX = 7;

export function ProductRoadmapPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    currentDesignPhase,
    isSaving,
    updateProductRoadmap,
    completePhase,
    createSectionsFromRoadmap,
  } = useDesignPhaseStore();

  // Local state for syncing indicator
  const [isSyncing, setIsSyncing] = useState(false);

  // Get current and next phase info
  const currentPhaseInfo = DESIGN_PHASES.find((p) => p.id === 'product-roadmap');
  const nextPhaseInfo = DESIGN_PHASES.find((p) => p.id === 'data-model');

  // Get existing roadmap data
  const productRoadmap = currentDesignPhase?.product_roadmap || null;
  const sections = productRoadmap?.sections || [];

  // Get product overview for AI suggestions
  const productOverview = currentDesignPhase?.product_overview || null;

  // Check if we can proceed to next phase
  // Requirement: at least 1 section with a title
  const canProceed = useMemo(() => {
    if (!productRoadmap || sections.length === 0) return false;
    return sections.some((s) => s.title.trim().length > 0);
  }, [productRoadmap, sections]);

  // Get reason why we can't proceed
  const proceedReason = useMemo(() => {
    if (!productRoadmap || sections.length === 0) {
      return 'Add at least one section to your roadmap';
    }

    const validSections = sections.filter((s) => s.title.trim().length > 0);
    if (validSections.length === 0) {
      return 'Add a title to at least one section';
    }

    return undefined;
  }, [productRoadmap, sections]);

  // Get recommendation message
  const recommendationMessage = useMemo(() => {
    const validCount = sections.filter((s) => s.title.trim().length > 0).length;

    if (validCount === 0) {
      return null;
    }

    if (validCount < RECOMMENDED_MIN) {
      return `You have ${validCount} section${validCount !== 1 ? 's' : ''}. Consider adding more (${RECOMMENDED_MIN}-${RECOMMENDED_MAX} recommended).`;
    }

    if (validCount > RECOMMENDED_MAX) {
      return `You have ${validCount} sections. Consider consolidating (${RECOMMENDED_MIN}-${RECOMMENDED_MAX} recommended).`;
    }

    return null;
  }, [sections]);

  // Handle roadmap changes - auto-save to database
  const handleRoadmapChange = useCallback(
    async (newSections: RoadmapSection[]) => {
      try {
        const roadmap: ProductRoadmap = { sections: newSections };
        await updateProductRoadmap(roadmap);
      } catch (error) {
        console.error('Failed to save roadmap:', error);
      }
    },
    [updateProductRoadmap]
  );

  // Handle proceed to next phase
  const handleProceed = useCallback(async () => {
    if (!projectId || !canProceed || !productRoadmap) return;

    try {
      // Sync sections to design_sections table
      setIsSyncing(true);
      await createSectionsFromRoadmap(productRoadmap);
      setIsSyncing(false);

      // Complete the phase
      await completePhase();
      navigate(`/project/${projectId}/design/${nextPhaseInfo?.route || 'data-model'}`);
    } catch (error) {
      setIsSyncing(false);
      console.error('Failed to complete phase:', error);
    }
  }, [projectId, canProceed, productRoadmap, completePhase, createSectionsFromRoadmap, navigate, nextPhaseInfo]);

  // Handle AI assist - will be connected to AI service later
  const handleAIAssist = useCallback(() => {
    // TODO: Implement AI assist functionality
    // This will suggest sections based on product overview
    console.log('AI Assist clicked - to be implemented');
    console.log('Product overview for context:', productOverview);
  }, [productOverview]);

  // AI suggestion placeholder component
  const AISuggestionHint = () => {
    if (!productOverview?.features?.length) return null;

    return (
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              AI Suggestion Available
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              You have {productOverview.features.length} feature{productOverview.features.length !== 1 ? 's' : ''} defined.
              Click the AI Assist button to generate section suggestions based on your product vision.
            </p>
          </div>
        </div>
      </div>
    );
  };

  return (
    <PhaseLayout onAIAssist={handleAIAssist}>
      {/* Phase Introduction */}
      <div className="mb-6">
        <p className="text-gray-600 dark:text-gray-400">
          Break down your product into sections for incremental development.
          Each section represents a feature area that can be designed and built independently.
        </p>
      </div>

      {/* AI Suggestion Hint */}
      <AISuggestionHint />

      {/* Roadmap Editor */}
      <RoadmapEditor
        sections={sections}
        onChange={handleRoadmapChange}
        disabled={isSaving || isSyncing}
      />

      {/* Recommendation Message */}
      {recommendationMessage && (
        <div className="mt-4 flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{recommendationMessage}</span>
        </div>
      )}

      {/* Next Phase Button */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          {/* Requirements hint */}
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {canProceed ? (
              <span className="text-green-600 dark:text-green-400">
                {isSyncing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Syncing sections...
                  </span>
                ) : (
                  'Ready to proceed to the next phase'
                )}
              </span>
            ) : (
              <span>
                {proceedReason || 'Complete all required fields to continue'}
              </span>
            )}
          </div>

          {/* Next Phase Button */}
          <NextPhaseButton
            currentPhase="product-roadmap"
            canProceed={canProceed && !isSyncing}
            onProceed={handleProceed}
            reason={proceedReason}
          />
        </div>
      </div>
    </PhaseLayout>
  );
}
