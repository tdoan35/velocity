import { NodeViewProps, NodeViewWrapper } from '@tiptap/react'
import { GripVertical, Plus } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

export const DragHandle = ({ editor, node, getPos }: NodeViewProps) => {
  const [isDragging, setIsDragging] = useState(false)
  const [showInsert, setShowInsert] = useState(false)

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/html', node.textContent || '')
    
    const pos = getPos()
    if (typeof pos === 'number') {
      e.dataTransfer.setData('block-position', pos.toString())
    }
    
    setIsDragging(true)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
  }

  const handleInsertBlock = () => {
    const pos = getPos()
    if (typeof pos === 'number') {
      editor.chain()
        .focus()
        .insertContentAt(pos + node.nodeSize, '<p></p>')
        .run()
    }
  }

  return (
    <NodeViewWrapper 
      className="relative group"
      onMouseEnter={() => setShowInsert(true)}
      onMouseLeave={() => setShowInsert(false)}
    >
      {/* Drag Handle */}
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={cn(
          "absolute -left-8 top-1 opacity-0 group-hover:opacity-100 transition-opacity cursor-move p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800",
          isDragging && "opacity-100"
        )}
        contentEditable={false}
      >
        <GripVertical className="h-4 w-4 text-gray-400" />
      </div>

      {/* Insert Button */}
      {showInsert && (
        <button
          onClick={handleInsertBlock}
          className="absolute -left-8 -bottom-4 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 z-10"
          contentEditable={false}
        >
          <Plus className="h-4 w-4 text-gray-400" />
        </button>
      )}

      {/* Original content */}
      <div className="notion-block">
        {node.textContent}
      </div>
    </NodeViewWrapper>
  )
}