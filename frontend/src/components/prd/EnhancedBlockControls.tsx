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
import { useDragStore } from '@/stores/dragStateStore'

interface BlockControlsProps {
  editor: Editor | null
  containerRef: React.RefObject<HTMLDivElement | null>
  sectionId: string
  onContentDragStart?: (e: React.DragEvent) => void
  onContentDragEnd?: (e: React.DragEvent) => void
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

export function EnhancedBlockControls({ editor, containerRef, sectionId, onContentDragStart, onContentDragEnd, onBlockInsert }: BlockControlsProps) {
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [controlsPosition, setControlsPosition] = useState({ top: 0, left: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [showBetweenBlocks, setShowBetweenBlocks] = useState(false)
  const [betweenPosition, setBetweenPosition] = useState({ top: 0 })
  const [dropIndicator, setDropIndicator] = useState<{ top: number; visible: boolean }>({ top: 0, visible: false })
  const controlsRef = useRef<HTMLDivElement>(null)
  const draggedNodeRef = useRef<{ node: any; pos: number } | null>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dragInProgressRef = useRef<boolean>(false)
  const dragStartTimeRef = useRef<number>(0)
  const [dragHandleElement, setDragHandleElement] = useState<HTMLDivElement | null>(null)
  
  // Use drag store for global state management
  const { startContentDrag, resetDragState } = useDragStore()

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
        
        // Clear any pending hide timeout
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current)
          hideTimeoutRef.current = null
        }
        
        // Calculate position for controls
        const blockRect = block.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        
        // Get the ProseMirror container to find its actual left offset
        const proseMirror = container.querySelector('.ProseMirror') as HTMLElement
        const proseMirrorRect = proseMirror ? proseMirror.getBoundingClientRect() : containerRect
        
        const top = blockRect.top - containerRect.top
        const blockHeight = block.offsetHeight
        const controlsHeight = 28
        
        // Calculate the left position
        // The parent container has pl-20 (80px) padding
        // We need to position controls in that padding area using negative left
        const controlsWidth = 70 // Width of both controls
        const negativeOffset = -75 // Move left into the padding area
        
        setControlsPosition({ 
          top: top + (blockHeight / 2) - (controlsHeight / 2),
          left: negativeOffset // Negative positioning to place in padding area
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

    // Handle drag over events for content reordering
    const handleDragOver = (e: DragEvent) => {
      // Check if this is a content drag (not a section drag)
      // During dragover, we can't read the actual data, but we can check the types
      const hasContentData = e.dataTransfer?.types.includes('application/x-tiptap-content') || 
                            e.dataTransfer?.types.includes('text/plain')
      if (!hasContentData) return

      console.log('[EnhancedBlockControls] DragOver detected for content')

      // We can't read the actual drag data during dragover, but we can allow the drop
      e.preventDefault()
      e.dataTransfer!.dropEffect = 'move'

      // Find the target block and calculate drop position
      const target = e.target as HTMLElement
      const targetBlock = target.closest('.ProseMirror > *') as HTMLElement
      
      if (targetBlock) {
        const blockRect = targetBlock.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        const mouseY = e.clientY
        const blockCenter = blockRect.top + blockRect.height / 2
        
        // Determine if we're dropping above or below the target block
        const dropAbove = mouseY < blockCenter
        const indicatorTop = dropAbove 
          ? blockRect.top - containerRect.top - 2
          : blockRect.bottom - containerRect.top + 2
        
        setDropIndicator({ top: indicatorTop, visible: true })
      }
    }

    // Handle drop events for content reordering
    const handleDrop = (e: DragEvent) => {
      // Check both data formats for compatibility
      let dragData = e.dataTransfer?.getData('application/x-tiptap-content')
      if (!dragData) {
        dragData = e.dataTransfer?.getData('text/plain')
      }
      if (!dragData) return

      console.log('[EnhancedBlockControls] Drop detected:', { dragData })

      try {
        const data = typeof dragData === 'string' && dragData.startsWith('{') 
          ? JSON.parse(dragData) 
          : { sectionId }
        // Only handle drops within the same section
        if (data.sectionId !== sectionId) {
          e.preventDefault()
          return
        }

        e.preventDefault()
        setDropIndicator({ top: 0, visible: false })

        const target = e.target as HTMLElement
        const targetBlock = target.closest('.ProseMirror > *') as HTMLElement
        
        if (targetBlock && draggedNodeRef.current) {
          try {
            // More robust position finding
            let targetPos = -1
            let targetNode = null
            let targetSize = 0
            
            // Find the position of the target block
            const view = editor.view
            const coords = { left: targetBlock.offsetLeft, top: targetBlock.offsetTop }
            const pos = view.posAtCoords(coords)
            
            if (pos && pos.pos >= 0) {
              targetPos = pos.pos
            } else {
              // Fallback: try to find position using DOM
              targetPos = view.posAtDOM(targetBlock, 0)
            }
            
            console.log('[EnhancedBlockControls] Target position:', targetPos)
            
            if (targetPos < 0) {
              console.error('[EnhancedBlockControls] Could not find target position')
              return
            }
            
            const sourcePos = draggedNodeRef.current.pos
            const sourceSize = draggedNodeRef.current.node.nodeSize
            
            // Don't move if dropping on the same position
            if (Math.abs(targetPos - sourcePos) < sourceSize) {
              console.log('[EnhancedBlockControls] Same position, skipping move')
              return
            }

            // Calculate drop position (above or below target)
            const mouseY = e.clientY
            const blockRect = targetBlock.getBoundingClientRect()
            const blockCenter = blockRect.top + blockRect.height / 2
            const dropAbove = mouseY < blockCenter
            
            console.log('[EnhancedBlockControls] Drop position:', dropAbove ? 'above' : 'below')
            
            // Find the actual node at target position
            editor.state.doc.nodesBetween(targetPos, targetPos + 1, (node, nodePos) => {
              if (nodePos === targetPos) {
                targetNode = node
                targetSize = node.nodeSize
                return false
              }
            })
            
            let insertPos = targetPos
            if (!dropAbove && targetNode) {
              insertPos = targetPos + targetSize
            }

            // Perform the move operation with transaction
            const tr = editor.state.tr
            
            // Get the content to move
            const content = tr.doc.slice(sourcePos, sourcePos + sourceSize)
            
            // Adjust positions if moving forward
            if (sourcePos < insertPos) {
              // Moving forward: delete first, then insert at adjusted position
              tr.delete(sourcePos, sourcePos + sourceSize)
              tr.insert(insertPos - sourceSize, content.content)
            } else {
              // Moving backward: insert first, then delete at adjusted position
              tr.insert(insertPos, content.content)
              tr.delete(sourcePos + sourceSize, sourcePos + sourceSize + sourceSize)
            }
            
            // Apply the transaction
            editor.view.dispatch(tr)
            console.log('[EnhancedBlockControls] Move completed')
            
          } catch (error) {
            console.error('[EnhancedBlockControls] Error during drop:', error)
          }
        }
      } catch (error) {
        console.error('Error handling drop:', error)
      }
    }

    const handleDragLeave = (e: DragEvent) => {
      // Only hide indicator if leaving the container entirely
      const relatedTarget = e.relatedTarget as HTMLElement
      if (!relatedTarget || !container.contains(relatedTarget)) {
        setDropIndicator({ top: 0, visible: false })
      }
    }

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseleave', handleMouseLeave)
    container.addEventListener('dragover', handleDragOver)
    container.addEventListener('drop', handleDrop)
    container.addEventListener('dragleave', handleDragLeave)

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('drop', handleDrop)
      container.removeEventListener('dragleave', handleDragLeave)
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    }
  }, [containerRef, editor, sectionId])

  const handleDragStart = useCallback((e: DragEvent) => {
    console.log('[EnhancedBlockControls] Native DragStart initiated')
    
    if (!hoveredBlock || !editor) {
      console.warn('[EnhancedBlockControls] Missing hoveredBlock or editor:', { hoveredBlock: !!hoveredBlock, editor: !!editor })
      return
    }
    
    // Prevent propagation to parent handlers
    e.stopPropagation()
    
    // Track drag state
    dragInProgressRef.current = true
    dragStartTimeRef.current = Date.now()
    setIsDragging(true)
    
    // Update global drag state
    startContentDrag('content-block', sectionId)
    
    // Notify parent component if callback exists
    if (onContentDragStart) {
      const syntheticEvent = new Event('dragstart') as any
      syntheticEvent.dataTransfer = e.dataTransfer
      onContentDragStart(syntheticEvent)
    }
    
    // Create proper drag image
    const dragImage = hoveredBlock.cloneNode(true) as HTMLElement
    dragImage.style.position = 'absolute'
    dragImage.style.top = '-1000px'
    dragImage.style.opacity = '0.8'
    dragImage.style.transform = 'rotate(2deg)'
    document.body.appendChild(dragImage)
    
    e.dataTransfer!.effectAllowed = 'move'
    e.dataTransfer!.setDragImage(dragImage, 20, 20)
    
    // Clean up drag image after a frame
    setTimeout(() => {
      if (document.body.contains(dragImage)) {
        document.body.removeChild(dragImage)
      }
    }, 0)
    
    // Add visual feedback
    hoveredBlock.classList.add('is-dragging')
    
    // Temporarily disable TipTap to prevent interference
    editor.setEditable(false)
    containerRef.current?.classList.add('tiptap-drag-disabled')
    
    try {
      const pos = editor.view.posAtDOM(hoveredBlock, 0)
      console.log('[EnhancedBlockControls] Found position:', pos)
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
        const dragData = {
          sectionId: sectionId,
          nodePos: blockPos,
          nodeSize: blockSize,
          nodeType: blockNode.type.name
        }
        
        // Set data in multiple formats for compatibility
        e.dataTransfer.setData('application/x-tiptap-content', JSON.stringify(dragData))
        e.dataTransfer.setData('text/plain', JSON.stringify(dragData))
        
        console.log('[EnhancedBlockControls] Drag data set:', dragData)
      } else {
        console.warn('[EnhancedBlockControls] No block node found')
      }
    } catch (error) {
      console.error('[EnhancedBlockControls] Error in drag start:', error)
      // Still allow the drag to proceed with basic data
      e.dataTransfer.setData('text/plain', JSON.stringify({ sectionId }))
    }
  }, [hoveredBlock, editor, sectionId, onContentDragStart, startContentDrag])

  const handleDragEnd = useCallback((e: DragEvent) => {
    const dragDuration = Date.now() - dragStartTimeRef.current
    console.log('[EnhancedBlockControls] Native DragEnd, duration:', dragDuration)
    
    dragInProgressRef.current = false
    setIsDragging(false)
    setDropIndicator({ top: 0, visible: false })
    
    // Reset global drag state
    resetDragState()
    
    // Notify parent component if callback exists
    if (onContentDragEnd) {
      const syntheticEvent = new Event('dragend') as any
      syntheticEvent.dataTransfer = e.dataTransfer
      onContentDragEnd(syntheticEvent)
    }
    
    // Re-enable TipTap editor
    if (editor) {
      editor.setEditable(true)
    }
    containerRef.current?.classList.remove('tiptap-drag-disabled')
    
    // Clean up visual feedback
    if (hoveredBlock) {
      hoveredBlock.classList.remove('is-dragging')
    }
    document.querySelectorAll('.is-dragging').forEach(el => {
      el.classList.remove('is-dragging')
    })
    
    draggedNodeRef.current = null
  }, [hoveredBlock, editor, onContentDragEnd, resetDragState])

  // Re-enable native event listeners now that TipTap's drag handling is disabled
  useEffect(() => {
    if (!dragHandleElement) return

    const handle = dragHandleElement
    
    // Create native event handlers that use the callbacks
    const nativeDragStart = (e: DragEvent) => {
      console.log('[EnhancedBlockControls] Native dragstart event fired')
      handleDragStart(e)
    }
    
    const nativeDragEnd = (e: DragEvent) => {
      console.log('[EnhancedBlockControls] Native dragend event fired')
      handleDragEnd(e)
    }
    
    // Attach native event listeners
    handle.addEventListener('dragstart', nativeDragStart)
    handle.addEventListener('dragend', nativeDragEnd)
    
    // Also make sure draggable is properly set
    handle.draggable = true
    
    console.log('[EnhancedBlockControls] Native event listeners attached to drag handle')
    
    return () => {
      handle.removeEventListener('dragstart', nativeDragStart)
      handle.removeEventListener('dragend', nativeDragEnd)
      console.log('[EnhancedBlockControls] Native event listeners removed from drag handle')
    }
  }, [dragHandleElement, handleDragStart, handleDragEnd])

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
              left: `${controlsPosition.left}px`
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

            {/* Drag Handle */}
            <div
              ref={setDragHandleElement}
              draggable={true}
              onMouseDown={(e) => {
                // Don't prevent default - we need this for drag to work
                e.stopPropagation()
                console.log('[EnhancedBlockControls] Mouse down on drag handle')
              }}
              className={cn(
                "drag-handle", // Important: Used by event delegation
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

      {/* Content Drop Indicator */}
      {dropIndicator.visible && (
        <div 
          className="absolute left-0 right-0 z-50 pointer-events-none"
          style={{ 
            top: `${dropIndicator.top}px`,
            height: '3px',
            background: 'linear-gradient(90deg, transparent 0%, #10b981 20%, #10b981 80%, transparent 100%)',
            boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)',
            animation: 'pulse 1.5s ease-in-out infinite'
          }}
        >
          <div 
            className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2" 
            style={{
              width: '8px',
              height: '8px',
              backgroundColor: '#10b981',
              borderRadius: '50%',
              boxShadow: '0 0 0 3px rgba(16, 185, 129, 0.3)'
            }}
          />
        </div>
      )}

      {/* Drag Indicator Line (for visual feedback during drag) */}
      {isDragging && (
        <div className="absolute left-0 right-0 h-0.5 bg-blue-500 z-40 pointer-events-none" />
      )}
    </>
  )
}