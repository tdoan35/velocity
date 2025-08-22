import { useState, useRef, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { NotionRichTextEditor } from './NotionRichTextEditor'
import { usePRDTemplates } from '@/hooks/usePRDTemplates'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  ChevronDown, 
  Edit2, 
  Save, 
  X,
  Check,
  Circle,
  Clock,
  Type,
  Code2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FlexiblePRDSection } from '@/services/prdService'
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types'
import { isTemplateOrEmptyContent, getAutoSaveDelay } from '@/utils/sectionUtils'

// Section emoji mapping (matching BlockBasedPRDEditor)
const getSectionEmoji = (section: FlexiblePRDSection): string => {
  const emojis: Record<string, string> = {
    overview: '📋',
    core_features: '⭐',
    additional_features: '✨',
    ui_design_patterns: '🎨',
    ux_flows: '🗺️',
    technical_architecture: '🏗️',
    tech_integrations: '🔌',
    custom: '📝'
  }
  
  // For custom sections, always use the custom emoji
  if (section.isCustom) {
    return '📝'
  }
  
  return emojis[section.id] || '📄'
}

// Agent mapping for sections (matching BlockBasedPRDEditor)
const getSectionAgent = (sectionId: string): string => {
  const agentMap: Record<string, string> = {
    overview: 'Project Manager',
    core_features: 'Project Manager',
    additional_features: 'Project Manager',
    ui_design_patterns: 'Design Assistant',
    ux_flows: 'Design Assistant',
    technical_architecture: 'Engineering Assistant',
    tech_integrations: 'Config Helper'
  }
  return agentMap[sectionId] || 'You'
}

// Agent badge styling (matching SectionBlock component)
const getAgentBadgeStyle = (agent: string): string => {
  const styles: Record<string, string> = {
    'Project Manager': 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800',
    'Design Assistant': 'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 border-blue-200 dark:border-blue-800',
    'Engineering Assistant': 'bg-purple-500/10 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400 border-purple-200 dark:border-purple-800',
    'Config Helper': 'bg-orange-500/10 text-orange-600 dark:bg-orange-500/20 dark:text-orange-400 border-orange-200 dark:border-orange-800',
    'You': 'bg-gray-500/10 text-gray-600 dark:bg-gray-500/20 dark:text-gray-400 border-gray-200 dark:border-gray-700'
  }
  return styles[agent] || styles['You']
}

interface SectionBlockEditorProps {
  section: FlexiblePRDSection
  onSave: (sectionId: string, content: { html: string; text: string }) => Promise<void>
  isExpanded?: boolean
  enableClickToEdit?: boolean
  enableVirtualBlocks?: boolean
  onBlocksUpdate?: (sectionId: string, blocks: VirtualContentBlock[]) => void
}

export function SectionBlockEditor({ 
  section, 
  onSave,
  isExpanded: initialExpanded = true,
  enableClickToEdit = true,
  enableVirtualBlocks = true,
  onBlocksUpdate
}: SectionBlockEditorProps) {
  const { getTemplate, isTemplatePlaceholder } = usePRDTemplates()
  const [isExpanded, setIsExpanded] = useState(initialExpanded)
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [editContent, setEditContent] = useState<{ html: string; text: string }>({
    html: '',
    text: ''
  })
  const [editorMode, setEditorMode] = useState<'rich' | 'plain'>('rich')
  const [currentContent, setCurrentContent] = useState<{ html: string; text: string }>({
    html: '',
    text: ''
  })
  const [isAnimating, setIsAnimating] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Initialize content for display and editing
  useEffect(() => {
    let content: { html: string; text: string }
    
    if (section.content && section.content.html) {
      // Use existing rich text content
      content = section.content
    } else if (section.template) {
      // Use section template if available
      content = section.template
    } else {
      // Fall back to default template
      content = getTemplate(section.id)
    }
    
    // Always set current content
    setCurrentContent(content)
    
    // Set edit content when in edit mode or always-editable mode
    if (isEditing || enableClickToEdit) {
      setEditContent(content)
      
      // Focus textarea if in plain mode and actually editing
      if (isEditing && editorMode === 'plain' && textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.select()
      }
    }
  }, [section.content, section.template, section.id, getTemplate]) // Dependencies

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  const handleStartEdit = () => {
    setIsEditing(true)
    setIsExpanded(true)
  }

  const handleCancelEdit = () => {
    setIsEditing(false)
    setEditContent(currentContent)
  }

  const handleSave = async (contentToSave?: { html: string; text: string }) => {
    const content = contentToSave || editContent
    
    // Don't save template placeholder content using enhanced detection
    if (isTemplatePlaceholder(content) || isTemplateOrEmptyContent(content)) {
      console.log('Skipping save for template/empty placeholder content')
      return
    }
    
    setIsSaving(true)
    try {
      await onSave(section.id, content)
      setIsEditing(false)
      setCurrentContent(content)
    } catch (error) {
      console.error('Failed to save section:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Handle auto-save for click-to-edit mode
  const handleContentChange = (newContent: { html: string; text: string }) => {
    console.log(`[${section.id}] Content change detected:`, { newContent, isTemplate: isTemplatePlaceholder(newContent), isCreating: section.isCreating }) // Debug log
    
    setEditContent(newContent)
    setCurrentContent(newContent)
    
    if (enableClickToEdit) {
      // Skip auto-save if section is still being created
      if (section.isCreating) {
        console.log(`[${section.id}] Skipping auto-save - section is being created`) // Debug log
        return
      }
      
      // Prevent auto-save cycles for template content
      if (isTemplatePlaceholder(newContent)) {
        console.log(`[${section.id}] Skipping auto-save for template content`) // Debug log
        return
      }
      
      // Enhanced template content detection using utility function
      if (isTemplateOrEmptyContent(newContent)) {
        console.log(`[${section.id}] Skipping auto-save for template/empty content`) // Debug log
        return
      }
      
      // Also check if content is the same as what we already have to prevent unnecessary saves
      if (JSON.stringify(newContent) === JSON.stringify(currentContent)) {
        console.log(`[${section.id}] Skipping auto-save - content unchanged`) // Debug log
        return
      }
      
      // Determine auto-save delay using utility function
      const autoSaveDelay = getAutoSaveDelay(section.id, newContent)
      
      console.log(`[${section.id}] Scheduling auto-save in ${autoSaveDelay / 1000} seconds`) // Debug log
      
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      
      // Set new timeout for auto-save with dynamic delay
      saveTimeoutRef.current = setTimeout(() => {
        console.log(`[${section.id}] Executing auto-save`) // Debug log
        handleSave(newContent)
      }, autoSaveDelay) as unknown as NodeJS.Timeout
    }
  }

  // Handle blur for click-to-edit mode
  const handleEditorBlur = () => {
    if (enableClickToEdit && isEditing) {
      // Skip save if section is still being created
      if (section.isCreating) {
        return
      }
      
      // Enhanced template content detection for blur events using utility function
      if (isTemplatePlaceholder(currentContent) || isTemplateOrEmptyContent(currentContent)) {
        console.log(`[${section.id}] Skipping blur save for template/empty content`) // Debug log
        return
      }
      
      // Save immediately on blur for substantial content
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      handleSave(currentContent)
    }
  }

  // Stable callback for handling virtual blocks updates
  const handleBlocksUpdate = useCallback((blocks: VirtualContentBlock[]) => {
    onBlocksUpdate?.(section.id, blocks)
  }, [section.id, onBlocksUpdate])

  const getStatusIcon = () => {
    if (section.isCreating) {
      return (
        <div title="Creating section...">
          <Clock className="w-4 h-4 text-blue-500 animate-pulse" />
        </div>
      )
    }
    
    switch (section.status) {
      case 'completed':
        return <Check className="w-4 h-4 text-emerald-500" />
      case 'in_progress':
        return <Clock className="w-4 h-4 text-amber-500" />
      default:
        return <Circle className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusColor = () => {
    switch (section.status) {
      case 'completed':
        return 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800'
      case 'in_progress':
        return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-600'
    }
  }

  const renderContent = () => {
    if (!currentContent.html || isTemplatePlaceholder(currentContent)) {
      return <p className="text-muted-foreground italic">No content yet. Click to start writing...</p>
    }

    // Render HTML content
    return (
      <div 
        className="prose prose-sm max-w-none"
        dangerouslySetInnerHTML={{ __html: currentContent.html }}
      />
    )
  }

  return (
    <motion.div
      layout
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      <Card className="mb-4 overflow-visible bg-transparent border-0 shadow-none" data-section-id={section.id}>
      <CardHeader className="pb-3 bg-transparent">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                setIsAnimating(true)
                setIsExpanded(!isExpanded)
              }}
              className="p-1 hover:bg-muted rounded transition-colors"
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              <motion.div
                animate={{ rotate: isExpanded ? 0 : -90 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
              >
                <ChevronDown className="w-4 h-4 text-gray-500" />
              </motion.div>
            </button>
            
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {getSectionEmoji(section)} {section.title}
            </h2>
            
            {section.required && (
              <span className="text-red-500" title="Required">
                *
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className={cn(
              "px-2 py-1 text-xs font-medium rounded-md border",
              getAgentBadgeStyle(getSectionAgent(section.id))
            )}>
              {getSectionAgent(section.id)}
            </span>

            {getStatusIcon()}
            
            {!enableClickToEdit && !isEditing && (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleStartEdit}
                className="h-7 px-2"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <AnimatePresence 
        initial={false}
        onExitComplete={() => setIsAnimating(false)}
      >
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ 
              duration: 0.3, 
              ease: "easeInOut",
              opacity: { duration: 0.2 }
            }}
            className={`motion-content ${isAnimating ? 'overflow-hidden' : 'overflow-visible'}`}
            onAnimationStart={() => setIsAnimating(true)}
            onAnimationComplete={() => setIsAnimating(false)}
          >
              <CardContent className="pt-0 bg-transparent">
              {enableClickToEdit ? (
                // Click-to-edit mode with Notion-like UX
                <div className="relative">
                  {isSaving && (
                    <div className="absolute top-2 right-2 flex items-center gap-2 text-xs text-muted-foreground bg-background/80 backdrop-blur-sm px-2 py-1 rounded">
                      <span className="w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                      Saving...
                    </div>
                  )}
                  <div 
                    onClick={() => !isEditing && setIsEditing(true)}
                    className={cn(
                      "min-h-[100px] rounded-md transition-colors"
                    )}
                  >
                    <NotionRichTextEditor
                      content={currentContent}
                      onChange={handleContentChange}
                      onBlur={handleEditorBlur}
                      placeholder="Click to start writing..."
                      editable={true} // Always editable in click-to-edit mode
                      enableVirtualBlocks={enableVirtualBlocks}
                      onBlocksUpdate={handleBlocksUpdate}
                      sectionId={section.id}
                    />
                  </div>
                </div>
              ) : (
                // Traditional edit mode with explicit edit button
                isEditing ? (
              <div className="space-y-3">
                {/* Editor Mode Toggle */}
                <div className="flex gap-1 p-1 bg-muted rounded-md w-fit">
                  <Button
                    type="button"
                    size="sm"
                    variant={editorMode === 'rich' ? 'default' : 'ghost'}
                    onClick={() => setEditorMode('rich')}
                    className="h-7 px-2 gap-1.5"
                  >
                    <Type className="w-3.5 h-3.5" />
                    Rich Text
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={editorMode === 'plain' ? 'default' : 'ghost'}
                    onClick={() => setEditorMode('plain')}
                    className="h-7 px-2 gap-1.5"
                  >
                    <Code2 className="w-3.5 h-3.5" />
                    Plain/JSON
                  </Button>
                </div>
                
                {/* Editor */}
                {editorMode === 'rich' ? (
                  <NotionRichTextEditor
                    content={editContent}
                    onChange={setEditContent}
                    placeholder="Start writing..."
                    enableVirtualBlocks={enableVirtualBlocks}
                    onBlocksUpdate={handleBlocksUpdate}
                    sectionId={section.id}
                  />
                ) : (
                  <Textarea
                    ref={textareaRef}
                    value={editContent.text}
                    onChange={(e) => setEditContent({ 
                      html: `<p>${e.target.value.replace(/\n/g, '</p><p>')}</p>`,
                      text: e.target.value 
                    })}
                    className="min-h-[200px] font-mono text-sm"
                    placeholder="Enter plain text..."
                    disabled={isSaving}
                  />
                )}
                
                {/* Action Buttons */}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleSave()}
                    disabled={isSaving}
                    className="gap-1.5"
                  >
                    {isSaving ? (
                      <>
                        <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        Save
                      </>
                    )}
                  </Button>
                  
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                  >
                    <X className="w-3.5 h-3.5 mr-1" />
                    Cancel
                  </Button>
                </div>
                
                <p className="text-xs text-muted-foreground">
                  {editorMode === 'rich' 
                    ? "Use the toolbar to format your text. Content is saved as HTML."
                    : "Enter plain text or JSON. JSON will be automatically detected and formatted."}
                </p>
              </div>
            ) : (
              <div className="prose prose-sm max-w-none">
                {renderContent()}
              </div>
            )
          )}
              </CardContent>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
    </motion.div>
  )
}