import React, { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'

export function TestContentDrag() {
  useEffect(() => {
    // Add global event listeners for debugging
    const handleGlobalDragStart = (e: DragEvent) => {
      console.log('[Global] Drag started:', {
        target: e.target,
        dataTransfer: e.dataTransfer?.types
      })
    }
    
    const handleGlobalDragEnd = (e: DragEvent) => {
      console.log('[Global] Drag ended:', {
        target: e.target
      })
    }
    
    const handleGlobalDrop = (e: DragEvent) => {
      console.log('[Global] Drop occurred:', {
        target: e.target,
        dataTransfer: e.dataTransfer?.types
      })
    }
    
    document.addEventListener('dragstart', handleGlobalDragStart)
    document.addEventListener('dragend', handleGlobalDragEnd)
    document.addEventListener('drop', handleGlobalDrop)
    
    return () => {
      document.removeEventListener('dragstart', handleGlobalDragStart)
      document.removeEventListener('dragend', handleGlobalDragEnd)
      document.removeEventListener('drop', handleGlobalDrop)
    }
  }, [])
  
  return (
    <Card className="p-6 m-4">
      <h2 className="text-xl font-semibold mb-4">Content Drag & Drop Test</h2>
      <div className="space-y-2 text-sm">
        <p>✅ Drag handle setup fixed - using draggable="true" attribute</p>
        <p>✅ Data transfer format consistency - using both formats</p>
        <p>✅ Debug logging added - check console for drag events</p>
        <p>✅ DOM position resolution improved - with fallback</p>
        <p>✅ Visual feedback enhanced - better drop indicators</p>
      </div>
      
      <div className="mt-4 p-4 bg-gray-100 rounded">
        <h3 className="font-medium mb-2">Test Instructions:</h3>
        <ol className="list-decimal list-inside space-y-1 text-sm">
          <li>Create 3 lines of content in a section</li>
          <li>Hover over a line to see the drag handle</li>
          <li>Click and drag the handle to reorder</li>
          <li>Watch for green drop indicator line</li>
          <li>Check console for debug messages</li>
        </ol>
      </div>
      
      <div className="mt-4 p-4 bg-blue-50 rounded">
        <h4 className="font-medium mb-2">Expected Console Output:</h4>
        <pre className="text-xs bg-white p-2 rounded overflow-x-auto">
{`[EnhancedBlockControls] DragStart initiated
[EnhancedBlockControls] Found position: [number]
[EnhancedBlockControls] Drag data set: {...}
[EnhancedBlockControls] DragOver detected: {...}
[EnhancedBlockControls] Drop detected: {...}
[EnhancedBlockControls] Target position: [number]
[EnhancedBlockControls] Drop position: above/below
[EnhancedBlockControls] Move completed
[EnhancedBlockControls] DragEnd`}
        </pre>
      </div>
      
      <Button 
        className="mt-4"
        onClick={() => {
          // Test that the drag state is clean
          const dragElements = document.querySelectorAll('.is-dragging')
          const dropIndicators = document.querySelectorAll('.drop-active')
          console.log('Drag state check:', {
            draggingElements: dragElements.length,
            activeIndicators: dropIndicators.length
          })
          if (dragElements.length > 0 || dropIndicators.length > 0) {
            console.warn('Found stale drag state - cleaning up')
            dragElements.forEach(el => el.classList.remove('is-dragging'))
            dropIndicators.forEach(el => el.classList.remove('drop-active'))
          } else {
            console.log('✅ Drag state is clean')
          }
        }}
      >
        Check Drag State
      </Button>
    </Card>
  )
}