import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import { Button } from '@/components/ui/button'
import { SectionBlock, type SectionBlockProps, type SectionType } from './SectionBlock'
import { EnhancedBlockControls } from '../EnhancedBlockControls'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  CheckCircle2
} from 'lucide-react'

// Hybrid content model interface
export interface HybridContent {
  structuredData: any      // For backend/validation
  richContent: string       // TipTap HTML
  lastEditedIn: 'rich' | 'structured'
  version: number
}

export interface NotionSectionEditorProps extends Omit<SectionBlockProps, 'children'> {
  placeholder?: string
  enableSlashCommands?: boolean
  enableBubbleMenu?: boolean
  customCommands?: SlashCommand[]
  onContentSync?: (structured: any, rich: string) => void
}

interface SlashCommand {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  action: (editor: Editor) => void
  keywords?: string[]
}

// Content transformation utilities
const transformStructuredToRich = (type: SectionType, structured: any): string => {
  let html = ''
  
  switch (type) {
    case 'overview':
      if (structured?.vision) {
        html += `<h3>Vision</h3><p>${structured.vision}</p>`
      }
      if (structured?.problem) {
        html += `<h3>Problem Statement</h3><p>${structured.problem}</p>`
      }
      if (structured?.targetUsers?.length > 0) {
        html += '<h3>Target Users</h3><ul>'
        structured.targetUsers.forEach((user: string) => {
          html += `<li>${user}</li>`
        })
        html += '</ul>'
      }
      break
      
    case 'core_features':
    case 'additional_features':
      if (structured?.features?.length > 0) {
        structured.features.forEach((feature: any, index: number) => {
          html += `<h3>${index + 1}. ${feature.title || feature.name || 'Feature'}</h3>`
          html += `<p>${feature.description || ''}</p>`
          if (feature.priority) {
            html += `<p><em>Priority: ${feature.priority}</em></p>`
          }
        })
      }
      break
      
    case 'technical_architecture':
      if (structured?.platforms?.length > 0) {
        html += '<h3>Platforms</h3><ul>'
        structured.platforms.forEach((platform: string) => {
          html += `<li>${platform}</li>`
        })
        html += '</ul>'
      }
      if (structured?.techStack) {
        html += '<h3>Technology Stack</h3>'
        if (structured.techStack.frontend?.length > 0) {
          html += '<h4>Frontend</h4><ul>'
          structured.techStack.frontend.forEach((tech: string) => {
            html += `<li>${tech}</li>`
          })
          html += '</ul>'
        }
        if (structured.techStack.backend?.length > 0) {
          html += '<h4>Backend</h4><ul>'
          structured.techStack.backend.forEach((tech: string) => {
            html += `<li>${tech}</li>`
          })
          html += '</ul>'
        }
      }
      break
      
    default:
      // For custom sections, display as formatted JSON or text
      if (typeof structured === 'string') {
        html = `<p>${structured}</p>`
      } else if (structured && Object.keys(structured).length > 0) {
        html = '<pre>' + JSON.stringify(structured, null, 2) + '</pre>'
      }
  }
  
  return html || '<p></p>'
}

const transformRichToStructured = (type: SectionType, html: string): any => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  switch (type) {
    case 'overview': {
      const result: any = {}
      
      // Find Vision section
      const headings = Array.from(doc.querySelectorAll('h3'))
      const visionHeading = headings.find(h => h.textContent?.toLowerCase().includes('vision'))
      if (visionHeading) {
        const nextElement = visionHeading.nextElementSibling
        if (nextElement?.tagName === 'P') {
          result.vision = nextElement.textContent || ''
        }
      }
      
      // Find Problem Statement
      const problemHeading = headings.find(h => h.textContent?.toLowerCase().includes('problem'))
      if (problemHeading) {
        const nextElement = problemHeading.nextElementSibling
        if (nextElement?.tagName === 'P') {
          result.problem = nextElement.textContent || ''
        }
      }
      
      // Find Target Users
      const usersHeading = headings.find(h => h.textContent?.toLowerCase().includes('users'))
      if (usersHeading) {
        const nextElement = usersHeading.nextElementSibling
        if (nextElement?.tagName === 'UL') {
          result.targetUsers = Array.from(nextElement.querySelectorAll('li'))
            .map(li => li.textContent || '')
            .filter(text => text.length > 0)
        }
      }
      
      return result
    }
    
    case 'core_features':
    case 'additional_features': {
      const features: any[] = []
      const headings = Array.from(doc.querySelectorAll('h3'))
      
      headings.forEach(heading => {
        const titleText = heading.textContent || ''
        // Skip section headers
        if (titleText.toLowerCase().includes('feature')) return
        
        const feature: any = {
          title: titleText.replace(/^\d+\.\s*/, ''),
          description: ''
        }
        
        let nextElement = heading.nextElementSibling
        while (nextElement && nextElement.tagName !== 'H3') {
          if (nextElement.tagName === 'P') {
            const text = nextElement.textContent || ''
            if (text.toLowerCase().startsWith('priority:')) {
              feature.priority = text.replace(/^priority:\s*/i, '').trim()
            } else if (!nextElement.querySelector('em')) {
              feature.description = text
            }
          }
          nextElement = nextElement.nextElementSibling
        }
        
        if (feature.title) {
          features.push(feature)
        }
      })
      
      return { features }
    }
    
    default:
      // For custom sections, try to extract text content
      const textContent = doc.body.textContent || ''
      return textContent.trim() || {}
  }
}

// Section-specific placeholders
const getSectionPlaceholder = (type: SectionType): string => {
  const placeholders: Record<SectionType, string> = {
    overview: "Start typing your project overview or type '/' for commands...",
    core_features: "Describe core features or type '/' to add a feature block...",
    additional_features: "Add optional features here...",
    ui_design_patterns: "Define UI patterns and design system...",
    ux_flows: "Map out user journeys and flows...",
    technical_architecture: "Describe technical stack and architecture...",
    tech_integrations: "List integrations and configurations...",
    custom: "Add custom content..."
  }
  return placeholders[type] || "Type '/' for commands or start writing..."
}

// Section-specific slash commands
const getSectionCommands = (type: SectionType): SlashCommand[] => {
  const baseCommands: SlashCommand[] = [
    {
      id: 'heading1',
      label: 'Heading 1',
      icon: Heading1,
      action: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run()
    },
    {
      id: 'heading2',
      label: 'Heading 2',
      icon: Heading2,
      action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run()
    },
    {
      id: 'heading3',
      label: 'Heading 3',
      icon: Heading3,
      action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run()
    },
    {
      id: 'bulletList',
      label: 'Bullet List',
      icon: List,
      action: (editor) => editor.chain().focus().toggleBulletList().run()
    },
    {
      id: 'orderedList',
      label: 'Numbered List',
      icon: ListOrdered,
      action: (editor) => editor.chain().focus().toggleOrderedList().run()
    },
    {
      id: 'taskList',
      label: 'Task List',
      icon: CheckCircle2,
      action: (editor) => editor.chain().focus().toggleTaskList().run()
    },
    {
      id: 'quote',
      label: 'Quote',
      icon: Quote,
      action: (editor) => editor.chain().focus().toggleBlockquote().run()
    },
    {
      id: 'code',
      label: 'Code Block',
      icon: Code,
      action: (editor) => editor.chain().focus().toggleCodeBlock().run()
    }
  ]
  
  // Add section-specific commands
  switch (type) {
    case 'overview':
      return [
        {
          id: 'vision',
          label: 'Vision Statement',
          icon: Heading3,
          action: (editor) => {
            editor.chain()
              .focus()
              .insertContent('<h3>Vision</h3><p></p>')
              .run()
          }
        },
        {
          id: 'problem',
          label: 'Problem Statement',
          icon: Heading3,
          action: (editor) => {
            editor.chain()
              .focus()
              .insertContent('<h3>Problem Statement</h3><p></p>')
              .run()
          }
        },
        {
          id: 'users',
          label: 'Target Users',
          icon: Heading3,
          action: (editor) => {
            editor.chain()
              .focus()
              .insertContent('<h3>Target Users</h3><ul><li></li></ul>')
              .run()
          }
        },
        ...baseCommands
      ]
      
    case 'core_features':
    case 'additional_features':
      return [
        {
          id: 'feature',
          label: 'New Feature',
          icon: Heading3,
          action: (editor) => {
            const featureNum = editor.getHTML().match(/<h3>/g)?.length || 0
            editor.chain()
              .focus()
              .insertContent(`<h3>${featureNum + 1}. Feature Name</h3><p>Feature description...</p>`)
              .run()
          }
        },
        {
          id: 'priority',
          label: 'Priority Label',
          icon: Heading3,
          action: (editor) => {
            editor.chain()
              .focus()
              .insertContent('<p><em>Priority: High/Medium/Low</em></p>')
              .run()
          }
        },
        ...baseCommands
      ]
      
    default:
      return baseCommands
  }
}

export function NotionSectionEditor({
  id,
  type,
  title,
  content,
  ownership,
  isRequired,
  isExpanded = true,
  isEditable = true,
  isVisible = true,
  order,
  status,
  validationErrors,
  placeholder,
  enableSlashCommands = true,
  enableBubbleMenu = true,
  customCommands,
  onUpdate,
  onDelete,
  onDuplicate,
  onToggleVisibility,
  onToggleExpanded,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onContentSync,
  className
}: NotionSectionEditorProps) {
  const [showSlashCommand, setShowSlashCommand] = useState(false)
  const [slashCommandPosition, setSlashCommandPosition] = useState({ top: 0, left: 0 })
  const [slashFilter, setSlashFilter] = useState('')
  const editorRef = useRef<HTMLDivElement>(null)
  
  // Initialize hybrid content
  const [hybridContent, setHybridContent] = useState<HybridContent>(() => ({
    structuredData: content || {},
    richContent: transformStructuredToRich(type, content || {}),
    lastEditedIn: 'structured',
    version: 1
  }))
  
  // Get commands for this section type
  const commands = useMemo(() => 
    customCommands || getSectionCommands(type),
    [type, customCommands]
  )
  
  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!slashFilter) return commands
    const filter = slashFilter.toLowerCase()
    return commands.filter(cmd => 
      cmd.label.toLowerCase().includes(filter) ||
      cmd.keywords?.some(k => k.toLowerCase().includes(filter))
    )
  }, [commands, slashFilter])
  
  // Initialize TipTap editor
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
        placeholder: placeholder || getSectionPlaceholder(type)
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
    content: hybridContent.richContent,
    editable: isEditable && (ownership === 'human' || ownership === 'shared'),
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const structured = transformRichToStructured(type, html)
      
      const newHybridContent: HybridContent = {
        structuredData: structured,
        richContent: html,
        lastEditedIn: 'rich',
        version: hybridContent.version + 1
      }
      
      setHybridContent(newHybridContent)
      onUpdate(id, structured)
      onContentSync?.(structured, html)
    },
    editorProps: {
      attributes: {
        class: 'notion-content focus:outline-none min-h-[100px]',
        'data-section-id': id,
        'data-section-type': type
      },
      handleKeyDown: (view, event) => {
        // Handle slash command
        if (event.key === '/' && !showSlashCommand && enableSlashCommands) {
          const coords = view.coordsAtPos(view.state.selection.from)
          setSlashCommandPosition({
            top: coords.top + 25,
            left: coords.left
          })
          setShowSlashCommand(true)
          setSlashFilter('')
          return true
        }
        
        // Navigate slash menu
        if (showSlashCommand) {
          if (event.key === 'Escape') {
            setShowSlashCommand(false)
            setSlashFilter('')
            return true
          }
          
          if (event.key === 'Backspace' && slashFilter === '') {
            setShowSlashCommand(false)
            return false
          }
          
          // Let other keys update the filter
          if (event.key.length === 1) {
            setSlashFilter(prev => prev + event.key)
            return true
          }
        }
        
        return false
      }
    }
  })
  
  // Sync content when it changes externally
  useEffect(() => {
    if (editor && content) {
      const newRichContent = transformStructuredToRich(type, content)
      if (newRichContent !== hybridContent.richContent) {
        editor.commands.setContent(newRichContent)
        setHybridContent({
          structuredData: content,
          richContent: newRichContent,
          lastEditedIn: 'structured',
          version: hybridContent.version + 1
        })
      }
    }
  }, [content, type])
  
  const insertSlashCommand = useCallback((command: SlashCommand) => {
    if (!editor) return
    
    // Remove the slash and filter text
    const from = editor.state.selection.from - slashFilter.length - 1
    const to = editor.state.selection.from
    editor.commands.deleteRange({ from, to })
    
    // Execute the command action
    command.action(editor)
    
    setShowSlashCommand(false)
    setSlashFilter('')
  }, [editor, slashFilter])
  
  return (
    <SectionBlock
      id={id}
      type={type}
      title={title}
      content={hybridContent.structuredData}
      ownership={ownership}
      isRequired={isRequired}
      isExpanded={isExpanded}
      isEditable={isEditable}
      isVisible={isVisible}
      order={order}
      status={status}
      validationErrors={validationErrors}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onToggleVisibility={onToggleVisibility}
      onToggleExpanded={onToggleExpanded}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={className}
    >
      <div ref={editorRef} className="relative">
        {/* Enhanced Block Controls */}
        {editor && (
          <EnhancedBlockControls 
            editor={editor} 
            containerRef={editorRef}
            onBlockInsert={(type) => {
              console.log('Block inserted:', type)
            }}
          />
        )}
        
        <EditorContent 
          editor={editor} 
          className="notion-editor-content"
        />
        
        {/* Bubble Menu for text formatting */}
        {editor && enableBubbleMenu && editor.isActive('textSelection') && (
          <div className="bubble-menu-container flex items-center gap-1 p-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
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
          </div>
        )}
        
        {/* Slash Command Menu */}
        <AnimatePresence>
          {showSlashCommand && enableSlashCommands && (
            <motion.div 
              className="absolute z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2 min-w-[200px] slash-command-menu"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              style={{ 
                top: slashCommandPosition.top, 
                left: slashCommandPosition.left,
                maxHeight: '300px',
                overflowY: 'auto'
              }}
            >
            {slashFilter && (
              <div className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 mb-1">
                Searching: {slashFilter}
              </div>
            )}
            <div className="space-y-1">
              {filteredCommands.length > 0 ? (
                filteredCommands.map((command) => {
                  const Icon = command.icon
                  return (
                    <button
                      key={command.id}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                      onClick={() => insertSlashCommand(command)}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-sm">{command.label}</span>
                    </button>
                  )
                })
              ) : (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No commands found
                </div>
              )}
            </div>
          </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SectionBlock>
  )
}