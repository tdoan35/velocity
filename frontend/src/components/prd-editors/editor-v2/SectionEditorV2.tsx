import React, { useEffect, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { usePRDEditorStore } from '@/stores/prdEditorStore'
import type { PRDSection } from '@/stores/prdEditorStore'
import { cn } from '@/lib/utils'
import { 
  Bold, 
  Italic, 
  List, 
  ListOrdered, 
  Quote,
  Heading2,
  Heading3,
  CheckSquare,
  Trash2,
  CheckCircle,
  Circle,
  Clock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface SectionEditorProps {
  section: PRDSection
  isActive?: boolean
  className?: string
}

const getStatusIcon = (status: PRDSection['status']) => {
  switch (status) {
    case 'completed':
      return <CheckCircle className="h-4 w-4 text-green-600" />
    case 'in_progress':
      return <Clock className="h-4 w-4 text-blue-600" />
    default:
      return <Circle className="h-4 w-4 text-gray-400" />
  }
}

const getAgentColor = (agent: PRDSection['agent']) => {
  switch (agent) {
    case 'project_manager':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'design_assistant':
      return 'bg-purple-100 text-purple-800 border-purple-200'
    case 'engineering_assistant':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'config_helper':
      return 'bg-orange-100 text-orange-800 border-orange-200'
    default:
      return 'bg-gray-100 text-gray-800 border-gray-200'
  }
}

export const SectionEditor: React.FC<SectionEditorProps> = ({
  section,
  isActive = false,
  className,
}) => {
  const { 
    updateSectionContent, 
    updateSectionStatus, 
    removeSection,
    setActiveSection 
  } = usePRDEditorStore()
  
  const [isExpanded, setIsExpanded] = useState(true)

  // Initialize editor with section-specific content
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3, 4],
        },
      }),
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') {
            return `Heading ${node.attrs.level}`
          }
          return 'Start typing or press "/" for commands...'
        },
      }),
      Typography,
      Highlight,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
    ],
    content: section.content.editorJSON || getDefaultContent(section),
    onUpdate: ({ editor }) => {
      const json = editor.getJSON()
      updateSectionContent(section.id, json)
    },
    onFocus: () => {
      setActiveSection(section.id)
    },
    onBlur: () => {
      setActiveSection(null)
    },
    editable: section.status !== 'completed' || section.isCustom,
  })

  // Update editor content when section changes
  useEffect(() => {
    if (editor && section.content.editorJSON) {
      const currentJSON = editor.getJSON()
      if (JSON.stringify(currentJSON) !== JSON.stringify(section.content.editorJSON)) {
        editor.commands.setContent(section.content.editorJSON)
      }
    }
  }, [editor, section.content.editorJSON])

  const handleStatusChange = (newStatus: PRDSection['status']) => {
    updateSectionStatus(section.id, newStatus)
    if (editor) {
      editor.setEditable(newStatus !== 'completed' || section.isCustom)
    }
  }

  const handleRemoveSection = () => {
    if (window.confirm(`Are you sure you want to remove "${section.title}"?`)) {
      removeSection(section.id)
    }
  }

  return (
    <div
      className={cn(
        'section-editor rounded-lg border bg-card transition-all duration-200',
        isActive && 'ring-2 ring-primary ring-offset-2',
        className
      )}
    >
      {/* Section Header */}
      <div className="section-header border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {getStatusIcon(section.status)}
            </button>
            
            <div>
              <h3 className="font-semibold text-lg flex items-center gap-2">
                {section.title}
                {section.required && (
                  <span className="text-xs text-red-500">*Required</span>
                )}
              </h3>
              {section.description && (
                <p className="text-sm text-muted-foreground mt-0.5">
                  {section.description}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={cn(
                'text-xs px-2 py-1 rounded-md border',
                getAgentColor(section.agent)
              )}
            >
              {section.agent.replace('_', ' ')}
            </span>
            
            <Select value={section.status} onValueChange={handleStatusChange}>
              <SelectTrigger className="w-32 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="in_progress">In Progress</SelectItem>
                <SelectItem value="completed">Completed</SelectItem>
              </SelectContent>
            </Select>

            {section.isCustom && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRemoveSection}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Section Content */}
      {isExpanded && (
        <div className="section-content p-4">
          {editor && (
            <>
              <BubbleMenu 
                editor={editor}
                tippyOptions={{ duration: 100 }}
                className="bubble-menu flex items-center gap-1 p-1 rounded-lg border bg-popover shadow-lg"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBold().run()}
                  className={cn(
                    'h-8 w-8 p-0',
                    editor.isActive('bold') && 'bg-muted'
                  )}
                >
                  <Bold className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleItalic().run()}
                  className={cn(
                    'h-8 w-8 p-0',
                    editor.isActive('italic') && 'bg-muted'
                  )}
                >
                  <Italic className="h-4 w-4" />
                </Button>
                <div className="w-px h-6 bg-border mx-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                  className={cn(
                    'h-8 w-8 p-0',
                    editor.isActive('heading', { level: 2 }) && 'bg-muted'
                  )}
                >
                  <Heading2 className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                  className={cn(
                    'h-8 w-8 p-0',
                    editor.isActive('heading', { level: 3 }) && 'bg-muted'
                  )}
                >
                  <Heading3 className="h-4 w-4" />
                </Button>
                <div className="w-px h-6 bg-border mx-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBulletList().run()}
                  className={cn(
                    'h-8 w-8 p-0',
                    editor.isActive('bulletList') && 'bg-muted'
                  )}
                >
                  <List className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleOrderedList().run()}
                  className={cn(
                    'h-8 w-8 p-0',
                    editor.isActive('orderedList') && 'bg-muted'
                  )}
                >
                  <ListOrdered className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleTaskList().run()}
                  className={cn(
                    'h-8 w-8 p-0',
                    editor.isActive('taskList') && 'bg-muted'
                  )}
                >
                  <CheckSquare className="h-4 w-4" />
                </Button>
                <div className="w-px h-6 bg-border mx-1" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => editor.chain().focus().toggleBlockquote().run()}
                  className={cn(
                    'h-8 w-8 p-0',
                    editor.isActive('blockquote') && 'bg-muted'
                  )}
                >
                  <Quote className="h-4 w-4" />
                </Button>
              </BubbleMenu>

              <EditorContent 
                editor={editor}
                className={cn(
                  'prose prose-sm dark:prose-invert max-w-none',
                  'focus:outline-none',
                  '[&_.ProseMirror]:min-h-[100px]',
                  '[&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)]',
                  '[&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground',
                  '[&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left',
                  '[&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0',
                  '[&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none'
                )}
              />
            </>
          )}
        </div>
      )}

      {/* Section Footer (metadata) */}
      {section.metadata && isExpanded && (
        <div className="section-footer border-t px-4 py-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Version {section.metadata.version}</span>
            <span>
              Last modified: {new Date(section.metadata.lastModified).toLocaleString()}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

// Helper function to get default content for a section
function getDefaultContent(section: PRDSection): JSONContent {
  const baseContent: JSONContent = {
    type: 'doc',
    content: [],
  }

  // Add section-specific default content based on type
  switch (section.id) {
    case 'overview':
      baseContent.content = [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Vision' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Describe your product vision here...' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Problem Statement' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'What problem are you solving?' }],
        },
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Target Users' }],
        },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'User group 1' }],
                },
              ],
            },
          ],
        },
      ]
      break

    case 'core_features':
      baseContent.content = [
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Core Features' }],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Feature 1' }],
                },
              ],
            },
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Feature 2' }],
                },
              ],
            },
            {
              type: 'taskItem',
              attrs: { checked: false },
              content: [
                {
                  type: 'paragraph',
                  content: [{ type: 'text', text: 'Feature 3' }],
                },
              ],
            },
          ],
        },
      ]
      break

    default:
      baseContent.content = [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: 'Start typing here...' }],
        },
      ]
  }

  return baseContent
}