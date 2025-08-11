import { useEffect, useState, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { motion, AnimatePresence } from 'framer-motion'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { prdService, type PRD, type PRDSection, type PRDFeature } from '@/services/prdService'
import { PRDStatusBadge } from './PRDStatusBadge'
import { 
  FileText, 
  Download, 
  ArrowLeft,
  Loader2,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Circle,
  Target,
  Settings,
  Sparkles,
  Plus,
  Hash,
  PanelRight,
  GripVertical
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { BlockControls } from './BlockControls'

interface NotionPRDEditorProps {
  projectId: string
  conversationId?: string
  onClose?: () => void
  className?: string
}

interface Section {
  id: string
  title: string
  icon: any
  isComplete: boolean
  isExpanded: boolean
}

export function NotionPRDEditor({ 
  projectId, 
  onClose,
  className 
}: NotionPRDEditorProps) {
  const [prd, setPRD] = useState<PRD | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isAutoSaving, setIsAutoSaving] = useState(false)
  const [showSlashCommand, setShowSlashCommand] = useState(false)
  const [slashCommandPosition, setSlashCommandPosition] = useState({ top: 0, left: 0 })
  const [sections, setSections] = useState<Section[]>([])
  const [showTOC, setShowTOC] = useState(false)
  const [draggedBlockPos, setDraggedBlockPos] = useState<number | null>(null)
  const [showBlockMenu, setShowBlockMenu] = useState(false)
  const [blockMenuPosition, setBlockMenuPosition] = useState({ top: 0, left: 0 })
  const { toast } = useToast()
  const editorRef = useRef<HTMLDivElement>(null)
  const editorContentRef = useRef<HTMLDivElement>(null)

  // TipTap editor with Notion-like configuration
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
          HTMLAttributes: {
            class: 'notion-heading'
          }
        }
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading' && node.attrs.level === 1) {
            return 'Untitled'
          }
          if (node.type.name === 'heading') {
            return 'Heading'
          }
          return "Type '/' for commands or start writing..."
        }
      }),
      Typography,
      Highlight.configure({
        multicolor: false
      }),
      TaskList,
      TaskItem.configure({
        nested: true
      }),
      Dropcursor.configure({
        color: '#10b981',
        width: 2
      }),
      Gapcursor
    ],
    parseOptions: {
      preserveWhitespace: 'full'
    },
    content: '',
    onUpdate: ({ editor }) => {
      handleContentChange()
    },
    editorProps: {
      attributes: {
        class: 'notion-content focus:outline-none'
      },
      handleKeyDown: (view, event) => {
        // Handle slash command
        if (event.key === '/' && !showSlashCommand) {
          const coords = view.coordsAtPos(view.state.selection.from)
          setSlashCommandPosition({
            top: coords.top + 25,
            left: coords.left
          })
          setShowSlashCommand(true)
          return true
        }
        
        // Close slash command on Escape
        if (event.key === 'Escape' && showSlashCommand) {
          setShowSlashCommand(false)
          return true
        }
        
        return false
      },
      handleDrop: (view, event, slice, moved) => {
        // Prevent default drop behavior to handle it ourselves
        event.preventDefault()
        
        try {
          const dragData = event.dataTransfer?.getData('application/x-tiptap-drag')
          if (!dragData) return false
          
          const { nodePos, nodeSize } = JSON.parse(dragData)
          
          // Get the position where we're dropping
          const dropPos = view.posAtCoords({ 
            left: event.clientX, 
            top: event.clientY 
          })
          
          if (!dropPos) return false
          
          // Don't allow dropping at the same position
          if (dropPos.pos >= nodePos && dropPos.pos <= nodePos + nodeSize) {
            return false
          }
          
          // Get the node to move BEFORE deleting it
          const node = view.state.doc.nodeAt(nodePos)
          if (!node) return false
          
          // Get the transaction
          const tr = view.state.tr
          
          // Calculate the adjusted insert position
          let insertPos = dropPos.pos
          
          // If dropping after the original position, adjust for the deletion
          if (insertPos > nodePos + nodeSize) {
            // Insert first, then delete
            tr.insert(insertPos, node)
            tr.delete(nodePos, nodePos + nodeSize)
          } else {
            // Delete first, then insert
            tr.delete(nodePos, nodePos + nodeSize)
            tr.insert(insertPos, node)
          }
          
          // Apply the transaction
          view.dispatch(tr)
          
          return true
        } catch (error) {
          console.error('Error handling drop:', error)
          return false
        }
      },
      handleDOMEvents: {
        dragover: (view, event) => {
          event.preventDefault()
          event.dataTransfer!.dropEffect = 'move'
          return false
        }
      }
    }
  })

  // Define parseEditorContent before it's used in useEffect
  const parseEditorContent = useCallback((editor: any): Partial<PRD> => {
    if (!editor) return {}
    
    const html = editor.getHTML()
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    
    // Extract title from first h1
    const titleElement = doc.querySelector('h1')
    const title = titleElement?.textContent || 'Untitled PRD'
    
    // Extract overview section
    const overview: any = {}
    const visionHeader = Array.from(doc.querySelectorAll('h3')).find(h => h.textContent === 'Vision')
    if (visionHeader) {
      const visionPara = visionHeader.nextElementSibling
      if (visionPara && visionPara.tagName === 'P') {
        overview.vision = visionPara.textContent || ''
      }
    }
    
    const problemHeader = Array.from(doc.querySelectorAll('h3')).find(h => h.textContent === 'Problem Statement')
    if (problemHeader) {
      const problemPara = problemHeader.nextElementSibling
      if (problemPara && problemPara.tagName === 'P') {
        overview.problem = problemPara.textContent || ''
      }
    }
    
    const targetUsersHeader = Array.from(doc.querySelectorAll('h3')).find(h => h.textContent === 'Target Users')
    if (targetUsersHeader) {
      const targetUsersPara = targetUsersHeader.nextElementSibling
      if (targetUsersPara && targetUsersPara.tagName === 'P') {
        overview.targetUsers = targetUsersPara.textContent || ''
      }
    }
    
    // For now, we'll just parse the title and overview
    // More complex parsing for features, technical requirements, etc. can be added later
    return {
      title,
      overview: Object.keys(overview).length > 0 ? overview : undefined
    }
  }, [])

  // Load or create PRD on mount
  useEffect(() => {
    loadOrCreatePRD()
  }, [projectId])
  
  // Save on unmount and cleanup auto-save timer
  useEffect(() => {
    return () => {
      // Clear any pending auto-save timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current)
      }
      
      // Save any pending changes on unmount
      if (editor && prd && prd.id) {
        const parsedContent = parseEditorContent(editor)
        const updatedPRD = {
          ...prd,
          ...parsedContent
        }
        // Fire and forget - we can't await in cleanup
        prdService.autoSavePRD(prd.id, updatedPRD).catch((error) => {
          console.error('Failed to save on unmount:', error)
        })
      }
    }
  }, [editor, prd, parseEditorContent])

  // Initialize sections
  useEffect(() => {
    if (prd) {
      setSections([
        {
          id: 'overview',
          title: 'Overview',
          icon: FileText,
          isComplete: !!(prd.overview?.vision && prd.overview?.problem && prd.overview?.targetUsers),
          isExpanded: true
        },
        {
          id: 'core_features',
          title: 'Core Features',
          icon: Sparkles,
          isComplete: Array.isArray(prd.core_features) && prd.core_features.length >= 3,
          isExpanded: true
        },
        {
          id: 'additional_features',
          title: 'Additional Features',
          icon: Plus,
          isComplete: Array.isArray(prd.additional_features) && prd.additional_features.length > 0,
          isExpanded: true
        },
        {
          id: 'technical_requirements',
          title: 'Technical Requirements',
          icon: Settings,
          isComplete: !!(prd.technical_requirements?.platforms && prd.technical_requirements.platforms.length > 0),
          isExpanded: true
        },
        {
          id: 'success_metrics',
          title: 'Success Metrics',
          icon: Target,
          isComplete: !!(prd.success_metrics?.kpis && prd.success_metrics.kpis.length > 0),
          isExpanded: true
        }
      ])
      
      // Set editor content
      if (editor) {
        editor.commands.setContent(formatPRDContent(prd))
      }
    }
  }, [prd, editor])

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

  const formatPRDContent = (prd: PRD): string => {
    let content = `<h1>${prd.title}</h1>`
    
    // Overview Section
    content += '<h2 id="section-overview">📋 Overview</h2>'
    if (prd.overview?.vision) {
      content += `<h3>Vision</h3><p>${prd.overview.vision}</p>`
    }
    if (prd.overview?.problem) {
      content += `<h3>Problem Statement</h3><p>${prd.overview.problem}</p>`
    }
    if (prd.overview?.targetUsers) {
      content += `<h3>Target Users</h3><p>${prd.overview.targetUsers}</p>`
    } else {
      content += '<p>Add Overview...</p>'
    }
    
    // Core Features
    content += '<h2 id="section-core_features">✨ Core Features</h2>'
    if (prd.core_features && prd.core_features.length > 0) {
      prd.core_features.forEach((feature, index) => {
        content += `<h3>${index + 1}. ${feature.title}</h3>`
        content += `<p>${feature.description}</p>`
      })
    } else {
      content += '<p>Add core features to your product...</p>'
    }
    
    // Additional Features
    content += '<h2 id="section-additional_features">➕ Additional Features</h2>'
    if (prd.additional_features && prd.additional_features.length > 0) {
      prd.additional_features.forEach((feature, index) => {
        content += `<h3>${index + 1}. ${feature.title}</h3>`
        content += `<p>${feature.description}</p>`
      })
    } else {
      content += '<p>Add additional features...</p>'
    }
    
    // Technical Requirements
    content += '<h2 id="section-technical_requirements">⚙️ Technical Requirements</h2>'
    if (prd.technical_requirements?.platforms) {
      content += `<h3>Platforms</h3><ul>${prd.technical_requirements.platforms.map(p => `<li>${p}</li>`).join('')}</ul>`
    }
    if (prd.technical_requirements?.performance) {
      content += `<h3>Performance</h3><p>${prd.technical_requirements.performance}</p>`
    } else {
      content += '<p>Add technical requirements features...</p>'
    }
    
    // Success Metrics
    content += '<h2 id="section-success_metrics">🎯 Success Metrics</h2>'
    if (prd.success_metrics?.kpis && prd.success_metrics.kpis.length > 0) {
      content += '<h3>Key Performance Indicators</h3><ul>'
      prd.success_metrics.kpis.forEach(kpi => {
        content += `<li><strong>${kpi.metric}:</strong> ${kpi.target}`
        if (kpi.timeframe) {
          content += ` (${kpi.timeframe})`
        }
        content += '</li>'
      })
      content += '</ul>'
    } else {
      content += '<p>Define success metrics...</p>'
    }
    
    return content
  }

  // Auto-save timer ref
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  const handleContentChange = useCallback(() => {
    if (!prd || !editor) return
    
    // Clear any existing auto-save timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current)
    }
    
    // Set a new auto-save timer (debounced to 2 seconds after user stops typing)
    autoSaveTimerRef.current = setTimeout(async () => {
      // Parse the editor content and create updated PRD
      const parsedContent = parseEditorContent(editor)
      const updatedPRD = {
        ...prd,
        ...parsedContent
      }
      
      // Update the PRD state only after debounce
      setPRD(updatedPRD)
      
      // Auto-save to database
      if (updatedPRD.id) {
        setIsAutoSaving(true)
        try {
          await prdService.autoSavePRD(updatedPRD.id, updatedPRD)
        } catch (error) {
          console.error('Auto-save failed:', error)
          toast({
            title: 'Auto-save failed',
            description: 'Your changes may not be saved. Please check your connection.',
            variant: 'destructive'
          })
        } finally {
          setIsAutoSaving(false)
        }
      }
    }, 2000) // 2 second debounce
  }, [prd, editor, parseEditorContent, toast])


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

  const scrollToSection = (sectionId: string) => {
    // Map section IDs to their heading text
    const sectionHeadings: Record<string, string> = {
      'overview': '📋 Overview',
      'core_features': '✨ Core Features',
      'additional_features': '➕ Additional Features',
      'technical_requirements': '⚙️ Technical Requirements',
      'success_metrics': '🎯 Success Metrics'
    }
    
    const headingText = sectionHeadings[sectionId]
    if (!headingText) return
    
    // Find the heading element by its text content
    const headings = document.querySelectorAll('h2')
    let targetElement: HTMLElement | null = null
    
    headings.forEach((heading) => {
      if (heading.textContent === headingText) {
        targetElement = heading as HTMLElement
      }
    })
    
    if (targetElement && editorRef.current) {
      // Calculate the scroll position
      const rect = (targetElement as HTMLElement).getBoundingClientRect()
      const containerRect = editorRef.current.getBoundingClientRect()
      const scrollTop = editorRef.current.scrollTop + (rect.top - containerRect.top) - 20
      
      // Scroll the editor container
      editorRef.current.scrollTo({
        top: scrollTop,
        behavior: 'smooth'
      })
    }
  }

  const toggleSection = (sectionId: string) => {
    setSections(prev => prev.map(section => 
      section.id === sectionId 
        ? { ...section, isExpanded: !section.isExpanded }
        : section
    ))
  }

  const insertSlashCommand = (command: string) => {
    if (!editor) return
    
    // Remove the slash
    editor.commands.deleteRange({
      from: editor.state.selection.from - 1,
      to: editor.state.selection.from
    })
    
    // Insert the appropriate content
    switch (command) {
      case 'heading1':
        editor.commands.setHeading({ level: 1 })
        break
      case 'heading2':
        editor.commands.setHeading({ level: 2 })
        break
      case 'heading3':
        editor.commands.setHeading({ level: 3 })
        break
      case 'bulletList':
        editor.commands.toggleBulletList()
        break
      case 'orderedList':
        editor.commands.toggleOrderedList()
        break
      case 'taskList':
        editor.commands.toggleTaskList()
        break
      case 'quote':
        editor.commands.toggleBlockquote()
        break
      case 'code':
        editor.commands.toggleCodeBlock()
        break
    }
    
    setShowSlashCommand(false)
  }

  // Handle drag and drop for blocks
  const handleBlockDragStart = useCallback((e: React.DragEvent, blockElement: HTMLElement) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', blockElement.innerHTML)
    blockElement.classList.add('is-dragging')
  }, [])

  const handleBlockDragEnd = useCallback((e: React.DragEvent, blockElement: HTMLElement) => {
    blockElement.classList.remove('is-dragging')
  }, [])

  const handleBlockDrop = useCallback((e: React.DragEvent, targetElement: HTMLElement) => {
    e.preventDefault()
    const draggedHTML = e.dataTransfer.getData('text/html')
    // Implementation would require more complex TipTap transaction handling
    console.log('Drop block:', draggedHTML)
  }, [])

  // Add block between existing blocks
  const handleAddBlock = useCallback((afterElement: HTMLElement) => {
    if (!editor) return
    
    // Find the position after the current block
    const pos = editor.view.posAtDOM(afterElement, 0)
    
    // Insert a new paragraph
    editor.chain()
      .focus()
      .insertContentAt(pos + afterElement.textContent!.length + 1, '<p></p>')
      .run()
  }, [editor])

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
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Header - matching EnhancedChatInterface style */}
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
              {isAutoSaving && (
                <div className="px-2 py-1 rounded-md bg-blue-500/10 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-500" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-500">
                    Saving...
                  </span>
                </div>
              )}
              <PRDStatusBadge status={prd.status} />
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
        
        {/* Progress Bar as bottom border */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700">
          <div 
            className="h-full bg-emerald-500 transition-all duration-300 ease-out"
            style={{ width: `${prd.completion_percentage || 0}%` }}
          />
        </div>
      </div>

      {/* Main Content Area with Editor and TOC */}
      <div className="flex-1 relative overflow-hidden">
        {/* Editor Content - Full width */}
        <div className="absolute inset-0 overflow-y-auto" ref={editorRef}>
          <div className="max-w-4xl mx-auto px-24 relative" ref={editorContentRef}>
            {/* Block Controls for drag and insert - positioned absolutely within the padded container */}
            <BlockControls editor={editor} containerRef={editorContentRef} />
            
            {/* Editor content */}
            <div className="relative">
              <EditorContent 
                editor={editor} 
                className="notion-editor-content"
              />
            
            {/* Floating Bubble Menu */}
            {editor && (
              <BubbleMenu
                editor={editor}
                className="flex items-center gap-1 p-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
              >
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  data-active={editor.isActive('bold')}
                >
                  <Bold className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  data-active={editor.isActive('italic')}
                >
                  <Italic className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => editor.chain().focus().toggleStrike().run()}
                  data-active={editor.isActive('strike')}
                >
                  <Strikethrough className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  data-active={editor.isActive('code')}
                >
                  <Code className="h-3 w-3" />
                </Button>
                <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                  data-active={editor.isActive('heading', { level: 1 })}
                >
                  <Heading1 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  data-active={editor.isActive('heading', { level: 2 })}
                >
                  <Heading2 className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                  data-active={editor.isActive('heading', { level: 3 })}
                >
                  <Heading3 className="h-3 w-3" />
                </Button>
              </BubbleMenu>
            )}

            {/* Slash Command Menu */}
            {showSlashCommand && (
              <div 
                className="absolute z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2 min-w-[200px]"
                style={{ top: slashCommandPosition.top, left: slashCommandPosition.left }}
              >
                <div className="space-y-1">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('heading1')}
                  >
                    <Heading1 className="h-4 w-4" />
                    <span className="text-sm">Heading 1</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('heading2')}
                  >
                    <Heading2 className="h-4 w-4" />
                    <span className="text-sm">Heading 2</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('heading3')}
                  >
                    <Heading3 className="h-4 w-4" />
                    <span className="text-sm">Heading 3</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('bulletList')}
                  >
                    <List className="h-4 w-4" />
                    <span className="text-sm">Bullet List</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('orderedList')}
                  >
                    <ListOrdered className="h-4 w-4" />
                    <span className="text-sm">Numbered List</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('taskList')}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm">Task List</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('quote')}
                  >
                    <Quote className="h-4 w-4" />
                    <span className="text-sm">Quote</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('code')}
                  >
                    <Code className="h-4 w-4" />
                    <span className="text-sm">Code Block</span>
                  </button>
                </div>
              </div>
            )}
            </div> {/* Close the container div */}
          </div>
        </div>

        {/* Table of Contents Sidebar - Overlay */}
        <AnimatePresence mode="wait">
          {showTOC && (
            <motion.div 
              className="absolute top-0 right-0 bottom-0 w-64 border-l border-gray-200 dark:border-gray-700 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm overflow-y-auto z-40 shadow-xl"
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
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3">TABLE OF CONTENTS</h3>
                <div className="space-y-1">
                  {sections.map((section, index) => {
                    const Icon = section.icon
                    return (
                      <motion.button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left group transition-colors duration-150"
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ 
                          x: 0, 
                          opacity: 1,
                          transition: { 
                            delay: 0.15 + (index * 0.03),
                            duration: 0.2
                          }
                        }}
                        whileHover={{ x: 2 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <motion.div 
                          className={cn(
                            "w-1.5 h-1.5 rounded-full transition-colors duration-200",
                            section.isComplete ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
                          )}
                          animate={section.isComplete ? {
                            scale: [1, 1.2, 1],
                            transition: { duration: 0.3 }
                          } : {}}
                        />
                        <Icon className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 transition-colors duration-150" />
                        <span className="text-sm text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-gray-100 transition-colors duration-150">
                          {section.title}
                        </span>
                      </motion.button>
                    )
                  })}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

// Add Notion-style CSS
const notionStyles = `
.notion-content {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, 'Apple Color Emoji', Arial, sans-serif, 'Segoe UI Emoji', 'Segoe UI Symbol';
  font-size: 16px;
  line-height: 1.8;
  color: rgb(55, 53, 47);
  caret-color: rgb(55, 53, 47);
}

.dark .notion-content {
  color: rgba(255, 255, 255, 0.9);
  caret-color: rgba(255, 255, 255, 0.9);
}

.notion-editor-content {
  position: relative;
}

/* Block hover effects */
.notion-content > * {
  position: relative;
  transition: background-color 0.2s;
  min-height: 24px; /* Ensure minimum height for controls */
}

.notion-content > *:hover {
  background-color: rgba(55, 53, 47, 0.03);
}

.dark .notion-content > *:hover {
  background-color: rgba(255, 255, 255, 0.03);
}

/* Dragging state */
.is-dragging {
  opacity: 0.5;
  cursor: move;
}

/* Drop indicator for drag and drop */
.ProseMirror-dropcursor {
  border-left: 2px solid #10b981;
}

/* Gap cursor for placing cursor between blocks */
.ProseMirror-gapcursor {
  display: none;
  pointer-events: none;
  position: absolute;
}

.ProseMirror-gapcursor:after {
  content: "";
  display: block;
  position: absolute;
  top: -2px;
  width: 20px;
  border-top: 1px solid #10b981;
  animation: ProseMirror-cursor-blink 1.1s steps(2, start) infinite;
}

@keyframes ProseMirror-cursor-blink {
  to {
    visibility: hidden;
  }
}

.notion-content h1 {
  font-size: 2.5em;
  font-weight: 700;
  margin-top: 2em;
  margin-bottom: 0.5em;
  letter-spacing: -0.02em;
}

.notion-content h2 {
  font-size: 1.875em;
  font-weight: 600;
  margin-top: 1.5em;
  margin-bottom: 0.5em;
  letter-spacing: -0.01em;
}

.notion-content h3 {
  font-size: 1.5em;
  font-weight: 600;
  margin-top: 1em;
  margin-bottom: 0.5em;
}

.notion-content p {
  margin: 0.5em 0;
}

.notion-content ul,
.notion-content ol {
  margin: 0.5em 0;
  padding-left: 1.5em;
}

.notion-content li {
  margin: 0.25em 0;
}

.notion-content code {
  background: rgba(135, 131, 120, 0.15);
  border-radius: 3px;
  padding: 0.2em 0.4em;
  font-size: 0.875em;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace;
}

.dark .notion-content code {
  background: rgba(255, 255, 255, 0.1);
}

.notion-content blockquote {
  border-left: 3px solid currentColor;
  margin: 1em 0;
  padding-left: 1em;
  opacity: 0.8;
}

.notion-content .is-empty::before {
  color: rgba(55, 53, 47, 0.3);
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
}

.dark .notion-content .is-empty::before {
  color: rgba(255, 255, 255, 0.3);
}

[data-active="true"] {
  background-color: rgb(229, 231, 235);
}

.dark [data-active="true"] {
  background-color: rgb(55, 65, 81);
}
`

// Inject styles
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style')
  styleSheet.textContent = notionStyles
  document.head.appendChild(styleSheet)
}