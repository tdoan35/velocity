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
  Heading4,
  Heading5,
  Heading6,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Code,
  Minus,
  Image,
  Table,
  FileText,
  Copy,
  Trash2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { VirtualContentBlock, BlockType as VirtualBlockType } from '@/lib/virtual-blocks/types'
import { BlockType } from '@/lib/virtual-blocks/types'
import { BlockTypeMenu } from '../blocks/BlockTypeMenu'
import type { VirtualBlockManager } from '@/lib/virtual-blocks/VirtualBlockManager'
import { VirtualBlockSortable } from '../dnd/VirtualBlockSortable'

interface BlockControlsProps {
  editor: Editor | null
  containerRef: React.RefObject<HTMLDivElement | null>
  sectionId: string
  blockId?: string
  virtualBlocks?: VirtualContentBlock[]
  virtualBlockManager?: VirtualBlockManager
  onBlockInsert?: (type: string) => void
  onBlockUpdate?: (blockId: string, content: string) => void
  onBlockDelete?: (blockId: string) => void
  onBlockDuplicate?: (blockId: string) => void
}

interface TipTapBlockType {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  command: (editor: Editor) => void
  shortcut?: string
}

const blockTypes: TipTapBlockType[] = [
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

// Map virtual block types to icons and labels
const getBlockTypeInfo = (blockType: string) => {
  const typeMap: Record<string, { icon: React.ComponentType<{ className?: string }>, label: string, color: string }> = {
    [BlockType.PARAGRAPH]: { icon: Type, label: 'Text', color: 'text-gray-500' },
    [BlockType.HEADING_1]: { icon: Heading1, label: 'Heading 1', color: 'text-blue-600' },
    [BlockType.HEADING_2]: { icon: Heading2, label: 'Heading 2', color: 'text-blue-500' },
    [BlockType.HEADING_3]: { icon: Heading3, label: 'Heading 3', color: 'text-blue-400' },
    [BlockType.HEADING_4]: { icon: Heading4, label: 'Heading 4', color: 'text-blue-300' },
    [BlockType.HEADING_5]: { icon: Heading5, label: 'Heading 5', color: 'text-blue-200' },
    [BlockType.HEADING_6]: { icon: Heading6, label: 'Heading 6', color: 'text-blue-100' },
    [BlockType.BULLET_LIST]: { icon: List, label: 'Bullet List', color: 'text-purple-500' },
    [BlockType.NUMBERED_LIST]: { icon: ListOrdered, label: 'Numbered List', color: 'text-purple-500' },
    [BlockType.LIST_ITEM]: { icon: Minus, label: 'List Item', color: 'text-purple-400' },
    [BlockType.QUOTE]: { icon: Quote, label: 'Quote', color: 'text-green-500' },
    [BlockType.CODE]: { icon: Code, label: 'Code Block', color: 'text-orange-500' },
    [BlockType.DIVIDER]: { icon: Minus, label: 'Divider', color: 'text-gray-400' },
    [BlockType.IMAGE]: { icon: Image, label: 'Image', color: 'text-pink-500' },
    [BlockType.TABLE]: { icon: Table, label: 'Table', color: 'text-indigo-500' },
    [BlockType.TABLE_ROW]: { icon: Table, label: 'Table Row', color: 'text-indigo-400' },
    [BlockType.TABLE_CELL]: { icon: Table, label: 'Table Cell', color: 'text-indigo-300' },
    [BlockType.UNKNOWN]: { icon: FileText, label: 'Unknown', color: 'text-gray-400' }
  }
  
  return typeMap[blockType] || typeMap[BlockType.UNKNOWN]
}

export function EnhancedBlockControlsDnd({ 
  editor, 
  containerRef, 
  sectionId, 
  blockId,
  virtualBlocks,
  virtualBlockManager,
  onBlockInsert,
  onBlockUpdate,
  onBlockDelete,
  onBlockDuplicate
}: BlockControlsProps) {
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null)
  const [currentVirtualBlock, setCurrentVirtualBlock] = useState<VirtualContentBlock | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [controlsPosition, setControlsPosition] = useState({ top: 0, left: 0 })
  const [showBetweenBlocks, setShowBetweenBlocks] = useState(false)
  const [betweenPosition, setBetweenPosition] = useState({ top: 0 })
  const [showBlockTypeMenu, setShowBlockTypeMenu] = useState(false)
  const [blockTypeMenuPosition, setBlockTypeMenuPosition] = useState({ top: 0, left: 0 })
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

  const handleInsertBlock = useCallback((blockType?: TipTapBlockType) => {
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
      // If we have virtualBlockManager, use it for block operations
      if (virtualBlockManager && currentVirtualBlock) {
        const currentHtml = editor.getHTML()
        const result = virtualBlockManager.insertBlockAfter(
          currentHtml,
          currentVirtualBlock.id,
          { type: BlockType.PARAGRAPH, content: '' }
        )
        
        if (result.success && result.html) {
          editor.commands.setContent(result.html)
          onBlockInsert?.('paragraph')
        }
      } else {
        // Fallback to original TipTap method
        const pos = editor.view.posAtDOM(hoveredBlock, hoveredBlock.childNodes.length)
        editor.chain()
          .focus()
          .insertContentAt(pos + 1, '<p></p>')
          .setTextSelection(pos + 2)
          .run()
        onBlockInsert?.('paragraph')
      }
    } catch (error) {
      console.error('Error inserting new line:', error)
      editor.chain().focus().insertContent('<p></p>').run()
    }
  }, [editor, hoveredBlock, currentVirtualBlock, virtualBlockManager, onBlockInsert])

  const handleDeleteBlock = useCallback(() => {
    if (!editor || !currentVirtualBlock || !virtualBlockManager) return
    
    try {
      const currentHtml = editor.getHTML()
      const result = virtualBlockManager.deleteBlock(currentHtml, currentVirtualBlock.id)
      
      if (result.success && result.html) {
        editor.commands.setContent(result.html)
        onBlockDelete?.(currentVirtualBlock.id)
        setShowControls(false)
      }
    } catch (error) {
      console.error('Error deleting block:', error)
    }
  }, [editor, currentVirtualBlock, virtualBlockManager, onBlockDelete])

  const handleDuplicateBlock = useCallback(() => {
    if (!editor || !currentVirtualBlock || !virtualBlockManager) return
    
    try {
      const currentHtml = editor.getHTML()
      const result = virtualBlockManager.duplicateBlock(currentHtml, currentVirtualBlock.id)
      
      if (result.success && result.html) {
        editor.commands.setContent(result.html)
        onBlockDuplicate?.(currentVirtualBlock.id)
      }
    } catch (error) {
      console.error('Error duplicating block:', error)
    }
  }, [editor, currentVirtualBlock, virtualBlockManager, onBlockDuplicate])

  // Get block-specific actions based on the current block type
  const getBlockActions = useCallback((blockType: string) => {
    const actions: Array<{ icon: React.ComponentType<{ className?: string }>, label: string, onClick: () => void }> = []
    
    if (!editor) return actions
    
    switch (blockType) {
      case BlockType.PARAGRAPH:
        actions.push(
          { icon: Heading1, label: 'Convert to Heading 1', onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
          { icon: List, label: 'Convert to Bullet List', onClick: () => editor.chain().focus().toggleBulletList().run() },
          { icon: Quote, label: 'Convert to Quote', onClick: () => editor.chain().focus().toggleBlockquote().run() }
        )
        break
      case BlockType.HEADING_1:
      case BlockType.HEADING_2:
      case BlockType.HEADING_3:
        actions.push(
          { icon: Type, label: 'Convert to Paragraph', onClick: () => editor.chain().focus().setParagraph().run() },
          { icon: Heading2, label: 'Convert to Heading 2', onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
          { icon: Heading3, label: 'Convert to Heading 3', onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run() }
        )
        break
      case BlockType.BULLET_LIST:
        actions.push(
          { icon: ListOrdered, label: 'Convert to Numbered List', onClick: () => editor.chain().focus().toggleOrderedList().run() },
          { icon: Type, label: 'Convert to Paragraph', onClick: () => editor.chain().focus().setParagraph().run() }
        )
        break
      case BlockType.NUMBERED_LIST:
        actions.push(
          { icon: List, label: 'Convert to Bullet List', onClick: () => editor.chain().focus().toggleBulletList().run() },
          { icon: Type, label: 'Convert to Paragraph', onClick: () => editor.chain().focus().setParagraph().run() }
        )
        break
      case BlockType.QUOTE:
        actions.push(
          { icon: Type, label: 'Convert to Paragraph', onClick: () => editor.chain().focus().setParagraph().run() },
          { icon: Code, label: 'Convert to Code Block', onClick: () => editor.chain().focus().toggleCodeBlock().run() }
        )
        break
      case BlockType.CODE:
        actions.push(
          { icon: Type, label: 'Convert to Paragraph', onClick: () => editor.chain().focus().setParagraph().run() },
          { icon: Quote, label: 'Convert to Quote', onClick: () => editor.chain().focus().toggleBlockquote().run() }
        )
        break
    }
    
    return actions
  }, [editor])

  // Handle block type menu
  const handleOpenBlockTypeMenu = useCallback(() => {
    if (!hoveredBlock) return
    
    const rect = hoveredBlock.getBoundingClientRect()
    const containerRect = containerRef.current?.getBoundingClientRect()
    
    if (containerRect) {
      setBlockTypeMenuPosition({
        top: rect.bottom - containerRect.top + 5,
        left: rect.left - containerRect.left
      })
      setShowBlockTypeMenu(true)
    }
  }, [hoveredBlock, containerRef])

  const handleBlockTypeSelect = useCallback((blockType: VirtualBlockType) => {
    if (!editor || !hoveredBlock) return
    
    // Get the appropriate command based on block type
    const blockCommands: Record<VirtualBlockType, () => void> = {
      [BlockType.PARAGRAPH]: () => editor.chain().focus().setParagraph().run(),
      [BlockType.HEADING_1]: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      [BlockType.HEADING_2]: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      [BlockType.HEADING_3]: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      [BlockType.HEADING_4]: () => editor.chain().focus().toggleHeading({ level: 4 }).run(),
      [BlockType.HEADING_5]: () => editor.chain().focus().toggleHeading({ level: 5 }).run(),
      [BlockType.HEADING_6]: () => editor.chain().focus().toggleHeading({ level: 6 }).run(),
      [BlockType.BULLET_LIST]: () => editor.chain().focus().toggleBulletList().run(),
      [BlockType.NUMBERED_LIST]: () => editor.chain().focus().toggleOrderedList().run(),
      [BlockType.LIST_ITEM]: () => editor.chain().focus().liftListItem('listItem').run(),
      [BlockType.QUOTE]: () => editor.chain().focus().toggleBlockquote().run(),
      [BlockType.CODE]: () => editor.chain().focus().toggleCodeBlock().run(),
      [BlockType.DIVIDER]: () => editor.chain().focus().setHorizontalRule().run(),
      [BlockType.IMAGE]: () => {}, // No-op for now, images need special handling
      [BlockType.TABLE]: () => {}, // No-op for now, tables need special handling
      [BlockType.TABLE_ROW]: () => {}, // No-op for now, table rows need special handling
      [BlockType.TABLE_CELL]: () => {}, // No-op for now, table cells need special handling
      [BlockType.UNKNOWN]: () => editor.chain().focus().setParagraph().run() // Fallback to paragraph
    }
    
    const command = blockCommands[blockType]
    if (command) {
      command()
      onBlockUpdate?.(currentVirtualBlock?.id || '', blockType)
    }
    
    setShowBlockTypeMenu(false)
  }, [editor, hoveredBlock, currentVirtualBlock, onBlockUpdate])

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
            {/* Block Type Indicator - Clickable to open menu */}
            {currentVirtualBlock && (
              <motion.button
                className={cn(
                  "flex items-center gap-1 px-2 py-1 rounded-md",
                  "bg-white dark:bg-gray-800",
                  "border border-gray-200 dark:border-gray-700",
                  "shadow-sm hover:shadow-md",
                  "min-w-0",
                  "cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700",
                  "transition-all duration-150"
                )}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.1 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleOpenBlockTypeMenu}
                onMouseDown={(e) => e.preventDefault()}
                title="Click to change block type"
              >
                {(() => {
                  const blockInfo = getBlockTypeInfo(currentVirtualBlock.type)
                  const BlockIcon = blockInfo.icon
                  return (
                    <>
                      <BlockIcon className={cn("h-3.5 w-3.5 flex-shrink-0", blockInfo.color)} />
                      <span className={cn(
                        "text-xs font-medium truncate max-w-[80px]",
                        blockInfo.color
                      )}>
                        {blockInfo.label}
                      </span>
                    </>
                  )
                })()}
              </motion.button>
            )}

            {/* Block-specific Actions */}
            {currentVirtualBlock && (
              <div className="flex items-center gap-0.5">
                {getBlockActions(currentVirtualBlock.type).slice(0, 3).map((action, index) => {
                  const ActionIcon = action.icon
                  return (
                    <motion.button
                      key={index}
                      className={cn(
                        "p-1 rounded",
                        "bg-white dark:bg-gray-800",
                        "border border-gray-200 dark:border-gray-700",
                        "hover:bg-gray-50 dark:hover:bg-gray-700",
                        "shadow-sm hover:shadow-md",
                        "transition-all duration-150"
                      )}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={action.onClick}
                      onMouseDown={(e) => e.preventDefault()}
                      title={action.label}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.1, delay: index * 0.02 }}
                    >
                      <ActionIcon className="h-3 w-3 text-gray-500 dark:text-gray-400" />
                    </motion.button>
                  )
                })}
              </div>
            )}

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

            {/* Duplicate Block Button */}
            {virtualBlockManager && currentVirtualBlock && (
              <motion.button
                className={cn(
                  "p-1.5 rounded-md",
                  "bg-white dark:bg-gray-800",
                  "border border-gray-200 dark:border-gray-700",
                  "hover:bg-blue-50 dark:hover:bg-blue-900/20",
                  "shadow-sm hover:shadow-md",
                  "transition-all duration-150"
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleDuplicateBlock}
                onMouseDown={(e) => e.preventDefault()}
                title="Duplicate block"
              >
                <Copy className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 hover:text-blue-500" />
              </motion.button>
            )}

            {/* Delete Block Button */}
            {virtualBlockManager && currentVirtualBlock && (
              <motion.button
                className={cn(
                  "p-1.5 rounded-md",
                  "bg-white dark:bg-gray-800",
                  "border border-gray-200 dark:border-gray-700",
                  "hover:bg-red-50 dark:hover:bg-red-900/20",
                  "shadow-sm hover:shadow-md",
                  "transition-all duration-150"
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleDeleteBlock}
                onMouseDown={(e) => e.preventDefault()}
                title="Delete block"
              >
                <Trash2 className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400 hover:text-red-500" />
              </motion.button>
            )}

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

      {/* Block Type Conversion Menu */}
      <BlockTypeMenu
        position={blockTypeMenuPosition}
        onTypeSelect={handleBlockTypeSelect}
        onClose={() => setShowBlockTypeMenu(false)}
        currentType={currentVirtualBlock?.type}
        isVisible={showBlockTypeMenu}
      />
    </>
  )
}