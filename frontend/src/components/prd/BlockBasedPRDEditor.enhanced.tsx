import { useState, useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { prdService, type PRD, type FlexiblePRDSection, type AgentType } from '@/services/prdService'
import { supabase } from '@/lib/supabase'
import { PRDStatusBadge } from './PRDStatusBadge'
import { NotionSectionEditor } from './blocks/NotionSectionEditor'
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types'
import '@/styles/notion-editor.css'
// Removed legacy drag imports - now using @dnd-kit
import { PRDDndProvider, SortableSection } from './dnd'
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
  enableVirtualBlocks?: boolean // Enable virtual block system
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
  className,
  enableVirtualBlocks = true 
}: EnhancedBlockBasedPRDEditorProps) {
  const [prd, setPRD] = useState<PRD | null>(null)
  const [sectionVirtualBlocks, setSectionVirtualBlocks] = useState<Record<string, VirtualContentBlock[]>>({})
  const [sections, setSections] = useState<FlexiblePRDSection[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [savingSection, setSavingSection] = useState<string | null>(null)
  const [showTOC, setShowTOC] = useState(false)
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down' | null>(null)
  
  // Drag state now handled by @dnd-kit
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

  // Removed global drag handler - @dnd-kit handles this

  // Auto-scroll now handled by @dnd-kit modifiers

  // Removed all drag handlers - now handled by @dnd-kit


  // Handle section reordering with @dnd-kit
  const handleSectionReorder = useCallback(async (reorderedSections: FlexiblePRDSection[]) => {
    if (!prd?.id) return

    // Update sections with new order
    const sectionsWithUpdatedOrder = reorderedSections.map((section, index) => ({
      ...section,
      order: index + 1
    }))
    
    setSections(sectionsWithUpdatedOrder)

    try {
      // Get session for auth
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        throw new Error('No active session')
      }
      
      // Save all section orders to backend
      const { error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'updateSectionOrders',
          prdId: prd.id,
          sections: sectionsWithUpdatedOrder.map(s => ({
            id: s.id,
            order: s.order
          }))
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
      onDelete: section.required ? undefined : () => handleRemoveSection(section.id)
    }

    // Use NotionSectionEditor for all sections with enhanced Notion-like UI
    return (
      <NotionSectionEditor 
        key={section.id} 
        {...commonProps}
        enableSlashCommands={true}
        enableBubbleMenu={true}
        enableVirtualBlocks={enableVirtualBlocks}
        onContentSync={(structured, rich) => {
          console.log('Content synced:', { structured, rich })
        }}
        onBlocksUpdate={(blocks) => {
          setSectionVirtualBlocks(prev => ({
            ...prev,
            [section.id]: blocks
          }))
          console.log(`Virtual blocks updated for section ${section.id}:`, blocks)
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
      <div className="flex-1 relative overflow-hidden">
        {/* Auto-scroll zones indicators - handled by @dnd-kit */}
        {false && (
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
          <PRDDndProvider 
            sections={sortedSectionsData}
            onSectionReorder={handleSectionReorder}
          >
            <div 
              className="max-w-4xl mx-auto px-8 py-6"
              data-sections-container
            >
              <div className="relative">
                {sortedSectionsData.map((section) => (
                  <SortableSection 
                    key={section.id} 
                    id={section.id}
                    className="mb-4"
                  >
                    <div
                      ref={(el) => {
                        if (el) sectionRefs.current.set(section.id, el)
                      }}
                    >
                      {renderSectionEditor(section)}
                    </div>
                  </SortableSection>
                ))}
              </div>
            </div>
          </PRDDndProvider>
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