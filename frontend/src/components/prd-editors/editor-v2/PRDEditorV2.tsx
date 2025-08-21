import React, { useEffect, useCallback, useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import type { DropResult } from '@hello-pangea/dnd'
import { usePRDEditorStore } from './stores/prdEditorStoreSimple'
import { SectionEditor } from './SectionEditorV2Simple'
import { useDebounce } from '@/hooks/useDebounce'
import { Button } from '@/components/ui/button'
import { Plus, GripVertical, Save, FileDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface PRDEditorV2Props {
  prdId: string
  projectId: string
  className?: string
}

export const PRDEditorV2: React.FC<PRDEditorV2Props> = ({ 
  prdId, 
  projectId,
  className 
}) => {
  const {
    sections,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    lastSaved,
    initializePRD,
    reorderSections,
    addCustomSection,
    saveToBackend,
    getCompletionPercentage,
  } = usePRDEditorStore()

  const [showAddSection, setShowAddSection] = useState(false)
  const [newSectionTitle, setNewSectionTitle] = useState('')

  // Initialize PRD on mount
  useEffect(() => {
    if (prdId && projectId) {
      initializePRD(prdId, projectId)
    }
  }, [prdId, projectId, initializePRD])

  // Auto-save with debouncing
  const debouncedSave = useDebounce(saveToBackend, 2000)
  
  useEffect(() => {
    if (hasUnsavedChanges) {
      debouncedSave()
    }
  }, [hasUnsavedChanges, debouncedSave])

  // Handle drag and drop
  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) return
    
    reorderSections(result.source.index, result.destination.index)
  }, [reorderSections])

  // Handle adding custom section
  const handleAddSection = useCallback(() => {
    if (newSectionTitle.trim()) {
      addCustomSection(newSectionTitle.trim(), 'project_manager')
      setNewSectionTitle('')
      setShowAddSection(false)
    }
  }, [newSectionTitle, addCustomSection])

  // Export to markdown
  const handleExport = useCallback(() => {
    // TODO: Implement export functionality
    console.log('Exporting PRD to markdown...')
  }, [])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className={cn('prd-editor-v2 flex flex-col h-full', className)}>
      {/* Header */}
      <div className="flex-shrink-0 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold">Product Requirements Document</h2>
              <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                <span>Completion: {getCompletionPercentage()}%</span>
                {lastSaved && (
                  <span>Last saved: {new Date(lastSaved).toLocaleTimeString()}</span>
                )}
                {hasUnsavedChanges && !isSaving && (
                  <span className="text-yellow-600">Unsaved changes</span>
                )}
                {isSaving && (
                  <span className="text-blue-600 flex items-center gap-1">
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600"></div>
                    Saving...
                  </span>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => saveToBackend()}
                disabled={!hasUnsavedChanges || isSaving}
              >
                <Save className="h-4 w-4 mr-2" />
                Save
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
              >
                <FileDown className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto p-6">
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="sections">
              {(provided) => (
                <div
                  {...provided.droppableProps}
                  ref={provided.innerRef}
                  className="space-y-6"
                >
                  {sections.map((section, index) => (
                    <Draggable
                      key={section.id}
                      draggableId={section.id}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          className={cn(
                            'transition-all duration-200',
                            snapshot.isDragging && 'shadow-xl opacity-90'
                          )}
                        >
                          <div className="flex gap-2">
                            <div
                              {...provided.dragHandleProps}
                              className="flex items-center justify-center w-8 opacity-50 hover:opacity-100 cursor-move"
                            >
                              <GripVertical className="h-5 w-5" />
                            </div>
                            <div className="flex-1">
                              <SectionEditor
                                section={section}
                                isActive={false}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>

          {/* Add Section Button */}
          <div className="mt-6">
            {!showAddSection ? (
              <Button
                variant="outline"
                onClick={() => setShowAddSection(true)}
                className="w-full"
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Custom Section
              </Button>
            ) : (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newSectionTitle}
                  onChange={(e) => setNewSectionTitle(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddSection()}
                  placeholder="Enter section title..."
                  className="flex-1 px-3 py-2 border rounded-md"
                  autoFocus
                />
                <Button onClick={handleAddSection} disabled={!newSectionTitle.trim()}>
                  Add
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowAddSection(false)
                    setNewSectionTitle('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}