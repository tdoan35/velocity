import { useEffect, useRef, useMemo, useState } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Button } from '@/components/ui/button'
import { 
  Bold, 
  Italic, 
  Strikethrough,
  Code,
  Heading2,
  Heading3,
  List, 
  ListOrdered,
  Quote
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { SimpleBlockControls } from './SimpleBlockControls'
import { VirtualBlockManager } from '@/lib/virtual-blocks/VirtualBlockManager'
import { AutoConversionManager } from '@/lib/virtual-blocks/AutoConversionManager'
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types'

interface NotionRichTextEditorProps {
  content: {
    html: string
    text: string
  }
  onChange: (content: { html: string; text: string }) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
  editable?: boolean
  enableVirtualBlocks?: boolean
  onBlocksUpdate?: (blocks: VirtualContentBlock[]) => void
  sectionId?: string
}

export function NotionRichTextEditor({ 
  content, 
  onChange, 
  onBlur,
  placeholder = 'Click to start typing...',
  className,
  editable = true,
  enableVirtualBlocks = true,
  onBlocksUpdate,
  sectionId = 'baseline-editor'
}: NotionRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null!)
  const isUpdatingProgrammatically = useRef(false)
  
  // Virtual block state management
  const [virtualBlocks, setVirtualBlocks] = useState<VirtualContentBlock[]>([])
  


  const editor: Editor | null = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3]
        }
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty'
      }),
    ],
    content: content.html,
    editable,
    onUpdate: ({ editor }) => {
      // Skip onChange if this is a programmatic update
      if (isUpdatingProgrammatically.current) {
        return
      }
      
      const html = editor.getHTML()
      const text = editor.getText()
      onChange({ html, text })
      
      // Parse HTML to virtual blocks if enabled
      if (enableVirtualBlocks) {
        const blocks = virtualBlockManager.parseHTMLToBlocks(html)
        setVirtualBlocks(blocks)
        onBlocksUpdate?.(blocks)
      }
    },
    onBlur: () => {
      onBlur?.()
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none min-h-[100px] px-3 py-2',
          'prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-strong:text-foreground',
          'dark:prose-headings:text-foreground dark:prose-p:text-foreground dark:prose-li:text-foreground dark:prose-strong:text-foreground',
          'cursor-text',
          className
        )
      }
    }
  })



  // Initialize VirtualBlockManager for auto-conversion (baseline mode)
  const virtualBlockManager = useMemo(() => new VirtualBlockManager(), [])
  
  // Initialize AutoConversionManager
  const autoConversionManager = useMemo(() => {
    if (!editor) return null
    return new AutoConversionManager(editor, virtualBlockManager)
  }, [editor, virtualBlockManager])

  // Virtual block reordering handler for SimpleBlockControls
  const handleBlockReorder = (fromIndex: number, toIndex: number, position: 'before' | 'after' = 'after') => {
    
    if (!editor || !virtualBlocks || virtualBlocks.length === 0) {
      return
    }
    
    // Validate indices
    if (fromIndex < 0 || fromIndex >= virtualBlocks.length || 
        toIndex < 0 || toIndex >= virtualBlocks.length ||
        fromIndex === toIndex) {
      return
    }
    
    try {
      // Get current HTML from editor
      const currentHTML = editor.getHTML()
      
      // Re-parse HTML to get fresh virtual blocks with consistent IDs
      const freshVirtualBlocks = virtualBlockManager.parseHTMLToBlocks(currentHTML)
      
      
      // Use fresh blocks to get the correct IDs
      const sourceBlock = freshVirtualBlocks[fromIndex]
      const targetBlock = freshVirtualBlocks[toIndex]
      
      if (!sourceBlock || !targetBlock) {
        return
      }
      
      // Call reorderBlocks with fresh block IDs
      const result = virtualBlockManager.reorderBlocks(
        currentHTML,
        sourceBlock.id,        // fresh source block ID
        targetBlock.id,        // fresh target block ID
        position               // 'before' or 'after'
      )
      
      // Check if operation was successful
      if (!result.success) {
        return
      }
      
      const newHTML = result.html || ''
      
      // Validate the new HTML is not empty
      if (!newHTML.trim()) {
        return
      }
      
      // Update editor content
      editor.commands.setContent(newHTML)
      
      // Update virtual blocks state with fresh blocks
      const updatedBlocks = virtualBlockManager.parseHTMLToBlocks(newHTML)
      
      setVirtualBlocks(updatedBlocks)
      onBlocksUpdate?.(updatedBlocks)
      
      // Trigger onChange to save
      onChange({ html: newHTML, text: editor.getText() })
      
    } catch (error) {
      // Error handling
    }
  }

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && content.html !== editor.getHTML()) {
      // Set flag to indicate this is a programmatic update
      isUpdatingProgrammatically.current = true
      
      editor.commands.setContent(content.html)
      
      // Extended delay for template content to prevent race conditions
      const isTemplateContent = content.html?.includes('Start writing') || content.html?.includes('template-placeholder')
      const resetDelay = isTemplateContent ? 300 : 100
      
      // Reset flag after delay to allow the update to complete
      setTimeout(() => {
        isUpdatingProgrammatically.current = false
      }, resetDelay)
      
      // Parse initial virtual blocks
      if (enableVirtualBlocks && content.html) {
        const blocks = virtualBlockManager.parseHTMLToBlocks(content.html)
        setVirtualBlocks(blocks)
        onBlocksUpdate?.(blocks)
      }
    }
  }, [content.html, editor, enableVirtualBlocks]) // Removed unstable dependencies
  
  // Initialize virtual blocks on first load
  useEffect(() => {
    if (editor && enableVirtualBlocks && content.html && virtualBlocks.length === 0) {
      const blocks = virtualBlockManager.parseHTMLToBlocks(content.html)
      setVirtualBlocks(blocks)
      onBlocksUpdate?.(blocks)
    }
  }, [editor, enableVirtualBlocks, content.html, virtualBlocks.length]) // Removed unstable dependencies

  // Add auto-conversion keyboard handling for baseline editor
  useEffect(() => {
    if (!editor || !autoConversionManager) return
    
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if the editor is focused
      if (!editor.isFocused) return
      
      // Handle auto-conversion patterns (space or Enter key)
      if (event.key === ' ' || event.key === 'Enter') {
        const converted = autoConversionManager.handleAutoConversionTrigger(event)
        if (converted) {
          // Prevent default and stop propagation if conversion happened
          event.preventDefault()
          event.stopPropagation()
        }
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
  }, [editor, autoConversionManager])

  if (!editor) {
    return null
  }

  const BubbleMenuButton = ({ 
    onClick, 
    isActive = false, 
    children, 
    title 
  }: { 
    onClick: () => void
    isActive?: boolean
    children: React.ReactNode
    title: string 
  }) => (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn(
        "h-7 w-7 p-0",
        isActive && "bg-accent"
      )}
      title={title}
    >
      {children}
    </Button>
  )

  return (
    <div className="relative" ref={editorRef}>

      {/* Simple Block Controls with Virtual Block Support */}
      <SimpleBlockControls
        editor={editor}
        containerRef={editorRef}
        virtualBlocks={virtualBlocks}
        enableVirtualBlocks={enableVirtualBlocks}
        onBlockReorder={handleBlockReorder}
        onBlockInsert={() => {
          // Simple block insertion - just add a new paragraph
        }}
      />

      {/* Bubble Menu - appears when text is selected */}
      {editor && (
        <BubbleMenu 
          editor={editor} 
          updateDelay={100}
          options={{ 
            placement: 'top'
          }}
          className="flex items-center gap-0.5 p-1 bg-popover border rounded-lg shadow-lg"
        >
          <BubbleMenuButton
            onClick={() => editor.chain().focus().toggleBold().run()}
            isActive={editor.isActive('bold')}
            title="Bold"
          >
            <Bold className="h-3.5 w-3.5" />
          </BubbleMenuButton>
          
          <BubbleMenuButton
            onClick={() => editor.chain().focus().toggleItalic().run()}
            isActive={editor.isActive('italic')}
            title="Italic"
          >
            <Italic className="h-3.5 w-3.5" />
          </BubbleMenuButton>
          
          <BubbleMenuButton
            onClick={() => editor.chain().focus().toggleStrike().run()}
            isActive={editor.isActive('strike')}
            title="Strikethrough"
          >
            <Strikethrough className="h-3.5 w-3.5" />
          </BubbleMenuButton>
          
          <BubbleMenuButton
            onClick={() => editor.chain().focus().toggleCode().run()}
            isActive={editor.isActive('code')}
            title="Code"
          >
            <Code className="h-3.5 w-3.5" />
          </BubbleMenuButton>
          
          <div className="w-px h-5 bg-border mx-0.5" />
          
          <BubbleMenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            isActive={editor.isActive('heading', { level: 2 })}
            title="Heading 2"
          >
            <Heading2 className="h-3.5 w-3.5" />
          </BubbleMenuButton>
          
          <BubbleMenuButton
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            isActive={editor.isActive('heading', { level: 3 })}
            title="Heading 3"
          >
            <Heading3 className="h-3.5 w-3.5" />
          </BubbleMenuButton>
          
          <div className="w-px h-5 bg-border mx-0.5" />
          
          <BubbleMenuButton
            onClick={() => editor.chain().focus().toggleBulletList().run()}
            isActive={editor.isActive('bulletList')}
            title="Bullet List"
          >
            <List className="h-3.5 w-3.5" />
          </BubbleMenuButton>
          
          <BubbleMenuButton
            onClick={() => editor.chain().focus().toggleOrderedList().run()}
            isActive={editor.isActive('orderedList')}
            title="Numbered List"
          >
            <ListOrdered className="h-3.5 w-3.5" />
          </BubbleMenuButton>
          
          <BubbleMenuButton
            onClick={() => editor.chain().focus().toggleBlockquote().run()}
            isActive={editor.isActive('blockquote')}
            title="Quote"
          >
            <Quote className="h-3.5 w-3.5" />
          </BubbleMenuButton>
        </BubbleMenu>
      )}
      
      {/* Editor Content */}
      <EditorContent editor={editor} />
      
      {/* Custom CSS for placeholder and virtual blocks */}
      <style dangerouslySetInnerHTML={{ __html: `
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: hsl(var(--muted-foreground));
          pointer-events: none;
          height: 0;
        }
        .ProseMirror:focus {
          outline: none;
        }
        /* Virtual block styling */
        .ProseMirror p, .ProseMirror h1, .ProseMirror h2, .ProseMirror h3, 
        .ProseMirror h4, .ProseMirror h5, .ProseMirror h6, .ProseMirror ul, 
        .ProseMirror ol, .ProseMirror blockquote, .ProseMirror pre {
          position: relative;
          transition: background-color 0.15s ease;
          border-radius: 3px;
          padding: 2px 4px;
          margin: 1px 0;
          color: hsl(var(--foreground));
        }
        .ProseMirror p:hover, .ProseMirror h1:hover, .ProseMirror h2:hover, 
        .ProseMirror h3:hover, .ProseMirror h4:hover, .ProseMirror h5:hover, 
        .ProseMirror h6:hover, .ProseMirror ul:hover, .ProseMirror ol:hover, 
        .ProseMirror blockquote:hover, .ProseMirror pre:hover {
          background-color: hsl(var(--accent) / 0.1);
        }
        /* Ensure all text content uses proper foreground colors */
        .ProseMirror * {
          color: hsl(var(--foreground));
        }
        .ProseMirror strong {
          color: hsl(var(--foreground));
          font-weight: 600;
        }
        .ProseMirror code {
          color: hsl(var(--foreground));
          background-color: hsl(var(--muted));
        }
        .ProseMirror blockquote {
          border-left-color: hsl(var(--border));
          color: hsl(var(--muted-foreground));
        }
      `}} />
    </div>
  )
}