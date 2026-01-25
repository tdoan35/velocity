/**
 * DataModelPage
 * Phase 3: Define data model entities and relationships (Optional Phase)
 */

import React, { useCallback, useMemo } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { PhaseLayout, NextPhaseButton, DataModelEditor } from '../../components/design-phases';
import { useDesignPhaseStore } from '../../stores/useDesignPhaseStore';
import { DESIGN_PHASES } from '../../types/design-phases';
import type { DataModel } from '../../types/design-phases';
import { Info, SkipForward, Sparkles, Database } from 'lucide-react';

export function DataModelPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    currentDesignPhase,
    isSaving,
    updateDataModel,
    completePhase,
  } = useDesignPhaseStore();

  // Get current and next phase info
  const currentPhaseInfo = DESIGN_PHASES.find((p) => p.id === 'data-model');
  const nextPhaseInfo = DESIGN_PHASES.find((p) => p.id === 'design-system');

  // Get existing data model
  const dataModel = currentDesignPhase?.data_model || null;

  // Get product overview for AI suggestions
  const productOverview = currentDesignPhase?.product_overview || null;
  const productRoadmap = currentDesignPhase?.product_roadmap || null;

  // This phase is always optional - can proceed even without data
  const canProceed = true;

  // Get summary of what's defined
  const modelSummary = useMemo(() => {
    if (!dataModel) return null;

    const entityCount = dataModel.entities?.length || 0;
    const relationshipCount = dataModel.relationships?.length || 0;

    if (entityCount === 0) return null;

    return {
      entityCount,
      relationshipCount,
    };
  }, [dataModel]);

  // Handle data model changes - auto-save to database
  const handleDataModelChange = useCallback(
    async (data: DataModel) => {
      try {
        await updateDataModel(data);
      } catch (error) {
        console.error('Failed to save data model:', error);
      }
    },
    [updateDataModel]
  );

  // Handle proceed to next phase
  const handleProceed = useCallback(async () => {
    if (!projectId) return;

    try {
      await completePhase();
      navigate(`/project/${projectId}/design/${nextPhaseInfo?.route || 'design-system'}`);
    } catch (error) {
      console.error('Failed to complete phase:', error);
    }
  }, [projectId, completePhase, navigate, nextPhaseInfo]);

  // Handle skip phase (same as proceed but more explicit)
  const handleSkip = useCallback(async () => {
    if (!projectId) return;

    try {
      await completePhase();
      navigate(`/project/${projectId}/design/${nextPhaseInfo?.route || 'design-system'}`);
    } catch (error) {
      console.error('Failed to skip phase:', error);
    }
  }, [projectId, completePhase, navigate, nextPhaseInfo]);

  // Handle AI assist - will be connected to AI service later
  const handleAIAssist = useCallback(() => {
    // TODO: Implement AI assist functionality
    // This will suggest entities based on product overview and sections
    console.log('AI Assist clicked - to be implemented');
    console.log('Product overview for context:', productOverview);
    console.log('Product roadmap for context:', productRoadmap);
  }, [productOverview, productRoadmap]);

  // AI suggestion hint component
  const AISuggestionHint = () => {
    if (!productOverview?.features?.length && !productRoadmap?.sections?.length) return null;

    const contextItems: string[] = [];
    if (productOverview?.features?.length) {
      contextItems.push(`${productOverview.features.length} feature${productOverview.features.length !== 1 ? 's' : ''}`);
    }
    if (productRoadmap?.sections?.length) {
      contextItems.push(`${productRoadmap.sections.length} section${productRoadmap.sections.length !== 1 ? 's' : ''}`);
    }

    return (
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              AI Suggestion Available
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              You have {contextItems.join(' and ')} defined.
              Click the AI Assist button to generate entity suggestions based on your product vision.
            </p>
          </div>
        </div>
      </div>
    );
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
              Defining your data model is helpful for complex applications but not required.
              You can skip this phase and let the AI determine the data structure during code generation.
            </p>
            <button
              onClick={handleSkip}
              className="inline-flex items-center gap-1.5 mt-2 text-sm font-medium text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 transition-colors"
            >
              <SkipForward className="w-4 h-4" />
              Skip this phase
            </button>
          </div>
        </div>
      </div>

      {/* Phase Introduction */}
      <div className="mb-6">
        <p className="text-gray-600 dark:text-gray-400">
          Define the data entities and their relationships for your application.
          This helps ensure consistent data structures across your codebase.
        </p>
      </div>

      {/* AI Suggestion Hint */}
      <AISuggestionHint />

      {/* Data Model Editor */}
      <DataModelEditor
        dataModel={dataModel}
        onChange={handleDataModelChange}
        disabled={isSaving}
      />

      {/* Model Summary */}
      {modelSummary && (
        <div className="mt-4 flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
          <Database className="w-4 h-4" />
          <span>
            {modelSummary.entityCount} entit{modelSummary.entityCount !== 1 ? 'ies' : 'y'}
            {modelSummary.relationshipCount > 0 && (
              <>, {modelSummary.relationshipCount} relationship{modelSummary.relationshipCount !== 1 ? 's' : ''}</>
            )}
          </span>
        </div>
      )}

      {/* Next Phase Button */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          {/* Status hint */}
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {modelSummary ? (
              <span className="text-green-600 dark:text-green-400">
                Data model defined - ready to proceed
              </span>
            ) : (
              <span>
                No entities defined yet (optional)
              </span>
            )}
          </div>

          {/* Next Phase Button - Always enabled since phase is optional */}
          <NextPhaseButton
            currentPhase="data-model"
            canProceed={canProceed}
            onProceed={handleProceed}
          />
        </div>
      </div>
    </PhaseLayout>
  );
}
