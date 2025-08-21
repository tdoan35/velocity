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
}

export function SimpleBlockControls({ 
  editor, 
  containerRef,
  onBlockInsert,
  virtualBlocks = [],
  enableVirtualBlocks = true
}: SimpleBlockControlsProps) {
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null)
  const [currentVirtualBlock, setCurrentVirtualBlock] = useState<VirtualContentBlock | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [controlsPosition, setControlsPosition] = useState({ top: 0, left: 0 })
  const controlsRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        
        // Find corresponding virtual block if enabled
        let virtualBlock: VirtualContentBlock | null = null
        if (enableVirtualBlocks && virtualBlocks.length > 0) {
          const blockText = block.textContent || ''
          const blockTagName = block.tagName.toLowerCase()
          
          virtualBlock = virtualBlocks.find(vb => {
            // Match by text content and tag type
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
        }
        
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

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    }
  }, [containerRef, editor])

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
            <motion.div
              className={cn(
                "drag-handle",
                "p-1.5 rounded-md cursor-move",
                "bg-white dark:bg-gray-800",
                "border border-gray-200 dark:border-gray-700",
                "hover:bg-gray-50 dark:hover:bg-gray-700",
                "shadow-sm hover:shadow-md",
                "transition-all duration-150"
              )}
              whileHover={{ scale: 1.05 }}
              title={currentVirtualBlock ? `Drag ${currentVirtualBlock.type} to reorder` : "Drag to reorder"}
              draggable={enableVirtualBlocks && !!currentVirtualBlock}
              onDragStart={(e: React.DragEvent) => {
                if (currentVirtualBlock && hoveredBlock) {
                  // Set drag data for virtual block
                  e.dataTransfer.setData('text/virtual-block-id', currentVirtualBlock.id)
                  e.dataTransfer.setData('text/virtual-block-type', currentVirtualBlock.type)
                  e.dataTransfer.effectAllowed = 'move'
                  
                  // Add visual feedback to the block
                  hoveredBlock.style.opacity = '0.5'
                  
                  console.log('Dragging virtual block:', currentVirtualBlock.type, currentVirtualBlock.id)
                } else {
                  // Prevent drag if no virtual block
                  e.preventDefault()
                }
              }}
              onDragEnd={() => {
                if (hoveredBlock) {
                  hoveredBlock.style.opacity = ''
                }
              }}
            >
              <GripVertical className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}