import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'
import { projectService } from '@/services/projectService'
import { conversationService } from '@/services/conversationService'
import { EnhancedChatInterface } from '@/components/chat/enhanced-chat-interface'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
import { useDesignPhase, useDesignSections, useDesignPhaseStore } from '@/stores/useDesignPhaseStore'
import { ProductVisionForm } from '@/components/design-phases/forms/ProductVisionForm'
import { RoadmapEditor } from '@/components/design-phases/forms/RoadmapEditor'
import { DataModelEditor } from '@/components/design-phases/forms/DataModelEditor'
import { ColorPicker } from '@/components/design-phases/forms/ColorPicker'
import { TypographyPicker } from '@/components/design-phases/forms/TypographyPicker'
import { ShellEditor } from '@/components/design-phases/forms/ShellEditor'
import { SectionSpecEditor } from '@/components/design-phases/forms/SectionSpecEditor'
import { SectionCard } from '@/components/design-phases/cards/SectionCard'
import { StepIndicator } from '@/components/design-phases/StepIndicator'
import { ProductOverviewCard } from '@/components/design-phases/cards/ProductOverviewCard'
import { RoadmapSectionsCard } from '@/components/design-phases/cards/RoadmapSectionsCard'
import { ProductEmptyState } from '@/components/design-phases/cards/ProductEmptyState'
import { DataModelEmptyState } from '@/components/design-phases/cards/DataModelEmptyState'
import { DataModelSummaryCard } from '@/components/design-phases/cards/DataModelSummaryCard'
import { DesignTokensEmptyState } from '@/components/design-phases/cards/DesignTokensEmptyState'
import { DesignTokensSummaryCard } from '@/components/design-phases/cards/DesignTokensSummaryCard'
import { ShellSpecEmptyState } from '@/components/design-phases/cards/ShellSpecEmptyState'
import { ShellSpecSummaryCard } from '@/components/design-phases/cards/ShellSpecSummaryCard'
import type { PhaseName, DesignPhaseType, ProductOverview, ProductRoadmap, DataModel, DesignSystem, ShellSpec, SectionSpec, SampleDataOutput } from '@/types/design-phases'
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Code2,
  History,
  MessageSquare,
  MoreVertical,
  Edit,
  Trash2,
  Check,
  FileText,
  Database,
  Lightbulb,
  Palette,
  Lock,
  Layers,
  CheckCircle2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

// ============================================================================
// Consolidated Design Phases
// ============================================================================

const CONSOLIDATED_PHASES = [
  {
    id: 'product',
    label: 'Product',
    description: 'Define your product vision and roadmap',
    icon: Lightbulb,
    color: 'emerald',
    mappedPhases: ['product-vision', 'product-roadmap'] as PhaseName[],
  },
  {
    id: 'data-model',
    label: 'Data Model',
    description: 'Define entities and their relationships',
    icon: Database,
    color: 'blue',
    mappedPhases: ['data-model'] as PhaseName[],
  },
  {
    id: 'design',
    label: 'Design',
    description: 'Choose colors, typography, and layout',
    icon: Palette,
    color: 'purple',
    mappedPhases: ['design-system', 'application-shell'] as PhaseName[],
  },
  {
    id: 'sections',
    label: 'Sections',
    description: 'Design individual feature sections',
    icon: FileText,
    color: 'orange',
    mappedPhases: ['section-details'] as PhaseName[],
  },
  {
    id: 'build',
    label: 'Build',
    description: 'Generate and export your application',
    icon: Code2,
    color: 'rose',
    mappedPhases: ['export'] as PhaseName[],
  },
] as const

type ConsolidatedPhaseId = (typeof CONSOLIDATED_PHASES)[number]['id']

// ============================================================================
// Color utilities for dynamic Tailwind classes
// ============================================================================

const COLOR_CLASSES: Record<string, { bg: string; text: string; ring: string; bgIcon: string }> = {
  emerald: { bg: 'bg-emerald-500/10', text: 'text-emerald-500', ring: 'ring-emerald-500', bgIcon: 'bg-emerald-500/10' },
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-500', ring: 'ring-blue-500', bgIcon: 'bg-blue-500/10' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-500', ring: 'ring-purple-500', bgIcon: 'bg-purple-500/10' },
  orange: { bg: 'bg-orange-500/10', text: 'text-orange-500', ring: 'ring-orange-500', bgIcon: 'bg-orange-500/10' },
  rose: { bg: 'bg-rose-500/10', text: 'text-rose-500', ring: 'ring-rose-500', bgIcon: 'bg-rose-500/10' },
}

// ============================================================================
// Conversation Tab Interface
// ============================================================================

interface ConversationTab {
  id: string
  title: string
  isLoading: boolean
  activeAgent: 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper'
  isTemporary?: boolean
  metadata?: {
    primaryAgent?: string
    agentsUsed?: string[]
    lastAgent?: string
  }
}

// Inner component that uses the ProjectContext
function ProjectDesignContent() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore()
  const { toast } = useToast()

  const [project, setProject] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentConversation, setCurrentConversation] = useState<ConversationTab | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [activePhase, setActivePhase] = useState<ConsolidatedPhaseId | null>(null)
  const [conversationHistory, setConversationHistory] = useState<Array<{
    id: string;
    title: string;
    created_at: string;
    message_count: number;
    metadata?: {
      primaryAgent?: string;
      agentsUsed?: string[];
      lastAgent?: string;
    }
  }>>([])
  const [initialPromptSubmitted, setInitialPromptSubmitted] = useState(false)
  const [isFirstVisit, setIsFirstVisit] = useState(false)
  const initialPromptRef = useRef<string | null>(null)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [editingProductVision, setEditingProductVision] = useState(false)
  const [editingRoadmap, setEditingRoadmap] = useState(false)
  const [activeDesignPhase, setActiveDesignPhase] = useState<DesignPhaseType | null>(null)
  const [phaseConversations, setPhaseConversations] = useState<Partial<Record<DesignPhaseType, string>>>({})
  const [phaseInitialMessage, setPhaseInitialMessage] = useState<string | null>(null)
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null)
  const [editingDataModel, setEditingDataModel] = useState(false)
  const [editingDesignSystem, setEditingDesignSystem] = useState(false)
  const [editingShellSpec, setEditingShellSpec] = useState(false)

  // Design phase store
  const {
    currentDesignPhase,
    isSaving,
    loadDesignPhase,
    createDesignPhase,
    updateProductOverview,
    updateProductRoadmap,
    updateDataModel,
    updateDesignSystem,
    updateShellSpec,
    completePhase,
  } = useDesignPhase()

  const {
    sections,
    currentSection,
    setCurrentSection,
    updateSection,
    createSectionsFromRoadmap,
  } = useDesignSections()

  // ============================================================================
  // Design Phase AI Handlers
  // ============================================================================

  const handlePhaseComplete = async (phase: DesignPhaseType, output: any) => {
    switch (phase) {
      case 'product_vision':
        await updateProductOverview(output as ProductOverview)
        await completePhase()
        // Reload design phase data to get updated state
        if (projectId) await loadDesignPhase(projectId)
        setActivePhase('product')
        toast({
          title: 'Product Vision saved!',
          description: 'Your product overview has been saved. You can view it in the Product phase.',
        })
        break
      case 'product_roadmap':
        await updateProductRoadmap(output as ProductRoadmap)
        await createSectionsFromRoadmap(output as ProductRoadmap)
        await completePhase()
        if (projectId) await loadDesignPhase(projectId)
        setActivePhase('product')
        toast({
          title: 'Product Roadmap saved!',
          description: 'Your roadmap sections have been created.',
        })
        break
      case 'data_model':
        await updateDataModel(output as DataModel)
        await completePhase()
        if (projectId) await loadDesignPhase(projectId)
        setActivePhase('data-model')
        toast({
          title: 'Data Model saved!',
          description: 'Your data model has been saved.',
        })
        break
      case 'design_tokens':
        await updateDesignSystem(output as DesignSystem)
        await completePhase()
        if (projectId) await loadDesignPhase(projectId)
        setActivePhase('design')
        toast({
          title: 'Design Tokens saved!',
          description: 'Your design system has been saved.',
        })
        break
      case 'design_shell':
        await updateShellSpec(output as ShellSpec)
        await completePhase()
        if (projectId) await loadDesignPhase(projectId)
        setActivePhase('design')
        toast({
          title: 'Application Shell saved!',
          description: 'Your navigation and layout have been saved.',
        })
        break
      case 'shape_section':
        if (activeSectionId) {
          await updateSection(activeSectionId, { spec: output as SectionSpec })
          if (projectId) await loadDesignPhase(projectId)
          setActivePhase('sections')
          toast({
            title: 'Section spec saved!',
            description: 'The section specification has been saved.',
          })
        }
        break
      case 'sample_data': {
        const sampleOutput = output as SampleDataOutput
        if (activeSectionId) {
          await updateSection(activeSectionId, {
            sample_data: sampleOutput.sampleData,
            types_definition: sampleOutput.typesDefinition,
            status: 'completed',
          })
          if (projectId) await loadDesignPhase(projectId)
          setActivePhase('sections')
          toast({
            title: 'Sample data saved!',
            description: 'Sample data and type definitions have been saved.',
          })
        }
        break
      }
    }
  }

  const startRoadmapPhase = async () => {
    if (!projectId) return

    // Build initial message from product overview
    const overview = currentDesignPhase?.product_overview
    let msg: string | null = null
    if (overview) {
      const features = overview.features?.map(f => f.title).join(', ') || ''
      msg = `Here's my product overview for "${overview.name}": ${overview.description}. Key features: ${features}. Please help me break this into development sections.`
    }

    // Do async conversation setup BEFORE showing the chat to avoid race conditions
    const { conversation: existingPhaseConv } = await conversationService.getPhaseConversation(projectId, 'product_roadmap')

    if (existingPhaseConv) {
      setPhaseConversations(prev => ({ ...prev, product_roadmap: existingPhaseConv.id }))
      await createNewConversation(existingPhaseConv.title || 'Product Roadmap', existingPhaseConv.id)

      const { messages } = await conversationService.getConversationMessages(existingPhaseConv.id)
      if (messages.length > 0) {
        msg = null // Don't re-send if conversation already has messages
      }
    } else {
      const { conversation: newConv } = await conversationService.createPhaseConversation(
        projectId,
        'product_roadmap',
        'Product Roadmap',
        project ? {
          id: project.id,
          name: project.name || project.title || 'Untitled Project',
          description: project.description,
          template: project.template_type || project.template,
          initialPrompt: initialPromptRef.current || undefined,
        } : undefined
      )

      if (newConv) {
        setPhaseConversations(prev => ({ ...prev, product_roadmap: newConv.id }))
        setCurrentConversation({
          id: newConv.id,
          title: 'Product Roadmap',
          isLoading: false,
          activeAgent: 'project_manager',
          isTemporary: false,
        })
      }
    }

    // Show chat AFTER conversation is ready
    setActiveDesignPhase('product_roadmap')
    setPhaseInitialMessage(msg)
    setActivePhase(null)
  }

  const startDataModelPhase = async () => {
    if (!projectId) return

    const overview = currentDesignPhase?.product_overview
    const roadmap = currentDesignPhase?.product_roadmap
    const sectionNames = roadmap?.sections?.map(s => s.title).join(', ') || ''
    let msg: string | null = overview
      ? `Here's my product: "${overview.name}" with sections: ${sectionNames}. Help me define the data model.`
      : 'Help me define the data model for my app.'

    // Do async conversation setup BEFORE showing the chat
    const { conversation: existingPhaseConv } = await conversationService.getPhaseConversation(projectId, 'data_model')
    if (existingPhaseConv) {
      setPhaseConversations(prev => ({ ...prev, data_model: existingPhaseConv.id }))
      await createNewConversation(existingPhaseConv.title || 'Data Model', existingPhaseConv.id)
      const { messages } = await conversationService.getConversationMessages(existingPhaseConv.id)
      if (messages.length > 0) msg = null
    } else {
      const { conversation: newConv } = await conversationService.createPhaseConversation(
        projectId, 'data_model', 'Data Model',
        project ? { id: project.id, name: project.name || project.title || 'Untitled', description: project.description, template: project.template_type || project.template, initialPrompt: initialPromptRef.current || undefined } : undefined
      )
      if (newConv) {
        setPhaseConversations(prev => ({ ...prev, data_model: newConv.id }))
        setCurrentConversation({ id: newConv.id, title: 'Data Model', isLoading: false, activeAgent: 'project_manager', isTemporary: false })
      }
    }

    // Show chat AFTER conversation is ready
    setActiveDesignPhase('data_model')
    setPhaseInitialMessage(msg)
    setActivePhase(null)
  }

  const startDesignTokensPhase = async () => {
    if (!projectId) return

    const overview = currentDesignPhase?.product_overview
    let msg: string | null = overview
      ? `Help me choose colors and typography for "${overview.name}".`
      : 'Help me choose colors and typography for my app.'

    // Do async conversation setup BEFORE showing the chat
    const { conversation: existingPhaseConv } = await conversationService.getPhaseConversation(projectId, 'design_tokens')
    if (existingPhaseConv) {
      setPhaseConversations(prev => ({ ...prev, design_tokens: existingPhaseConv.id }))
      await createNewConversation(existingPhaseConv.title || 'Design Tokens', existingPhaseConv.id)
      const { messages } = await conversationService.getConversationMessages(existingPhaseConv.id)
      if (messages.length > 0) msg = null
    } else {
      const { conversation: newConv } = await conversationService.createPhaseConversation(
        projectId, 'design_tokens', 'Design Tokens',
        project ? { id: project.id, name: project.name || project.title || 'Untitled', description: project.description, template: project.template_type || project.template, initialPrompt: initialPromptRef.current || undefined } : undefined
      )
      if (newConv) {
        setPhaseConversations(prev => ({ ...prev, design_tokens: newConv.id }))
        setCurrentConversation({ id: newConv.id, title: 'Design Tokens', isLoading: false, activeAgent: 'project_manager', isTemporary: false })
      }
    }

    // Show chat AFTER conversation is ready
    setActiveDesignPhase('design_tokens')
    setPhaseInitialMessage(msg)
    setActivePhase(null)
  }

  const startDesignShellPhase = async () => {
    if (!projectId) return

    const overview = currentDesignPhase?.product_overview
    const sectionCount = currentDesignPhase?.product_roadmap?.sections?.length ?? 0
    let msg: string | null = overview
      ? `Help me design the navigation and layout for "${overview.name}" with ${sectionCount} sections.`
      : 'Help me design the navigation and layout for my app.'

    // Do async conversation setup BEFORE showing the chat
    const { conversation: existingPhaseConv } = await conversationService.getPhaseConversation(projectId, 'design_shell')
    if (existingPhaseConv) {
      setPhaseConversations(prev => ({ ...prev, design_shell: existingPhaseConv.id }))
      await createNewConversation(existingPhaseConv.title || 'App Shell', existingPhaseConv.id)
      const { messages } = await conversationService.getConversationMessages(existingPhaseConv.id)
      if (messages.length > 0) msg = null
    } else {
      const { conversation: newConv } = await conversationService.createPhaseConversation(
        projectId, 'design_shell', 'App Shell',
        project ? { id: project.id, name: project.name || project.title || 'Untitled', description: project.description, template: project.template_type || project.template, initialPrompt: initialPromptRef.current || undefined } : undefined
      )
      if (newConv) {
        setPhaseConversations(prev => ({ ...prev, design_shell: newConv.id }))
        setCurrentConversation({ id: newConv.id, title: 'App Shell', isLoading: false, activeAgent: 'project_manager', isTemporary: false })
      }
    }

    // Show chat AFTER conversation is ready
    setActiveDesignPhase('design_shell')
    setPhaseInitialMessage(msg)
    setActivePhase(null)
  }

  const startShapeSectionPhase = async (sectionId: string, section: { title: string; description?: string }) => {
    if (!projectId) return

    let msg: string | null = `I'd like to shape the "${section.title}" section.${section.description ? ` Description: ${section.description}` : ''}`

    // Do async conversation setup BEFORE showing the chat
    const { conversation: existingConv } = await conversationService.getSectionPhaseConversation(projectId, 'shape_section', sectionId)
    if (existingConv) {
      setPhaseConversations(prev => ({ ...prev, shape_section: existingConv.id }))
      await createNewConversation(existingConv.title || `Shape: ${section.title}`, existingConv.id)
      const { messages } = await conversationService.getConversationMessages(existingConv.id)
      if (messages.length > 0) msg = null
    } else {
      const { conversation: newConv } = await conversationService.createSectionPhaseConversation(
        projectId, 'shape_section', sectionId, `Shape: ${section.title}`,
        project ? { id: project.id, name: project.name || project.title || 'Untitled', description: project.description, template: project.template_type || project.template, initialPrompt: initialPromptRef.current || undefined } : undefined
      )
      if (newConv) {
        setPhaseConversations(prev => ({ ...prev, shape_section: newConv.id }))
        setCurrentConversation({ id: newConv.id, title: `Shape: ${section.title}`, isLoading: false, activeAgent: 'project_manager', isTemporary: false })
      }
    }

    // Show chat AFTER conversation is ready
    setActiveDesignPhase('shape_section')
    setActiveSectionId(sectionId)
    setPhaseInitialMessage(msg)
    setActivePhase(null)
  }

  const startSampleDataPhase = async (sectionId: string, section: { title: string; description?: string }) => {
    if (!projectId) return

    let msg: string | null = `Generate sample data and types for the "${section.title}" section.`

    // Do async conversation setup BEFORE showing the chat
    const { conversation: existingConv } = await conversationService.getSectionPhaseConversation(projectId, 'sample_data', sectionId)
    if (existingConv) {
      setPhaseConversations(prev => ({ ...prev, sample_data: existingConv.id }))
      await createNewConversation(existingConv.title || `Sample Data: ${section.title}`, existingConv.id)
      const { messages } = await conversationService.getConversationMessages(existingConv.id)
      if (messages.length > 0) msg = null
    } else {
      const { conversation: newConv } = await conversationService.createSectionPhaseConversation(
        projectId, 'sample_data', sectionId, `Sample Data: ${section.title}`,
        project ? { id: project.id, name: project.name || project.title || 'Untitled', description: project.description, template: project.template_type || project.template, initialPrompt: initialPromptRef.current || undefined } : undefined
      )
      if (newConv) {
        setPhaseConversations(prev => ({ ...prev, sample_data: newConv.id }))
        setCurrentConversation({ id: newConv.id, title: `Sample Data: ${section.title}`, isLoading: false, activeAgent: 'project_manager', isTemporary: false })
      }
    }

    // Show chat AFTER conversation is ready
    setActiveDesignPhase('sample_data')
    setActiveSectionId(sectionId)
    setPhaseInitialMessage(msg)
    setActivePhase(null)
  }

  // ============================================================================
  // Phase Status Helpers
  // ============================================================================

  const isPhaseCompleted = (phase: typeof CONSOLIDATED_PHASES[number]) => {
    if (!currentDesignPhase) return false
    return phase.mappedPhases.every(p => currentDesignPhase.phases_completed.includes(p))
  }

  const isPhaseCurrent = (phase: typeof CONSOLIDATED_PHASES[number]) => {
    if (!currentDesignPhase) return false
    return phase.mappedPhases.includes(currentDesignPhase.current_phase)
  }

  const isPhaseAccessible = (phase: typeof CONSOLIDATED_PHASES[number], index: number) => {
    if (index === 0) return true
    if (isPhaseCompleted(phase)) return true
    if (isPhaseCurrent(phase)) return true
    // Check if previous consolidated phase is completed
    const prevPhase = CONSOLIDATED_PHASES[index - 1]
    return isPhaseCompleted(prevPhase)
  }

  // ============================================================================
  // Product Step Status Helpers
  // ============================================================================

  const hasProductOverview = !!currentDesignPhase?.product_overview?.name?.trim()
  const hasRoadmap = (currentDesignPhase?.product_roadmap?.sections?.length ?? 0) > 0

  function getProductStepStatus(step: 1 | 2): 'completed' | 'current' | 'upcoming' {
    if (step === 1) return hasProductOverview ? 'completed' : 'current'
    if (hasRoadmap) return 'completed'
    return hasProductOverview ? 'current' : 'upcoming'
  }

  // ============================================================================
  // Phase Card Click Handler
  // ============================================================================

  const handlePhaseClick = (phase: typeof CONSOLIDATED_PHASES[number], index: number) => {
    if (!isPhaseAccessible(phase, index)) return

    if (activePhase === phase.id) {
      // Toggle off - back to chat
      setActivePhase(null)
    } else {
      setActivePhase(phase.id as ConsolidatedPhaseId)
    }
  }

  // Create or load conversation
  const createNewConversation = async (title?: string, loadFromId?: string, forceNew: boolean = false) => {
    if (!projectId) return

    try {
      let conversationId = loadFromId
      let conversationTitle = title || 'New Conversation'
      let metadata = {}
      let isTemporary = false

      if (!loadFromId || forceNew) {
        conversationId = `temp-${Date.now()}`
        conversationTitle = forceNew ? 'New Conversation' : conversationTitle
        isTemporary = true
        metadata = {
          primaryAgent: 'project_manager',
          agentsUsed: ['project_manager'],
          lastAgent: 'project_manager'
        }
      }

      const newConversation: ConversationTab = {
        id: conversationId!,
        title: conversationTitle,
        isLoading: false,
        activeAgent: 'project_manager',
        isTemporary,
        metadata
      }

      setCurrentConversation(newConversation)

      if (forceNew && showHistory) {
        setShowHistory(false)
      }
    } catch (error) {
      console.error('Error creating conversation:', error)
    }
  }

  // Handle conversation rename
  const handleConversationRename = async (conversationId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setEditingConversationId(null)
      return
    }

    setIsSavingTitle(true)
    try {
      const { conversation, error } = await conversationService.updateConversationTitle(conversationId, newTitle.trim())

      if (!error && conversation) {
        setConversationHistory(prev =>
          prev.map(conv =>
            conv.id === conversationId
              ? { ...conv, title: newTitle.trim() }
              : conv
          )
        )

        if (currentConversation?.id === conversationId) {
          setCurrentConversation(prev => prev ? { ...prev, title: newTitle.trim() } : null)
        }

        toast({
          title: 'Success',
          description: 'Conversation renamed successfully',
        })
      } else {
        toast({
          title: 'Error',
          description: 'Failed to rename conversation',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error renaming conversation:', error)
      toast({
        title: 'Error',
        description: 'Failed to rename conversation',
        variant: 'destructive',
      })
    } finally {
      setIsSavingTitle(false)
      setEditingConversationId(null)
    }
  }

  // Handle conversation delete
  const handleConversationDelete = async (conversationId: string) => {
    try {
      const { error } = await conversationService.deleteConversation(conversationId)

      if (!error) {
        setConversationHistory(prev => prev.filter(conv => conv.id !== conversationId))

        if (currentConversation?.id === conversationId) {
          setCurrentConversation(null)
        }

        toast({
          title: 'Success',
          description: 'Conversation deleted successfully',
        })
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete conversation',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error deleting conversation:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete conversation',
        variant: 'destructive',
      })
    } finally {
      setDeletingConversationId(null)
    }
  }

  // Start editing a conversation title
  const startEditingTitle = (conversationId: string, currentTitle: string) => {
    setEditingConversationId(conversationId)
    setEditingTitle(currentTitle)
    setTimeout(() => {
      if (titleInputRef.current) {
        titleInputRef.current.focus()
        const length = titleInputRef.current.value.length
        titleInputRef.current.setSelectionRange(length, length)
      }
    }, 100)
  }

  // Load conversation history
  const loadConversationHistory = async () => {
    if (!user?.id || !projectId) return

    try {
      const { data: conversations, error } = await supabase
        .from('conversations')
        .select(`
          id,
          title,
          created_at,
          metadata
        `)
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        console.error('Error loading conversation history:', error)
        return
      }

      const formattedConversations = await Promise.all(
        conversations?.map(async (conv) => {
          const { count } = await supabase
            .from('conversation_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)

          return {
            id: conv.id,
            title: conv.title || 'Untitled Conversation',
            created_at: conv.created_at,
            message_count: count || 0,
            metadata: conv.metadata
          }
        }) || []
      )

      setConversationHistory(formattedConversations)
    } catch (error) {
      console.error('Error loading conversation history:', error)
    }
  }

  // Load history when toggling
  useEffect(() => {
    if (showHistory) {
      loadConversationHistory()
    }
  }, [showHistory, user?.id, projectId])

  useEffect(() => {
    console.log('ProjectDesign mount:', { user, isAuthenticated, authLoading, projectId })

    if (authLoading) {
      return
    }

    if (!isAuthenticated || !user) {
      console.log('Not authenticated, redirecting to dashboard')
      navigate('/dashboard')
      return
    }

    if (!projectId) {
      console.log('No project ID, redirecting to dashboard')
      navigate('/dashboard')
      return
    }

    loadProject()
  }, [user, isAuthenticated, authLoading, projectId, navigate])

  const loadProject = async () => {
    if (!projectId) return

    try {
      setIsLoading(true)
      const { project: loadedProject, error } = await projectService.getProject(projectId)

      if (error || !loadedProject) {
        toast({
          title: 'Error',
          description: 'Failed to load project',
          variant: 'destructive',
        })
        navigate('/dashboard')
        return
      }

      setProject(loadedProject)

      // Load design phase data (create if it doesn't exist yet)
      await loadDesignPhase(projectId)
      const { currentDesignPhase: existingPhase } = useDesignPhaseStore.getState()
      if (!existingPhase) {
        await createDesignPhase({ project_id: projectId })
      }

      // Extract initial prompt from app_config
      const initialPrompt = loadedProject.app_config?.initialPrompt
      if (initialPrompt) {
        initialPromptRef.current = initialPrompt
      }

      // Determine the appropriate design phase based on progress
      // We use a function to read the latest store state after loadDesignPhase completes
      const { currentDesignPhase: loadedDesignPhase } = useDesignPhaseStore.getState()
      const hasOverview = !!loadedDesignPhase?.product_overview?.name?.trim()
      const hasRoadmapData = (loadedDesignPhase?.product_roadmap?.sections?.length ?? 0) > 0

      if (hasOverview && hasRoadmapData) {
        // Both phases complete, no active design phase - show normal chat
        setActiveDesignPhase(null)
      } else if (hasOverview && !hasRoadmapData) {
        // Product vision done but no roadmap yet
        setActiveDesignPhase('product_roadmap')
      } else {
        // Start with product vision
        setActiveDesignPhase('product_vision')
      }

      // Check for existing phase conversation first, then fall back to general conversation
      const activePhaseKey = !hasOverview ? 'product_vision' : (!hasRoadmapData ? 'product_roadmap' : null)

      if (activePhaseKey) {
        const { conversation: phaseConv } = await conversationService.getPhaseConversation(projectId, activePhaseKey)
        if (phaseConv) {
          setPhaseConversations(prev => ({ ...prev, [activePhaseKey]: phaseConv.id }))
          await createNewConversation(phaseConv.title || loadedProject.title, phaseConv.id)

          const { messages } = await conversationService.getConversationMessages(phaseConv.id)
          if (messages.length === 0 && initialPrompt && !initialPromptSubmitted) {
            setIsFirstVisit(true)
          }
        } else {
          // Check for any existing conversation (legacy or general)
          const { conversation: existingConv } = await conversationService.getConversationByProjectId(projectId)

          if (existingConv) {
            await createNewConversation(existingConv.title || loadedProject.title, existingConv.id)

            const { messages } = await conversationService.getConversationMessages(existingConv.id)
            if (messages.length === 0 && initialPrompt && !initialPromptSubmitted) {
              setIsFirstVisit(true)
            }
          } else {
            await createNewConversation(loadedProject.title || loadedProject.name)
            if (initialPrompt && !initialPromptSubmitted) {
              setIsFirstVisit(true)
            }
          }
        }
      } else {
        // No active design phase, load most recent conversation
        const { conversation: existingConv } = await conversationService.getConversationByProjectId(projectId)

        if (existingConv) {
          await createNewConversation(existingConv.title || loadedProject.title, existingConv.id)
        } else {
          await createNewConversation(loadedProject.title || loadedProject.name)
        }
      }
    } catch (error) {
      console.error('Error loading project:', error)
      toast({
        title: 'Error',
        description: 'Failed to load project',
        variant: 'destructive',
      })
      navigate('/dashboard')
    } finally {
      setIsLoading(false)
    }
  }

  const handleApplyCode = (code: string) => {
    console.log('Applying code:', code)
    toast({
      title: 'Code Applied',
      description: 'The generated code has been added to your project',
    })
  }

  // ============================================================================
  // Phase Editor Renderers
  // ============================================================================

  const renderPhaseEditor = () => {
    const phaseConfig = CONSOLIDATED_PHASES.find(p => p.id === activePhase)
    if (!phaseConfig) return null

    const colorClasses = COLOR_CLASSES[phaseConfig.color]
    const PhaseIcon = phaseConfig.icon

    const header = (
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <div className={cn('w-8 h-8 rounded-full flex items-center justify-center', colorClasses.bgIcon)}>
            <PhaseIcon className={cn('w-4 h-4', colorClasses.text)} />
          </div>
          {phaseConfig.label}
        </h2>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setActivePhase(null)}
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Chat
        </Button>
      </div>
    )

    switch (activePhase) {
      case 'product': {
        const allProductStepsComplete = hasProductOverview && hasRoadmap
        const productHeader = (
          <div className="flex items-start gap-3 p-4 border-b border-gray-200 dark:border-gray-700">
            <div className={cn('w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5', colorClasses.bgIcon)}>
              <PhaseIcon className={cn('w-4 h-4', colorClasses.text)} />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold leading-tight">Product Definition</h2>
              <p className="text-sm text-muted-foreground">
                Define your product vision and break it into development sections.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="flex-shrink-0"
              onClick={() => setActivePhase(null)}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Chat
            </Button>
          </div>
        )
        return (
          <div className="flex flex-col h-full">
            {productHeader}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Step 1: Product Vision */}
              <StepIndicator step={1} status={getProductStepStatus(1)}>
                {hasProductOverview && currentDesignPhase?.product_overview ? (
                  <ProductOverviewCard
                    overview={currentDesignPhase.product_overview}
                    onEdit={() => setEditingProductVision(true)}
                  />
                ) : (
                  <ProductEmptyState type="overview" onGoToChat={() => {
                    setActivePhase(null)
                    setActiveDesignPhase('product_vision')
                  }} />
                )}
              </StepIndicator>

              {/* Step 2: Roadmap / Sections */}
              <StepIndicator step={2} status={getProductStepStatus(2)} isLast={!allProductStepsComplete}>
                {hasRoadmap && currentDesignPhase?.product_roadmap ? (
                  <RoadmapSectionsCard
                    sections={currentDesignPhase.product_roadmap.sections}
                    onEdit={() => setEditingRoadmap(true)}
                  />
                ) : (
                  <ProductEmptyState type="roadmap" onGoToChat={startRoadmapPhase} disabled={!hasProductOverview} />
                )}
              </StepIndicator>

              {/* Step 3: Continue to Data Model */}
              {allProductStepsComplete && (
                <StepIndicator step={3} status="current" isLast>
                  <Button
                    onClick={() => setActivePhase('data-model')}
                    className="w-full"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Continue to Data Model
                  </Button>
                </StepIndicator>
              )}
            </div>

            {/* Edit Product Vision Dialog */}
            <Dialog open={editingProductVision} onOpenChange={setEditingProductVision}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Product Vision</DialogTitle>
                  <DialogDescription>
                    Update your product name, description, problems, and features.
                  </DialogDescription>
                </DialogHeader>
                <ProductVisionForm
                  initialData={currentDesignPhase?.product_overview ?? null}
                  onChange={updateProductOverview}
                  disabled={isSaving}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingProductVision(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Edit Roadmap Dialog */}
            <Dialog open={editingRoadmap} onOpenChange={setEditingRoadmap}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Roadmap</DialogTitle>
                  <DialogDescription>
                    Add, remove, or reorder your product sections.
                  </DialogDescription>
                </DialogHeader>
                <RoadmapEditor
                  sections={currentDesignPhase?.product_roadmap?.sections ?? []}
                  onChange={(roadmapSections) => updateProductRoadmap({ sections: roadmapSections })}
                  disabled={isSaving}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingRoadmap(false)}>
                    Close
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )
      }
      case 'data-model': {
        const hasDataModel = currentDesignPhase?.data_model?.entities?.length
        return (
          <div className="flex flex-col h-full">
            {header}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              <StepIndicator step={1} status={hasDataModel ? 'completed' : 'current'} isLast={!hasDataModel}>
                {hasDataModel && currentDesignPhase?.data_model ? (
                  <DataModelSummaryCard
                    dataModel={currentDesignPhase.data_model}
                    onEdit={() => setEditingDataModel(true)}
                  />
                ) : (
                  <DataModelEmptyState onDefineWithAI={startDataModelPhase} />
                )}
              </StepIndicator>

              {hasDataModel && (
                <StepIndicator step={2} status="current" isLast>
                  <Button onClick={() => setActivePhase('design')} className="w-full">
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Continue to Design
                  </Button>
                </StepIndicator>
              )}
            </div>

            <Dialog open={editingDataModel} onOpenChange={setEditingDataModel}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Data Model</DialogTitle>
                  <DialogDescription>Update your entities, fields, and relationships.</DialogDescription>
                </DialogHeader>
                <DataModelEditor
                  dataModel={currentDesignPhase?.data_model ?? null}
                  onChange={updateDataModel}
                  disabled={isSaving}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingDataModel(false)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )
      }
      case 'design': {
        const hasDesignTokens = !!currentDesignPhase?.design_system?.colors?.primary?.value
        const hasShellSpec = (currentDesignPhase?.shell_spec?.navigationItems?.length ?? 0) > 0

        function getDesignStepStatus(step: 1 | 2 | 3): 'completed' | 'current' | 'upcoming' {
          if (step === 1) return hasDesignTokens ? 'completed' : 'current'
          if (step === 2) {
            if (hasShellSpec) return 'completed'
            return hasDesignTokens ? 'current' : 'upcoming'
          }
          return (hasDesignTokens && hasShellSpec) ? 'current' : 'upcoming'
        }

        const allDesignStepsComplete = hasDesignTokens && hasShellSpec

        return (
          <div className="flex flex-col h-full">
            {header}
            <div className="flex-1 overflow-y-auto p-4 space-y-6">
              {/* Step 1: Design Tokens */}
              <StepIndicator step={1} status={getDesignStepStatus(1)}>
                {hasDesignTokens && currentDesignPhase?.design_system ? (
                  <DesignTokensSummaryCard
                    designSystem={currentDesignPhase.design_system}
                    onEdit={() => setEditingDesignSystem(true)}
                  />
                ) : (
                  <DesignTokensEmptyState onDefineWithAI={startDesignTokensPhase} />
                )}
              </StepIndicator>

              {/* Step 2: Application Shell */}
              <StepIndicator step={2} status={getDesignStepStatus(2)} isLast={!allDesignStepsComplete}>
                {hasShellSpec && currentDesignPhase?.shell_spec ? (
                  <ShellSpecSummaryCard
                    shellSpec={currentDesignPhase.shell_spec}
                    onEdit={() => setEditingShellSpec(true)}
                  />
                ) : (
                  <ShellSpecEmptyState
                    onDefineWithAI={startDesignShellPhase}
                    disabled={!hasDesignTokens}
                  />
                )}
              </StepIndicator>

              {/* Step 3: Continue to Sections */}
              {allDesignStepsComplete && (
                <StepIndicator step={3} status="current" isLast>
                  <Button onClick={() => setActivePhase('sections')} className="w-full">
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Continue to Sections
                  </Button>
                </StepIndicator>
              )}
            </div>

            {/* Edit Design Tokens Dialog */}
            <Dialog open={editingDesignSystem} onOpenChange={setEditingDesignSystem}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Design Tokens</DialogTitle>
                  <DialogDescription>Update your colors and typography.</DialogDescription>
                </DialogHeader>
                <div className="space-y-6">
                  <div>
                    <h3 className="text-sm font-medium mb-3">Colors</h3>
                    <div className="space-y-4">
                      {(['primary', 'secondary', 'neutral', 'accent'] as const).map((colorKey) => (
                        <ColorPicker
                          key={colorKey}
                          label={colorKey.charAt(0).toUpperCase() + colorKey.slice(1)}
                          value={currentDesignPhase?.design_system?.colors?.[colorKey] ?? null}
                          onChange={(color) => {
                            const current = currentDesignPhase?.design_system
                            if (current) {
                              updateDesignSystem({ ...current, colors: { ...current.colors, [colorKey]: color } })
                            }
                          }}
                          disabled={isSaving}
                        />
                      ))}
                    </div>
                  </div>
                  <div>
                    <h3 className="text-sm font-medium mb-3">Typography</h3>
                    <div className="space-y-4">
                      {(['heading', 'body', 'mono'] as const).map((category) => (
                        <TypographyPicker
                          key={category}
                          label={category.charAt(0).toUpperCase() + category.slice(1)}
                          category={category}
                          value={currentDesignPhase?.design_system?.typography?.[category] ?? null}
                          onChange={(font) => {
                            const current = currentDesignPhase?.design_system
                            if (current) {
                              updateDesignSystem({ ...current, typography: { ...current.typography, [category]: font } })
                            }
                          }}
                          disabled={isSaving}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingDesignSystem(false)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Edit Shell Spec Dialog */}
            <Dialog open={editingShellSpec} onOpenChange={setEditingShellSpec}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Edit Application Shell</DialogTitle>
                  <DialogDescription>Update your navigation and layout structure.</DialogDescription>
                </DialogHeader>
                <ShellEditor
                  shellSpec={currentDesignPhase?.shell_spec ?? null}
                  sections={currentDesignPhase?.product_roadmap?.sections ?? []}
                  onChange={updateShellSpec}
                  disabled={isSaving}
                />
                <DialogFooter>
                  <Button variant="outline" onClick={() => setEditingShellSpec(false)}>Close</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )
      }
      case 'sections':
        return (
          <div className="flex flex-col h-full">
            {header}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {currentSection ? (
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setCurrentSection(null)}
                    className="mb-3"
                  >
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    Back to Sections
                  </Button>
                  <h3 className="text-sm font-medium mb-3">{currentSection.title}</h3>
                  {currentSection.description && (
                    <p className="text-sm text-muted-foreground mb-4">{currentSection.description}</p>
                  )}

                  {/* AI action buttons */}
                  <div className="flex gap-2 mb-4">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startShapeSectionPhase(currentSection.id, { title: currentSection.title, description: currentSection.description })}
                      disabled={!!currentSection.spec}
                    >
                      <MessageSquare className="w-4 h-4 mr-2" />
                      {currentSection.spec ? 'Spec Defined' : 'Shape Section with AI'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startSampleDataPhase(currentSection.id, { title: currentSection.title, description: currentSection.description })}
                      disabled={!currentSection.spec}
                    >
                      <Database className="w-4 h-4 mr-2" />
                      {currentSection.sample_data ? 'Data Generated' : 'Generate Sample Data'}
                    </Button>
                  </div>

                  {/* Section spec editor for manual editing */}
                  <SectionSpecEditor
                    spec={currentSection.spec ?? null}
                    onChange={(spec) => updateSection(currentSection.id, { spec })}
                    disabled={isSaving}
                  />
                </div>
              ) : (
                <>
                  {sections.length === 0 ? (
                    <div className="text-center py-8">
                      <FileText className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                      <p className="text-sm text-muted-foreground">No sections yet. Define your product roadmap first.</p>
                    </div>
                  ) : (
                    sections.map((section) => (
                      <SectionCard
                        key={section.id}
                        section={section}
                        onClick={() => setCurrentSection(section)}
                      />
                    ))
                  )}
                </>
              )}
            </div>
          </div>
        )
      case 'build':
        return (
          <div className="flex flex-col h-full">
            {header}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="text-center py-12">
                <Code2 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">Build & Export</h3>
                <p className="text-sm text-muted-foreground max-w-md mx-auto">
                  Review your design and generate AI-ready implementation artifacts. This feature is coming soon.
                </p>
              </div>
            </div>
          </div>
        )
      default:
        return null
    }
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Project not found</p>
          <Button onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full mx-2 mb-2 rounded-lg overflow-hidden bg-white/30 dark:bg-gray-900/30 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 shadow-xl">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left Panel - Chat Interface or Phase Editor */}
        <ResizablePanel defaultSize={65} minSize={40}>
          <div className="h-full p-2">
            <Card className="h-full flex flex-col bg-transparent border-gray-300 dark:border-gray-700/50 relative overflow-hidden">
              <AnimatePresence mode="wait">
                {activePhase ? (
                  <motion.div
                    key={`phase-editor-${activePhase}`}
                    className="flex-1 flex flex-col absolute inset-0"
                    initial={{ opacity: 0, x: 100, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -100, scale: 0.95 }}
                    transition={{
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1]
                    }}
                  >
                    {renderPhaseEditor()}
                  </motion.div>
                ) : (
                  <motion.div
                    key="chat-interface"
                    className="flex-1 flex flex-col absolute inset-0"
                    initial={{ opacity: 0, x: -100, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 100, scale: 0.95 }}
                    transition={{
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1]
                    }}
                  >
                    <EnhancedChatInterface
                      projectId={projectId || ''}
                      conversationId={currentConversation?.id}
                      onApplyCode={handleApplyCode}
                      className="flex-1"
                      activeAgent="project_manager"
                      conversationTitle={currentConversation?.title}
                      onNewConversation={() => {
                        setActiveDesignPhase(null)
                        createNewConversation(undefined, undefined, true)
                      }}
                      onToggleHistory={() => setShowHistory(!showHistory)}
                      isHistoryOpen={showHistory}
                      designPhase={activeDesignPhase || undefined}
                      onPhaseComplete={handlePhaseComplete}
                      sectionId={(activeDesignPhase === 'shape_section' || activeDesignPhase === 'sample_data') ? activeSectionId || undefined : undefined}
                      phaseContext={(() => {
                        if (!activeDesignPhase) return undefined
                        switch (activeDesignPhase) {
                          case 'product_roadmap':
                            return currentDesignPhase?.product_overview ? { productOverview: currentDesignPhase.product_overview } : undefined
                          case 'data_model':
                            return {
                              ...(currentDesignPhase?.product_overview ? { productOverview: currentDesignPhase.product_overview } : {}),
                              ...(currentDesignPhase?.product_roadmap ? { productRoadmap: currentDesignPhase.product_roadmap } : {}),
                            }
                          case 'design_tokens':
                            return currentDesignPhase?.product_overview ? { productOverview: currentDesignPhase.product_overview } : undefined
                          case 'design_shell':
                            return {
                              ...(currentDesignPhase?.product_overview ? { productOverview: currentDesignPhase.product_overview } : {}),
                              ...(currentDesignPhase?.product_roadmap ? { productRoadmap: currentDesignPhase.product_roadmap } : {}),
                              ...(currentDesignPhase?.design_system ? { designSystem: currentDesignPhase.design_system } : {}),
                            }
                          case 'shape_section': {
                            const sec = sections.find(s => s.id === activeSectionId)
                            return {
                              ...(currentDesignPhase?.product_overview ? { productOverview: currentDesignPhase.product_overview } : {}),
                              ...(currentDesignPhase?.product_roadmap ? { productRoadmap: currentDesignPhase.product_roadmap } : {}),
                              ...(currentDesignPhase?.data_model ? { dataModel: currentDesignPhase.data_model } : {}),
                              ...(sec ? { sectionInfo: { title: sec.title, description: sec.description, sectionId: sec.section_id } } : {}),
                            }
                          }
                          case 'sample_data': {
                            const sec2 = sections.find(s => s.id === activeSectionId)
                            return {
                              ...(currentDesignPhase?.data_model ? { dataModel: currentDesignPhase.data_model } : {}),
                              ...(sec2?.spec ? { sectionSpec: sec2.spec } : {}),
                              ...(sec2 ? { sectionInfo: { title: sec2.title, description: sec2.description, sectionId: sec2.section_id } } : {}),
                            }
                          }
                          default:
                            return undefined
                        }
                      })()}
                      initialMessage={phaseInitialMessage || (isFirstVisit && initialPromptRef.current ? initialPromptRef.current : undefined)}
                      projectContext={project ? {
                        id: project.id,
                        name: project.name || project.title || 'Untitled Project',
                        description: project.description,
                        template: project.template_type || project.template,
                        initialPrompt: initialPromptRef.current || undefined
                      } : undefined}
                      onInitialMessageSent={() => {
                        setIsFirstVisit(false)
                        setInitialPromptSubmitted(true)
                        setPhaseInitialMessage(null)
                      }}
                      onConversationCreated={(newConversationId) => {
                        if (currentConversation?.isTemporary) {
                          setCurrentConversation({
                            ...currentConversation,
                            id: newConversationId,
                            isTemporary: false,
                          })
                          loadConversationHistory()
                        } else if (!currentConversation) {
                          setCurrentConversation({
                            id: newConversationId,
                            title: 'New Conversation',
                            isLoading: false,
                            activeAgent: 'project_manager',
                            isTemporary: false,
                            metadata: {
                              primaryAgent: 'project_manager',
                              agentsUsed: ['project_manager'],
                              lastAgent: 'project_manager'
                            }
                          })
                          loadConversationHistory()
                        }
                      }}
                      onTitleGenerated={(generatedTitle) => {
                        if (currentConversation) {
                          setCurrentConversation(prev => prev ? {
                            ...prev,
                            title: generatedTitle
                          } : null)
                          setConversationHistory(prev =>
                            prev.map(conv =>
                              conv.id === currentConversation.id
                                ? { ...conv, title: generatedTitle }
                                : conv
                            )
                          )
                        }
                      }}
                      onConversationTitleUpdated={(updatedTitle) => {
                        if (currentConversation) {
                          setCurrentConversation(prev => prev ? {
                            ...prev,
                            title: updatedTitle
                          } : null)
                          setConversationHistory(prev =>
                            prev.map(conv =>
                              conv.id === currentConversation.id
                                ? { ...conv, title: updatedTitle }
                                : conv
                            )
                          )
                        }
                      }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel - Design Phases or History */}
        <ResizablePanel defaultSize={35} minSize={25}>
          <div className="h-full p-2">
            <Card className="h-full flex flex-col bg-transparent border-gray-300 dark:border-gray-700/50">
              <CardHeader className="p-4 pl-5 border-b border-gray-300 dark:border-gray-700/50">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={showHistory ? 'history' : 'phases'}
                    className="flex items-center gap-2"
                    initial={{ opacity: 0, x: showHistory ? 10 : -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: showHistory ? -10 : 10 }}
                    transition={{ duration: 0.2, ease: "easeInOut" }}
                  >
                    {showHistory ? (
                      <>
                        <History className="w-5 h-5" />
                        <CardTitle className="text-lg">Chat History</CardTitle>
                      </>
                    ) : (
                      <>
                        <Layers className="w-5 h-5" />
                        <CardTitle className="text-lg">Phases</CardTitle>
                      </>
                    )}
                  </motion.div>
                </AnimatePresence>
              </CardHeader>
              <CardContent className="p-4 flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">
                  {showHistory ? (
                    // Conversation History View
                    <motion.div
                      key="history-content"
                      className="space-y-2"
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                    >
                      {conversationHistory.length === 0 ? (
                        <div className="text-center py-8">
                          <History className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                          <p className="text-sm text-muted-foreground">No conversation history yet</p>
                        </div>
                      ) : (
                        conversationHistory.map((conv) => {
                          const isCurrentConversation = currentConversation?.id === conv.id;

                          return (
                            <div
                              key={conv.id}
                              className={cn(
                                "group relative p-3 rounded-lg border transition-all",
                                isCurrentConversation
                                  ? "bg-card border-primary/50 ring-1 ring-primary/30 shadow-sm"
                                  : "bg-card hover:bg-accent/50 border-gray-200 dark:border-gray-700"
                              )}
                            >
                              {/* Dropdown menu */}
                              <div className="absolute top-2 right-2 z-10">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreVertical className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        startEditingTitle(conv.id, conv.title)
                                      }}
                                    >
                                      <Edit className="w-3.5 h-3.5 mr-2" />
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setDeletingConversationId(conv.id)
                                      }}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>

                              <div
                                className="flex items-start gap-3 cursor-pointer"
                                onClick={async () => {
                                  await createNewConversation(conv.title, conv.id)
                                }}
                              >
                                <div className="w-8 h-8 rounded-full bg-gray-500/10 flex items-center justify-center flex-shrink-0">
                                  <MessageSquare className="w-4 h-4 text-gray-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    {editingConversationId === conv.id ? (
                                      <Popover open={editingConversationId === conv.id} onOpenChange={(open) => !open && setEditingConversationId(null)}>
                                        <PopoverTrigger asChild>
                                          <div className="flex-1" />
                                        </PopoverTrigger>
                                        <PopoverContent className="w-56 px-3 pt-1" align="start" side="bottom">
                                          <div className="space-y-1">
                                            <Label htmlFor={`conv-title-${conv.id}`} className="text-xs text-muted-foreground">Conversation title</Label>
                                            <div className="flex gap-1.5 items-center">
                                              <Input
                                                id={`conv-title-${conv.id}`}
                                                ref={titleInputRef}
                                                value={editingTitle}
                                                onChange={(e) => setEditingTitle(e.target.value)}
                                                onKeyDown={(e) => {
                                                  e.stopPropagation()
                                                  if (e.key === 'Enter') {
                                                    handleConversationRename(conv.id, editingTitle)
                                                  } else if (e.key === 'Escape') {
                                                    setEditingConversationId(null)
                                                  }
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                placeholder="Enter conversation title"
                                                className="flex-1 bg-background h-8 text-sm"
                                                disabled={isSavingTitle}
                                                autoFocus
                                              />
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleConversationRename(conv.id, editingTitle)
                                                }}
                                                disabled={isSavingTitle || !editingTitle.trim() || editingTitle === conv.title}
                                                className="h-8 w-8"
                                              >
                                                <Check className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    ) : (
                                      <h3 className="font-medium text-sm truncate flex-1">{conv.title}</h3>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between mt-1">
                                    <span className="text-xs text-muted-foreground">
                                      {conv.message_count} messages
                                    </span>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(conv.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </motion.div>
                  ) : (
                    // Design Phases View
                    <motion.div
                      key="phases-content"
                      className="space-y-0"
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                    >
                      {CONSOLIDATED_PHASES.map((phase, index) => {
                        const completed = isPhaseCompleted(phase)
                        const current = isPhaseCurrent(phase)
                        const accessible = isPhaseAccessible(phase, index)
                        const isActive = activePhase === phase.id
                        const colorClasses = COLOR_CLASSES[phase.color]
                        const PhaseIcon = phase.icon

                        return (
                          <motion.div
                            key={phase.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.1 + index * 0.05, duration: 0.2 }}
                          >
                            {/* Connector line between cards */}
                            {index > 0 && (
                              <div className="flex justify-center py-1">
                                <div className={cn(
                                  "w-0.5 h-4",
                                  completed || current || accessible
                                    ? "bg-gray-300 dark:bg-gray-600"
                                    : "bg-gray-200 dark:bg-gray-700"
                                )} />
                              </div>
                            )}

                            <div
                              className={cn(
                                "p-3 rounded-lg border transition-all relative",
                                accessible
                                  ? "bg-card hover:bg-accent/50 cursor-pointer border-gray-200 dark:border-gray-700"
                                  : "bg-gray-50/50 dark:bg-gray-800/30 cursor-not-allowed border-gray-200 dark:border-gray-700",
                                isActive && `ring-2 ${colorClasses.ring}`,
                              )}
                              onClick={() => handlePhaseClick(phase, index)}
                            >
                              {/* Current indicator dot - top right */}
                              {/* {current && !completed && !isActive && (
                                <div className="absolute top-3 right-3">
                                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                                </div>
                              )} */}

                              <div className={cn(
                                "flex items-start gap-3",
                                !accessible && "opacity-60"
                              )}>
                                {/* Phase icon / status icon */}
                                <div className={cn(
                                  "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0",
                                  colorClasses.bgIcon
                                )}>
                                  {completed ? (
                                    <CheckCircle2 className={cn("w-5 h-5", colorClasses.text)} />
                                  ) : !accessible ? (
                                    <Lock className="w-5 h-5 text-gray-400" />
                                  ) : (
                                    <PhaseIcon className={cn("w-5 h-5", colorClasses.text)} />
                                  )}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    {completed && (
                                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                                        Completed
                                      </span>
                                    )}
                                  </div>
                                  <h3 className="font-medium text-sm">{phase.label}</h3>
                                  <p className="text-xs text-muted-foreground mt-0.5">
                                    {phase.description}
                                  </p>
                                </div>
                                {isActive && (
                                  <div className="w-2 h-2 rounded-full mt-1 bg-green-500 animate-pulse" />
                                )}
                              </div>
                            </div>
                          </motion.div>
                        )
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </CardContent>
            </Card>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deletingConversationId} onOpenChange={(open) => !open && setDeletingConversationId(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Conversation</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this conversation? This action cannot be undone and will permanently delete all messages in this conversation.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingConversationId(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (deletingConversationId) {
                  handleConversationDelete(deletingConversationId)
                }
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// Main component - provider is now handled by the router
export function ProjectDesign() {
  return <ProjectDesignContent />
}
