import React, { useRef, useState, useEffect } from 'react'
import { GripVertical } from 'lucide-react'
import { Editor } from '@tiptap/react'
import { cn } from '@/lib/utils'

interface SimpleDragHandleProps {
  editor: Editor
  blockElement: HTMLElement
  onMoveComplete?: () => void
}

export function SimpleDragHandle({ editor, blockElement, onMoveComplete }: SimpleDragHandleProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [draggedNode, setDraggedNode] = useState<{ pos: number; size: number; content: any } | null>(null)
  const dragImageRef = useRef<HTMLDivElement | null>(null)

  // Create a custom drag image
  useEffect(() => {
    if (!dragImageRef.current) {
      const div = document.createElement('div')
      div.style.position = 'absolute'
      div.style.top = '-1000px'
      div.style.left = '-1000px'
      div.style.background = 'white'
      div.style.border = '2px solid #3b82f6'
      div.style.borderRadius = '4px'
      div.style.padding = '8px'
      div.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)'
      div.style.maxWidth = '400px'
      div.style.opacity = '0.9'
      document.body.appendChild(div)
      dragImageRef.current = div
    }

    return () => {
      if (dragImageRef.current && dragImageRef.current.parentNode) {
        dragImageRef.current.parentNode.removeChild(dragImageRef.current)
        dragImageRef.current = null
      }
    }
  }, [])

  const handleDragStart = (e: React.DragEvent) => {
    e.stopPropagation()
    setIsDragging(true)

    try {
      // Get the position of this block in the editor
      const pos = editor.view.posAtDOM(blockElement, 0)
      const $pos = editor.state.doc.resolve(pos)
      const nodePos = $pos.before($pos.depth)
      const node = editor.state.doc.nodeAt(nodePos)

      if (!node) {
        console.error('Could not find node at position')
        return
      }

      // Store the dragged node info
      const dragInfo = {
        pos: nodePos,
        size: node.nodeSize,
        content: node.toJSON()
      }
      setDraggedNode(dragInfo)

      // Set drag data
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('application/x-tiptap-drag', JSON.stringify(dragInfo))

      // Create custom drag image
      if (dragImageRef.current) {
        dragImageRef.current.innerHTML = blockElement.innerHTML
        dragImageRef.current.style.width = `${blockElement.offsetWidth * 0.8}px`
        e.dataTransfer.setDragImage(dragImageRef.current, 20, 20)
      }

      // Add dragging class to the original element
      blockElement.classList.add('dragging-source')

      console.log('[SimpleDragHandle] Drag started', dragInfo)
    } catch (error) {
      console.error('[SimpleDragHandle] Error starting drag:', error)
    }
  }

  const handleDragEnd = (e: React.DragEvent) => {
    e.stopPropagation()
    setIsDragging(false)
    setDraggedNode(null)

    // Remove dragging class
    blockElement.classList.remove('dragging-source')

    console.log('[SimpleDragHandle] Drag ended')
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    e.dataTransfer.dropEffect = 'move'

    // Add visual feedback
    blockElement.classList.add('drag-over')
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.stopPropagation()
    blockElement.classList.remove('drag-over')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    
    blockElement.classList.remove('drag-over')

    try {
      const dragData = e.dataTransfer.getData('application/x-tiptap-drag')
      if (!dragData) return

      const dragInfo = JSON.parse(dragData)
      
      // Get the drop position
      const dropPos = editor.view.posAtDOM(blockElement, 0)
      const $dropPos = editor.state.doc.resolve(dropPos)
      const dropNodePos = $dropPos.before($dropPos.depth)

      // Don't drop on itself
      if (dropNodePos === dragInfo.pos) return

      console.log('[SimpleDragHandle] Dropping:', { from: dragInfo.pos, to: dropNodePos })

      // Perform the move in a single transaction
      const tr = editor.state.tr
      const draggedNode = editor.state.doc.nodeAt(dragInfo.pos)

      if (draggedNode) {
        // Calculate the target position
        let targetPos = dropNodePos
        
        if (dropNodePos > dragInfo.pos) {
          // Moving down: insert after the drop target
          const dropNode = editor.state.doc.nodeAt(dropNodePos)
          if (dropNode) {
            targetPos = dropNodePos + dropNode.nodeSize
          }
        }

        // Delete from original position
        tr.delete(dragInfo.pos, dragInfo.pos + dragInfo.size)

        // Adjust target position if necessary
        if (targetPos > dragInfo.pos) {
          targetPos -= dragInfo.size
        }

        // Insert at new position
        tr.insert(targetPos, draggedNode)

        // Apply the transaction
        editor.view.dispatch(tr)

        console.log('[SimpleDragHandle] Content moved successfully')
        onMoveComplete?.()
      }
    } catch (error) {
      console.error('[SimpleDragHandle] Error handling drop:', error)
    }
  }

  return (
    <>
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "simple-drag-handle",
          "inline-flex items-center justify-center",
          "p-1.5 rounded cursor-move",
          "bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600",
          "transition-colors duration-150",
          isDragging && "opacity-50"
        )}
        title="Drag to reorder"
      >
        <GripVertical className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </div>

      <style jsx>{`
        .dragging-source {
          opacity: 0.5;
        }
        
        .drag-over {
          position: relative;
        }
        
        .drag-over::before {
          content: '';
          position: absolute;
          left: 0;
          right: 0;
          top: -2px;
          height: 4px;
          background: #3b82f6;
          border-radius: 2px;
        }
      `}</style>
    </>
  )
}