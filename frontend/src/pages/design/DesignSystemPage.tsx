/**
 * DesignSystemPage
 * Phase 4: Select design tokens - colors and typography (Optional Phase)
 */

import React, { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  PhaseLayout,
  NextPhaseButton,
  ColorPicker,
  TypographyPicker,
} from '../../components/design-phases';
import { useDesignPhaseStore } from '../../stores/useDesignPhaseStore';
import { DESIGN_PHASES } from '../../types/design-phases';
import type { DesignSystem, ColorDefinition, TypographyDefinition } from '../../types/design-phases';
import { Info, SkipForward, Sparkles, Palette, Type } from 'lucide-react';

// Default design system values
const DEFAULT_DESIGN_SYSTEM: DesignSystem = {
  colors: {
    primary: { name: 'blue-600', value: '#2563eb' },
    secondary: { name: 'slate-600', value: '#475569' },
    neutral: { name: 'stone-500', value: '#78716c' },
    accent: { name: 'amber-500', value: '#f59e0b' },
  },
  typography: {
    heading: { family: 'Inter', weights: [500, 600, 700] },
    body: { family: 'Inter', weights: [400, 500] },
    mono: { family: 'JetBrains Mono', weights: [400, 500] },
  },
};

export function DesignSystemPage() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const {
    currentDesignPhase,
    isSaving,
    updateDesignSystem,
    completePhase,
  } = useDesignPhaseStore();

  // Get current and next phase info
  const currentPhaseInfo = DESIGN_PHASES.find((p) => p.id === 'design-system');
  const nextPhaseInfo = DESIGN_PHASES.find((p) => p.id === 'application-shell');

  // Get existing design system or use defaults for display
  const designSystem = currentDesignPhase?.design_system || null;
  const displaySystem = designSystem || DEFAULT_DESIGN_SYSTEM;

  // This phase is always optional - can proceed even without data
  const canProceed = true;

  // Check if design system has been customized
  const isCustomized = useMemo(() => {
    if (!designSystem) return false;
    return (
      designSystem.colors?.primary?.name !== DEFAULT_DESIGN_SYSTEM.colors.primary.name ||
      designSystem.typography?.heading?.family !== DEFAULT_DESIGN_SYSTEM.typography.heading.family
    );
  }, [designSystem]);

  // Handle color change
  const handleColorChange = useCallback(
    async (key: 'primary' | 'secondary' | 'neutral' | 'accent', color: ColorDefinition) => {
      try {
        const newSystem: DesignSystem = {
          colors: {
            ...displaySystem.colors,
            [key]: color,
          },
          typography: displaySystem.typography,
        };
        await updateDesignSystem(newSystem);
      } catch (error) {
        console.error('Failed to save design system:', error);
      }
    },
    [displaySystem, updateDesignSystem]
  );

  // Handle typography change
  const handleTypographyChange = useCallback(
    async (key: 'heading' | 'body' | 'mono', font: TypographyDefinition) => {
      try {
        const newSystem: DesignSystem = {
          colors: displaySystem.colors,
          typography: {
            ...displaySystem.typography,
            [key]: font,
          },
        };
        await updateDesignSystem(newSystem);
      } catch (error) {
        console.error('Failed to save design system:', error);
      }
    },
    [displaySystem, updateDesignSystem]
  );

  // Handle proceed to next phase
  const handleProceed = useCallback(async () => {
    if (!projectId) return;

    try {
      // If no design system set, save defaults
      if (!designSystem) {
        await updateDesignSystem(DEFAULT_DESIGN_SYSTEM);
      }
      await completePhase();
      navigate(`/project/${projectId}/design/${nextPhaseInfo?.route || 'application-shell'}`);
    } catch (error) {
      console.error('Failed to complete phase:', error);
    }
  }, [projectId, designSystem, updateDesignSystem, completePhase, navigate, nextPhaseInfo]);

  // Handle skip phase
  const handleSkip = useCallback(async () => {
    if (!projectId) return;

    try {
      // Save defaults when skipping
      await updateDesignSystem(DEFAULT_DESIGN_SYSTEM);
      await completePhase();
      navigate(`/project/${projectId}/design/${nextPhaseInfo?.route || 'application-shell'}`);
    } catch (error) {
      console.error('Failed to skip phase:', error);
    }
  }, [projectId, updateDesignSystem, completePhase, navigate, nextPhaseInfo]);

  // Handle AI assist
  const handleAIAssist = useCallback(() => {
    // TODO: Implement AI assist for color harmony suggestions
    console.log('AI Assist clicked - to be implemented');
    console.log('Current design system:', displaySystem);
  }, [displaySystem]);

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
              Customize your app's visual identity with colors and typography.
              Skip to use sensible defaults (Tailwind Blue + Inter font).
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
          Define the visual language for your application. These tokens will be used
          consistently throughout your generated code.
        </p>
      </div>

      {/* AI Suggestion Hint */}
      <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
              AI Color Harmony
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
              Click the AI Assist button to get color palette suggestions based on
              your primary color selection.
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Colors Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Palette className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Color Palette
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ColorPicker
              label="Primary Color"
              value={displaySystem.colors.primary}
              onChange={(color) => handleColorChange('primary', color)}
              disabled={isSaving}
            />
            <ColorPicker
              label="Secondary Color"
              value={displaySystem.colors.secondary}
              onChange={(color) => handleColorChange('secondary', color)}
              disabled={isSaving}
            />
            <ColorPicker
              label="Neutral Color"
              value={displaySystem.colors.neutral}
              onChange={(color) => handleColorChange('neutral', color)}
              disabled={isSaving}
            />
            <ColorPicker
              label="Accent Color"
              value={displaySystem.colors.accent}
              onChange={(color) => handleColorChange('accent', color)}
              disabled={isSaving}
            />
          </div>
        </section>

        {/* Typography Section */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Type className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Typography
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TypographyPicker
              label="Heading Font"
              value={displaySystem.typography.heading}
              onChange={(font) => handleTypographyChange('heading', font)}
              category="heading"
              disabled={isSaving}
            />
            <TypographyPicker
              label="Body Font"
              value={displaySystem.typography.body}
              onChange={(font) => handleTypographyChange('body', font)}
              category="body"
              disabled={isSaving}
            />
            <TypographyPicker
              label="Monospace Font"
              value={displaySystem.typography.mono}
              onChange={(font) => handleTypographyChange('mono', font)}
              category="mono"
              disabled={isSaving}
            />
          </div>
        </section>

        {/* Live Preview */}
        <section>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
            Preview
          </h3>

          <div className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800">
            {/* Sample Heading */}
            <h1
              className="text-2xl font-bold mb-2"
              style={{
                fontFamily: `"${displaySystem.typography.heading.family}", sans-serif`,
                color: displaySystem.colors.primary.value,
              }}
            >
              Sample Heading
            </h1>

            {/* Sample Body Text */}
            <p
              className="mb-4"
              style={{
                fontFamily: `"${displaySystem.typography.body.family}", sans-serif`,
                color: displaySystem.colors.neutral.value,
              }}
            >
              This is sample body text that shows how your content will look.
              The typography and colors you select will be applied consistently
              throughout your application.
            </p>

            {/* Sample Buttons */}
            <div className="flex flex-wrap gap-3 mb-4">
              <button
                className="px-4 py-2 rounded-lg text-white font-medium"
                style={{
                  backgroundColor: displaySystem.colors.primary.value,
                  fontFamily: `"${displaySystem.typography.body.family}", sans-serif`,
                }}
              >
                Primary Button
              </button>
              <button
                className="px-4 py-2 rounded-lg text-white font-medium"
                style={{
                  backgroundColor: displaySystem.colors.secondary.value,
                  fontFamily: `"${displaySystem.typography.body.family}", sans-serif`,
                }}
              >
                Secondary Button
              </button>
              <button
                className="px-4 py-2 rounded-lg text-white font-medium"
                style={{
                  backgroundColor: displaySystem.colors.accent.value,
                  fontFamily: `"${displaySystem.typography.body.family}", sans-serif`,
                }}
              >
                Accent Button
              </button>
            </div>

            {/* Sample Card */}
            <div
              className="p-4 rounded-lg border"
              style={{ borderColor: displaySystem.colors.neutral.value + '40' }}
            >
              <h3
                className="text-lg font-semibold mb-2"
                style={{
                  fontFamily: `"${displaySystem.typography.heading.family}", sans-serif`,
                  color: displaySystem.colors.secondary.value,
                }}
              >
                Sample Card
              </h3>
              <p
                className="text-sm mb-3"
                style={{
                  fontFamily: `"${displaySystem.typography.body.family}", sans-serif`,
                  color: displaySystem.colors.neutral.value,
                }}
              >
                Cards and containers will use your neutral colors for borders and text.
              </p>
              <code
                className="text-xs px-2 py-1 rounded"
                style={{
                  fontFamily: `"${displaySystem.typography.mono.family}", monospace`,
                  backgroundColor: displaySystem.colors.neutral.value + '20',
                  color: displaySystem.colors.secondary.value,
                }}
              >
                const example = "code preview";
              </code>
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
                Design system customized - ready to proceed
              </span>
            ) : (
              <span>
                Using default values (can be customized)
              </span>
            )}
          </div>

          {/* Next Phase Button - Always enabled since phase is optional */}
          <NextPhaseButton
            currentPhase="design-system"
            canProceed={canProceed}
            onProceed={handleProceed}
          />
        </div>
      </div>
    </PhaseLayout>
  );
}
