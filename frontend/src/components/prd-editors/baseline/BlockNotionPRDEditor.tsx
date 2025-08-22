import { useState, useEffect, useCallback, useRef } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle, FileText, RefreshCw, Download, Save, PanelRight } from 'lucide-react'
import { prdService, type PRD, type FlexiblePRDSection } from '@/services/prdService'
import { useToast } from '@/hooks/use-toast'
import { SectionBlockEditor } from './blocks/SectionBlockEditor'
import { SectionBlockControls } from './blocks/SectionBlockControls'
import { supabase } from '@/lib/supabase'
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types'
import { PRDDndProvider, SortableSection, type SortableSectionRef } from './dnd'
import { PRDStatusBadge } from '../shared/components/PRDStatusBadge'
import { cn } from '@/lib/utils'
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

export function BlockNotionPRDEditor({ projectId }: BlockNotionPRDEditorProps) {
  const [prd, setPRD] = useState<PRD | null>(null)
  const [sections, setSections] = useState<FlexiblePRDSection[]>([])
  const [, setSectionVirtualBlocks] = useState<Record<string, VirtualContentBlock[]>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showTOC, setShowTOC] = useState(false)
  const [prdStatus, setPrdStatus] = useState<'draft' | 'in_progress' | 'review' | 'finalized' | 'archived'>('draft')
  const [showResetDialog, setShowResetDialog] = useState(false)
  const { toast } = useToast()
  
  // Keep a ref to current sections to avoid dependency issues
  const sectionsRef = useRef<FlexiblePRDSection[]>([])
  
  // Ref for the sections container for SectionBlockControls
  const sectionsContainerRef = useRef<HTMLDivElement>(null)
  
  // Refs for each sortable section
  const sectionRefs = useRef<Record<string, SortableSectionRef | null>>({})
  
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
      console.log('Loading PRD for project:', projectId)
      
      // Try to load existing PRD
      let { prd: existingPRD, error: loadError } = await prdService.getPRDByProject(projectId)
      
      if (loadError) {
        console.error('Error loading PRD:', loadError)
      }
      
      // If no PRD exists, create a new one
      if (!existingPRD) {
        console.log('No existing PRD found, creating new one...')
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
        console.log('Loaded existing PRD:', existingPRD.id)
      }
      
      setPRD(existingPRD)
      
      // Preserve sections that are currently being created
      const newSections = existingPRD?.sections || []
      setSections(prev => {
        const creatingSections = prev.filter(s => s.isCreating)
        const dbSections = newSections.filter(s => !creatingSections.some(creating => creating.id === s.id))
        return [...dbSections, ...creatingSections]
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

    // Skip save if section is being created (use ref to avoid dependency issues)
    const section = sectionsRef.current.find(s => s.id === sectionId)
    console.log(`[SAVE] handleSectionUpdate called for ${sectionId}:`, {
      sectionFound: !!section,
      isCreating: section?.isCreating,
      content
    }) // Enhanced debug log
    
    if (section?.isCreating) {
      console.log(`[SAVE] Skipping save for section ${sectionId} - section is being created`) // Debug log
      return
    }

    console.log(`[SAVE] Starting save for section ${sectionId}:`, content) // Debug log
    console.log(`[SAVE] Current sections before save:`, sections.map(s => ({ id: s.id, title: s.title, isCreating: s.isCreating }))) // Debug log
    
    setIsSaving(true)
    
    try {
      // Update local state optimistically
      setSections(prev => {
        const updated = prev.map(section => 
          section.id === sectionId 
            ? { ...section, content, status: 'in_progress' as const }
            : section
        )
        console.log(`[SAVE] Optimistic update for ${sectionId}:`, updated.map(s => ({ id: s.id, title: s.title }))) // Debug log
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
      
      console.log(`[SAVE] Backend save successful for ${sectionId}, hasRealContent: ${hasRealContent}`) // Debug log
      
      setSections(prev => {
        const updated = prev.map(section => 
          section.id === sectionId 
            ? { 
                ...section, 
                status: hasRealContent ? 'completed' as const : 'in_progress' as const 
              }
            : section
        )
        console.log(`[SAVE] Final state update for ${sectionId}:`, updated.map(s => ({ id: s.id, title: s.title }))) // Debug log
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
      console.error(`[SAVE] Failed to save section ${sectionId}:`, error)
      console.log(`[SAVE] Error occurred, sections before reload:`, sections.map(s => ({ id: s.id, title: s.title }))) // Debug log
      
      // Check if this is a template content save attempt (which should be ignored)
      const isTemplateSave = content.html?.includes('Start writing') || 
                            content.text?.includes('Start writing') ||
                            content.html?.includes('template-placeholder')
      
      // Also check if the failed section is being created
      const failedSection = sectionsRef.current.find(s => s.id === sectionId)
      const isSectionBeingCreated = failedSection?.isCreating
      
      if (isTemplateSave || isSectionBeingCreated) {
        console.log(`[SAVE] Template content save failed or section being created - this is expected, not reloading`) // Debug log
        // Don't show error toast or reload for template content or sections being created
        return
      }
      
      toast({
        title: 'Save failed',
        description: 'Failed to save section. Please try again.',
        variant: 'destructive'
      })
      
      // Only reload for non-template save errors and non-creating sections
      console.log(`[SAVE] Real content save failed - reloading PRD`) // Debug log
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
      
      // Calculate order based on position
      let newOrder: number
      if (afterSectionId) {
        // Find the section to insert after
        const afterSection = sections.find(s => s.id === afterSectionId)
        if (afterSection) {
          // Find the next section after the target section
          const nextSection = sections.find(s => s.order > afterSection.order)
          if (nextSection) {
            // Insert between the current section and the next one
            newOrder = (afterSection.order + nextSection.order) / 2
          } else {
            // Insert at the end (after the last section)
            newOrder = afterSection.order + 1
          }
        } else {
          // Fallback: add at the end
          newOrder = Math.max(...sections.map(s => s.order)) + 1
        }
      } else {
        // No specific position: add at the end
        newOrder = Math.max(...sections.map(s => s.order)) + 1
      }
      const sectionData = {
        title: 'New Section',
        agent: 'project_manager' as const, // Use proper AgentType
        required: false,
        content: {
          html: '<p>Start writing your section content here...</p>',
          text: 'Start writing your section content here...'
        },
        order: newOrder,
        id: `custom_${Date.now()}`
      }
      
      // Store the section ID for error handling
      newSectionId = sectionData.id

      // Optimistic update: Add section to UI immediately
      const optimisticSection: FlexiblePRDSection = {
        id: sectionData.id,
        title: sectionData.title,
        order: sectionData.order,
        agent: sectionData.agent,
        required: sectionData.required,
        content: sectionData.content,
        status: 'pending',
        isCustom: true,
        isCreating: true
      }
      
      console.log('Adding optimistic section:', optimisticSection) // Debug log
      
      // Update UI immediately for better UX
      setSections(prev => {
        const updated = [...prev, optimisticSection].sort((a, b) => a.order - b.order)
        console.log('Optimistic sections update:', updated) // Debug log
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
        // Remove optimistic section on error
        setSections(prev => prev.filter(s => s.id !== sectionData.id))
        throw error
      }

      console.log('Add section response:', data) // Debug log

      // Update with backend data if available, otherwise keep optimistic update
      if (data?.newSection) {
        const backendSection: FlexiblePRDSection = {
          ...data.newSection,
          agent: data.newSection.agent || 'project_manager',
          isCustom: true,
          isCreating: false
        }
        
        console.log('Replacing optimistic with backend section:', backendSection) // Debug log
        
        // Replace optimistic section with backend response
        setSections(prev => {
          const withoutOptimistic = prev.filter(s => s.id !== sectionData.id)
          const updated = [...withoutOptimistic, backendSection].sort((a, b) => a.order - b.order)
          console.log('Final sections after backend response:', updated) // Debug log
          return updated
        })
      } else {
        // If no backend section returned, clear the isCreating flag on optimistic section
        setSections(prev => prev.map(section => 
          section.id === sectionData.id 
            ? { ...section, isCreating: false }
            : section
        ))
      }

      toast({
        title: 'Section added',
        description: 'New section has been added successfully.',
      })

    } catch (error) {
      console.error('Failed to add section:', error)
      
      // Clear isCreating flag on error to prevent auto-save issues
      if (newSectionId) {
        setSections(prev => prev.map(section => 
          section.id === newSectionId 
            ? { ...section, isCreating: false }
            : section
        ))
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

  // Handle section reordering with backend persistence
  const handleSectionReorder = useCallback(async (reorderedSections: FlexiblePRDSection[]) => {
    if (!prd?.id) {
      console.warn('No PRD ID available for reordering')
      return
    }

    // Use ref to get current sections without dependency issues
    const currentSections = sectionsRef.current

    console.log('Starting section reorder:', {
      prdId: prd.id,
      originalOrder: currentSections.map(s => ({ id: s.id, order: s.order, title: s.title })),
      newOrder: reorderedSections.map((s, i) => ({ id: s.id, order: i + 1, title: s.title }))
    })

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

      console.log('Calling updateSectionOrders with:', {
        action: 'updateSectionOrders',
        prdId: prd.id,
        sections: sectionOrderData
      })
      
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

      console.log('updateSectionOrders response:', { data, error })

      if (error) throw error

      console.log('Section reorder successful')
      toast({
        title: 'Sections reordered',
        description: 'Section order has been saved successfully.',
      })
    } catch (error) {
      console.error('Failed to reorder sections:', error)
      console.log('Rolling back to original order:', originalSections.map(s => ({ id: s.id, order: s.order, title: s.title })))
      
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
              <h2 className="text-lg font-semibold">Product Requirements Document</h2>
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
            style={{ width: `${prd.completion_percentage || 0}%` }}
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
            sections={sections.sort((a, b) => a.order - b.order)}
            onSectionReorder={handleSectionReorder}
          >
            <div className="space-y-2">
              {sections
                .sort((a, b) => a.order - b.order)
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
              <p className="text-sm">No sections have been created yet.</p>
              <p className="text-xs mt-2">Sections will be added as you build your PRD.</p>
            </div>
          </CardContent>
        </Card>
      )}
      
          </div> {/* End inner content wrapper */}
        </div> {/* End scrollable content wrapper */}
      </div> {/* End relative container */}
      
      {/* Reset Confirmation Dialog */}
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset PRD to Default Template?</AlertDialogTitle>
            <AlertDialogDescription>
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