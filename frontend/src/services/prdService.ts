import { supabase } from '@/lib/supabase'

// Legacy interfaces for backward compatibility
export interface PRDSection {
  vision?: string
  problem?: string
  targetUsers?: string
}

export interface PRDFeature {
  id?: string
  title: string
  description: string
  priority?: 'high' | 'medium' | 'low'
}

// New flexible section structure
export type SectionStatus = 'pending' | 'in_progress' | 'completed'
export type AgentType = 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper'

export interface FlexiblePRDSection {
  id: string
  title: string
  order: number
  agent: AgentType
  required: boolean
  content: Record<string, any>
  status: SectionStatus
  isCustom: boolean
  description?: string
}

export interface PRD {
  id?: string
  project_id: string
  user_id?: string
  title: string
  status: 'draft' | 'in_progress' | 'review' | 'finalized' | 'archived'
  // Legacy fields (may be null for new PRDs)
  overview?: PRDSection
  core_features?: PRDFeature[]
  additional_features?: PRDFeature[]
  technical_requirements?: {
    platforms?: string[]
    performance?: string
    security?: string
    integrations?: string[]
  }
  success_metrics?: {
    kpis?: Array<{
      metric: string
      target: string
      timeframe?: string
    }>
    milestones?: string[]
  }
  // New flexible structure
  sections?: FlexiblePRDSection[]
  completion_percentage?: number
  last_section_completed?: string
  created_at?: string
  updated_at?: string
  finalized_at?: string
}

class PRDService {
  private autoSaveTimeout: NodeJS.Timeout | null = null
  private autoSaveDelay = 1500 // 1.5 seconds

  async getPRDByProject(projectId: string): Promise<{ prd: PRD | null; error: any }> {
    try {
      const { data, error } = await supabase
        .from('prds')
        .select('*')
        .eq('project_id', projectId)
        .single()

      if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        throw error
      }

      return { prd: data as PRD | null, error: null }
    } catch (error) {
      console.error('Error fetching PRD:', error)
      return { prd: null, error }
    }
  }

  async createPRD(projectId: string, initialData?: Partial<PRD>): Promise<{ prd: PRD | null; error: any }> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('User not authenticated')

      // The backend will automatically initialize default sections
      const newPRD = {
        project_id: projectId,
        user_id: user.id,
        title: initialData?.title || 'Product Requirements Document',
        status: 'draft',
        completion_percentage: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }

      const { data, error } = await supabase
        .from('prds')
        .insert(newPRD)
        .select()
        .single()

      if (error) throw error

      return { prd: data as PRD, error: null }
    } catch (error) {
      console.error('Error creating PRD:', error)
      return { prd: null, error }
    }
  }

  async updatePRD(prdId: string, updates: Partial<PRD>): Promise<{ prd: PRD | null; error: any }> {
    try {
      // If sections are being updated, use the edge function for proper handling
      if (updates.sections && updates.sections.length > 0) {
        // Update each modified section through the edge function
        for (const section of updates.sections) {
          if (section.content && Object.keys(section.content).length > 0) {
            const { data, error } = await supabase.functions.invoke('prd-management', {
              body: {
                action: 'updateSection',
                prdId,
                sectionId: section.id,
                data: section.content
              }
            })
            
            if (error) {
              console.error(`Failed to update section ${section.id}:`, error)
            }
          }
        }
        
        // Fetch updated PRD
        const { data: updatedPRD, error: fetchError } = await supabase
          .from('prds')
          .select('*')
          .eq('id', prdId)
          .single()
          
        if (fetchError) throw fetchError
        
        return { prd: updatedPRD as PRD, error: null }
      }
      
      // For non-section updates, proceed with normal update
      const completionPercentage = this.calculateCompletion({
        ...updates
      } as PRD)

      const updateData = {
        ...updates,
        completion_percentage: completionPercentage,
        updated_at: new Date().toISOString()
      }

      // Update status based on completion
      if (completionPercentage === 100 && updateData.status === 'draft') {
        updateData.status = 'review'
      } else if (completionPercentage > 0 && updateData.status === 'draft') {
        updateData.status = 'in_progress'
      }

      const { data, error } = await supabase
        .from('prds')
        .update(updateData)
        .eq('id', prdId)
        .select()
        .single()

      if (error) throw error

      return { prd: data as PRD, error: null }
    } catch (error) {
      console.error('Error updating PRD:', error)
      return { prd: null, error }
    }
  }

  async autoSavePRD(prdId: string, updates: Partial<PRD>): Promise<void> {
    // Clear existing timeout
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout)
    }

    // Set new timeout for auto-save
    this.autoSaveTimeout = setTimeout(async () => {
      await this.updatePRD(prdId, updates)
      console.log('PRD auto-saved')
    }, this.autoSaveDelay)
  }

  async finalizePRD(prdId: string): Promise<{ prd: PRD | null; error: any }> {
    try {
      const { data, error } = await supabase
        .from('prds')
        .update({
          status: 'finalized',
          finalized_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', prdId)
        .select()
        .single()

      if (error) throw error

      return { prd: data as PRD, error: null }
    } catch (error) {
      console.error('Error finalizing PRD:', error)
      return { prd: null, error }
    }
  }

  calculateCompletion(prd: PRD): number {
    // Use flexible sections if available
    if (prd.sections && prd.sections.length > 0) {
      const requiredSections = prd.sections.filter(s => s.required)
      if (requiredSections.length === 0) return 0
      
      const completedRequired = requiredSections.filter(s => s.status === 'completed')
      return Math.round((completedRequired.length / requiredSections.length) * 100)
    }
    
    // Fallback to legacy calculation
    let completion = 0
    
    // Overview (20%)
    if (prd.overview?.vision && prd.overview?.problem && prd.overview?.targetUsers) {
      completion += 20
    }
    
    // Core features (30%)
    if (Array.isArray(prd.core_features) && prd.core_features.length >= 3) {
      completion += 30
    }
    
    // Additional features (20%)
    if (Array.isArray(prd.additional_features) && prd.additional_features.length > 0) {
      completion += 20
    }
    
    // Technical requirements (15%)
    if (prd.technical_requirements?.platforms && prd.technical_requirements.platforms.length > 0) {
      completion += 15
    }
    
    // Success metrics (15%)
    if (prd.success_metrics?.kpis && Array.isArray(prd.success_metrics.kpis) && prd.success_metrics.kpis.length > 0) {
      completion += 15
    }
    
    return completion
  }

  exportToMarkdown(prd: PRD): string {
    let markdown = `# ${prd.title}\n\n`
    markdown += `**Status:** ${prd.status}\n`
    markdown += `**Completion:** ${prd.completion_percentage}%\n\n`

    // Use flexible sections if available
    if (prd.sections && prd.sections.length > 0) {
      const sortedSections = [...prd.sections].sort((a, b) => a.order - b.order)
      
      sortedSections.forEach(section => {
        markdown += `## ${section.title}\n\n`
        markdown += `**Agent:** ${section.agent}\n`
        markdown += `**Status:** ${section.status}\n`
        if (section.description) {
          markdown += `**Description:** ${section.description}\n`
        }
        markdown += `\n`
        
        // Render section content based on structure
        if (section.content) {
          switch (section.id) {
            case 'overview':
              if (section.content.vision) {
                markdown += `### Vision\n${section.content.vision}\n\n`
              }
              if (section.content.problem) {
                markdown += `### Problem Statement\n${section.content.problem}\n\n`
              }
              if (section.content.targetUsers && Array.isArray(section.content.targetUsers)) {
                markdown += `### Target Users\n`
                section.content.targetUsers.forEach((user: string) => {
                  markdown += `- ${user}\n`
                })
                markdown += `\n`
              }
              break
              
            case 'core_features':
            case 'additional_features':
              if (section.content.features && Array.isArray(section.content.features)) {
                section.content.features.forEach((feature: any, index: number) => {
                  markdown += `### ${index + 1}. ${feature.title || feature.name || 'Feature'}\n`
                  markdown += `${feature.description || ''}\n\n`
                })
              }
              break
              
            case 'technical_architecture':
              if (section.content.platforms && Array.isArray(section.content.platforms)) {
                markdown += `### Platforms\n`
                section.content.platforms.forEach((platform: string) => {
                  markdown += `- ${platform}\n`
                })
                markdown += `\n`
              }
              if (section.content.techStack) {
                markdown += `### Technology Stack\n`
                if (section.content.techStack.frontend?.length > 0) {
                  markdown += `**Frontend:**\n`
                  section.content.techStack.frontend.forEach((tech: string) => {
                    markdown += `- ${tech}\n`
                  })
                }
                if (section.content.techStack.backend?.length > 0) {
                  markdown += `**Backend:**\n`
                  section.content.techStack.backend.forEach((tech: string) => {
                    markdown += `- ${tech}\n`
                  })
                }
                markdown += `\n`
              }
              break
              
            default:
              // For other sections, output as JSON or text
              if (typeof section.content === 'string') {
                markdown += section.content + '\n\n'
              } else {
                markdown += `\`\`\`json\n${JSON.stringify(section.content, null, 2)}\n\`\`\`\n\n`
              }
          }
        }
      })
    } else {
      // Fallback to legacy format
      // Overview
      if (prd.overview) {
        markdown += `## Overview\n\n`
        if (prd.overview.vision) {
          markdown += `### Vision\n${prd.overview.vision}\n\n`
        }
        if (prd.overview.problem) {
          markdown += `### Problem Statement\n${prd.overview.problem}\n\n`
        }
        if (prd.overview.targetUsers) {
          markdown += `### Target Users\n${prd.overview.targetUsers}\n\n`
        }
      }

      // Core Features
      if (prd.core_features && prd.core_features.length > 0) {
        markdown += `## Core Features\n\n`
        prd.core_features.forEach((feature, index) => {
          markdown += `### ${index + 1}. ${feature.title}\n`
          markdown += `${feature.description}\n\n`
        })
      }

      // Additional Features
      if (prd.additional_features && prd.additional_features.length > 0) {
        markdown += `## Additional Features\n\n`
        prd.additional_features.forEach((feature, index) => {
          markdown += `### ${index + 1}. ${feature.title}\n`
          markdown += `${feature.description}\n\n`
        })
      }

      // Technical Requirements
      if (prd.technical_requirements) {
        markdown += `## Technical Requirements\n\n`
        if (prd.technical_requirements.platforms) {
          markdown += `**Platforms:** ${prd.technical_requirements.platforms.join(', ')}\n\n`
        }
        if (prd.technical_requirements.performance) {
          markdown += `**Performance:** ${prd.technical_requirements.performance}\n\n`
        }
        if (prd.technical_requirements.integrations) {
          markdown += `**Integrations:** ${prd.technical_requirements.integrations.join(', ')}\n\n`
        }
      }

      // Success Metrics
      if (prd.success_metrics) {
        markdown += `## Success Metrics\n\n`
        if (prd.success_metrics.kpis && prd.success_metrics.kpis.length > 0) {
          markdown += `### Key Performance Indicators\n`
          prd.success_metrics.kpis.forEach(kpi => {
            markdown += `- **${kpi.metric}:** ${kpi.target}`
            if (kpi.timeframe) {
              markdown += ` (${kpi.timeframe})`
            }
            markdown += `\n`
          })
        }
      }
    }

    return markdown
  }

  cancelAutoSave(): void {
    if (this.autoSaveTimeout) {
      clearTimeout(this.autoSaveTimeout)
      this.autoSaveTimeout = null
    }
  }
}

export const prdService = new PRDService()