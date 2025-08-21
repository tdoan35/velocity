import { useEffect, useRef } from 'react'
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
}

export function NotionRichTextEditor({ 
  content, 
  onChange, 
  onBlur,
  placeholder = 'Click to start typing...',
  className,
  editable = true
}: NotionRichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  


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
      const html = editor.getHTML()
      const text = editor.getText()
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
    <div className="relative" ref={editorRef}>

      {/* Simple Block Controls - Only + and Drag */}
      <SimpleBlockControls
        editor={editor}
        containerRef={editorRef}
        onBlockInsert={() => {
          // Simple block insertion - just add a new paragraph
          console.log('New block inserted')
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