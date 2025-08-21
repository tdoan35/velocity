import { useEffect, useState, useRef } from 'react'
import { Editor } from '@tiptap/react'
import { GripVertical, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface BlockControlsProps {
  editor: Editor | null
  containerRef: React.RefObject<HTMLDivElement | null>
}

export function BlockControls({ editor, containerRef }: BlockControlsProps) {
  const [hoveredBlock, setHoveredBlock] = useState<HTMLElement | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [controlsPosition, setControlsPosition] = useState({ top: 0, left: 0 })
  const controlsRef = useRef<HTMLDivElement>(null)
  const draggedNodeRef = useRef<{ node: any; pos: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current || !editor) return

    const container = containerRef.current
    let currentBlock: HTMLElement | null = null
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      
      // Find the closest block element - could be p, h1, h2, h3, ul, ol, etc.
      const block = target.closest('.ProseMirror > *') as HTMLElement
      
      if (block && block !== currentBlock) {
        currentBlock = block
        setHoveredBlock(block)
        
        // Clear any existing timeout
        if (timeoutId) clearTimeout(timeoutId)
        
        // Calculate position for controls
        const blockRect = block.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        
        // Since the controls are positioned absolutely within the container (editorContentRef),
        // and the container scrolls with the content, we just need the relative position
        // WITHOUT adding scroll offset
        let top = blockRect.top - containerRect.top
        
        // Get computed styles
        const computedStyle = window.getComputedStyle(block)
        const fontSize = parseFloat(computedStyle.fontSize)
        
        // Get the actual height of the controls (the icons are 16px, with padding ~24px total)
        const controlsHeight = 24
        
        // Check if this is a heading by looking at the tag name
        const tagName = block.tagName.toLowerCase()
        
        // Calculate the vertical center of the element
        // We want to align with the center of the entire block element,
        // not just the text within it
        const blockHeight = block.offsetHeight
        
        // Position controls at the vertical center of the block
        top += (blockHeight / 2) - (controlsHeight / 2)
        
        // For horizontal: position to the left in the padding area
        const left = 24 // Position in the left padding area
        
        setControlsPosition({ top, left })
        setShowControls(true)
      }
    }

    const handleMouseLeave = (e: MouseEvent) => {
      // Check if mouse is leaving the editor area entirely
      const relatedTarget = e.relatedTarget as HTMLElement
      if (!relatedTarget || !container.contains(relatedTarget)) {
        // Add a small delay before hiding to prevent flicker
        timeoutId = setTimeout(() => {
          currentBlock = null
          setHoveredBlock(null)
          setShowControls(false)
        }, 100)
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

  const handleDragStart = (e: React.DragEvent) => {
    if (!hoveredBlock || !editor) return
    
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setDragImage(hoveredBlock, 0, 0)
    
    // Mark the block as being dragged
    hoveredBlock.classList.add('is-dragging')
    hoveredBlock.style.opacity = '0.5'
    
    try {
      // Get the position of the dragged block in the editor
      const pos = editor.view.posAtDOM(hoveredBlock, 0)
      
      // Find the block-level node that contains this position
      let blockPos = pos
      let blockNode = null
      let blockSize = 1
      
      // Iterate through the document to find the block node
      editor.state.doc.descendants((node, nodePos) => {
        // Check if this is a block node that contains our position
        if (nodePos <= pos && pos < nodePos + node.nodeSize) {
          // Check if this is a block-level node (paragraph, heading, etc.)
          if (node.isBlock && node.type.name !== 'doc') {
            blockPos = nodePos
            blockNode = node
            blockSize = node.nodeSize
            return false // Stop iterating
          }
        }
      })
      
      // If we found a block node, store its data
      if (blockNode) {
        // Store the node and position for the drop handler
        draggedNodeRef.current = { node: blockNode, pos: blockPos }
        
        // Store data for the drop handler
        e.dataTransfer.setData('application/x-tiptap-drag', JSON.stringify({
          nodePos: blockPos,
          nodeSize: blockSize
        }))
      } else {
        console.warn('Could not find block node at position', pos)
      }
    } catch (error) {
      console.error('Error in drag start:', error)
    }
  }

  const handleDragEnd = () => {
    if (!hoveredBlock) return
    hoveredBlock.classList.remove('is-dragging')
    hoveredBlock.style.opacity = '1'
    draggedNodeRef.current = null
  }

  const handleInsertBlock = () => {
    if (!editor || !hoveredBlock) return
    
    try {
      // Get the position after the current block
      const pos = editor.view.posAtDOM(hoveredBlock, hoveredBlock.childNodes.length)
      
      // Insert a new paragraph after the current block
      editor.chain()
        .focus()
        .insertContentAt(pos, '<p></p>')
        .run()
    } catch (error) {
      console.error('Error inserting block:', error)
      // Fallback: just insert at current position
      editor.chain()
        .focus()
        .insertContent('<p></p>')
        .run()
    }
  }

  return (
    <>
      {/* Block Controls Container - Horizontal layout */}
      {showControls && (
        <div
          ref={controlsRef}
          className={cn(
            "absolute flex items-center gap-1 transition-opacity duration-200",
            "z-20"
          )}
          style={{
            top: `${controlsPosition.top}px`,
            left: `${controlsPosition.left}px`,
            opacity: showControls ? 1 : 0
          }}
        >
          {/* Insert Button (Left) */}
          <button
            onClick={handleInsertBlock}
            className={cn(
              "p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800",
              "transition-colors duration-150"
            )}
            onMouseDown={(e) => e.preventDefault()} // Prevent focus loss
          >
            <Plus className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          </button>

          {/* Drag Handle (Right) */}
          <div
            draggable
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            className={cn(
              "p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800",
              "cursor-move transition-colors duration-150"
            )}
          >
            <GripVertical className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
          </div>
        </div>
      )}
    </>
  )
}