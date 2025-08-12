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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface BlockControlsProps {
  editor: Editor | null
  containerRef: React.RefObject<HTMLDivElement | null>
  onBlockInsert?: (type: string) => void
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

export function EnhancedBlockControls({ editor, containerRef, onBlockInsert }: BlockControlsProps) {
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [controlsPosition, setControlsPosition] = useState({ top: 0, left: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [showAddMenu, setShowAddMenu] = useState(false)
  const [showBetweenBlocks, setShowBetweenBlocks] = useState(false)
  const [betweenPosition, setBetweenPosition] = useState({ top: 0 })
  const controlsRef = useRef<HTMLDivElement>(null)
  const draggedNodeRef = useRef<{ node: any; pos: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current || !editor) return

    const container = containerRef.current
    let currentBlock: HTMLElement | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      
      // Find the closest block element
      const block = target.closest('.ProseMirror > *') as HTMLElement
      
      if (block && block !== currentBlock) {
        currentBlock = block
        setHoveredBlock(block)
        
        if (timeoutId) clearTimeout(timeoutId)
        
        // Calculate position for controls
        const blockRect = block.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        
        const top = blockRect.top - containerRect.top
        const blockHeight = block.offsetHeight
        const controlsHeight = 28
        
        setControlsPosition({ 
          top: top + (blockHeight / 2) - (controlsHeight / 2),
          left: -40 // Position to the left of content
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
      if (!relatedTarget || !container.contains(relatedTarget)) {
        timeoutId = setTimeout(() => {
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
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [containerRef, editor])

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (!hoveredBlock || !editor) return
    
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setDragImage(hoveredBlock, 20, 20)
    
    hoveredBlock.classList.add('is-dragging')
    
    try {
      const pos = editor.view.posAtDOM(hoveredBlock, 0)
      let blockPos = pos
      let blockNode = null
      let blockSize = 1
      
      editor.state.doc.descendants((node, nodePos) => {
        if (nodePos <= pos && pos < nodePos + node.nodeSize) {
          if (node.isBlock && node.type.name !== 'doc') {
            blockPos = nodePos
            blockNode = node
            blockSize = node.nodeSize
            return false
          }
        }
      })
      
      if (blockNode) {
        draggedNodeRef.current = { node: blockNode, pos: blockPos }
        e.dataTransfer.setData('application/x-tiptap-drag', JSON.stringify({
          nodePos: blockPos,
          nodeSize: blockSize
        }))
      }
    } catch (error) {
      console.error('Error in drag start:', error)
    }
  }, [hoveredBlock, editor])

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    if (hoveredBlock) {
      hoveredBlock.classList.remove('is-dragging')
    }
    draggedNodeRef.current = null
  }, [hoveredBlock])

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
    
    setShowAddMenu(false)
  }, [editor, hoveredBlock, onBlockInsert])

  return (
    <>
      {/* Main Block Controls */}
      <AnimatePresence>
        {showControls && !isDragging && (
          <motion.div
            ref={controlsRef}
            className="absolute flex items-center gap-0.5 z-30"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            style={{
              top: `${controlsPosition.top}px`,
              left: `${controlsPosition.left}px`
            }}
          >
            {/* Add Block Button */}
            <DropdownMenu open={showAddMenu} onOpenChange={setShowAddMenu}>
              <DropdownMenuTrigger asChild>
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
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <Plus className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
                </motion.button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400">
                  TURN INTO
                </div>
                {blockTypes.map((blockType) => {
                  const Icon = blockType.icon
                  return (
                    <DropdownMenuItem
                      key={blockType.id}
                      onClick={() => handleInsertBlock(blockType)}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span>{blockType.label}</span>
                      </div>
                      {blockType.shortcut && (
                        <span className="text-xs text-gray-400">
                          {blockType.shortcut}
                        </span>
                      )}
                    </DropdownMenuItem>
                  )
                })}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Drag Handle */}
            <div
              draggable
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
              className={cn(
                "p-1.5 rounded-md cursor-move",
                "bg-white dark:bg-gray-800",
                "border border-gray-200 dark:border-gray-700",
                "hover:bg-gray-50 dark:hover:bg-gray-700",
                "shadow-sm hover:shadow-md",
                "transition-all duration-150"
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
              onClick={() => handleInsertBlock()}
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
            >
              <Plus className="h-4 w-4" />
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drag Indicator Line */}
      {isDragging && (
        <div className="absolute left-0 right-0 h-0.5 bg-blue-500 z-40 pointer-events-none" />
      )}
    </>
  )
}