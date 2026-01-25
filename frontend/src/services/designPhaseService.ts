/**
 * Supabase Service for Design Phases
 * Provides CRUD operations for design_phases and design_sections tables
 */

import { supabase } from '../lib/supabase';
import type {
  DesignPhase,
  DesignSection,
  CreateDesignPhaseRequest,
  UpdateDesignPhaseRequest,
  CreateDesignSectionRequest,
  UpdateDesignSectionRequest,
} from '../types/design-phases';

export const designPhaseService = {
  // ============================================================================
  // Design Phase Operations
  // ============================================================================

  /**
   * Get design phase by project ID
   */
  async getByProjectId(projectId: string): Promise<DesignPhase | null> {
    const { data, error } = await supabase
      .from('design_phases')
      .select('*')
      .eq('project_id', projectId)
      .single();

    if (error) {
      // Return null if no record exists (404 is expected for new projects)
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  },

  /**
   * Create a new design phase for a project
   */
  async create(request: CreateDesignPhaseRequest): Promise<DesignPhase> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('design_phases')
      .insert({
        ...request,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update an existing design phase
   */
  async update(
    id: string,
    request: UpdateDesignPhaseRequest
  ): Promise<DesignPhase> {
    const { data, error } = await supabase
      .from('design_phases')
      .update(request)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete a design phase (cascade deletes sections)
   */
  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('design_phases').delete().eq('id', id);

    if (error) throw error;
  },

  // ============================================================================
  // Design Section Operations
  // ============================================================================

  /**
   * Get all sections for a design phase, ordered by order_index
   */
  async getSectionsByPhaseId(designPhaseId: string): Promise<DesignSection[]> {
    const { data, error } = await supabase
      .from('design_sections')
      .select('*')
      .eq('design_phase_id', designPhaseId)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get all sections for a project, ordered by order_index
   */
  async getSectionsByProjectId(projectId: string): Promise<DesignSection[]> {
    const { data, error } = await supabase
      .from('design_sections')
      .select('*')
      .eq('project_id', projectId)
      .order('order_index', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get a single section by ID
   */
  async getSectionById(id: string): Promise<DesignSection | null> {
    const { data, error } = await supabase
      .from('design_sections')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throw error;
    }

    return data;
  },

  /**
   * Create a new design section
   */
  async createSection(
    request: CreateDesignSectionRequest
  ): Promise<DesignSection> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const { data, error } = await supabase
      .from('design_sections')
      .insert({
        ...request,
        user_id: user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Update an existing design section
   */
  async updateSection(
    id: string,
    request: UpdateDesignSectionRequest
  ): Promise<DesignSection> {
    const { data, error } = await supabase
      .from('design_sections')
      .update(request)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  /**
   * Delete a design section
   */
  async deleteSection(id: string): Promise<void> {
    const { error } = await supabase
      .from('design_sections')
      .delete()
      .eq('id', id);

    if (error) throw error;
  },

  /**
   * Bulk create sections (useful when creating from roadmap)
   */
  async bulkCreateSections(
    requests: CreateDesignSectionRequest[]
  ): Promise<DesignSection[]> {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not authenticated');

    const sectionsWithUserId = requests.map((req) => ({
      ...req,
      user_id: user.id,
    }));

    const { data, error } = await supabase
      .from('design_sections')
      .insert(sectionsWithUserId)
      .select();

    if (error) throw error;
    return data || [];
  },
};
