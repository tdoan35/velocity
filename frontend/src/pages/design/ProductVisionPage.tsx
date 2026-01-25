/**
 * ProductVisionPage
 * Phase 1: Define product name, description, problems, and features
 */

import React, { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { PhaseLayout, NextPhaseButton, ProductVisionForm } from '../../components/design-phases';
import { useDesignPhaseStore } from '../../stores/useDesignPhaseStore';
import { DESIGN_PHASES } from '../../types/design-phases';
import type { ProductOverview } from '../../types/design-phases';

export function ProductVisionPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    currentDesignPhase,
    isSaving,
    updateProductOverview,
    completePhase,
  } = useDesignPhaseStore();

  // Get current phase info
  const currentPhaseInfo = DESIGN_PHASES.find((p) => p.id === 'product-vision');
  const nextPhaseInfo = DESIGN_PHASES.find((p) => p.id === 'product-roadmap');

  // Get existing product overview data
  const productOverview = currentDesignPhase?.product_overview || null;

  // Check if we can proceed to next phase
  // Requirements: name, description, at least 1 problem, at least 1 feature
  const canProceed = useMemo(() => {
    if (!productOverview) return false;

    const hasName = productOverview.name?.trim().length > 0;
    const hasDescription = productOverview.description?.trim().length > 0;
    const hasProblems = productOverview.problems?.length > 0 &&
      productOverview.problems.some(
        (p) => p.problem.trim().length > 0 && p.solution.trim().length > 0
      );
    const hasFeatures = productOverview.features?.length > 0 &&
      productOverview.features.some((f) => f.title.trim().length > 0);

    return hasName && hasDescription && hasProblems && hasFeatures;
  }, [productOverview]);

  // Get reason why we can't proceed
  const proceedReason = useMemo(() => {
    if (!productOverview) {
      return 'Please fill in your product information';
    }

    const missing: string[] = [];

    if (!productOverview.name?.trim()) {
      missing.push('product name');
    }
    if (!productOverview.description?.trim()) {
      missing.push('product description');
    }
    if (
      !productOverview.problems?.length ||
      !productOverview.problems.some(
        (p) => p.problem.trim().length > 0 && p.solution.trim().length > 0
      )
    ) {
      missing.push('at least one problem/solution');
    }
    if (
      !productOverview.features?.length ||
      !productOverview.features.some((f) => f.title.trim().length > 0)
    ) {
      missing.push('at least one feature');
    }

    if (missing.length === 0) return undefined;

    return `Please add: ${missing.join(', ')}`;
  }, [productOverview]);

  // Handle form changes - auto-save to database
  const handleFormChange = useCallback(
    async (data: ProductOverview) => {
      try {
        await updateProductOverview(data);
      } catch (error) {
        console.error('Failed to save product overview:', error);
      }
    },
    [updateProductOverview]
  );

  // Handle proceed to next phase
  const handleProceed = useCallback(async () => {
    if (!projectId || !canProceed) return;

    try {
      await completePhase();
      navigate(`/project/${projectId}/design/${nextPhaseInfo?.route || 'product-roadmap'}`);
    } catch (error) {
      console.error('Failed to complete phase:', error);
    }
  }, [projectId, canProceed, completePhase, navigate, nextPhaseInfo]);

  // Handle AI assist - will be connected to AI service later
  const handleAIAssist = useCallback(() => {
    // TODO: Implement AI assist functionality
    // This will open a chat panel or modal with AI assistance
    // for generating problems/features from the description
    console.log('AI Assist clicked - to be implemented');
  }, []);

  return (
    <PhaseLayout onAIAssist={handleAIAssist}>
      {/* Form Section */}
      <ProductVisionForm
        initialData={productOverview}
        onChange={handleFormChange}
        disabled={isSaving}
      />

      {/* Next Phase Button */}
      <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          {/* Requirements hint */}
          <div className="text-sm text-gray-500 dark:text-gray-400">
            {canProceed ? (
              <span className="text-green-600 dark:text-green-400">
                Ready to proceed to the next phase
              </span>
            ) : (
              <span>
                Complete all required fields to continue
              </span>
            )}
          </div>

          {/* Next Phase Button */}
          <NextPhaseButton
            currentPhase="product-vision"
            canProceed={canProceed}
            onProceed={handleProceed}
            reason={proceedReason}
          />
        </div>
      </div>
    </PhaseLayout>
  );
}
