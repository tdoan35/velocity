import React, { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { prdService, type PRD, type FlexiblePRDSection, type AgentType } from '@/services/prdService'
import { supabase } from '@/lib/supabase'
import { PRDStatusBadge } from './PRDStatusBadge'
import { NotionSectionEditor } from './blocks/NotionSectionEditor'
import '@/styles/notion-editor.css'
import { useDragStore } from '@/stores/dragStateStore'
import { 
  getDragType, 
  extractSectionDragData, 
  dragDebug
} from '@/utils/dragDetection'
import { useDragCleanup } from '@/hooks/useDragCleanup'
import { 
  FileText, 
  Download, 
  ArrowLeft,
  Loader2,
  Plus,
  PanelRight,
  Sparkles,
  Palette,
  Users,
  Building2,
  Plug,
  Save
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getEmptySectionContent, validateSectionContent } from '@/lib/prd-schemas'
import type { SectionType } from './blocks/SectionBlock'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface EnhancedBlockBasedPRDEditorProps {
  projectId: string
  conversationId?: string
  onClose?: () => void
  className?: string
}

// Sortable Section Wrapper
// Removed SortableSection - drag functionality is now handled by NotionSectionEditor

interface SectionMeta {
  id: string
  title: string
  icon: any
  type: SectionType
  agent: AgentType | 'human'
  required: boolean
  order: number
}

// Default section metadata with emojis
const defaultSectionMeta: SectionMeta[] = [
  {
    id: 'overview',
    title: 'Overview',
    icon: FileText,
    type: 'overview',
    agent: 'project_manager',
    required: true,
    order: 1
  },
  {
    id: 'core_features',
    title: 'Core Features',
    icon: Sparkles,
    type: 'core_features',
    agent: 'project_manager',
    required: true,
    order: 2
  },
  {
    id: 'additional_features',
    title: 'Additional Features',
    icon: Plus,
    type: 'additional_features',
    agent: 'project_manager',
    required: false,
    order: 3
  },
  {
    id: 'ui_design_patterns',
    title: 'UI Design Patterns',
    icon: Palette,
    type: 'ui_design_patterns',
    agent: 'design_assistant',
    required: true,
    order: 4
  },
  {
    id: 'ux_flows',
    title: 'User Experience Flows',
    icon: Users,
    type: 'ux_flows',
    agent: 'design_assistant',
    required: true,
    order: 5
  },
  {
    id: 'technical_architecture',
    title: 'Technical Architecture',
    icon: Building2,
    type: 'technical_architecture',
    agent: 'engineering_assistant',
    required: true,
    order: 6
  },
  {
    id: 'tech_integrations',
    title: 'Tech Integrations',
    icon: Plug,
    type: 'tech_integrations',
    agent: 'config_helper',
    required: true,
    order: 7
  }
]

export function EnhancedBlockBasedPRDEditor({ 
  projectId, 
  onClose,
  className 
}: EnhancedBlockBasedPRDEditorProps) {
  const [prd, setPRD] = useState<PRD | null>(null)
  const [sections, setSections] = useState<FlexiblePRDSection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [savingSection, setSavingSection] = useState<string | null>(null)
  const [showTOC, setShowTOC] = useState(false)
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null)
  
  // Use centralized drag state
  const { 
    type: dragType,
    draggedSectionId,
    dropIndicatorIndex,
    dropIndicatorType,
    setDropIndicator,
    clearDropIndicator
  } = useDragStore()
  
  // Initialize drag cleanup system
  useDragCleanup()
  const { toast } = useToast()
  
  // Debounce timers for each section
  const sectionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const sectionRefs = useRef<Map<string, HTMLDivElement>>(new Map())
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const autoScrollInterval = useRef<NodeJS.Timeout | null>(null)

  // Removed DnD sensors - drag functionality now handled by NotionSectionEditor

  // Load or create PRD on mount
  useEffect(() => {
    loadOrCreatePRD()
  }, [projectId])

  const loadOrCreatePRD = async () => {
    setIsLoading(true)
    try {
      let { prd: existingPRD, error } = await prdService.getPRDByProject(projectId)
      
      if (!existingPRD) {
        const result = await prdService.createPRD(projectId)
        existingPRD = result.prd
        error = result.error
      }

      if (error) {
        console.error('Error fetching/creating PRD:', error)
        throw error
      }

      // Initialize sections if empty
      if (existingPRD && (!existingPRD.sections || existingPRD.sections.length === 0)) {
        console.log('Initializing sections for PRD:', existingPRD.id)
        
        try {
          // Get the current session to ensure auth headers are included
          const { data: { session }, error: sessionError } = await supabase.auth.getSession()
          
          if (sessionError || !session) {
            console.error('No active session for edge function call:', sessionError)
            throw new Error('Authentication required')
          }
          
          const { data, error: initError } = await supabase.functions.invoke('prd-management', {
            body: {
              action: 'initializeSections',
              prdId: existingPRD.id
            },
            headers: {
              Authorization: `Bearer ${session.access_token}`
            }
          })
          
          if (initError) {
            console.error('Error initializing sections:', initError)
            // If initialization fails, use default sections locally
            const defaultSections = defaultSectionMeta.map((meta, index) => ({
              id: meta.id,
              title: meta.title,
              type: meta.type,
              agent: meta.agent,
              required: meta.required,
              order: index + 1,
              status: 'pending' as const,
              content: getEmptySectionContent(meta.id),
              isCustom: false
            }))
            existingPRD.sections = defaultSections as FlexiblePRDSection[]
          } else if (data?.sections) {
            existingPRD.sections = data.sections
          } else if (data?.prd?.sections) {
            existingPRD.sections = data.prd.sections
          }
        } catch (funcError) {
          console.error('Edge function error:', funcError)
          // Use default sections as fallback
          const defaultSections = defaultSectionMeta.map((meta, index) => ({
            id: meta.id,
            title: meta.title,
            type: meta.type,
            agent: meta.agent,
            required: meta.required,
            order: index + 1,
            status: 'pending' as const,
            content: getEmptySectionContent(meta.id),
            isCustom: false
          }))
          existingPRD.sections = defaultSections
        }
      }

      setPRD(existingPRD)
      setSections(existingPRD?.sections || [])
    } catch (error) {
      console.error('Error loading PRD:', error)
      toast({
        title: 'Error',
        description: (error && typeof error === 'object' && 'message' in error ? (error as any).message : 'Failed to load PRD. Please try refreshing the page.'),
        variant: 'destructive'
      })
      setIsLoading(false)
    } finally {
      setIsLoading(false)
    }
  }

  // Section-aware save with debouncing
  const handleSectionUpdate = useCallback(async (sectionId: string, content: any) => {
    if (!prd?.id) return

    // Clear existing timer for this section
    const existingTimer = sectionTimers.current.get(sectionId)
    if (existingTimer) {
      clearTimeout(existingTimer)
    }

    // Update local state immediately (optimistic update)
    setSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { ...section, content, status: 'in_progress' as const }
        : section
    ))

    // Set new debounced save timer (1.5 seconds)
    const timer = setTimeout(async () => {
      setSavingSection(sectionId)
      
      try {
        // Validate content before saving
        const validation = validateSectionContent(sectionId, content)
        if (!validation.success && validation.errors && validation.errors.length > 0) {
          toast({
            title: 'Validation Warning',
            description: validation.errors[0],
            variant: 'destructive'
          })
        }

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

        // Update section status if successful
        setSections(prev => prev.map(section => 
          section.id === sectionId 
            ? { ...section, status: content && Object.keys(content).length > 0 ? 'completed' as const : 'in_progress' as const }
            : section
        ))

        // Update PRD completion percentage
        if (data?.completionPercentage !== undefined) {
          setPRD(prev => prev ? { ...prev, completion_percentage: data.completionPercentage } : prev)
        }

      } catch (error) {
        console.error(`Failed to save section ${sectionId}:`, error)
        toast({
          title: 'Save failed',
          description: `Failed to save ${sectionId} section`,
          variant: 'destructive'
        })
        
        // Rollback optimistic update on error
        const originalSection = prd.sections?.find(s => s.id === sectionId)
        if (originalSection) {
          setSections(prev => prev.map(section => 
            section.id === sectionId ? originalSection : section
          ))
        }
      } finally {
        setSavingSection(null)
        sectionTimers.current.delete(sectionId)
      }
    }, 1500)

    sectionTimers.current.set(sectionId, timer as unknown as NodeJS.Timeout)
  }, [prd, toast])

  // Track global drag over handler for cleanup
  const globalDragOverHandler = useRef<((event: DragEvent) => void) | null>(null)

  // Auto-scroll functionality
  const startAutoScroll = useCallback((direction: 'up' | 'down', speed: number = 5) => {
    if (!scrollContainerRef.current) return
    
    // Clear any existing interval
    if (autoScrollInterval.current) {
      clearInterval(autoScrollInterval.current)
    }
    
    autoScrollInterval.current = setInterval(() => {
      if (scrollContainerRef.current) {
        const scrollAmount = direction === 'up' ? -speed : speed
        scrollContainerRef.current.scrollTop += scrollAmount
      }
    }, 16) as unknown as NodeJS.Timeout // ~60fps
  }, [])

  const stopAutoScroll = useCallback(() => {
    if (autoScrollInterval.current) {
      clearInterval(autoScrollInterval.current)
      autoScrollInterval.current = null
    }
  }, [])

  // Handle drag start
  const handleDragStart = useCallback((_e: React.DragEvent, _sectionId: string) => {
    // Note: Section drag start is now handled by SectionBlock component
    // This function is kept for compatibility but drag state is managed centrally
    
    // Remove any existing handler first
    if (globalDragOverHandler.current) {
      document.removeEventListener('dragover', globalDragOverHandler.current)
    }
    
    // Create new handler for auto-scroll (only for section drags)
    globalDragOverHandler.current = (event: DragEvent) => {
      if (!scrollContainerRef.current) return

      // Check drag type using reliable detection
      const detectedDragType = event.dataTransfer ? getDragType(event.dataTransfer) : 'unknown'
      
      // Only trigger auto-scroll for section drags
      if (detectedDragType !== 'section') {
        return
      }
      
      const container = scrollContainerRef.current
      const rect = container.getBoundingClientRect()
      const scrollZoneHeight = 100 // Height of auto-scroll zones
      
      // Check if cursor is in top scroll zone
      if (event.clientY < rect.top + scrollZoneHeight && event.clientY > rect.top) {
        const speed = Math.max(1, Math.min(10, (scrollZoneHeight - (event.clientY - rect.top)) / 10))
        startAutoScroll('up', speed)
        setScrollDirection('up')
      }
      // Check if cursor is in bottom scroll zone
      else if (event.clientY > rect.bottom - scrollZoneHeight && event.clientY < rect.bottom) {
        const speed = Math.max(1, Math.min(10, ((event.clientY - (rect.bottom - scrollZoneHeight))) / 10))
        startAutoScroll('down', speed)
        setScrollDirection('down')
      }
      // Stop scrolling if not in any scroll zone
      else {
        stopAutoScroll()
        setScrollDirection(null)
      }
    }
    
    // Add global listener
    document.addEventListener('dragover', globalDragOverHandler.current)
    
    dragDebug.logDragStart('section', _sectionId, { from: 'BlockBasedPRDEditor' })
  }, [startAutoScroll, stopAutoScroll])

  // Handle drag over for section drop zones
  const handleSectionDragOver = useCallback((e: React.DragEvent, targetIndex: number) => {
    // Use reliable drag type detection
    const detectedDragType = getDragType(e.dataTransfer)
    
    // Only handle section drags
    if (detectedDragType !== 'section') {
      // Clear any section drop indicators for non-section drags
      if (dropIndicatorType === 'section') {
        clearDropIndicator()
      }
      return
    }

    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'
    
    // Add active class to current drop zone
    const dropZone = e.currentTarget as HTMLElement
    if (dropZone && !dropZone.classList.contains('drop-active')) {
      // Remove active class from all other drop zones
      document.querySelectorAll('.section-drop-zone.drop-active').forEach(zone => {
        if (zone !== dropZone) {
          zone.classList.remove('drop-active')
        }
      })
      dropZone.classList.add('drop-active')
    }
    
    if (draggedSectionId) {
      // Calculate if we should show the drop indicator
      const draggedIndex = sections.findIndex(s => s.id === draggedSectionId)
      if (draggedIndex !== targetIndex && draggedIndex !== targetIndex - 1) {
        setDropIndicator(targetIndex, 'section')
        dragDebug.logDragOver('section', `index-${targetIndex}`, true)
      } else {
        clearDropIndicator()
      }
    }
  }, [draggedSectionId, sections, dropIndicatorType, setDropIndicator, clearDropIndicator])

  // Handle drag leave
  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear indicator if leaving the entire sections container
    const relatedTarget = e.relatedTarget as HTMLElement
    if (!relatedTarget || !relatedTarget.closest('[data-sections-container]')) {
      clearDropIndicator()
      // Remove active class from all drop zones
      document.querySelectorAll('.section-drop-zone.drop-active').forEach(zone => {
        zone.classList.remove('drop-active')
      })
    }
  }, [clearDropIndicator])

  // Handle drag end
  const handleDragEnd = useCallback(() => {
    // Note: Drag state is now reset by SectionBlock component
    // This function handles cleanup of auto-scroll and global listeners
    
    setScrollDirection(null)
    stopAutoScroll()
    
    // Remove active class from all drop zones
    document.querySelectorAll('.section-drop-zone.drop-active').forEach(zone => {
      zone.classList.remove('drop-active')
    })
    
    // Remove global drag event listener
    if (globalDragOverHandler.current) {
      document.removeEventListener('dragover', globalDragOverHandler.current)
      globalDragOverHandler.current = null
    }
    
    dragDebug.logDragEnd('section', true)
  }, [stopAutoScroll])

  // Handle section drop
  const handleSectionDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    // Use reliable drag type detection
    const detectedDragType = getDragType(e.dataTransfer)
    
    // Only handle section drops
    if (detectedDragType !== 'section') {
      return
    }

    e.preventDefault()
    e.stopPropagation()
    
    // Remove active class from all drop zones
    document.querySelectorAll('.section-drop-zone.drop-active').forEach(zone => {
      zone.classList.remove('drop-active')
    })

    // Extract drag data
    const dragData = extractSectionDragData(e.dataTransfer)
    if (!dragData || !dragData.sectionId) {
      dragDebug.logError('Invalid section drag data', dragData)
      return
    }

    const { sectionId } = dragData
    
    dragDebug.logDrop('section', sectionId, `index-${targetIndex}`)
    
    // Handle reorder directly here since the function is declared later
    const fromIndex = sections.findIndex(s => s.id === sectionId)
    
    if (fromIndex === -1 || fromIndex === targetIndex) return

    // Optimistic update
    const newSections = [...sections]
    const [removed] = newSections.splice(fromIndex, 1)
    
    // Adjust target index if dragging from before to after
    const adjustedIndex = fromIndex < targetIndex ? targetIndex - 1 : targetIndex
    newSections.splice(adjustedIndex, 0, removed)
    
    // Update order
    const reorderedSections = newSections.map((section, index) => ({
      ...section,
      order: index + 1
    }))
    
    setSections(reorderedSections)
    
    // Clear drop indicator
    clearDropIndicator()
  }, [sections, setSections, clearDropIndicator])

  // Handle section reordering
  const handleSectionReorder = useCallback(async (fromId: string, toIndex: number) => {
    if (!prd?.id) return

    const fromIndex = sections.findIndex(s => s.id === fromId)
    
    if (fromIndex === -1 || fromIndex === toIndex) return

    // Optimistic update
    const newSections = [...sections]
    const [removed] = newSections.splice(fromIndex, 1)
    
    // Adjust target index if dragging from before to after
    const adjustedIndex = fromIndex < toIndex ? toIndex - 1 : toIndex
    newSections.splice(adjustedIndex, 0, removed)
    
    // Update order
    const reorderedSections = newSections.map((section, index) => ({
      ...section,
      order: index + 1
    }))
    
    setSections(reorderedSections)
    clearDropIndicator()

    try {
      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }
      
      // Save to backend
      const { error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'reorderSections',
          prdId: prd.id,
          sectionId: fromId,
          newOrder: adjustedIndex + 1
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (error) throw error
    } catch (error) {
      console.error('Failed to reorder sections:', error)
      // Rollback on error
      setSections(sections)
      toast({
        title: 'Error',
        description: 'Failed to reorder sections',
        variant: 'destructive'
      })
    }
  }, [prd, sections, toast])

  // Handle adding custom section
  const handleAddSection = useCallback(async (_type: string, title: string) => {
    if (!prd?.id) return

    try {
      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }
      
      const { error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'addSection',
          prdId: prd.id,
          title: title,
          agent: 'project_manager',
          required: false
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })

      if (error) throw error

      // Reload sections
      await loadOrCreatePRD()
      
      toast({
        title: 'Section added',
        description: `Added "${title}" section`
      })
    } catch (error) {
      console.error('Failed to add section:', error)
      toast({
        title: 'Error',
        description: 'Failed to add section',
        variant: 'destructive'
      })
    }
  }, [prd, toast])

  // Handle removing section
  const handleRemoveSection = useCallback(async (sectionId: string) => {
    if (!prd?.id) return

    const section = sections.find(s => s.id === sectionId)
    if (!section || section.required) return

    try {
      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }
      
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

      // Remove from local state
      setSections(prev => prev.filter(s => s.id !== sectionId))
      
      toast({
        title: 'Section removed',
        description: `Removed "${section.title}" section`
      })
    } catch (error) {
      console.error('Failed to remove section:', error)
      toast({
        title: 'Error',
        description: 'Failed to remove section',
        variant: 'destructive'
      })
    }
  }, [prd, sections, toast])

  const handleExportMarkdown = () => {
    if (!prd) return

    const markdown = prdService.exportToMarkdown(prd)
    const blob = new Blob([markdown], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prd.title.replace(/\s+/g, '_')}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    toast({
      title: 'Success',
      description: 'PRD exported as Markdown'
    })
  }

  // Render section editor based on type
  const renderSectionEditor = (section: FlexiblePRDSection) => {
    const meta = defaultSectionMeta.find(m => m.id === section.id) || {
      id: section.id,
      title: section.title,
      icon: FileText,
      type: 'custom' as SectionType,
      agent: 'human' as const,
      required: section.required,
      order: section.order
    }

    const commonProps = {
      id: section.id,
      type: meta.type,
      title: section.title,
      content: section.content || getEmptySectionContent(section.id),
      ownership: meta.agent,
      isRequired: section.required,
      isEditable: true,
      order: section.order,
      status: section.status,
      validationErrors: [],
      onUpdate: handleSectionUpdate,
      onDelete: section.required ? undefined : () => handleRemoveSection(section.id),
      onDragStart: handleDragStart,
      onDragEnd: handleDragEnd,
      onDrop: (e: React.DragEvent) => {
        // Check if this is a content-level drag (should not trigger section reorder)
        const contentDragData = e.dataTransfer.getData('application/x-tiptap-content')
        if (contentDragData) {
          // This is a content drag, don't handle at section level
          e.preventDefault()
          e.stopPropagation()
          return
        }

        e.preventDefault()
        if (dropIndicatorIndex !== null) {
          const fromId = e.dataTransfer.getData('sectionId')
          if (fromId) {
            handleSectionReorder(fromId, dropIndicatorIndex)
          }
        }
      },
      isDraggingSection: dragType === 'section'  // Pass drag state to child
    }

    // Use NotionSectionEditor for all sections with enhanced Notion-like UI
    return (
      <NotionSectionEditor 
        key={section.id} 
        {...commonProps}
        enableSlashCommands={true}
        enableBubbleMenu={true}
        onContentSync={(structured, rich) => {
          console.log('Content synced:', { structured, rich })
        }}
      />
    )
  }

  if (isLoading) {
    return (
      <div className={cn('flex items-center justify-center h-full', className)}>
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  if (!prd) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full gap-4', className)}>
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900 dark:text-gray-100">Failed to load PRD</p>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
            There was an issue loading the Product Requirements Document.
          </p>
        </div>
        <Button
          onClick={() => loadOrCreatePRD()}
          variant="outline"
        >
          Try Again
        </Button>
      </div>
    )
  }

  // If no sections, show empty state with action
  if (sections.length === 0) {
    return (
      <div className={cn('flex flex-col h-full overflow-hidden', className)}>
        {/* Header */}
        <div className="relative border-b border-gray-300 dark:border-gray-700 bg-transparent flex-shrink-0 rounded-t-lg">
          <div className="p-4 pl-5">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center gap-2">
                {onClose && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={onClose}
                    className="h-8 w-8"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <h2 className="text-lg font-semibold">Product Requirements Document</h2>
              </div>
              <div className="flex items-center gap-2">
                <PRDStatusBadge status={prd.status} />
                <Button
                  onClick={() => loadOrCreatePRD()}
                  variant="outline"
                  size="sm"
                >
                  Initialize Sections
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Empty State */}
        <div className="flex-1 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <FileText className="w-16 h-16 mx-auto text-gray-400 dark:text-gray-600 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
              No sections found
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">
              Your PRD doesn't have any sections yet. Initialize the default sections to get started.
            </p>
            <div className="flex gap-3 justify-center">
              <Button
                onClick={() => loadOrCreatePRD()}
                variant="default"
              >
                <Plus className="w-4 h-4 mr-2" />
                Initialize Default Sections
              </Button>
              <Button
                onClick={() => handleAddSection('custom', 'Custom Section')}
                variant="outline"
              >
                Add Custom Section
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const sortedSectionsData = [...sections].sort((a, b) => a.order - b.order)

  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Header */}
      <div className="relative border-b border-gray-300 dark:border-gray-700 bg-transparent flex-shrink-0 rounded-t-lg">
        <div className="p-4 pl-5">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              {onClose && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onClose}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <h2 className="text-lg font-semibold">Product Requirements Document</h2>
            </div>
            <div className="flex items-center gap-2">
              {savingSection && (
                <div className="px-2 py-1 rounded-md bg-blue-500/10 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-500" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-500">
                    Saving {savingSection}...
                  </span>
                </div>
              )}
              <PRDStatusBadge status={prd.status} />
              
              {/* Add Section Dropdown */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    Add Section
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => handleAddSection('custom', 'Custom Section')}>
                    Custom Section
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddSection('requirements', 'Requirements')}>
                    Requirements
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddSection('timeline', 'Timeline')}>
                    Timeline
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleAddSection('risks', 'Risks & Mitigation')}>
                    Risks & Mitigation
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleExportMarkdown}
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
        
        {/* Progress Bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700">
          <div 
            className="h-full bg-emerald-500 transition-all duration-300 ease-out"
            style={{ width: `${prd.completion_percentage || 0}%` }}
          />
        </div>
      </div>

      {/* Main Content Area with DnD */}
      <div className={cn("flex-1 relative overflow-hidden", dragType === 'section' && "dragging")}>
        {/* Auto-scroll zones indicators (visible when dragging) */}
        {dragType === 'section' && (
          <>
            <div className={cn(
              "drag-scroll-zone-top",
              scrollDirection === 'up' && "drag-scroll-zone-active"
            )}>
              {scrollDirection === 'up' && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-blue-600 dark:text-blue-400 font-medium flex items-center gap-2">
                    <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11l5-5m0 0l5 5m-5-5v12" />
                    </svg>
                    <span className="text-sm">Auto-scrolling up</span>
                  </div>
                </div>
              )}
            </div>
            <div className={cn(
              "drag-scroll-zone-bottom",
              scrollDirection === 'down' && "drag-scroll-zone-active"
            )}>
              {scrollDirection === 'down' && (
                <div className="flex items-center justify-center h-full">
                  <div className="text-blue-600 dark:text-blue-400 font-medium flex items-center gap-2">
                    <svg className="w-5 h-5 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 13l-5 5m0 0l-5-5m5 5V6" />
                    </svg>
                    <span className="text-sm">Auto-scrolling down</span>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
        
        <div 
          ref={scrollContainerRef}
          className="absolute inset-0 overflow-y-auto bg-muted/50"
        >
          <div 
            className="max-w-4xl mx-auto px-8 py-6"
            data-sections-container
            onDragLeave={handleDragLeave}
          >
            <div className="relative">
              {/* Drop zone at the top - unified with visual indicator */}
              <div 
                className="section-drop-zone"
                onDragOver={(e) => handleSectionDragOver(e, 0)}
                onDrop={(e) => handleSectionDrop(e, 0)}
                onDragLeave={(e) => {
                  // Remove active class when leaving this specific zone
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    e.currentTarget.classList.remove('drop-active')
                  }
                }}
              />
              
              {sortedSectionsData.map((section, index) => (
                <div key={section.id} className="relative">
                  {/* Section wrapper for drag events */}
                  <div
                    ref={(el) => {
                      if (el) sectionRefs.current.set(section.id, el)
                    }}
                    className={cn(
                      "transition-opacity duration-200",
                      dragType === 'section' && draggedSectionId === section.id && "opacity-50"
                    )}
                  >
                    {renderSectionEditor(section)}
                  </div>
                  
                  {/* Drop zone after each section - unified with visual indicator */}
                  <div 
                    className="section-drop-zone"
                    onDragOver={(e) => handleSectionDragOver(e, index + 1)}
                    onDrop={(e) => handleSectionDrop(e, index + 1)}
                    onDragLeave={(e) => {
                      // Remove active class when leaving this specific zone
                      if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                        e.currentTarget.classList.remove('drop-active')
                      }
                    }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Table of Contents Sidebar */}
        <AnimatePresence mode="wait">
          {showTOC && (
            <motion.div 
              className="absolute top-0 right-0 bottom-0 w-64 border-l border-gray-200 dark:border-gray-700 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm overflow-y-auto z-40 shadow-xl"
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="p-4">
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">TABLE OF CONTENTS</h3>
                <div className="space-y-1">
                  {sortedSectionsData.map((section) => {
                    const meta = defaultSectionMeta.find(m => m.id === section.id)
                    const Icon = meta?.icon || FileText
                    const isSaving = savingSection === section.id
                    
                    return (
                      <button
                        key={section.id}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left group transition-colors duration-150"
                      >
                        <div className={cn(
                          "w-1.5 h-1.5 rounded-full transition-colors duration-200",
                          section.status === 'completed' ? "bg-emerald-500" :
                          section.status === 'in_progress' ? "bg-yellow-500" :
                          "bg-gray-300 dark:bg-gray-600"
                        )} />
                        <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 flex-1">
                          {section.title}
                        </span>
                        {isSaving && (
                          <Save className="h-3 w-3 text-blue-500 animate-pulse" />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}