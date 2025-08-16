import { useEffect, useState, useMemo, useRef } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Extension } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
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
import { VirtualBlockManager } from '@/lib/virtual-blocks/VirtualBlockManager'
import { KeyboardNavigationManager } from '@/lib/virtual-blocks/KeyboardNavigationManager'
import { BlockType } from '@/lib/virtual-blocks/types'
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types'
import { EnhancedBlockControlsDnd } from '@/components/prd/EnhancedBlockControlsDnd'

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
  sectionType?: string // Add for template awareness
  enableVirtualBlocks?: boolean // Enable virtual block system
  onBlocksUpdate?: (blocks: VirtualContentBlock[]) => void // Virtual blocks update callback
}

export function NotionRichTextEditor({ 
  content, 
  onChange, 
  onBlur,
  placeholder = 'Click to start typing...',
  className,
  editable = true,
  sectionType,
  enableVirtualBlocks = false,
  onBlocksUpdate
}: NotionRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  
  // Virtual Block Manager instance
  const virtualBlockManager = useMemo(() => new VirtualBlockManager(), [])
  const [virtualBlocks, setVirtualBlocks] = useState<VirtualContentBlock[]>(() => {
    if (enableVirtualBlocks && content.html) {
      return virtualBlockManager.parseHTMLToBlocks(content.html)
    }
    return []
  })

  // Create a custom extension to handle virtual block keyboard navigation
  const VirtualBlockKeyboardExtension = useMemo(() => {
    if (!enableVirtualBlocks) return null

    return Extension.create({
      name: 'virtualBlockKeyboard',
      priority: 1000, // High priority to override default behaviors
      addKeyboardShortcuts() {
        return {
          'Enter': ({ editor }) => {
            // This will be handled by our custom handleKeyDown in editorProps
            return false
          }
        }
      }
    })
  }, [enableVirtualBlocks])

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
      // Add our custom virtual block keyboard extension if enabled
      ...(VirtualBlockKeyboardExtension ? [VirtualBlockKeyboardExtension] : [])
    ],
    content: content.html,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const text = editor.getText()
      
      // Parse HTML into virtual blocks if enabled
      if (enableVirtualBlocks) {
        const blocks = virtualBlockManager.parseHTMLToBlocks(html)
        setVirtualBlocks(blocks)
        onBlocksUpdate?.(blocks)
      }
      
      onChange({ html, text })
    },
    onBlur: () => {
      onBlur?.()
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm max-w-none focus:outline-none min-h-[100px] px-3 py-2',
          'cursor-text',
          className
        )
      },
      handleKeyDown: (view, event): boolean => {
        // Handle virtual block keyboard navigation with TipTap integration
        if (!enableVirtualBlocks || !keyboardNavManager) return false
        
        let handled = false
        
        // Handle arrow navigation
        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
          const selection = view.state.selection
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
        
        // Handle Enter key for block creation
        else if (event.key === 'Enter') {
          handled = keyboardNavManager.handleEnterKey(event.shiftKey)
        }
        
        // Handle Backspace for block deletion/merging
        else if (event.key === 'Backspace') {
          const selection = view.state.selection
          const $from = selection.$from
          const isAtStart = $from.parentOffset === 0
          
          if (isAtStart) {
            handled = keyboardNavManager.handleBackspaceKey()
          }
        }
        
        // Handle Tab indentation
        else if (event.key === 'Tab') {
          event.preventDefault()
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
        
        return handled
      }
    }
  })

  // Initialize KeyboardNavigationManager
  const keyboardNavManager: KeyboardNavigationManager | null = useMemo(() => {
    if (!editor || !enableVirtualBlocks) return null
    
    return new KeyboardNavigationManager(editor, virtualBlockManager, {
      onBlockFocus: (blockId) => {
        console.log('Block focused:', blockId)
      },
      onBlockCreate: (blockId, type) => {
        console.log('Block created:', blockId, type)
      },
      onBlockDelete: (blockId) => {
        console.log('Block deleted:', blockId)
      },
      onContentUpdate: (html) => {
        // Parse and update virtual blocks
        const blocks = virtualBlockManager.parseHTMLToBlocks(html)
        setVirtualBlocks(blocks)
        onBlocksUpdate?.(blocks)
        
        // Update the content through onChange
        const text = editor?.getText() || ''
        onChange({ html, text })
      }
    })
  }, [editor, enableVirtualBlocks, virtualBlockManager, onBlocksUpdate, onChange])

  // Initialize virtual blocks when editor content changes
  useEffect(() => {
    if (enableVirtualBlocks && editor && content.html) {
      const blocks = virtualBlockManager.parseHTMLToBlocks(content.html)
      console.log('Virtual blocks parsed:', blocks)
      setVirtualBlocks(blocks)
      onBlocksUpdate?.(blocks)
    }
  }, [enableVirtualBlocks, editor, content.html, virtualBlockManager, onBlocksUpdate])

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && content.html !== editor.getHTML()) {
      editor.commands.setContent(content.html)
    }
  }, [content.html, editor])

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
      {/* Debug Info for Virtual Blocks */}
      {enableVirtualBlocks && (
        <div className="absolute top-0 right-0 bg-black/10 text-xs p-1 rounded text-gray-600 pointer-events-none z-50">
          Blocks: {virtualBlocks.length}
        </div>
      )}

      {/* Virtual Block Controls Overlay */}
      {enableVirtualBlocks && virtualBlocks.length > 0 && editor && (
        <EnhancedBlockControlsDnd
          editor={editor}
          containerRef={editorRef}
          sectionId={sectionType || 'default'}
          virtualBlocks={virtualBlocks}
          virtualBlockManager={virtualBlockManager}
          onBlockInsert={(type) => {
            // Create a new block of the specified type
            if (keyboardNavManager) {
              const currentBlock = keyboardNavManager.getCurrentBlock()
              if (currentBlock) {
                keyboardNavManager.createBlockAfter(currentBlock.id, type as BlockType)
              }
            }
          }}
          onBlockUpdate={(blockId, content) => {
            const currentHtml = editor.getHTML()
            const result = virtualBlockManager.updateBlockInHTML(currentHtml, blockId, content)
            if (result.success && result.html) {
              const text = editor.getText()
              onChange({ html: result.html, text })
            }
          }}
          onBlockDelete={(blockId) => {
            const currentHtml = editor.getHTML()
            const result = virtualBlockManager.deleteBlock(currentHtml, blockId)
            if (result.success && result.html) {
              const text = editor.getText()
              onChange({ html: result.html, text })
            }
          }}
          onBlockDuplicate={(blockId) => {
            if (keyboardNavManager) {
              keyboardNavManager.duplicateBlock(blockId)
            }
          }}
        />
      )}

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
          color: #adb5bd;
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
        }
        .ProseMirror p:hover, .ProseMirror h1:hover, .ProseMirror h2:hover, 
        .ProseMirror h3:hover, .ProseMirror h4:hover, .ProseMirror h5:hover, 
        .ProseMirror h6:hover, .ProseMirror ul:hover, .ProseMirror ol:hover, 
        .ProseMirror blockquote:hover, .ProseMirror pre:hover {
          background-color: rgba(0, 0, 0, 0.02);
        }
      `}} />
    </div>
  )
}