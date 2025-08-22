import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GripVertical, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { FlexiblePRDSection } from '@/services/prdService'
import type { SortableSectionRef } from '../dnd/SortableSection'

interface SectionBlockControlsProps {
  containerRef: React.RefObject<HTMLDivElement | null>
  sections: FlexiblePRDSection[]
  sectionRefs: React.MutableRefObject<Record<string, SortableSectionRef | null>>
  onSectionAdd?: (afterSectionId?: string) => void
  enableDragHandle?: boolean
}

export function SectionBlockControls({ 
  containerRef,
  sections,
  sectionRefs,
  onSectionAdd,
  enableDragHandle = true
}: SectionBlockControlsProps) {
  const [hoveredSection, setHoveredSection] = useState<HTMLElement | null>(null)
  const [showControls, setShowControls] = useState(false)
  const [controlsPosition, setControlsPosition] = useState({ top: 0, left: 0 })
  const controlsRef = useRef<HTMLDivElement>(null)
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const findSectionHeader = useCallback((element: HTMLElement): HTMLElement | null => {
    // Look for the card header element specifically
    const cardHeader = element.closest('[data-section-id]')?.querySelector('.bg-transparent') as HTMLElement
    return cardHeader || null
  }, [])

  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    let currentSectionHeader: HTMLElement | null = null

    const handleMouseMove = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      
      // Find the closest section header (CardHeader with bg-transparent class)
      const sectionCard = target.closest('[data-section-id]') as HTMLElement
      const sectionHeader = sectionCard?.querySelector('.bg-transparent') as HTMLElement
      
      // Check if hovering over the header area
      const isHoveringHeader = sectionHeader?.contains(target)
      
      // Check if hovering in the expanded hover zone (header + controls area)
      let isInExpandedHoverZone = false
      if (sectionHeader) {
        const headerRect = sectionHeader.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        
        // Create expanded zone that includes the controls area (75px to the left of header)
        const expandedZone = {
          left: headerRect.left - 75,
          right: headerRect.right,
          top: headerRect.top,
          bottom: headerRect.bottom
        }
        
        isInExpandedHoverZone = (
          e.clientX >= expandedZone.left &&
          e.clientX <= expandedZone.right &&
          e.clientY >= expandedZone.top &&
          e.clientY <= expandedZone.bottom
        )
      }
      
      if (sectionHeader && (isHoveringHeader || isInExpandedHoverZone) && sectionHeader !== currentSectionHeader) {
        currentSectionHeader = sectionHeader
        setHoveredSection(sectionHeader)
        
        // Clear any pending hide timeout
        if (hideTimeoutRef.current) {
          clearTimeout(hideTimeoutRef.current)
          hideTimeoutRef.current = null
        }
        
        // Calculate position for controls
        const headerRect = sectionHeader.getBoundingClientRect()
        const containerRect = container.getBoundingClientRect()
        
        const top = headerRect.top - containerRect.top
        const headerHeight = sectionHeader.offsetHeight
        const controlsHeight = 28
        
        // Position controls in the left padding area, center-aligned with header
        const negativeOffset = -75
        
        setControlsPosition({ 
          top: top + (headerHeight / 2) - (controlsHeight / 2),
          left: negativeOffset
        })
        setShowControls(true)
      } else if (!isHoveringHeader && !isInExpandedHoverZone && currentSectionHeader) {
        // Hide controls when moving away from expanded zone with increased delay
        currentSectionHeader = null
        hideTimeoutRef.current = setTimeout(() => {
          setHoveredSection(null)
          setShowControls(false)
        }, 500) // Increased delay from 200ms to 500ms
      }
    }

    const handleMouseLeave = (e: MouseEvent) => {
      const relatedTarget = e.relatedTarget as HTMLElement
      
      // Check if mouse is moving to the controls
      const isMovingToControls = controlsRef.current?.contains(relatedTarget)
      
      if (!isMovingToControls && (!relatedTarget || !container.contains(relatedTarget))) {
        hideTimeoutRef.current = setTimeout(() => {
          currentSectionHeader = null
          setHoveredSection(null)
          setShowControls(false)
        }, 500) // Increased delay to match mousemove handler
      }
    }

    container.addEventListener('mousemove', handleMouseMove)
    container.addEventListener('mouseleave', handleMouseLeave)

    return () => {
      container.removeEventListener('mousemove', handleMouseMove)
      container.removeEventListener('mouseleave', handleMouseLeave)
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current)
    }
  }, [containerRef, findSectionHeader])

  const handleAddNewSection = useCallback(() => {
    if (onSectionAdd && hoveredSection) {
      // Get the current section ID from the hovered section
      const sectionElement = hoveredSection.closest('[data-section-id]') as HTMLElement
      const sectionId = sectionElement?.getAttribute('data-section-id')
      
      if (sectionId) {
        onSectionAdd(sectionId)
      } else {
        // Fallback to adding at the end
        onSectionAdd()
      }
    }
  }, [onSectionAdd, hoveredSection])

  const getDragHandleProps = () => {
    if (!hoveredSection) return {}
    
    const sectionElement = hoveredSection.closest('[data-section-id]') as HTMLElement
    const sectionId = sectionElement?.getAttribute('data-section-id')
    
    if (!sectionId) return {}
    
    // Get the sortable section ref
    const sortableSectionRef = sectionRefs.current[sectionId]
    
    if (!sortableSectionRef) return {}
    
    // Get the drag handle props from the sortable section
    const dragHandleProps = sortableSectionRef.getDragHandleProps()
    
    return dragHandleProps
  }

  return (
    <>
      {/* Main Section Controls */}
      <AnimatePresence>
        {showControls && (
          <motion.div
            ref={controlsRef}
            className="section-block-controls absolute flex items-center gap-1 z-30"
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
                  setHoveredSection(null)
                  setShowControls(false)
                }, 500) // Increased delay for consistency
                return
              }
              
              // Check if going back to the expanded hover zone
              let isGoingToExpandedZone = false
              if (hoveredSection) {
                const headerRect = hoveredSection.getBoundingClientRect()
                const mouseX = e.clientX
                const mouseY = e.clientY
                
                const expandedZone = {
                  left: headerRect.left - 75,
                  right: headerRect.right,
                  top: headerRect.top,
                  bottom: headerRect.bottom
                }
                
                isGoingToExpandedZone = (
                  mouseX >= expandedZone.left &&
                  mouseX <= expandedZone.right &&
                  mouseY >= expandedZone.top &&
                  mouseY <= expandedZone.bottom
                )
              }
              
              const isGoingToContainer = containerRef.current?.contains(relatedTarget) && 
                                       !controlsRef.current?.contains(relatedTarget)
              
              if (!isGoingToContainer && !isGoingToExpandedZone) {
                // Hide controls if not going back to container or expanded zone
                hideTimeoutRef.current = setTimeout(() => {
                  setHoveredSection(null)
                  setShowControls(false)
                }, 500) // Increased delay for consistency
              }
            }}
          >
            {/* Add New Section Button */}
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
              onClick={handleAddNewSection}
              onMouseDown={(e) => e.preventDefault()}
              title="Add new section below"
            >
              <Plus className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
            </motion.button>

            {/* Drag Handle */}
            {enableDragHandle && (
              <motion.div
                className={cn(
                  "section-drag-handle",
                  "p-1.5 rounded-md cursor-move",
                  "bg-white dark:bg-gray-800",
                  "border border-gray-200 dark:border-gray-700",
                  "hover:bg-gray-50 dark:hover:bg-gray-700",
                  "shadow-sm hover:shadow-md",
                  "transition-all duration-150"
                )}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                title="Drag to reorder section"
                {...getDragHandleProps()}
              >
                <GripVertical className="h-3.5 w-3.5 text-gray-500 dark:text-gray-400" />
              </motion.div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}