import React, { useState, useRef } from 'react'
import { GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ContentBlockWrapperProps {
  children: React.ReactNode
  index: number
  onMove: (fromIndex: number, toIndex: number) => void
  isEditable?: boolean
}

export function ContentBlockWrapper({ 
  children, 
  index, 
  onMove,
  isEditable = true 
}: ContentBlockWrapperProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const blockRef = useRef<HTMLDivElement>(null)

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', index.toString())
    
    // Create a better drag image
    if (blockRef.current) {
      const dragImage = blockRef.current.cloneNode(true) as HTMLElement
      dragImage.style.transform = 'rotate(2deg)'
      dragImage.style.opacity = '0.8'
      document.body.appendChild(dragImage)
      e.dataTransfer.setDragImage(dragImage, e.clientX - blockRef.current.getBoundingClientRect().left, 20)
      setTimeout(() => document.body.removeChild(dragImage), 0)
    }
    
    console.log(`[ContentBlockWrapper] Starting drag from index ${index}`)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    console.log(`[ContentBlockWrapper] Ending drag from index ${index}`)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'))
    if (fromIndex !== index) {
      console.log(`[ContentBlockWrapper] Moving from ${fromIndex} to ${index}`)
      onMove(fromIndex, index)
    }
  }

  if (!isEditable) {
    return <div>{children}</div>
  }

  return (
    <div
      ref={blockRef}
      className={cn(
        "content-block-wrapper group relative",
        isDragging && "opacity-50",
        isDragOver && "ring-2 ring-blue-500 ring-offset-2"
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag Handle - Always visible on hover */}
      <div
        draggable
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        className={cn(
          "absolute -left-8 top-1/2 -translate-y-1/2",
          "opacity-0 group-hover:opacity-100",
          "transition-opacity duration-150",
          "cursor-move p-1 rounded",
          "bg-gray-100 hover:bg-gray-200",
          "dark:bg-gray-700 dark:hover:bg-gray-600"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4 text-gray-500 dark:text-gray-400" />
      </div>

      {/* Content */}
      <div className="content-block-content">
        {children}
      </div>

      {/* Drop indicator */}
      {isDragOver && (
        <div className="absolute inset-x-0 -top-1 h-0.5 bg-blue-500" />
      )}
    </div>
  )
}