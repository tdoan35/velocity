import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
// import Dropcursor from '@tiptap/extension-dropcursor' // Disabled - interferes with custom drag
import Gapcursor from '@tiptap/extension-gapcursor'
import { TextSelection } from '@tiptap/pm/state'
import { Button } from '@/components/ui/button'
import { SectionBlock, type SectionBlockProps, type SectionType } from './SectionBlock'
import { EnhancedBlockControlsDnd } from '../components/EnhancedBlockControlsDnd'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
// Removed legacy drag imports - now using @dnd-kit
import { ContentDndProvider, SortableContentLine, type ContentLine } from '../dnd'

// Virtual Block System imports
import { VirtualBlockManager } from '@/lib/virtual-blocks/VirtualBlockManager'
import { KeyboardNavigationManager } from '@/lib/virtual-blocks/KeyboardNavigationManager'
import { BlockType } from '@/lib/virtual-blocks/types'
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types'
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
  CheckCircle2,
  Highlighter
} from 'lucide-react'

// Hybrid content model interface
export interface HybridContent {
  structuredData: any      // For backend/validation
  richContent: string       // TipTap HTML
  lastEditedIn: 'rich' | 'structured'
  version: number
  virtualBlocks?: VirtualContentBlock[]  // Virtual blocks parsed from HTML
}

export interface NotionSectionEditorProps extends Omit<SectionBlockProps, 'children'> {
  placeholder?: string
  enableSlashCommands?: boolean
  enableBubbleMenu?: boolean
  enableVirtualBlocks?: boolean  // Enable virtual block system
  customCommands?: SlashCommand[]
  onContentSync?: (structured: any, rich: string) => void
  onBlocksUpdate?: (blocks: VirtualContentBlock[]) => void  // Virtual blocks update callback
  isDraggingSection?: boolean  // New prop to track when sections are being dragged
}

interface SlashCommand {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  action: (editor: Editor) => void
  keywords?: string[]
  blockType?: BlockType  // For block type conversion commands
  category?: 'basic' | 'heading' | 'list' | 'advanced'  // Command categories
  context?: string[]  // Block types where this command is relevant
}

// Helper function to check if an object has actual content (not just empty arrays/objects)
const hasActualContent = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object') return false
  
  // Check if any property has non-empty values
  return Object.keys(obj).some(key => {
    const value = obj[key]
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'string') return value.trim().length > 0
    if (typeof value === 'object' && value !== null) return hasActualContent(value)
    return Boolean(value)
  })
}

// TEMPORARILY DISABLED: Content transformation utilities - suspected cause of drag/drop issues
// These transformations might be causing the "Line 1Line 2Line 3" concatenation problem
/*
const transformStructuredToRich = (type: SectionType, structured: any): string => {
  let html = ''
  
  switch (type) {
    case 'overview':
      // Handle simple description first
      if (structured?.description && typeof structured.description === 'string') {
        html += `<p>${structured.description}</p>`
      } else {
        // Handle structured format
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
      
    case 'ui_design_patterns':
      if (structured?.patterns?.length > 0) {
        html += '<h3>Design Patterns</h3>'
        structured.patterns.forEach((pattern: any) => {
          html += `<h4>${pattern.name}</h4>`
          html += `<p>${pattern.description || ''}</p>`
          if (pattern.example) {
            html += `<p><em>Example: ${pattern.example}</em></p>`
          }
        })
      }
      if (structured?.designSystem) {
        html += `<h3>Design System</h3><p>${structured.designSystem}</p>`
      }
      if (structured?.colorScheme) {
        const hasColors = structured.colorScheme.primary || structured.colorScheme.secondary || 
                         structured.colorScheme.accent || structured.colorScheme.neutral?.length > 0
        if (hasColors) {
          html += '<h3>Color Scheme</h3>'
          if (structured.colorScheme.primary) {
            html += `<p><strong>Primary:</strong> ${structured.colorScheme.primary}</p>`
          }
          if (structured.colorScheme.secondary) {
            html += `<p><strong>Secondary:</strong> ${structured.colorScheme.secondary}</p>`
          }
          if (structured.colorScheme.accent) {
            html += `<p><strong>Accent:</strong> ${structured.colorScheme.accent}</p>`
          }
          if (structured.colorScheme.neutral?.length > 0) {
            html += '<p><strong>Neutral:</strong></p><ul>'
            structured.colorScheme.neutral.forEach((color: string) => {
              html += `<li>${color}</li>`
            })
            html += '</ul>'
          }
        }
      }
      if (structured?.typography) {
        const hasTypography = structured.typography.fontFamily || structured.typography.scale?.length > 0
        if (hasTypography) {
          html += '<h3>Typography</h3>'
          if (structured.typography.fontFamily) {
            html += `<p><strong>Font Family:</strong> ${structured.typography.fontFamily}</p>`
          }
          if (structured.typography.scale?.length > 0) {
            html += '<p><strong>Scale:</strong></p><ul>'
            structured.typography.scale.forEach((size: string) => {
              html += `<li>${size}</li>`
            })
            html += '</ul>'
          }
        }
      }
      if (structured?.components?.length > 0) {
        html += '<h3>Components</h3>'
        structured.components.forEach((component: any) => {
          html += `<h4>${component.name}</h4>`
          if (component.description) {
            html += `<p>${component.description}</p>`
          }
          if (component.usage) {
            html += `<p><em>Usage: ${component.usage}</em></p>`
          }
        })
      }
      break
      
    case 'ux_flows':
      if (structured?.userJourneys?.length > 0) {
        html += '<h3>User Journeys</h3>'
        structured.userJourneys.forEach((journey: any) => {
          html += `<h4>${journey.name}</h4>`
          html += `<p>${journey.description || ''}</p>`
          if (journey.persona) {
            html += `<p><em>Persona: ${journey.persona}</em></p>`
          }
          if (journey.steps?.length > 0) {
            html += '<ol>'
            journey.steps.forEach((step: string) => {
              html += `<li>${step}</li>`
            })
            html += '</ol>'
          }
        })
      }
      if (structured?.navigationStructure) {
        const hasNavigation = structured.navigationStructure.type || structured.navigationStructure.mainSections?.length > 0
        if (hasNavigation) {
          html += '<h3>Navigation Structure</h3>'
          if (structured.navigationStructure.type) {
            html += `<p><strong>Type:</strong> ${structured.navigationStructure.type}</p>`
          }
          if (structured.navigationStructure.mainSections?.length > 0) {
            html += '<p><strong>Main Sections:</strong></p><ul>'
            structured.navigationStructure.mainSections.forEach((section: string) => {
              html += `<li>${section}</li>`
            })
            html += '</ul>'
          }
        }
      }
      if (structured?.interactionPatterns?.length > 0) {
        html += '<h3>Interaction Patterns</h3>'
        structured.interactionPatterns.forEach((pattern: any) => {
          html += `<h4>${pattern.name}</h4>`
          html += `<p>${pattern.description}</p>`
        })
      }
      break
      
    case 'tech_integrations':
      if (structured?.integrations?.length > 0) {
        html += '<h3>Integrations</h3>'
        structured.integrations.forEach((integration: any) => {
          html += `<h4>${integration.name}</h4>`
          html += `<p><strong>Type:</strong> ${integration.type}</p>`
          html += `<p>${integration.purpose || ''}</p>`
          if (integration.configuration && Object.keys(integration.configuration).length > 0) {
            html += '<p><strong>Configuration:</strong></p>'
            html += '<pre>' + JSON.stringify(integration.configuration, null, 2) + '</pre>'
          }
        })
      }
      if (structured?.apis?.length > 0) {
        html += '<h3>APIs</h3>'
        structured.apis.forEach((api: any) => {
          html += `<h4>${api.name}</h4>`
          if (api.endpoint) {
            html += `<p><strong>Endpoint:</strong> <code>${api.endpoint}</code></p>`
          }
          if (api.authentication) {
            html += `<p><strong>Authentication:</strong> ${api.authentication}</p>`
          }
        })
      }
      if (structured?.environment) {
        const hasEnv = (structured.environment.development && Object.keys(structured.environment.development).length > 0) ||
                      (structured.environment.staging && Object.keys(structured.environment.staging).length > 0) ||
                      (structured.environment.production && Object.keys(structured.environment.production).length > 0)
        if (hasEnv) {
          html += '<h3>Environment Variables</h3>'
          if (structured.environment.development && Object.keys(structured.environment.development).length > 0) {
            html += '<h4>Development</h4>'
            html += '<pre>' + JSON.stringify(structured.environment.development, null, 2) + '</pre>'
          }
          if (structured.environment.staging && Object.keys(structured.environment.staging).length > 0) {
            html += '<h4>Staging</h4>'
            html += '<pre>' + JSON.stringify(structured.environment.staging, null, 2) + '</pre>'
          }
          if (structured.environment.production && Object.keys(structured.environment.production).length > 0) {
            html += '<h4>Production</h4>'
            html += '<pre>' + JSON.stringify(structured.environment.production, null, 2) + '</pre>'
          }
        }
      }
      break
      
    default:
      // For custom sections, only display JSON if there's actual content
      if (typeof structured === 'string') {
        html = `<p>${structured}</p>`
      } else if (hasActualContent(structured)) {
        html = '<pre>' + JSON.stringify(structured, null, 2) + '</pre>'
      }
      // Return empty string if no actual content so placeholder shows
  }
  
  return html || ''
}
*/

// Simplified transformation for testing - just pass through the content
const transformStructuredToRich = (type: SectionType, structured: any): string => {
  // Simple pass-through for testing
  if (typeof structured === 'string') return structured
  if (structured?.html) return structured.html
  if (structured?.content) return structured.content
  return '<p>Test content</p>'
}

const transformRichToStructured = (type: SectionType, html: string): any => {
  // Simple pass-through for testing
  return { html, type }
}

// Original transformation functions have been removed for testing
// The original implementations converted between structured data and rich HTML
// but may have been causing the content concatenation issue

/* Removed large block of commented-out transformation code for clarity.
   The original functions transformed between structured JSON and rich HTML
   for different section types (overview, core_features, ui_ux_design, etc.)
   These functions have been replaced with simplified pass-through versions above
   for testing purposes to isolate the drag-drop issue. */
// Section-specific placeholders
const getSectionPlaceholder = (type: SectionType): string => {
  const placeholders: Record<SectionType, string> = {
    overview: "Write your project vision, the problem you're solving, and who your target users are. Press '/' for formatting options...",
    core_features: "List the essential features that define your product's core value. Each feature should solve a key user problem...",
    additional_features: "Describe nice-to-have features that enhance the user experience but aren't critical for launch...",
    ui_design_patterns: "Define your visual design language, component library, color schemes, typography, and interaction patterns...",
    ux_flows: "Map out key user journeys, wireframes, and interaction flows. How will users navigate through your app?...",
    technical_architecture: "Describe your tech stack, system architecture, database design, API structure, and deployment strategy...",
    tech_integrations: "List third-party services, APIs, authentication providers, payment gateways, and other external dependencies...",
    custom: "Add any additional information relevant to your project..."
  }
  return placeholders[type] || "Start writing or press '/' for formatting options..."
}

// Get block-aware slash commands based on current context
const getSectionCommands = (type: SectionType, currentBlock?: VirtualContentBlock | null): SlashCommand[] => {
  const baseCommands: SlashCommand[] = [
    {
      id: 'heading1',
      label: 'Heading 1',
      icon: Heading1,
      action: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      blockType: BlockType.HEADING_1,
      category: 'heading',
      context: [BlockType.PARAGRAPH, BlockType.HEADING_2, BlockType.HEADING_3],
      keywords: ['h1', 'title', 'heading']
    },
    {
      id: 'heading2',
      label: 'Heading 2',
      icon: Heading2,
      action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      blockType: BlockType.HEADING_2,
      category: 'heading',
      context: [BlockType.PARAGRAPH, BlockType.HEADING_1, BlockType.HEADING_3],
      keywords: ['h2', 'subtitle', 'heading']
    },
    {
      id: 'heading3',
      label: 'Heading 3',
      icon: Heading3,
      action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      blockType: BlockType.HEADING_3,
      category: 'heading',
      context: [BlockType.PARAGRAPH, BlockType.HEADING_1, BlockType.HEADING_2],
      keywords: ['h3', 'section', 'heading']
    },
    {
      id: 'bulletList',
      label: 'Bullet List',
      icon: List,
      action: (editor) => editor.chain().focus().toggleBulletList().run(),
      blockType: BlockType.BULLET_LIST,
      category: 'list',
      context: [BlockType.PARAGRAPH, BlockType.NUMBERED_LIST],
      keywords: ['bullet', 'list', 'ul', '-']
    },
    {
      id: 'orderedList',
      label: 'Numbered List',
      icon: ListOrdered,
      action: (editor) => editor.chain().focus().toggleOrderedList().run(),
      blockType: BlockType.NUMBERED_LIST,
      category: 'list',
      context: [BlockType.PARAGRAPH, BlockType.BULLET_LIST],
      keywords: ['numbered', 'ordered', 'list', 'ol', '1.']
    },
    {
      id: 'taskList',
      label: 'Task List',
      icon: CheckCircle2,
      action: (editor) => editor.chain().focus().toggleTaskList().run()
      // Note: Task lists don't have a specific virtual block type yet
    },
    {
      id: 'quote',
      label: 'Quote',
      icon: Quote,
      action: (editor) => editor.chain().focus().toggleBlockquote().run(),
      blockType: BlockType.QUOTE
    },
    {
      id: 'code',
      label: 'Code Block',
      icon: Code,
      action: (editor) => editor.chain().focus().toggleCodeBlock().run(),
      blockType: BlockType.CODE
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

// Section emojis for visual distinction
const getSectionEmoji = (type: SectionType): string => {
  const emojis: Record<SectionType, string> = {
    overview: '📋',
    core_features: '⭐',
    additional_features: '✨',
    ui_design_patterns: '🎨',
    ux_flows: '🗺️',
    technical_architecture: '🏗️',
    tech_integrations: '🔌',
    custom: '📝'
  }
  return emojis[type] || '📄'
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
  enableVirtualBlocks = true,  // Enable virtual blocks by default
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
  onBlocksUpdate,
  isDraggingSection: _isDraggingSection = false,
  className
}: NotionSectionEditorProps) {
  const [showSlashCommand, setShowSlashCommand] = useState(false)
  const [slashCommandPosition, setSlashCommandPosition] = useState({ top: 0, left: 0 })
  const [slashFilter, setSlashFilter] = useState('')
  const editorRef = useRef<HTMLDivElement>(null)
  
  // Virtual Block Manager instance
  const virtualBlockManager = useMemo(() => new VirtualBlockManager(), [])
  const [virtualBlocks, setVirtualBlocks] = useState<VirtualContentBlock[]>([])
  
  // Drag state now handled by @dnd-kit
  
  // Removed useDragCleanup - now handled by @dnd-kit
  
  // Initialize hybrid content with virtual blocks
  // TEMPORARILY DISABLED: Commenting out transformation to debug drag/drop issues
  const [hybridContent, setHybridContent] = useState<HybridContent>(() => {
    const initialHtml = typeof content === 'string' ? content : '<p>Line 1</p><p>Line 2</p><p>Line 3</p>';
    const blocks = enableVirtualBlocks ? virtualBlockManager.parseHTMLToBlocks(initialHtml) : [];
    return {
      structuredData: content || {},
      // richContent: transformStructuredToRich(type, content || {}),
      richContent: initialHtml, // Use simple HTML for testing
      lastEditedIn: 'structured',
      version: 1,
      virtualBlocks: blocks
    }
  })
  
  // Refs for tracking content updates and preventing loops
  const contentRef = useRef(content)
  const isExternalUpdate = useRef(false)
  const isInternalUpdate = useRef(false)
  
  // Placeholder - these will be defined after editor initialization
  // to avoid TypeScript block-scoped variable errors
  
  // Memoize extensions to prevent duplication warnings
  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
        HTMLAttributes: {
          class: 'notion-heading'
        }
      },
      // Disable dropcursor and gapcursor from StarterKit to avoid duplication
      dropcursor: false,
      gapcursor: false
    }),
    Placeholder.configure({
      placeholder: placeholder || getSectionPlaceholder(type),
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
      showOnlyWhenEditable: false  // Show placeholder even when not editable
    }),
    Typography,
    Highlight.configure({
      multicolor: false
    }),
    TaskList,
    TaskItem.configure({
      nested: true
    }),
    // DISABLE Dropcursor completely - it might interfere with our custom drag
    // Dropcursor shows a line where content will be dropped, but we handle this ourselves
    // Dropcursor is now safe to use with @dnd-kit
    // Dropcursor.configure({
    //   color: '#10b981',
    //   width: 2
    // })]),
    // Always include gapcursor for better UX
    Gapcursor
  ], [type, placeholder])
  
  // Initialize TipTap editor
  const editor = useEditor({
    extensions,
    content: hybridContent.richContent || undefined,
    editable: isEditable,  // Trust the isEditable prop from parent
    onUpdate: ({ editor }) => {
      // TEMPORARILY DISABLED: Commenting out transformation to debug drag/drop issues
      // Prevent updates during external sync
      if (isExternalUpdate.current) return
      
      isInternalUpdate.current = true
      const html = editor.getHTML()
      
      // Parse HTML into virtual blocks if enabled
      let blocks: VirtualContentBlock[] = []
      if (enableVirtualBlocks) {
        blocks = virtualBlockManager.parseHTMLToBlocks(html)
        setVirtualBlocks(blocks)
        onBlocksUpdate?.(blocks)
      }
      
      // const structured = transformRichToStructured(type, html)
      const structured = { html } // Simple pass-through for testing
      
      const newHybridContent: HybridContent = {
        structuredData: structured,
        richContent: html,
        lastEditedIn: 'rich',
        version: hybridContent.version + 1,
        virtualBlocks: blocks
      }
      
      setHybridContent(newHybridContent)
      onUpdate(id, structured)
      // onContentSync?.(structured, html) // Disabled for testing
    },
    editorProps: {
      attributes: {
        class: 'notion-content focus:outline-none min-h-[100px]',
        'data-section-id': id,
        'data-section-type': type
      },
      // Re-enable TipTap drag handlers now that we're using @dnd-kit
      handleKeyDown: (view, event) => {
        // Handle slash command menu
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
        
        // All other keyboard navigation handled by KeyboardNavigationManager via useEffect
        return false
      }
    }
  })
  
  // Initialize KeyboardNavigationManager
  const keyboardNavManager = useMemo(() => {
    if (!editor || !enableVirtualBlocks) return null
    
    return new KeyboardNavigationManager(editor, virtualBlockManager, {
      onBlockFocus: (blockId) => {
        // Handle block focus updates
        console.log('Block focused:', blockId)
      },
      onBlockCreate: (blockId, type) => {
        // Handle new block creation
        console.log('Block created:', blockId, type)
      },
      onBlockDelete: (blockId) => {
        // Handle block deletion
        console.log('Block deleted:', blockId)
      },
      onContentUpdate: (html) => {
        // Parse and update virtual blocks
        const blocks = virtualBlockManager.parseHTMLToBlocks(html)
        setVirtualBlocks(blocks)
        onBlocksUpdate?.(blocks)
      }
    })
  }, [editor, enableVirtualBlocks, virtualBlockManager, onBlocksUpdate])
  
  // Get current virtual block for context
  const currentVirtualBlock = useMemo(() => {
    if (!editor || !virtualBlocks.length) return null
    const selection = editor.state.selection
    const pos = selection.from
    
    // Find the virtual block at the current cursor position
    for (const block of virtualBlocks) {
      if (pos >= block.position.start && pos <= block.position.end) {
        return block
      }
    }
    return null
  }, [editor, virtualBlocks])
  
  // Get commands for this section type with block context
  const commands = useMemo(() => 
    customCommands || getSectionCommands(type, currentVirtualBlock),
    [type, customCommands, currentVirtualBlock]
  )
  
  // Filter commands based on search and current block context
  const filteredCommands = useMemo(() => {
    let filtered = commands
    
    // Filter by current block context if available
    if (currentVirtualBlock && enableVirtualBlocks) {
      filtered = commands.filter(cmd => {
        // If command has no context restrictions, always show it
        if (!cmd.context || cmd.context.length === 0) return true
        // Check if current block type is in the command's context
        return cmd.context.includes(currentVirtualBlock.type)
      })
    }
    
    // Filter by search query
    if (slashFilter) {
      const filter = slashFilter.toLowerCase()
      filtered = filtered.filter(cmd => 
        cmd.label.toLowerCase().includes(filter) ||
        cmd.keywords?.some(k => k.toLowerCase().includes(filter))
      )
    }
    
    // Sort by relevance (prioritize exact block type matches)
    if (currentVirtualBlock && enableVirtualBlocks) {
      filtered.sort((a, b) => {
        const aRelevant = a.context?.includes(currentVirtualBlock.type) ? 1 : 0
        const bRelevant = b.context?.includes(currentVirtualBlock.type) ? 1 : 0
        return bRelevant - aRelevant
      })
    }
    
    return filtered
  }, [commands, slashFilter, currentVirtualBlock, enableVirtualBlocks])
  
  // Helper function to check if content has meaningful changes
  const hasSignificantContentChange = useCallback((oldContent: any, newContent: any): boolean => {
    // Deep comparison for objects
    if (typeof oldContent === 'object' && typeof newContent === 'object') {
      return JSON.stringify(oldContent) !== JSON.stringify(newContent)
    }
    return oldContent !== newContent
  }, [])
  
  // TEMPORARILY DISABLED: Commenting out content sync to debug drag/drop issues
  // Sync content when it changes externally (only for significant changes)
  // Integrate KeyboardNavigationManager with editor
  useEffect(() => {
    if (!editor || !keyboardNavManager || !enableVirtualBlocks) return
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Skip if slash command menu is open
      if (showSlashCommand) return
      
      // Check if the editor is focused
      if (!editor.isFocused) return
      
      let handled = false
      
      // Handle arrow navigation
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        // Only intercept at block boundaries
        const selection = editor.state.selection
        const $from = selection.$from
        const isAtBoundary = event.key === 'ArrowUp' 
          ? $from.parentOffset === 0 
          : $from.parentOffset === $from.parent.content.size
        
        if (isAtBoundary) {
          handled = keyboardNavManager.handleArrowNavigation(
            event.key === 'ArrowUp' ? 'up' : 'down'
          )
        }
      }
      
      // Handle Enter key
      else if (event.key === 'Enter') {
        handled = keyboardNavManager.handleEnterKey(event.shiftKey)
      }
      
      // Handle Backspace
      else if (event.key === 'Backspace') {
        const selection = editor.state.selection
        const $from = selection.$from
        const isAtStart = $from.parentOffset === 0
        
        if (isAtStart) {
          handled = keyboardNavManager.handleBackspaceKey()
        }
      }
      
      // Handle Tab indentation
      else if (event.key === 'Tab') {
        event.preventDefault() // Always prevent default tab behavior
        handled = keyboardNavManager.handleTabIndentation(event.shiftKey)
      }
      
      // Handle block duplication
      else if (event.key === 'd' && (event.ctrlKey || event.metaKey)) {
        const currentBlock = keyboardNavManager.getCurrentBlock()
        if (currentBlock) {
          event.preventDefault()
          keyboardNavManager.duplicateBlock(currentBlock.id)
          handled = true
        }
      }
      
      // Handle block type conversion shortcuts
      else if (event.ctrlKey || event.metaKey) {
        const currentBlock = keyboardNavManager.getCurrentBlock()
        if (currentBlock) {
          let newType: BlockType | null = null
          
          if (event.altKey) {
            // Cmd/Ctrl + Alt + number for headings
            if (event.key === '1') newType = BlockType.HEADING_1
            else if (event.key === '2') newType = BlockType.HEADING_2
            else if (event.key === '3') newType = BlockType.HEADING_3
          } else if (event.shiftKey) {
            // Cmd/Ctrl + Shift + number for lists
            if (event.key === '7') newType = BlockType.BULLET_LIST
            else if (event.key === '8') newType = BlockType.NUMBERED_LIST
          }
          
          if (newType) {
            event.preventDefault()
            keyboardNavManager.convertBlockType(currentBlock.id, newType)
            handled = true
          }
        }
      }
      
      if (handled) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    
    // Add event listener to the editor element
    const editorElement = editorRef.current
    if (editorElement) {
      editorElement.addEventListener('keydown', handleKeyDown, true)
      
      return () => {
        editorElement.removeEventListener('keydown', handleKeyDown, true)
      }
    }
  }, [editor, keyboardNavManager, enableVirtualBlocks, showSlashCommand])
  
  /*
  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      // Only update if content has significantly changed from external source
      if (hasSignificantContentChange(contentRef.current, content)) {
        isExternalUpdate.current = true
        const newRichContent = transformStructuredToRich(type, content || {})
        
        // Only update editor if the rich content is actually different
        const currentEditorContent = editor.getHTML()
        if (newRichContent !== currentEditorContent && newRichContent !== hybridContent.richContent) {
          editor.commands.setContent(newRichContent || '')
          setHybridContent({
            structuredData: content || {},
            richContent: newRichContent,
            lastEditedIn: 'structured',
            version: hybridContent.version + 1
          })
        }
        contentRef.current = content
        isExternalUpdate.current = false
      }
    }
    isInternalUpdate.current = false
  }, [content, type, editor, hasSignificantContentChange, hybridContent.richContent, hybridContent.version])
  */
  
  // NOTE: Content drag & drop is now handled entirely by EnhancedBlockControls
  // This component only manages section-level operations
  
  const insertSlashCommand = useCallback((command: SlashCommand) => {
    if (!editor) return
    
    // Remove the slash and filter text
    const from = editor.state.selection.from - slashFilter.length - 1
    const to = editor.state.selection.from
    editor.commands.deleteRange({ from, to })
    
    // If virtual blocks are enabled and this is a block type conversion command
    if (enableVirtualBlocks && virtualBlocks.length > 0 && command.blockType) {
      const pos = editor.state.selection.from
      const currentBlock = virtualBlockManager.getBlockAtPosition(hybridContent.richContent, pos)
      
      if (currentBlock) {
        // Convert the virtual block type
        const result = virtualBlockManager.convertBlockType(
          hybridContent.richContent,
          currentBlock.id,
          command.blockType
        )
        
        if (result.success && result.html) {
          // Update editor with converted HTML
          editor.commands.setContent(result.html)
          // Parse new blocks
          const newBlocks = virtualBlockManager.parseHTMLToBlocks(result.html)
          setVirtualBlocks(newBlocks)
          onBlocksUpdate?.(newBlocks)
          setShowSlashCommand(false)
          setSlashFilter('')
          return
        }
      }
    }
    
    // Execute the default command action
    command.action(editor)
    
    setShowSlashCommand(false)
    setSlashFilter('')
  }, [editor, slashFilter, enableVirtualBlocks, virtualBlocks, virtualBlockManager, hybridContent, onBlocksUpdate])
  
  // Get emoji for section
  const emoji = getSectionEmoji(type)
  
  // Handle content-level drag events (delegated to EnhancedBlockControls)
  // Removed content drag handlers - now handled by @dnd-kit

  const handleSectionDrop = useCallback((e: React.DragEvent) => {
    // Handled by @dnd-kit now
    onDrop?.(e, id)
  }, [onDrop, id])

  return (
    <SectionBlock
      id={id}
      type={type}
      title={`${emoji} ${title}`}
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
      onDrop={handleSectionDrop}
      className={className}
      hideCard={true}
    >
      <div ref={editorRef} className="relative">
        {/* Enhanced Block Controls */}
        {editor && (
          <EnhancedBlockControlsDnd 
            editor={editor} 
            containerRef={editorRef}
            sectionId={id}
            virtualBlocks={enableVirtualBlocks ? virtualBlocks : undefined}
            onBlockInsert={(type) => {
              console.log('Block inserted:', type)
            }}
          />
        )}
        
        <EditorContent 
          editor={editor} 
          className="notion-editor-content"
        />
        
        {/* Enhanced Bubble Menu for text formatting */}
        {editor && enableBubbleMenu && (
          <BubbleMenu 
            editor={editor}
            shouldShow={({ editor, state }) => {
              const { from, to } = state.selection
              return from !== to && !editor.isActive('link')
            }}
            className="bubble-menu-container flex items-center gap-1 p-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
          >
            {/* Text Formatting */}
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
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              data-active={editor.isActive('highlight')}
            >
              <Highlighter className="h-3 w-3" />
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
            
            {/* Headings */}
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
            
            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
            
            {/* Lists */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              data-active={editor.isActive('bulletList')}
            >
              <List className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              data-active={editor.isActive('orderedList')}
            >
              <ListOrdered className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              data-active={editor.isActive('taskList')}
            >
              <CheckCircle2 className="h-3 w-3" />
            </Button>
            
            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
            
            {/* Block Elements */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              data-active={editor.isActive('blockquote')}
            >
              <Quote className="h-3 w-3" />
            </Button>
          </BubbleMenu>
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
                  const isRelevant = currentVirtualBlock && command.context?.includes(currentVirtualBlock.type)
                  return (
                    <button
                      key={command.id}
                      className={cn(
                        "w-full flex items-center gap-2 px-3 py-2 rounded text-left transition-colors",
                        "hover:bg-gray-100 dark:hover:bg-gray-700",
                        isRelevant && "bg-blue-50 dark:bg-blue-900/20"
                      )}
                      onClick={() => insertSlashCommand(command)}
                    >
                      <Icon className={cn(
                        "h-4 w-4",
                        isRelevant ? "text-blue-600 dark:text-blue-400" : "text-gray-600 dark:text-gray-400"
                      )} />
                      <span className={cn(
                        "text-sm",
                        isRelevant && "font-medium text-blue-900 dark:text-blue-100"
                      )}>
                        {command.label}
                      </span>
                      {isRelevant && (
                        <span className="ml-auto text-xs text-blue-600 dark:text-blue-400">
                          Suggested
                        </span>
                      )}
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