import { useEffect, useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { prdService, type PRD, type PRDSection, type PRDFeature } from '@/services/prdService'
import { PRDToolbar } from './PRDToolbar'
import { PRDStatusBadge } from './PRDStatusBadge'
import { 
  FileText, 
  Save, 
  Download, 
  CheckCircle2, 
  Circle,
  ArrowLeft,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PRDEditorProps {
  projectId: string
  conversationId?: string
  onClose?: () => void
  className?: string
}

type PRDSectionType = 'overview' | 'core_features' | 'additional_features' | 'technical_requirements' | 'success_metrics'

export function PRDEditor({ 
  projectId, 
  onClose,
  className 
}: PRDEditorProps) {
  const [prd, setPRD] = useState<PRD | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [activeSection, setActiveSection] = useState<PRDSectionType>('overview')
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const { toast } = useToast()

  // TipTap editor instance
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3]
        }
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return 'Enter section title...'
          }
          return 'Start writing...'
        }
      }),
      Typography,
      Highlight,
      TaskList,
      TaskItem.configure({
        nested: true
      })
    ],
    content: '',
    onUpdate: () => {
      handleContentChange()
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[400px] p-4'
      }
    }
  })

  // Load or create PRD on mount
  useEffect(() => {
    loadOrCreatePRD()
  }, [projectId])

  // Update editor content when section changes
  useEffect(() => {
    if (editor && prd) {
      updateEditorContent()
    }
  }, [activeSection, prd, editor])

  const loadOrCreatePRD = async () => {
    setIsLoading(true)
    try {
      let { prd: existingPRD, error } = await prdService.getPRDByProject(projectId)
      
      if (!existingPRD) {
        // Create new PRD
        const result = await prdService.createPRD(projectId)
        existingPRD = result.prd
        error = result.error
      }

      if (error) {
        throw error
      }

      setPRD(existingPRD)
    } catch (error) {
      console.error('Error loading PRD:', error)
      toast({
        title: 'Error',
        description: 'Failed to load PRD',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
    }
  }

  const updateEditorContent = () => {
    if (!editor || !prd) return

    let content = ''
    
    switch (activeSection) {
      case 'overview':
        content = formatOverviewContent(prd.overview)
        break
      case 'core_features':
        content = formatFeaturesContent(prd.core_features)
        break
      case 'additional_features':
        content = formatFeaturesContent(prd.additional_features)
        break
      case 'technical_requirements':
        content = formatTechnicalRequirements(prd.technical_requirements)
        break
      case 'success_metrics':
        content = formatSuccessMetrics(prd.success_metrics)
        break
    }

    editor.commands.setContent(content)
  }

  const formatOverviewContent = (overview: PRDSection): string => {
    let content = '<h2>Overview</h2>'
    if (overview.vision) {
      content += `<h3>Vision</h3><p>${overview.vision}</p>`
    }
    if (overview.problem) {
      content += `<h3>Problem Statement</h3><p>${overview.problem}</p>`
    }
    if (overview.targetUsers) {
      content += `<h3>Target Users</h3><p>${overview.targetUsers}</p>`
    }
    return content || '<p>Start by describing your product vision...</p>'
  }

  const formatFeaturesContent = (features: PRDFeature[]): string => {
    if (!features || features.length === 0) {
      return '<p>Add features to this section...</p>'
    }
    
    let content = ''
    features.forEach((feature, index) => {
      content += `<h3>${index + 1}. ${feature.title}</h3>`
      content += `<p>${feature.description}</p>`
    })
    return content
  }

  const formatTechnicalRequirements = (requirements: any): string => {
    let content = '<h2>Technical Requirements</h2>'
    if (requirements?.platforms && requirements.platforms.length > 0) {
      content += `<h3>Platforms</h3><ul>${requirements.platforms.map((p: string) => `<li>${p}</li>`).join('')}</ul>`
    }
    if (requirements?.performance) {
      content += `<h3>Performance Requirements</h3><p>${requirements.performance}</p>`
    }
    if (requirements?.integrations && requirements.integrations.length > 0) {
      content += `<h3>Integrations</h3><ul>${requirements.integrations.map((i: string) => `<li>${i}</li>`).join('')}</ul>`
    }
    return content || '<p>Define technical requirements...</p>'
  }

  const formatSuccessMetrics = (metrics: any): string => {
    let content = '<h2>Success Metrics</h2>'
    if (metrics?.kpis && metrics.kpis.length > 0) {
      content += '<h3>Key Performance Indicators</h3><ul>'
      metrics.kpis.forEach((kpi: any) => {
        content += `<li><strong>${kpi.metric}:</strong> ${kpi.target}`
        if (kpi.timeframe) {
          content += ` (${kpi.timeframe})`
        }
        content += '</li>'
      })
      content += '</ul>'
    }
    return content || '<p>Define success metrics...</p>'
  }

  const handleContentChange = useCallback(() => {
    setHasUnsavedChanges(true)
    
    if (!prd) return

    // Parse the HTML content and update the appropriate section
    const updatedPRD = { ...prd }
    
    // This is a simplified version - in production, you'd parse the HTML
    // and extract structured data based on the section
    switch (activeSection) {
      case 'overview':
        // Parse and update overview fields
        break
      case 'core_features':
        // Parse and update core features
        break
      // ... handle other sections
    }

    // Auto-save with debounce
    if (prd.id) {
      prdService.autoSavePRD(prd.id, updatedPRD)
    }
  }, [prd, activeSection])

  const handleSave = async () => {
    if (!prd || !prd.id) return

    setIsSaving(true)
    try {
      const { error } = await prdService.updatePRD(prd.id, prd)
      if (error) throw error

      setHasUnsavedChanges(false)
      toast({
        title: 'Success',
        description: 'PRD saved successfully'
      })
    } catch (error) {
      console.error('Error saving PRD:', error)
      toast({
        title: 'Error',
        description: 'Failed to save PRD',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }

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

  const getSectionCompletionStatus = (section: PRDSectionType): boolean => {
    if (!prd) return false

    switch (section) {
      case 'overview':
        return !!(prd.overview?.vision && prd.overview?.problem && prd.overview?.targetUsers)
      case 'core_features':
        return Array.isArray(prd.core_features) && prd.core_features.length >= 3
      case 'additional_features':
        return Array.isArray(prd.additional_features) && prd.additional_features.length > 0
      case 'technical_requirements':
        return !!(prd.technical_requirements?.platforms && prd.technical_requirements.platforms.length > 0)
      case 'success_metrics':
        return !!(prd.success_metrics?.kpis && prd.success_metrics.kpis.length > 0)
      default:
        return false
    }
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
      <div className={cn('flex items-center justify-center h-full', className)}>
        <p>Failed to load PRD</p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <Card className="border-0 shadow-none rounded-none">
        <CardHeader className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
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
              <FileText className="h-5 w-5 text-primary" />
              <CardTitle className="text-lg">Product Requirements Document</CardTitle>
              <PRDStatusBadge status={prd.status} />
            </div>
            <div className="flex items-center gap-2">
              {hasUnsavedChanges && (
                <Badge variant="outline" className="text-yellow-600">
                  Unsaved changes
                </Badge>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSave}
                disabled={isSaving || !hasUnsavedChanges}
              >
                {isSaving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportMarkdown}
              >
                <Download className="h-4 w-4" />
                Export
              </Button>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Completion</span>
              <span className="font-medium">{prd.completion_percentage || 0}%</span>
            </div>
            <Progress value={prd.completion_percentage || 0} className="h-2" />
          </div>
        </CardHeader>

        <CardContent className="p-0 flex-1 overflow-hidden">
          <Tabs value={activeSection} onValueChange={(v) => setActiveSection(v as PRDSectionType)} className="h-full flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b h-auto p-0">
              {[
                { id: 'overview', label: 'Overview', icon: FileText },
                { id: 'core_features', label: 'Core Features', icon: CheckCircle2 },
                { id: 'additional_features', label: 'Additional Features', icon: Circle },
                { id: 'technical_requirements', label: 'Technical', icon: Settings },
                { id: 'success_metrics', label: 'Success Metrics', icon: Target }
              ].map((tab) => {
                const isComplete = getSectionCompletionStatus(tab.id as PRDSectionType)
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="rounded-none border-r last:border-r-0 data-[state=active]:bg-muted"
                  >
                    <div className="flex items-center gap-2">
                      {isComplete ? (
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span>{tab.label}</span>
                    </div>
                  </TabsTrigger>
                )
              })}
            </TabsList>

            <div className="flex-1 overflow-hidden">
              {/* Toolbar */}
              <PRDToolbar editor={editor} />
              
              {/* Editor Content */}
              <div className="h-full overflow-y-auto">
                <EditorContent editor={editor} className="h-full" />
              </div>
            </div>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}

// Add missing imports
import { Settings, Target } from 'lucide-react'