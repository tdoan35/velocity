/**
 * Zustand Store for Design Phases
 * Manages state for the 7-phase design workflow
 */

import { create } from 'zustand';
import { devtools, subscribeWithSelector } from 'zustand/middleware';
import { toast } from 'sonner';
import { designPhaseService } from '../services/designPhaseService';
import type {
  DesignPhase,
  DesignSection,
  PhaseName,
  CreateDesignPhaseRequest,
  UpdateDesignPhaseRequest,
  CreateDesignSectionRequest,
  UpdateDesignSectionRequest,
  ProductOverview,
  ProductRoadmap,
  DataModel,
  DesignSystem,
  ShellSpec,
} from '../types/design-phases';

// ============================================================================
// Store State Interface
// ============================================================================

interface DesignPhaseState {
  // Current data
  currentDesignPhase: DesignPhase | null;
  sections: DesignSection[];
  currentSection: DesignSection | null;

  // Loading states
  isLoading: boolean;
  isSaving: boolean;
  isLoadingSections: boolean;

  // Error state
  error: string | null;

  // ============================================================================
  // Design Phase Actions
  // ============================================================================

  /**
   * Load design phase by project ID
   */
  loadDesignPhase: (projectId: string) => Promise<void>;

  /**
   * Create a new design phase for a project
   */
  createDesignPhase: (request: CreateDesignPhaseRequest) => Promise<void>;

  /**
   * Update the current design phase
   */
  updateDesignPhase: (updates: UpdateDesignPhaseRequest) => Promise<void>;

  /**
   * Delete the current design phase
   */
  deleteDesignPhase: () => Promise<void>;

  /**
   * Navigate to a specific phase
   */
  goToPhase: (phase: PhaseName) => Promise<void>;

  /**
   * Mark current phase as complete and move to next
   */
  completePhase: () => Promise<void>;

  // ============================================================================
  // Phase-Specific Update Actions
  // ============================================================================

  updateProductOverview: (overview: ProductOverview) => Promise<void>;
  updateProductRoadmap: (roadmap: ProductRoadmap) => Promise<void>;
  updateDataModel: (model: DataModel) => Promise<void>;
  updateDesignSystem: (system: DesignSystem) => Promise<void>;
  updateShellSpec: (spec: ShellSpec) => Promise<void>;

  // ============================================================================
  // Section Actions
  // ============================================================================

  /**
   * Load all sections for the current design phase
   */
  loadSections: () => Promise<void>;

  /**
   * Set the current section being edited
   */
  setCurrentSection: (section: DesignSection | null) => void;

  /**
   * Create a new section
   */
  createSection: (request: CreateDesignSectionRequest) => Promise<void>;

  /**
   * Update a section
   */
  updateSection: (id: string, updates: UpdateDesignSectionRequest) => Promise<void>;

  /**
   * Delete a section
   */
  deleteSection: (id: string) => Promise<void>;

  /**
   * Bulk create sections (from roadmap)
   */
  createSectionsFromRoadmap: (roadmap: ProductRoadmap) => Promise<void>;

  // ============================================================================
  // Utility Actions
  // ============================================================================

  /**
   * Reset store to initial state
   */
  reset: () => void;

  /**
   * Set error state
   */
  setError: (error: string | null) => void;

  /**
   * Clear error state
   */
  clearError: () => void;
}

// ============================================================================
// Phase Navigation Helper
// ============================================================================

const PHASE_ORDER: PhaseName[] = [
  'product-vision',
  'product-roadmap',
  'data-model',
  'design-system',
  'application-shell',
  'section-details',
  'export',
];

function getNextPhase(currentPhase: PhaseName): PhaseName | null {
  const currentIndex = PHASE_ORDER.indexOf(currentPhase);
  if (currentIndex === -1 || currentIndex === PHASE_ORDER.length - 1) {
    return null;
  }
  return PHASE_ORDER[currentIndex + 1];
}

// ============================================================================
// Store Implementation
// ============================================================================

export const useDesignPhaseStore = create<DesignPhaseState>()(
  devtools(
    subscribeWithSelector((set, get) => ({
      // Initial state
      currentDesignPhase: null,
      sections: [],
      currentSection: null,
      isLoading: false,
      isSaving: false,
      isLoadingSections: false,
      error: null,

      // ============================================================================
      // Design Phase Actions
      // ============================================================================

      loadDesignPhase: async (projectId: string) => {
        set({ isLoading: true, error: null });

        try {
          const designPhase = await designPhaseService.getByProjectId(projectId);
          set({ currentDesignPhase: designPhase, isLoading: false });

          // If design phase exists, load sections
          if (designPhase) {
            await get().loadSections();
          }
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to load design phase';
          set({ error: errorMessage, isLoading: false });
          toast.error(errorMessage);
        }
      },

      createDesignPhase: async (request: CreateDesignPhaseRequest) => {
        set({ isSaving: true, error: null });

        try {
          const designPhase = await designPhaseService.create(request);
          set({ currentDesignPhase: designPhase, isSaving: false });
          toast.success('Design phase created');
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to create design phase';
          set({ error: errorMessage, isSaving: false });
          toast.error(errorMessage);
          throw error;
        }
      },

      updateDesignPhase: async (updates: UpdateDesignPhaseRequest) => {
        const { currentDesignPhase } = get();
        if (!currentDesignPhase) {
          toast.error('No design phase loaded');
          return;
        }

        set({ isSaving: true, error: null });

        try {
          const updated = await designPhaseService.update(
            currentDesignPhase.id,
            updates
          );
          set({ currentDesignPhase: updated, isSaving: false });
          toast.success('Design phase updated');
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to update design phase';
          set({ error: errorMessage, isSaving: false });
          toast.error(errorMessage);
          throw error;
        }
      },

      deleteDesignPhase: async () => {
        const { currentDesignPhase } = get();
        if (!currentDesignPhase) {
          toast.error('No design phase loaded');
          return;
        }

        set({ isSaving: true, error: null });

        try {
          await designPhaseService.delete(currentDesignPhase.id);
          set({
            currentDesignPhase: null,
            sections: [],
            currentSection: null,
            isSaving: false,
          });
          toast.success('Design phase deleted');
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to delete design phase';
          set({ error: errorMessage, isSaving: false });
          toast.error(errorMessage);
          throw error;
        }
      },

      goToPhase: async (phase: PhaseName) => {
        const { currentDesignPhase, updateDesignPhase } = get();
        if (!currentDesignPhase) {
          toast.error('No design phase loaded');
          return;
        }

        await updateDesignPhase({ current_phase: phase });
      },

      completePhase: async () => {
        const { currentDesignPhase, updateDesignPhase } = get();
        if (!currentDesignPhase) {
          toast.error('No design phase loaded');
          return;
        }

        const nextPhase = getNextPhase(currentDesignPhase.current_phase);
        if (!nextPhase) {
          toast.info('Already at the final phase');
          return;
        }

        // Add current phase to completed list if not already there
        const phasesCompleted = currentDesignPhase.phases_completed.includes(
          currentDesignPhase.current_phase
        )
          ? currentDesignPhase.phases_completed
          : [...currentDesignPhase.phases_completed, currentDesignPhase.current_phase];

        await updateDesignPhase({
          current_phase: nextPhase,
          phases_completed: phasesCompleted,
        });

        toast.success(`Moved to ${nextPhase} phase`);
      },

      // ============================================================================
      // Phase-Specific Update Actions
      // ============================================================================

      updateProductOverview: async (overview: ProductOverview) => {
        await get().updateDesignPhase({ product_overview: overview });
      },

      updateProductRoadmap: async (roadmap: ProductRoadmap) => {
        await get().updateDesignPhase({ product_roadmap: roadmap });
      },

      updateDataModel: async (model: DataModel) => {
        await get().updateDesignPhase({ data_model: model });
      },

      updateDesignSystem: async (system: DesignSystem) => {
        await get().updateDesignPhase({ design_system: system });
      },

      updateShellSpec: async (spec: ShellSpec) => {
        await get().updateDesignPhase({ shell_spec: spec });
      },

      // ============================================================================
      // Section Actions
      // ============================================================================

      loadSections: async () => {
        const { currentDesignPhase } = get();
        if (!currentDesignPhase) {
          return;
        }

        set({ isLoadingSections: true, error: null });

        try {
          const sections = await designPhaseService.getSectionsByPhaseId(
            currentDesignPhase.id
          );
          set({ sections, isLoadingSections: false });
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to load sections';
          set({ error: errorMessage, isLoadingSections: false });
          toast.error(errorMessage);
        }
      },

      setCurrentSection: (section: DesignSection | null) => {
        set({ currentSection: section });
      },

      createSection: async (request: CreateDesignSectionRequest) => {
        set({ isSaving: true, error: null });

        try {
          const section = await designPhaseService.createSection(request);
          set((state) => ({
            sections: [...state.sections, section].sort(
              (a, b) => a.order_index - b.order_index
            ),
            isSaving: false,
          }));
          toast.success('Section created');
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to create section';
          set({ error: errorMessage, isSaving: false });
          toast.error(errorMessage);
          throw error;
        }
      },

      updateSection: async (id: string, updates: UpdateDesignSectionRequest) => {
        set({ isSaving: true, error: null });

        try {
          const updated = await designPhaseService.updateSection(id, updates);
          set((state) => ({
            sections: state.sections.map((s) => (s.id === id ? updated : s)),
            currentSection:
              state.currentSection?.id === id ? updated : state.currentSection,
            isSaving: false,
          }));
          toast.success('Section updated');
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to update section';
          set({ error: errorMessage, isSaving: false });
          toast.error(errorMessage);
          throw error;
        }
      },

      deleteSection: async (id: string) => {
        set({ isSaving: true, error: null });

        try {
          await designPhaseService.deleteSection(id);
          set((state) => ({
            sections: state.sections.filter((s) => s.id !== id),
            currentSection:
              state.currentSection?.id === id ? null : state.currentSection,
            isSaving: false,
          }));
          toast.success('Section deleted');
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to delete section';
          set({ error: errorMessage, isSaving: false });
          toast.error(errorMessage);
          throw error;
        }
      },

      createSectionsFromRoadmap: async (roadmap: ProductRoadmap) => {
        const { currentDesignPhase } = get();
        if (!currentDesignPhase) {
          toast.error('No design phase loaded');
          return;
        }

        set({ isSaving: true, error: null });

        try {
          const requests: CreateDesignSectionRequest[] = roadmap.sections.map(
            (section) => ({
              design_phase_id: currentDesignPhase.id,
              project_id: currentDesignPhase.project_id,
              section_id: section.id,
              title: section.title,
              description: section.description,
              order_index: section.order,
            })
          );

          const sections = await designPhaseService.bulkCreateSections(requests);
          set({ sections, isSaving: false });
          toast.success(`Created ${sections.length} sections from roadmap`);
        } catch (error: any) {
          const errorMessage = error.message || 'Failed to create sections';
          set({ error: errorMessage, isSaving: false });
          toast.error(errorMessage);
          throw error;
        }
      },

      // ============================================================================
      // Utility Actions
      // ============================================================================

      reset: () => {
        set({
          currentDesignPhase: null,
          sections: [],
          currentSection: null,
          isLoading: false,
          isSaving: false,
          isLoadingSections: false,
          error: null,
        });
      },

      setError: (error: string | null) => {
        set({ error });
      },

      clearError: () => {
        set({ error: null });
      },
    })),
    {
      name: 'design-phase-store',
    }
  )
);

// ============================================================================
// Convenience Hooks
// ============================================================================

/**
 * Hook for design phase operations
 */
export const useDesignPhase = () => {
  const store = useDesignPhaseStore();
  return {
    currentDesignPhase: store.currentDesignPhase,
    isLoading: store.isLoading,
    isSaving: store.isSaving,
    error: store.error,
    loadDesignPhase: store.loadDesignPhase,
    createDesignPhase: store.createDesignPhase,
    updateDesignPhase: store.updateDesignPhase,
    deleteDesignPhase: store.deleteDesignPhase,
    goToPhase: store.goToPhase,
    completePhase: store.completePhase,
    updateProductOverview: store.updateProductOverview,
    updateProductRoadmap: store.updateProductRoadmap,
    updateDataModel: store.updateDataModel,
    updateDesignSystem: store.updateDesignSystem,
    updateShellSpec: store.updateShellSpec,
    reset: store.reset,
    clearError: store.clearError,
  };
};

/**
 * Hook for section operations
 */
export const useDesignSections = () => {
  const store = useDesignPhaseStore();
  return {
    sections: store.sections,
    currentSection: store.currentSection,
    isLoadingSections: store.isLoadingSections,
    isSaving: store.isSaving,
    error: store.error,
    loadSections: store.loadSections,
    setCurrentSection: store.setCurrentSection,
    createSection: store.createSection,
    updateSection: store.updateSection,
    deleteSection: store.deleteSection,
    createSectionsFromRoadmap: store.createSectionsFromRoadmap,
    clearError: store.clearError,
  };
};
