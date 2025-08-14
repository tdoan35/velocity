import { useEffect, useRef } from 'react'
import { useDragStore } from '@/stores/dragStateStore'
import { dragDebug } from '@/utils/dragDetection'

/**
 * Comprehensive cleanup system for drag operations
 * Provides multiple layers of cleanup to ensure drag state is always reset
 */
export const useDragCleanup = () => {
  const { type: dragType, resetDragState } = useDragStore()
  const cleanupTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const lastDragTypeRef = useRef<string>('none')

  useEffect(() => {
    // Track drag type changes for debugging
    if (lastDragTypeRef.current !== dragType) {
      if (dragType !== 'none') {
        dragDebug.logDragStart(dragType as any, 'unknown', { source: 'useDragCleanup' })
      } else if (lastDragTypeRef.current !== 'none') {
        dragDebug.logDragEnd(lastDragTypeRef.current as any, true)
      }
      lastDragTypeRef.current = dragType
    }

    // Global cleanup on window events
    const handleWindowDragEnd = (e: DragEvent) => {
      // Only cleanup if this is actually our drag
      if (dragType !== 'none') {
        dragDebug.logDragEnd(dragType as any, false)
        resetDragState()
      }
    }
    
    // REMOVED handleWindowMouseUp - this was killing drags prematurely
    // Mouse up is a normal part of drag operations and shouldn't trigger cleanup
    
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dragType !== 'none') {
        e.preventDefault()
        dragDebug.logDragEnd(dragType as any, false)
        resetDragState()
      }
    }
    
    const handleVisibilityChange = () => {
      if (document.hidden && dragType !== 'none') {
        // Page lost focus, cleanup drag state
        dragDebug.logDragEnd(dragType as any, false)
        resetDragState()
      }
    }

    // Add event listeners (removed mouseup listener)
    window.addEventListener('dragend', handleWindowDragEnd, { capture: true })
    document.addEventListener('keydown', handleEscape)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    
    // Cleanup previous timeout
    if (cleanupTimeoutRef.current) {
      clearTimeout(cleanupTimeoutRef.current)
    }
    
    // Set fallback cleanup timer when drag starts
    if (dragType !== 'none') {
      cleanupTimeoutRef.current = setTimeout(() => {
        if (dragType !== 'none') {
          dragDebug.logError('Fallback cleanup triggered - drag state was not properly reset', { dragType })
          resetDragState()
        }
      }, 15000) // 15 second fallback
    }
    
    // Cleanup function
    return () => {
      window.removeEventListener('dragend', handleWindowDragEnd, { capture: true })
      document.removeEventListener('keydown', handleEscape)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current)
        cleanupTimeoutRef.current = null
      }
    }
  }, [dragType, resetDragState])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (dragType !== 'none') {
        dragDebug.logDragEnd(dragType as any, false)
        resetDragState()
      }
      
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current)
      }
    }
  }, []) // Empty dependency array for unmount only

  // Return cleanup function for manual use
  return {
    manualCleanup: () => {
      if (dragType !== 'none') {
        dragDebug.logDragEnd(dragType as any, false)
        resetDragState()
      }
    },
    isDragging: dragType !== 'none',
    dragType
  }
}