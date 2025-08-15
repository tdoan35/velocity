import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Editor } from '@tiptap/react'
import { 
  GripVertical, 
  Plus,
  Type,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types'

interface BlockControlsProps {
  editor: Editor | null
  containerRef: React.RefObject<HTMLDivElement | null>
  sectionId: string
  blockId?: string
  virtualBlocks?: VirtualContentBlock[]
  onBlockInsert?: (type: string) => void
  onBlockUpdate?: (blockId: string, content: string) => void
}

interface BlockType {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  command: (editor: Editor) => void
  shortcut?: string
}

const blockTypes: BlockType[] = [
  {
    id: 'paragraph',
    label: 'Text',
    icon: Type,
    command: (editor) => editor.chain().focus().setParagraph().run(),
    shortcut: 'Ctrl+Alt+0'
  },
  {
    id: 'heading1',
    label: 'Heading 1',
    icon: Heading1,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
    shortcut: 'Ctrl+Alt+1'
  },
  {
    id: 'heading2',
    label: 'Heading 2',
    icon: Heading2,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
    shortcut: 'Ctrl+Alt+2'
  },
  {
    id: 'heading3',
    label: 'Heading 3',
    icon: Heading3,
    command: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
    shortcut: 'Ctrl+Alt+3'
  },
  {
    id: 'bulletList',
    label: 'Bullet List',
    icon: List,
    command: (editor) => editor.chain().focus().toggleBulletList().run(),
    shortcut: 'Ctrl+Shift+8'
  },
  {
    id: 'orderedList',
    label: 'Numbered List',
    icon: ListOrdered,
    command: (editor) => editor.chain().focus().toggleOrderedList().run(),
    shortcut: 'Ctrl+Shift+7'
  },
  {
    id: 'taskList',
    label: 'Task List',
    icon: CheckSquare,
    command: (editor) => editor.chain().focus().toggleTaskList().run(),
    shortcut: 'Ctrl+Shift+9'
  },
  {
    id: 'blockquote',
    label: 'Quote',
    icon: Quote,
    command: (editor) => editor.chain().focus().toggleBlockquote().run(),
    shortcut: 'Ctrl+Shift+B'
  },
  {
    id: 'codeBlock',
    label: 'Code Block',
    icon: Code,
    command: (editor) => editor.chain().focus().toggleCodeBlock().run(),
    shortcut: 'Ctrl+Alt+C'
  }
]

export function EnhancedBlockControlsDnd({ 
  editor, 
  containerRef, 
  sectionId, 
  blockId,
  virtualBlocks,
  onBlockInsert,
  onBlockUpdate 
}: BlockControlsProps) {
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null)
  const [currentVirtualBlock, setCurrentVirtualBlock] = useState<VirtualContentBlock | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [controlsPosition, setControlsPosition] = useState({ top: 0, left: 0 })
  const [showBetweenBlocks, setShowBetweenBlocks] = useState(false)
  const [betweenPosition, setBetweenPosition] = useState({ top: 0 })
  const controlsRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Use @dnd-kit for drag handling if blockId is provided
  const sortable = blockId ? useSortable({
    id: blockId,
    data: {
      type: 'content',
      sectionId,
    },
  }) : null

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = sortable || {
    attributes: {},
    listeners: {},
    setNodeRef: () => {},
    transform: null,
    transition: undefined,
    isDragging: false,
  }

  // Calculate drag styles
  const dragStyle = transform ? {
    transform: CSS.Transform.toString(transform),
    transition,
  } : {}

  useEffect(() => {
    if (!containerRef.current || !editor) return

    const container = containerRef.current
    let currentBlock: HTMLElement | null = null

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      
      // Find the closest block element
      const block = target.closest('.ProseMirror > *') as HTMLElement
      
      if (block && block !== currentBlock) {
        currentBlock = block
        setHoveredBlock(block)
        
        // If virtual blocks are available, find the corresponding virtual block
        if (virtualBlocks && virtualBlocks.length > 0) {
          // Try to match by DOM element or position
          const blockIndex = Array.from(block.parentElement?.children || []).indexOf(block)
          if (blockIndex >= 0 && blockIndex < virtualBlocks.length) {
            setCurrentVirtualBlock(virtualBlocks[blockIndex])
          }
        }
        
        // Clear any pending hide timeout
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current)
          hideTimeoutRef.current = null
        }
        
        // Calculate position for controls
        const blockRect = block.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        
        const top = blockRect.top - containerRect.top
        const blockHeight = block.offsetHeight
        const controlsHeight = 28
        
        // Position controls in the left padding area
        const negativeOffset = -75
        
        setControlsPosition({ 
          top: top + (blockHeight / 2) - (controlsHeight / 2),
          left: negativeOffset
        })
        setShowControls(true)

        // Check if mouse is between blocks for the "+" button
        const mouseY = e.clientY - containerRect.top
        const blockBottom = top + blockHeight
        
        if (Math.abs(mouseY - blockBottom) < 20) {
          setBetweenPosition({ top: blockBottom })
          setShowBetweenBlocks(true)
        } else {
          setShowBetweenBlocks(false)
        }
      }
    }

    const handleMouseLeave = (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement
      
      // Check if mouse is moving to the controls
      const isMovingToControls = controlsRef.current?.contains(relatedTarget)
      
      if (!isMovingToControls && (!relatedTarget || !container.contains(relatedTarget))) {
        hideTimeoutRef.current = setTimeout(() => {
          currentBlock = null
          setHoveredBlock(null)
          setShowControls(false)
          setShowBetweenBlocks(false)
        }, 200)
      }
    }

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    }
  }, [containerRef, editor])

  // Atomic move operation using TipTap transactions
  const handleAtomicMove = useCallback((sourcePos: number, sourceSize: number, targetPos: number) => {
    if (!editor) return

    try {
      // Use a single transaction for atomic operation
      const { tr } = editor.state
      
      // Get the content to move
      const content = tr.doc.slice(sourcePos, sourcePos + sourceSize)
      
      // Calculate adjusted positions
      let deleteFrom = sourcePos
      let deleteTo = sourcePos + sourceSize
      let insertPos = targetPos
      
      // Adjust positions based on move direction
      if (targetPos > sourcePos) {
        // Moving forward: adjust insert position
        insertPos = targetPos - sourceSize
      }
      
      // Perform atomic move in a single transaction
      if (targetPos < sourcePos) {
        // Moving backward: insert first, then delete
        tr.insert(insertPos, content.content)
        tr.delete(deleteFrom + content.size, deleteTo + content.size)
      } else {
        // Moving forward: delete first, then insert
        tr.delete(deleteFrom, deleteTo)
        tr.insert(insertPos, content.content)
      }
      
      // Apply the transaction
      editor.view.dispatch(tr)
      
      console.log('[EnhancedBlockControlsDnd] Atomic move completed')
    } catch (error) {
      console.error('[EnhancedBlockControlsDnd] Error during atomic move:', error)
    }
  }, [editor])

  const handleInsertBlock = useCallback((blockType?: BlockType) => {
    if (!editor || !hoveredBlock) return
    
    try {
      const pos = editor.view.posAtDOM(hoveredBlock, hoveredBlock.childNodes.length)
      
      if (blockType) {
        editor.chain()
          .focus()
          .insertContentAt(pos + 1, '<p></p>')
          .setTextSelection(pos + 1)
          .run()
        
        // Apply the block type command
        setTimeout(() => {
          blockType.command(editor)
        }, 50)
      } else {
        editor.chain()
          .focus()
          .insertContentAt(pos + 1, '<p></p>')
          .setTextSelection(pos + 1)
          .run()
      }
      
      onBlockInsert?.(blockType?.id || 'paragraph')
    } catch (error) {
      console.error('Error inserting block:', error)
      editor.chain().focus().insertContent('<p></p>').run()
    }
  }, [editor, hoveredBlock, onBlockInsert])

  const handleAddNewLine = useCallback(() => {
    if (!editor || !hoveredBlock) return
    
    try {
      // Find the position after the current block
      const pos = editor.view.posAtDOM(hoveredBlock, hoveredBlock.childNodes.length)
      
      // Insert a new paragraph and focus it
      editor.chain()
        .focus()
        .insertContentAt(pos + 1, '<p></p>')
        .setTextSelection(pos + 2) // Position cursor inside the new paragraph
        .run()
      
      onBlockInsert?.('paragraph')
    } catch (error) {
      console.error('Error inserting new line:', error)
      // Fallback: just add content at the end
      editor.chain().focus().insertContent('<p></p>').run()
    }
  }, [editor, hoveredBlock, onBlockInsert])

  return (
    <>
      {/* Main Block Controls */}
      <AnimatePresence>
        {showControls && !isDragging && (
          <motion.div
            ref={controlsRef}
            className="block-controls absolute flex items-center gap-0.5 z-30"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            style={{
              top: `${controlsPosition.top}px`,
              left: `${controlsPosition.left}px`,
              ...dragStyle
            }}
            onMouseEnter={() => {
              // Clear hide timeout when entering controls
              if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current)
                hideTimeoutRef.current = null
              }
            }}
            onMouseLeave={(e) => {
              // Check if we're leaving to go back to the editor
              const relatedTarget = e.relatedTarget as HTMLElement
              
              // Safety check for valid DOM node
              if (!relatedTarget || !(relatedTarget instanceof Node)) {
                // Hide controls if target is invalid
                hideTimeoutRef.current = setTimeout(() => {
                  setHoveredBlock(null)
                  setShowControls(false)
                  setShowBetweenBlocks(false)
                }, 200)
                return
              }
              
              const isGoingToEditor = containerRef.current?.contains(relatedTarget) && 
                                     !controlsRef.current?.contains(relatedTarget)
              
              if (!isGoingToEditor) {
                // Hide controls if not going back to editor
                hideTimeoutRef.current = setTimeout(() => {
                  setHoveredBlock(null)
                  setShowControls(false)
                  setShowBetweenBlocks(false)
                }, 200)
              }
            }}
          >
            {/* Add New Line Button */}
            <motion.button
              className={cn(
                "p-1.5 rounded-md",
                "bg-white dark:bg-gray-800",
                "border border-gray-200 dark:border-gray-700",
                "hover:bg-gray-50 dark:hover:bg-gray-700",
                "shadow-sm hover:shadow-md",
                "transition-all duration-150"
              )}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleAddNewLine}
              onMouseDown={(e) => e.preventDefault()}
              title="Add new line below"
            >
              <Plus className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            </motion.button>

            {/* Drag Handle - Now using @dnd-kit */}
            <div
              ref={setNodeRef as any}
              {...attributes}
              {...listeners}
              className={cn(
                "drag-handle",
                "p-1.5 rounded-md cursor-move",
                "bg-white dark:bg-gray-800",
                "border border-gray-200 dark:border-gray-700",
                "hover:bg-gray-50 dark:hover:bg-gray-700",
                "shadow-sm hover:shadow-md",
                "transition-all duration-150",
                isDragging && "opacity-50"
              )}
            >
              <GripVertical className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Between Blocks Add Button */}
      <AnimatePresence>
        {showBetweenBlocks && !showControls && (
          <motion.div
            className="absolute left-1/2 transform -translate-x-1/2 z-20"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            style={{
              top: `${betweenPosition.top - 12}px`
            }}
          >
            <motion.button
              onClick={handleAddNewLine}
              className={cn(
                "p-1 rounded-full",
                "bg-blue-500 hover:bg-blue-600",
                "text-white",
                "shadow-md hover:shadow-lg",
                "transition-all duration-150"
              )}
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
              onMouseDown={(e) => e.preventDefault()}
              title="Add new line"
            >
              <Plus className="h-4 w-4" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Visual feedback during drag */}
      {isDragging && (
        <div className="absolute left-0 right-0 h-0.5 bg-blue-500 z-40 pointer-events-none animate-pulse" />
      )}
    </>
  )
}