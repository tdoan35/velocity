import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, FileText, RefreshCw, Download, Save, PanelRight, CheckCircle2, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { prdService, type PRD, type FlexiblePRDSection } from '@/services/prdService'
import { useToast } from '@/hooks/use-toast'
import { SectionBlockEditor } from './blocks/SectionBlockEditor'
import { SectionBlockControls } from './blocks/SectionBlockControls'
import { supabase } from '@/lib/supabase'
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types'
import { PRDDndProvider, SortableSection, type SortableSectionRef } from './dnd'
import { PRDStatusBadge } from './components/PRDStatusBadge'
import { cn } from '@/lib/utils'
import { generateSectionId, isTemplateOrEmptyContent, markSectionAsNewlyCreated } from '@/utils/sectionUtils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface BlockNotionPRDEditorProps {
  projectId: string
}


// Section icons mapping
const sectionIcons: Record<string, string> = {
  overview: '📋',
  core_features: '✨',
  additional_features: '➕',
  ui_design_patterns: '🎨',
  ux_flows: '🔄',
  technical_architecture: '🏗️',
  tech_integrations: '🔌',
  custom: '📝'
}

// Get section type from FlexiblePRDSection
const getSectionType = (section: FlexiblePRDSection): string => {
  // Map section ID to type - using ID as a proxy for type
  const typeMap: Record<string, string> = {
    'overview': 'overview',
    'core_features': 'core_features',
    'additional_features': 'additional_features',
    'ui_design_patterns': 'ui_design_patterns',
    'ux_flows': 'ux_flows',
    'technical_architecture': 'technical_architecture',
    'tech_integrations': 'tech_integrations'
  }
  return typeMap[section.id] || 'custom'
}

export function BlockNotionPRDEditor({ projectId }: BlockNotionPRDEditorProps) {
  const [prd, setPRD] = useState<PRD | null>(null)
  const [sections, setSections] = useState<FlexiblePRDSection[]>([])
  const [, setSectionVirtualBlocks] = useState<Record<string, VirtualContentBlock[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTOC, setShowTOC] = useState(false)
  const [prdStatus, setPrdStatus] = useState<'draft' | 'in_progress' | 'review' | 'finalized' | 'archived'>('draft')
  const [completionPercentage, setCompletionPercentage] = useState(0)
  const [showResetDialog, setShowResetDialog] = useState(false)
  const { toast } = useToast()
  
  // Keep a ref to current sections to avoid dependency issues
  const sectionsRef = useRef<FlexiblePRDSection[]>([])
  
  // Track sections that are in creation process to prevent premature auto-saves
  const creatingSectionsRef = useRef<Set<string>>(new Set())
  
  // Ref for the sections container for SectionBlockControls
  const sectionsContainerRef = useRef<HTMLDivElement>(null)
  
  // Refs for each sortable section
  const sectionRefs = useRef<Record<string, SortableSectionRef | null>>({})
  

  // NEW: Add validation function for section ordering
  const validateSectionOrdering = useCallback((sections: FlexiblePRDSection[]) => {
    const sortedSections = [...sections].sort((a: FlexiblePRDSection, b: FlexiblePRDSection) => a.order - b.order)
    const hasOrderingIssues = sections.some((section, index) => 
      section.order !== sortedSections[index].order
    )
    
    if (hasOrderingIssues) {
      return sortedSections
    }
    
    return sections
  }, [])

  // Calculate completion percentage whenever sections change
  useEffect(() => {
    const completedSections = sections.filter(s => s.status === 'completed').length
    const totalSections = sections.length
    const percentage = totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0
    setCompletionPercentage(percentage)
  }, [sections])

  // Update ref whenever sections change
  useEffect(() => {
    sectionsRef.current = sections
  }, [sections])

  useEffect(() => {
    loadOrCreatePRD()
  }, [projectId])

  const loadOrCreatePRD = async () => {
    
    setIsLoading(true)
    setError(null)
    
    try {
      
      // Try to load existing PRD
      let { prd: existingPRD, error: loadError } = await prdService.getPRDByProject(projectId)
      
      if (loadError) {
        throw new Error(loadError.message || 'Failed to load PRD')
      }
      
      // If no PRD exists, create a new one
      if (!existingPRD) {
        const result = await prdService.createPRD(projectId)
        existingPRD = result.prd
        
        if (result.error) {
          throw new Error(result.error.message || 'Failed to create PRD')
        }
        
        toast({
          title: 'PRD Created',
          description: 'A new Product Requirements Document has been created for this project.',
        })
      } else {
      }
      
      setPRD(existingPRD)
      
      // Preserve sections that are currently being created
      const newSections = existingPRD?.sections || []
      setSections(prev => {
        const creatingSections = prev.filter(s => s.isCreating)
        const dbSections = newSections.filter(s => !creatingSections.some(creating => creating.id === s.id))
        
        // Preserve original titles for custom sections that might have been modified
        const preservedDbSections = dbSections.map(dbSection => {
          const existingSection = prev.find(s => s.id === dbSection.id && s.isCustom)
          if (existingSection && existingSection.title !== dbSection.title) {
            return { ...dbSection, title: existingSection.title }
          }
          return dbSection
        })
        
        
        return [...preservedDbSections, ...creatingSections]
      })
      
      setPrdStatus(existingPRD?.status || 'draft')
      
    } catch (err) {
      console.error('Error in loadOrCreatePRD:', err)
      const errorMessage = err instanceof Error ? err.message : 'Failed to load or create PRD'
      setError(errorMessage)
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRetry = () => {
    loadOrCreatePRD()
  }

  const handleResetToDefault = async () => {
    if (!prd?.id) return

    setIsSaving(true)
    
    try {
      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }
      
      // Reset PRD to default sections
      const { error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'resetToDefault',
          prdId: prd.id
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (error) throw error

      // Reload the PRD to get the fresh default sections  
      await loadOrCreatePRD()

      toast({
        title: 'PRD Reset',
        description: 'PRD has been reset to default template sections.',
      })

    } catch (error) {
      console.error('Failed to reset PRD:', error)
      toast({
        title: 'Reset failed',
        description: 'Failed to reset PRD. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSectionUpdate = useCallback(async (sectionId: string, content: { html: string; text: string }) => {
    if (!prd?.id) return

    // Simplified section creation protection with stable IDs
    const section = sectionsRef.current.find(s => s.id === sectionId)
    const isInCreationProcess = creatingSectionsRef.current.has(sectionId)
    
    
    // Skip save if section is still being created (much simpler logic)
    if (section?.isCreating || isInCreationProcess) {
      return
    }

    // Skip template content saves
    if (isTemplateOrEmptyContent(content)) {
      return
    }

    
    setIsSaving(true)
    
    try {
      // Update local state optimistically
      setSections(prev => {
        const updated = prev.map(section => 
          section.id === sectionId 
            ? { ...section, content, status: 'in_progress' as const }
            : section
        )
        return updated
      })

      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }
      
      // Save to backend using edge function
      const { data, error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'updateSection',
          prdId: prd.id,
          sectionId: sectionId,
          data: content
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (error) throw error

      // Update section status based on content (check if it's not just template)
      const hasRealContent = content.html && content.text && 
                            !content.html.includes('template-placeholder') && 
                            content.text.length > 20
      
      
      setSections(prev => {
        const updated = prev.map(section => 
          section.id === sectionId 
            ? { 
                ...section, 
                status: hasRealContent ? 'completed' as const : 'in_progress' as const 
              }
            : section
        )
        return updated
      })

      // Update PRD completion percentage if returned
      if (data?.completionPercentage !== undefined) {
        setPRD(prev => prev ? { ...prev, completion_percentage: data.completionPercentage } : prev)
      }

      toast({
        title: 'Section saved',
        description: 'Your changes have been saved successfully.',
      })

    } catch (error) {
      console.error(`Failed to save section ${sectionId}:`, error)
      
      // Check if this is a template content save attempt (which should be ignored)
      const isTemplateSave = isTemplateOrEmptyContent(content)
      
      // Also check if the failed section is being created
      const failedSection = sectionsRef.current.find(s => s.id === sectionId)
      const isSectionBeingCreated = failedSection?.isCreating
      
      if (isTemplateSave || isSectionBeingCreated) {
        // Don't show error toast or reload for template content or sections being created
        return
      }
      
      toast({
        title: 'Save failed',
        description: 'Failed to save section. Please try again.',
        variant: 'destructive'
      })
      
      // Only reload for non-template save errors and non-creating sections
      await loadOrCreatePRD()
    } finally {
      setIsSaving(false)
    }
  }, [prd, toast])

  const handleBlocksUpdate = useCallback((sectionId: string, blocks: VirtualContentBlock[]) => {
    setSectionVirtualBlocks(prev => ({
      ...prev,
      [sectionId]: blocks
    }))
  }, [])

  // Handle adding new sections
  const handleAddSection = useCallback(async (afterSectionId?: string) => {
    if (!prd?.id) return


    setIsSaving(true)
    
    // Generate section data outside try block for error handling
    let newSectionId: string | null = null
    
    try {
      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }
      
      const sectionData = {
        title: 'New Section',
        agent: 'project_manager' as const, // Use proper AgentType
        required: false,
        content: {
          html: '<p>Start writing your section content here...</p>',
          text: 'Start writing your section content here...'
        },
        id: generateSectionId(),
        insertAfter: afterSectionId // NEW: Pass the insertion position to backend
      }
      
      // Store the section ID for error handling and tracking
      newSectionId = sectionData.id
      
      // Mark section as newly created for auto-save delay logic
      markSectionAsNewlyCreated(newSectionId)
      
      // Add to creation tracking BEFORE any UI updates
      creatingSectionsRef.current.add(newSectionId)

      // Calculate optimistic order for UI display
      let optimisticOrder: number
      if (afterSectionId) {
        const afterSection = sections.find(s => s.id === afterSectionId)
        if (afterSection) {
          const nextSection = sections.find(s => s.order > afterSection.order)
          if (nextSection) {
            // Insert between the current section and the next one
            optimisticOrder = (afterSection.order + nextSection.order) / 2
          } else {
            // Insert at the end (after the last section)
            optimisticOrder = afterSection.order + 1
          }
        } else {
          // Fallback: add at the end
          optimisticOrder = Math.max(...sections.map(s => s.order)) + 1
        }
      } else {
        // No specific position: add at the end
        optimisticOrder = Math.max(...sections.map(s => s.order)) + 1
      }

      // Optimistic update: Add section to UI immediately
      const optimisticSection: FlexiblePRDSection = {
        id: sectionData.id,
        title: sectionData.title,
        order: optimisticOrder, // Use calculated optimistic order for display
        agent: sectionData.agent,
        required: sectionData.required,
        content: sectionData.content,
        status: 'pending',
        isCustom: true,
        isCreating: true
      }
      
      
      // Update UI immediately for better UX
      setSections(prev => {
        const updated = [...prev, optimisticSection].sort((a: FlexiblePRDSection, b: FlexiblePRDSection) => a.order - b.order)
        return updated
      })

      // Add section via enhanced edge function
      const { data, error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'addSection',
          prdId: prd.id,
          sectionData: sectionData
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (error) {
        // Remove optimistic section on error and clean up tracking
        setSections(prev => prev.filter(s => s.id !== sectionData.id))
        creatingSectionsRef.current.delete(sectionData.id)
        throw error
      }


      // Update with backend data if available, otherwise keep optimistic update
      if (data?.newSection) {
        // CRITICAL: Keep the same ID as optimistic section to prevent auto-save conflicts
        // CRITICAL: Preserve original title for custom sections to prevent template override
        const backendSection: FlexiblePRDSection = {
          ...data.newSection,
          id: sectionData.id, // Use original optimistic ID, not backend ID
          title: sectionData.title, // Preserve original custom title
          agent: data.newSection.agent || 'project_manager',
          isCustom: true,
          isCreating: false
        }
        
        
        // Remove from creation tracking since backend confirmed
        creatingSectionsRef.current.delete(sectionData.id)
        
        // Use all sections from backend if available for better state consistency
        if (data.allSections && Array.isArray(data.allSections)) {
          setSections(data.allSections.sort((a: FlexiblePRDSection, b: FlexiblePRDSection) => a.order - b.order))
        } else {
          // Fallback: Update optimistic section in place
          setSections(prev => {
            const updated = prev.map(section => 
              section.id === sectionData.id 
                ? backendSection
                : section
            ).sort((a: FlexiblePRDSection, b: FlexiblePRDSection) => a.order - b.order) // Ensure proper ordering
            
            
            return validateSectionOrdering(updated)
          })
        }
        
      } else {
        
        // If no backend section returned, clear creation tracking after delay
        // This ensures template content loading doesn't trigger auto-save
        setTimeout(() => {
          creatingSectionsRef.current.delete(sectionData.id)
          
          // Clear the isCreating flag on optimistic section
          setSections(prev => prev.map(section => 
            section.id === sectionData.id 
              ? { ...section, isCreating: false }
              : section
          ))
        }, 3000) // 3 second delay to allow template content to load
      }

      toast({
        title: 'Section added',
        description: 'New section has been added successfully.',
      })

    } catch (error) {
      console.error('Failed to add section:', error)
      
      // Clean up tracking and remove optimistic section on error
      if (newSectionId) {
        creatingSectionsRef.current.delete(newSectionId)
        
        setSections(prev => {
          const cleaned = prev.filter(section => section.id !== newSectionId)
          return cleaned
        })
      }
      
      toast({
        title: 'Add failed',
        description: 'Failed to add new section. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }, [prd, sections, toast])

  // Handle section deletion
  const handleSectionDelete = useCallback(async (sectionId: string) => {
    if (!prd?.id) return

    const sectionToDelete = sections.find(s => s.id === sectionId)
    if (!sectionToDelete || !sectionToDelete.isCustom) {
      toast({
        title: 'Cannot delete section',
        description: 'Only custom sections can be deleted.',
        variant: 'destructive'
      })
      return
    }

    setIsSaving(true)
    
    try {
      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }
      
      // Delete section via backend
      const { error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'removeSection',
          prdId: prd.id,
          sectionId: sectionId
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (error) throw error

      // Remove section from local state
      setSections(prev => prev.filter(section => section.id !== sectionId))

      toast({
        title: 'Section deleted',
        description: 'The section has been removed successfully.',
      })

    } catch (error) {
      console.error('Failed to delete section:', error)
      toast({
        title: 'Delete failed',
        description: 'Failed to delete section. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }, [prd, sections, toast])

  // Handle section title rename
  const handleSectionRename = useCallback(async (sectionId: string, newTitle: string) => {
    if (!prd?.id) return

    const sectionToRename = sections.find(s => s.id === sectionId)
    if (!sectionToRename || !sectionToRename.isCustom) {
      toast({
        title: 'Cannot rename section',
        description: 'Only custom sections can be renamed.',
        variant: 'destructive'
      })
      return
    }

    if (!newTitle.trim()) {
      toast({
        title: 'Invalid title',
        description: 'Section title cannot be empty.',
        variant: 'destructive'
      })
      return
    }

    setIsSaving(true)
    
    try {
      // Update local state optimistically
      setSections(prev => prev.map(section => 
        section.id === sectionId 
          ? { ...section, title: newTitle.trim() }
          : section
      ))

      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }
      
      // Update section title via backend
      const { error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'updateSectionTitle',
          prdId: prd.id,
          sectionId: sectionId,
          title: newTitle.trim()
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (error) throw error

      toast({
        title: 'Section renamed',
        description: 'The section title has been updated successfully.',
      })

    } catch (error) {
      console.error('Failed to rename section:', error)
      
      // Revert local state on error
      setSections(prev => prev.map(section => 
        section.id === sectionId 
          ? { ...section, title: sectionToRename.title }
          : section
      ))
      
      toast({
        title: 'Rename failed',
        description: 'Failed to rename section. Please try again.',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }, [prd, sections, toast])

  // Handle section reordering with backend persistence
  const handleSectionReorder = useCallback(async (reorderedSections: FlexiblePRDSection[]) => {
    if (!prd?.id) {
      console.warn('No PRD ID available for reordering')
      return
    }

    // Use ref to get current sections without dependency issues
    const currentSections = sectionsRef.current


    // Store original sections for rollback
    const originalSections = [...currentSections]

    // Update sections with new order
    const sectionsWithUpdatedOrder = reorderedSections.map((section, index) => ({
      ...section,
      order: index + 1
    }))
    
    // Optimistically update UI
    setSections(sectionsWithUpdatedOrder)

    try {
      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }
      
      // Prepare section order data
      const sectionOrderData = sectionsWithUpdatedOrder.map(s => ({
        id: s.id,
        order: s.order
      }))

      
      // Save all section orders to backend
      const { data, error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'updateSectionOrders',
          prdId: prd.id,
          sections: sectionOrderData
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })


      if (error) throw error

      toast({
        title: 'Sections reordered',
        description: 'Section order has been saved successfully.',
      })
    } catch (error) {
      console.error('Failed to reorder sections:', error)
      
      // Rollback on error using stored original sections
      setSections(originalSections)
      toast({
        title: 'Error',
        description: 'Failed to reorder sections. Changes have been reverted.',
        variant: 'destructive'
      })
    }
  }, [prd, toast])

  // Loading state
  if (isLoading) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Loading PRD...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Error state
  if (error || !prd) {
    return (
      <Card className="w-full max-w-4xl mx-auto">
        <CardContent className="flex items-center justify-center py-12">
          <div className="flex flex-col items-center gap-4">
            <AlertCircle className="w-8 h-8 text-destructive" />
            <p className="text-sm text-muted-foreground">{error || 'Failed to load PRD'}</p>
            <Button onClick={handleRetry} variant="outline" size="sm">
              Try Again
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // Main PRD display
  return (
    <div className="flex flex-col h-full">
      {/* Header - matching Enhanced NotionPRDEditor style */}
      <div className="relative border-b border-gray-200 dark:border-gray-700/50 bg-transparent flex-shrink-0 rounded-t-lg">
        <div className="p-4 pl-5">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold text-foreground">Product Requirements Document</h2>
            </div>
            <div className="flex items-center gap-2">
              {isSaving && (
                <div className="px-2 py-1 rounded-md bg-blue-500/10 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-500" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-500">
                    Saving...
                  </span>
                </div>
              )}
              <PRDStatusBadge status={prdStatus} />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  toast({
                    title: 'Save',
                    description: 'Manual save functionality coming soon',
                    duration: 2000
                  })
                }}
                disabled={isSaving}
                title="Save document"
              >
                <Save className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowResetDialog(true)}
                disabled={isLoading || isSaving}
                title="Reset PRD to default template"
              >
                <RefreshCw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  toast({
                    title: 'Export',
                    description: 'Export functionality coming soon',
                    duration: 2000
                  })
                }}
                title="Export as Markdown"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowTOC(!showTOC)}
                title={showTOC ? "Hide Table of Contents" : "Show Table of Contents"}
              >
                <PanelRight className={cn("h-4 w-4", showTOC && "text-primary")} />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Progress Bar as bottom border */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700">
          <div 
            className="h-full bg-emerald-500 transition-all duration-300 ease-out"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>

      {/* Main Content Wrapper */}
      <div className="flex-1 relative overflow-hidden">
        <div className="absolute inset-0 overflow-y-auto bg-muted/50">
          <div className="max-w-4xl mx-auto px-8 py-6">

      {/* Sections */}
      {sections.length > 0 ? (
        <div className="space-y-2 relative" ref={sectionsContainerRef}>
          <PRDDndProvider 
            sections={sections.sort((a: FlexiblePRDSection, b: FlexiblePRDSection) => a.order - b.order)}
            onSectionReorder={handleSectionReorder}
          >
            <div className="space-y-2">
              {sections
                .sort((a: FlexiblePRDSection, b: FlexiblePRDSection) => a.order - b.order)
                .map((section) => (
                  <SortableSection 
                    key={section.id} 
                    id={section.id}
                    className="mb-4"
                    ref={(ref) => { sectionRefs.current[section.id] = ref }}
                  >
                    <SectionBlockEditor
                      section={section}
                      onSave={handleSectionUpdate}
                      onDelete={handleSectionDelete}
                      onRename={handleSectionRename}
                      enableClickToEdit={true}
                      enableVirtualBlocks={true}
                      onBlocksUpdate={handleBlocksUpdate}
                    />
                  </SortableSection>
                ))}
            </div>
          </PRDDndProvider>

          {/* Section Block Controls */}
          <SectionBlockControls
            containerRef={sectionsContainerRef}
            sections={sections}
            sectionRefs={sectionRefs}
            onSectionAdd={handleAddSection}
            enableDragHandle={true}
          />
        </div>
      ) : (
        <Card>
          <CardContent className="py-12">
            <div className="text-center text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm text-muted-foreground">No sections have been created yet.</p>
              <p className="text-xs mt-2 text-muted-foreground">Sections will be added as you build your PRD.</p>
            </div>
          </CardContent>
        </Card>
      )}
      
          </div> {/* End inner content wrapper */}
        </div> {/* End scrollable content wrapper */}
        
        {/* Table of Contents Sidebar - Overlay */}
        <AnimatePresence mode="wait">
          {showTOC && (
            <motion.div 
              className="absolute top-0 right-0 bottom-0 w-64 border-l border-gray-200 dark:border-gray-700/50 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm overflow-y-auto z-40 shadow-xl"
              initial={{ x: "100%", opacity: 0 }}
              animate={{ 
                x: 0,
                opacity: 1,
                transition: {
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 }
                }
              }}
              exit={{ 
                x: "100%", 
                opacity: 0,
                transition: {
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.15 }
                }
              }}
            >
              <motion.div 
                className="p-4"
                initial={{ x: 20, opacity: 0 }}
                animate={{ 
                  x: 0, 
                  opacity: 1,
                  transition: { delay: 0.1, duration: 0.2 }
                }}
              >
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wider text-xs">
                  Table of Contents
                </h3>
                <div className="space-y-1">
                  {sections.map((section, index) => {
                    const sectionType = getSectionType(section)
                    const icon = sectionIcons[sectionType] || '📝'
                    return (
                      <motion.button
                        key={section.id}
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ 
                          x: 0, 
                          opacity: 1,
                          transition: { 
                            delay: 0.15 + (index * 0.03), 
                            duration: 0.2 
                          }
                        }}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
                          "flex items-center gap-2",
                          section.status === 'completed' && "text-green-600 dark:text-green-400"
                        )}
                        onClick={() => {
                          // Scroll to section
                          const sectionElement = document.querySelector(`[data-section-id="${section.id}"]`)
                          if (sectionElement) {
                            sectionElement.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }
                        }}
                      >
                        <span>{icon}</span>
                        <span className="flex-1 truncate">{section.title}</span>
                        {section.status === 'completed' && (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div> {/* End relative container */}
      
      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset PRD to Default Template?</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              This action will permanently replace all current sections with the default template. 
              Any content you've written will be lost and cannot be recovered.
              <br /><br />
              Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => {
                setShowResetDialog(false)
                handleResetToDefault()
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Reset PRD
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}