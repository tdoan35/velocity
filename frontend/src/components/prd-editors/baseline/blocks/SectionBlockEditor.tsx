import { useState, useRef, useEffect } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { NotionRichTextEditor } from './NotionRichTextEditor'
import { usePRDTemplates } from '@/hooks/usePRDTemplates'
import { 
  ChevronDown, 
  ChevronRight, 
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
    setIsSaving(true)
    try {
      const content = contentToSave || editContent
      
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
    setEditContent(newContent)
    setCurrentContent(newContent)
    
    if (enableClickToEdit) {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      
      // Set new timeout for auto-save (2 seconds after user stops typing)
      saveTimeoutRef.current = setTimeout(() => {
        handleSave(newContent)
      }, 2000) as unknown as NodeJS.Timeout
    }
  }

  // Handle blur for click-to-edit mode
  const handleEditorBlur = () => {
    if (enableClickToEdit && isEditing) {
      // Save immediately on blur
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
      handleSave(currentContent)
    }
  }

  const getStatusIcon = () => {
    switch (section.status) {
      case 'completed':
        return <Check className="w-4 h-4 text-green-600" />
      case 'in_progress':
        return <Clock className="w-4 h-4 text-yellow-600" />
      default:
        return <Circle className="w-4 h-4 text-gray-400" />
    }
  }

  const getStatusColor = () => {
    switch (section.status) {
      case 'completed':
        return 'bg-green-100 text-green-700 border-green-200'
      case 'in_progress':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200'
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200'
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
    <Card className="mb-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-muted rounded transition-colors"
              aria-label={isExpanded ? "Collapse" : "Expand"}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronRight className="w-4 h-4" />
              )}
            </button>
            
            {getStatusIcon()}
            
            <h3 className="font-medium text-base">
              {section.title}
            </h3>
            
            {section.required && (
              <span className="text-xs px-2 py-0.5 bg-primary/10 text-primary rounded">
                Required
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs px-2 py-1 rounded border",
              getStatusColor()
            )}>
              {section.status}
            </span>
            
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

      {isExpanded && (
        <CardContent className="pt-0">
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
                  onBlocksUpdate={(blocks) => onBlocksUpdate?.(section.id, blocks)}
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
                    onBlocksUpdate={(blocks) => onBlocksUpdate?.(section.id, blocks)}
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
      )}
    </Card>
  )
}