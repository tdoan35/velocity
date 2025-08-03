import { supabase } from '../lib/supabase'
import type { Project } from '../types/store'

export interface CreateProjectData {
  name: string
  description?: string
  initialPrompt: string
  template?: string
}

export interface ProjectResponse {
  project: Project | null
  error: Error | null
}

export const projectService = {
  async createProject(data: CreateProjectData): Promise<{ project: any | null; error: Error | null }> {
    try {
      // Get current user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        return { project: null, error: new Error('User not authenticated') }
      }

      // First, insert without select to avoid RLS recursion
      const { error: insertError } = await supabase
        .from('projects')
        .insert({
          name: data.name,
          description: data.description || '',
          owner_id: user.id,
          team_id: null, // Explicitly set to null to avoid RLS issues
          app_config: {
            initialPrompt: data.initialPrompt,
            createdFrom: 'homepage'
          },
          template_type: data.template || 'blank',
          status: 'active',
          is_public: false,
          is_template: false
        })

      if (insertError) {
        console.error('Error creating project:', insertError)
        return { project: null, error: insertError as Error }
      }

      // Then fetch the created project
      const { data: projects, error: selectError } = await supabase
        .from('projects')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)

      if (selectError || !projects || projects.length === 0) {
        console.error('Error fetching created project:', selectError)
        return { project: null, error: selectError as Error || new Error('Project not found') }
      }

      return { project: projects[0], error: null }
    } catch (error) {
      console.error('Unexpected error creating project:', error)
      return { project: null, error: error as Error }
    }
  },

  async getProject(projectId: string): Promise<{ project: any | null; error: Error | null }> {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .select('*')
        .eq('id', projectId)
        .single()

      if (error) {
        console.error('Error fetching project:', error)
        return { project: null, error: error as Error }
      }

      return { project, error: null }
    } catch (error) {
      console.error('Unexpected error fetching project:', error)
      return { project: null, error: error as Error }
    }
  },

  async updateProject(projectId: string, updates: Partial<Project>): Promise<{ project: any | null; error: Error | null }> {
    try {
      const { data: project, error } = await supabase
        .from('projects')
        .update({
          ...updates,
          updated_at: new Date().toISOString()
        })
        .eq('id', projectId)
        .select()
        .single()

      if (error) {
        console.error('Error updating project:', error)
        return { project: null, error: error as Error }
      }

      return { project, error: null }
    } catch (error) {
      console.error('Unexpected error updating project:', error)
      return { project: null, error: error as Error }
    }
  },

  async getUserProjects(): Promise<{ projects: any[] | null; error: Error | null }> {
    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        return { projects: null, error: new Error('User not authenticated') }
      }

      const { data: projects, error } = await supabase
        .from('projects')
        .select('*')
        .eq('owner_id', user.id)
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching projects:', error)
        return { projects: null, error: error as Error }
      }

      return { projects, error: null }
    } catch (error) {
      console.error('Unexpected error fetching projects:', error)
      return { projects: null, error: error as Error }
    }
  }
}