import { useEffect, useState, useMemo } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
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
import { BlockType } from '@/lib/virtual-blocks/types'
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
  // Virtual Block Manager instance
  const virtualBlockManager = useMemo(() => new VirtualBlockManager(), [])
  const [virtualBlocks, setVirtualBlocks] = useState<VirtualContentBlock[]>(() => {
    if (enableVirtualBlocks && content.html) {
      return virtualBlockManager.parseHTMLToBlocks(content.html)
    }
    return []
  })
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3]
        }
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty'
      })
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
      handleKeyDown: (view, event) => {
        // Handle virtual block navigation if enabled
        if (enableVirtualBlocks && virtualBlocks.length > 0) {
          // Arrow navigation between blocks
          if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            const pos = view.state.selection.from
            const currentBlock = virtualBlockManager.getBlockAtPosition(content.html, pos)
            
            if (currentBlock) {
              const currentIndex = virtualBlocks.findIndex(b => b.id === currentBlock.id)
              const targetIndex = event.key === 'ArrowUp' ? currentIndex - 1 : currentIndex + 1
              
              if (targetIndex >= 0 && targetIndex < virtualBlocks.length) {
                const targetBlock = virtualBlocks[targetIndex]
                if (targetBlock.position) {
                  const targetPos = event.key === 'ArrowUp' 
                    ? targetBlock.position.end - 1
                    : targetBlock.position.start + 1
                  view.dispatch(view.state.tr.setSelection(
                    TextSelection.near(view.state.doc.resolve(Math.min(targetPos, view.state.doc.content.size)))
                  ))
                  return true
                }
              }
            }
          }
          
          // Handle Enter key for new blocks
          if (event.key === 'Enter' && !event.shiftKey) {
            const pos = view.state.selection.from
            const currentBlock = virtualBlockManager.getBlockAtPosition(content.html, pos)
            
            if (currentBlock && currentBlock.type !== BlockType.LIST_ITEM) {
              const selection = view.state.selection
              const $pos = selection.$from
              const isAtEnd = $pos.parentOffset === $pos.parent.content.size
              
              if (isAtEnd) {
                // Create a new paragraph block after current block
                const result = virtualBlockManager.insertBlockAfter(
                  content.html,
                  currentBlock.id,
                  { type: BlockType.PARAGRAPH, content: '' }
                )
                
                if (result.success && result.html) {
                  // Let TipTap handle the actual insertion
                  return false
                }
              }
            }
          }
        }
        return false
      }
    }
  })

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
    <div className="relative">
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
      
      {/* Custom CSS for placeholder */}
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
      `}} />
    </div>
  )
}