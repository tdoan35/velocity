import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '@/lib/utils'

interface DragDropOverlayProps {
  isDragging: boolean
  draggedElement?: HTMLElement | null
  dropZones?: HTMLElement[]
  onDrop?: (targetElement: HTMLElement) => void
}

interface DropIndicator {
  id: string
  top: number
  left: number
  width: number
  isActive: boolean
}

export function DragDropOverlay({ 
  isDragging, 
  draggedElement,
  dropZones = [],
  onDrop
}: DragDropOverlayProps) {
  const [dropIndicators, setDropIndicators] = useState<DropIndicator[]>([])
  const [activeDropZone, setActiveDropZone] = useState<string | null>(null)
  const [ghostPosition, setGhostPosition] = useState({ x: 0, y: 0 })
  const [draggedContent, setDraggedContent] = useState<string>('')

  useEffect(() => {
    if (isDragging && draggedElement) {
      // Create ghost element content
      setDraggedContent(draggedElement.textContent || '')
      
      // Calculate drop indicators for valid drop zones
      const indicators: DropIndicator[] = dropZones.map((zone, index) => {
        const rect = zone.getBoundingClientRect()
        return {
          id: `drop-${index}`,
          top: rect.bottom,
          left: rect.left,
          width: rect.width,
          isActive: false
        }
      })
      setDropIndicators(indicators)
    } else {
      setDropIndicators([])
      setActiveDropZone(null)
    }
  }, [isDragging, draggedElement, dropZones])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      setGhostPosition({ x: e.clientX, y: e.clientY })
      
      // Check which drop zone is active
      const activeIndicator = dropIndicators.find(indicator => {
        const distance = Math.abs(e.clientY - indicator.top)
        return distance < 20
      })
      
      if (activeIndicator) {
        setActiveDropZone(activeIndicator.id)
      } else {
        setActiveDropZone(null)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => window.removeEventListener('mousemove', handleMouseMove)
  }, [isDragging, dropIndicators])

  return (
    <>
      {/* Drop Indicators */}
      <AnimatePresence>
        {isDragging && dropIndicators.map((indicator) => (
          <motion.div
            key={indicator.id}
            className={cn(
              "fixed h-0.5 pointer-events-none z-50",
              activeDropZone === indicator.id ? "bg-blue-500" : "bg-gray-300"
            )}
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ 
              opacity: activeDropZone === indicator.id ? 1 : 0.3,
              scaleX: 1,
              height: activeDropZone === indicator.id ? 2 : 0.5
            }}
            exit={{ opacity: 0, scaleX: 0 }}
            transition={{ duration: 0.2 }}
            style={{
              top: `${indicator.top}px`,
              left: `${indicator.left}px`,
              width: `${indicator.width}px`
            }}
          />
        ))}
      </AnimatePresence>

      {/* Ghost Element */}
      <AnimatePresence>
        {isDragging && draggedContent && (
          <motion.div
            className="fixed pointer-events-none z-50 p-3 bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ 
              opacity: 0.8,
              scale: 1,
              x: ghostPosition.x + 10,
              y: ghostPosition.y + 10,
              rotate: 2
            }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ 
              opacity: { duration: 0.2 },
              scale: { duration: 0.2 },
              default: { duration: 0 }
            }}
            style={{
              maxWidth: '300px',
              maxHeight: '100px',
              overflow: 'hidden'
            }}
          >
            <div className="text-sm text-gray-600 dark:text-gray-300 truncate">
              {draggedContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Drop Zone Highlights */}
      <AnimatePresence>
        {isDragging && dropZones.map((zone, index) => {
          const rect = zone.getBoundingClientRect()
          const isActive = activeDropZone === `drop-${index}`
          
          return (
            <motion.div
              key={`highlight-${index}`}
              className={cn(
                "fixed pointer-events-none rounded-md border-2 border-dashed",
                isActive ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20" : "border-transparent"
              )}
              initial={{ opacity: 0 }}
              animate={{ 
                opacity: isActive ? 0.5 : 0
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              style={{
                top: `${rect.top}px`,
                left: `${rect.left}px`,
                width: `${rect.width}px`,
                height: `${rect.height}px`
              }}
            />
          )
        })}
      </AnimatePresence>
    </>
  )
}

// Hook for managing drag and drop state
export function useDragDropOverlay() {
  const [isDragging, setIsDragging] = useState(false)
  const [draggedElement, setDraggedElement] = useState<HTMLElement | null>(null)
  const [dropZones, setDropZones] = useState<HTMLElement[]>([])

  const startDrag = (element: HTMLElement, validDropZones: HTMLElement[]) => {
    setIsDragging(true)
    setDraggedElement(element)
    setDropZones(validDropZones)
  }

  const endDrag = () => {
    setIsDragging(false)
    setDraggedElement(null)
    setDropZones([])
  }

  return {
    isDragging,
    draggedElement,
    dropZones,
    startDrag,
    endDrag
  }
}