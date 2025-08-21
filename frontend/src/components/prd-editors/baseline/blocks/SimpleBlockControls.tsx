import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Editor } from '@tiptap/react'
import { GripVertical, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { VirtualContentBlock } from '@/lib/virtual-blocks/types'

interface SimpleBlockControlsProps {
  editor: Editor | null
  containerRef: React.RefObject<HTMLDivElement | null>
  onBlockInsert?: () => void
  virtualBlocks?: VirtualContentBlock[]
  enableVirtualBlocks?: boolean
  onBlockReorder?: (fromIndex: number, toIndex: number, position?: 'before' | 'after') => void
}

export function SimpleBlockControls({ 
  editor, 
  containerRef,
  onBlockInsert,
  virtualBlocks = [],
  enableVirtualBlocks = true,
  onBlockReorder
}: SimpleBlockControlsProps) {
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null)
  const [currentVirtualBlock, setCurrentVirtualBlock] = useState<VirtualContentBlock | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [controlsPosition, setControlsPosition] = useState({ top: 0, left: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null)
  const [dropIndicatorPosition, setDropIndicatorPosition] = useState<{ top: number; show: boolean }>({ top: 0, show: false })
  const controlsRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Helper function to find drop zone (closest block element)
  const findDropZone = useCallback((element: HTMLElement): HTMLElement | null => {
    return element.closest('.ProseMirror > *') as HTMLElement
  }, [])

  // Helper function to find virtual block by DOM element
  const findVirtualBlockByElement = useCallback((element: HTMLElement): VirtualContentBlock | null => {
    if (!enableVirtualBlocks || virtualBlocks.length === 0) {
      return null
    }
    
    const blockText = element.textContent || ''
    const blockTagName = element.tagName.toLowerCase()
    
    
    const matchedBlock = virtualBlocks.find(vb => {
      const textMatch = vb.content.text === blockText
      const tagMatch = (
        (blockTagName === 'p' && vb.type === 'paragraph') ||
        (blockTagName === 'h1' && vb.type === 'heading_1') ||
        (blockTagName === 'h2' && vb.type === 'heading_2') ||
        (blockTagName === 'h3' && vb.type === 'heading_3') ||
        (blockTagName === 'ul' && vb.type === 'bullet_list') ||
        (blockTagName === 'ol' && vb.type === 'numbered_list') ||
        (blockTagName === 'blockquote' && vb.type === 'quote') ||
        (blockTagName === 'pre' && vb.type === 'code')
      )
      
      return textMatch && tagMatch
    }) || null
    
    return matchedBlock
  }, [enableVirtualBlocks, virtualBlocks])

  // Drag and drop event handlers
  const handleDragOver = useCallback((e: DragEvent) => {
    // Always prevent default to enable drop, even if conditions aren't met
    e.preventDefault()
    
    if (!isDragging || !draggedBlockId) {
      return
    }
    
    e.dataTransfer!.dropEffect = 'move'
    
    const target = e.target as HTMLElement
    const dropZone = findDropZone(target)
    
    if (dropZone && containerRef.current) {
      const containerRect = containerRef.current.getBoundingClientRect()
      const dropZoneRect = dropZone.getBoundingClientRect()
      const dropZoneMiddle = dropZoneRect.top + dropZoneRect.height / 2
      
      // Determine if we should drop above or below
      const dropAbove = e.clientY < dropZoneMiddle
      const indicatorTop = dropAbove 
        ? dropZoneRect.top - containerRect.top 
        : dropZoneRect.bottom - containerRect.top
      
      setDropIndicatorPosition({ top: indicatorTop, show: true })
    }
  }, [isDragging, draggedBlockId, findDropZone])

  const handleDrop = useCallback((e: DragEvent) => {
    
    e.preventDefault()
    
    // Early return checks
    if (!isDragging || !draggedBlockId || !onBlockReorder) {
      return
    }
    
    const target = e.target as HTMLElement
    const dropZone = findDropZone(target)
    
    if (dropZone) {
      const targetVirtualBlock = findVirtualBlockByElement(dropZone)
      
      if (targetVirtualBlock && targetVirtualBlock.id !== draggedBlockId) {
        // Find indices
        const draggedIndex = virtualBlocks.findIndex(block => block.id === draggedBlockId)
        const targetIndex = virtualBlocks.findIndex(block => block.id === targetVirtualBlock.id)
        
        if (draggedIndex !== -1 && targetIndex !== -1) {
          
          // Determine if dropping above or below based on mouse position
          const dropZoneRect = dropZone.getBoundingClientRect()
          const dropZoneMiddle = dropZoneRect.top + dropZoneRect.height / 2
          const dropAbove = e.clientY < dropZoneMiddle
          
          // Pass the position information to the handler
          const position = dropAbove ? 'before' : 'after'
          
          // Validate target index is within bounds
          if (targetIndex >= 0 && targetIndex < virtualBlocks.length) {
            onBlockReorder(draggedIndex, targetIndex, position)
          }
        }
      }
    }
    
    // Reset drag state
    setIsDragging(false)
    setDraggedBlockId(null)
    setDropIndicatorPosition({ top: 0, show: false })
  }, [isDragging, draggedBlockId, onBlockReorder, findDropZone, findVirtualBlockByElement, virtualBlocks])

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
        
        // Find corresponding virtual block using helper function
        const virtualBlock = findVirtualBlockByElement(block)
        setCurrentVirtualBlock(virtualBlock)
        
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
        
        // Position controls in the left padding area, center-aligned
        const negativeOffset = -75
        
        setControlsPosition({ 
          top: top + (blockHeight / 2) - (controlsHeight / 2),
          left: negativeOffset
        })
        setShowControls(true)
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
          setCurrentVirtualBlock(null)
          setShowControls(false)
        }, 200)
      }
    }

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseleave', handleMouseLeave)
    
    // Add drag and drop event listeners
    container.addEventListener('dragover', handleDragOver, { passive: false })
    container.addEventListener('drop', handleDrop, { passive: false })
    
    // Add additional drag event listeners for better debugging
    const handleDragEnter = (e: DragEvent) => {
      // Prevent default to ensure drop event fires
      e.preventDefault()
    }
    
    const handleDragLeave = (e: DragEvent) => {
      // No-op, just for cleanup
    }
    
    // Add dragend event listener to detect when drag operation ends
    const handleDragEnd = (e: DragEvent) => {
      // No-op, just for cleanup
    }
    
    container.addEventListener('dragenter', handleDragEnter)
    container.addEventListener('dragleave', handleDragLeave)
    container.addEventListener('dragend', handleDragEnd)

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      container.removeEventListener('dragover', handleDragOver)
      container.removeEventListener('drop', handleDrop)
      container.removeEventListener('dragenter', handleDragEnter)
      container.removeEventListener('dragleave', handleDragLeave)
      container.removeEventListener('dragend', handleDragEnd)
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    }
  }, [containerRef, editor, handleDragOver, handleDrop])

  const handleAddNewLine = useCallback(() => {
    if (!editor || !hoveredBlock) return
    
    try {
      const pos = editor.view.posAtDOM(hoveredBlock, hoveredBlock.childNodes.length)
      editor.chain()
        .focus()
        .insertContentAt(pos + 1, '<p></p>')
        .setTextSelection(pos + 2)
        .run()
      onBlockInsert?.()
    } catch (error) {
      console.error('Error inserting new line:', error)
      editor.chain().focus().insertContent('<p></p>').run()
    }
  }, [editor, hoveredBlock, onBlockInsert])

  return (
    <>
      {/* Drop Indicator */}
      <AnimatePresence>
        {dropIndicatorPosition.show && (
          <motion.div
            className="absolute left-0 right-0 h-0.5 bg-blue-500 z-40 pointer-events-none"
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0, scaleX: 0 }}
            style={{
              top: `${dropIndicatorPosition.top}px`,
            }}
          />
        )}
      </AnimatePresence>

      {/* Main Block Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            ref={controlsRef}
            className="simple-block-controls absolute flex items-center gap-1 z-30"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.15 }}
            style={{
              top: `${controlsPosition.top}px`,
              left: `${controlsPosition.left}px`,
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
                  setCurrentVirtualBlock(null)
                  setShowControls(false)
                }, 200)
                return
              }
              
              const isGoingToEditor = containerRef.current?.contains(relatedTarget) && 
                                     !controlsRef.current?.contains(relatedTarget)
              
              if (!isGoingToEditor) {
                // Hide controls if not going back to editor
                hideTimeoutRef.current = setTimeout(() => {
                  setHoveredBlock(null)
                  setCurrentVirtualBlock(null)
                  setShowControls(false)
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
              className={cn(
                "drag-handle",
                "p-1.5 rounded-md cursor-move",
                "bg-white dark:bg-gray-800",
                "border border-gray-200 dark:border-gray-700",
                "hover:bg-gray-50 dark:hover:bg-gray-700",
                "shadow-sm hover:shadow-md",
                "transition-all duration-150",
                "hover:scale-105"
              )}
              title={currentVirtualBlock ? `Drag ${currentVirtualBlock.type} to reorder` : "Drag to reorder"}
              draggable={enableVirtualBlocks && !!currentVirtualBlock}
              onDragStart={(e: React.DragEvent) => {
                if (currentVirtualBlock && hoveredBlock) {
                  
                  // Set drag data for virtual block
                  e.dataTransfer.setData('text/virtual-block-id', currentVirtualBlock.id)
                  e.dataTransfer.setData('text/virtual-block-type', currentVirtualBlock.type)
                  e.dataTransfer.effectAllowed = 'move'
                  
                  // Set drag state
                  setIsDragging(true)
                  setDraggedBlockId(currentVirtualBlock.id)
                  
                  // Add visual feedback to the block
                  hoveredBlock.style.opacity = '0.5'
                } else {
                  // Prevent drag if no virtual block
                  e.preventDefault()
                }
              }}
              onDragEnd={(e: React.DragEvent) => {
                // Reset visual feedback
                if (hoveredBlock) {
                  hoveredBlock.style.opacity = ''
                }
                
                // Reset drag state if not already reset by drop
                if (isDragging) {
                  setIsDragging(false)
                  setDraggedBlockId(null)
                  setDropIndicatorPosition({ top: 0, show: false })
                }
              }}
            >
              <GripVertical className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}