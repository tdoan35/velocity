import React, { useState, useEffect } from 'react'
import { NotionPRDEditor } from '@/components/prd/NotionPRDEditor'
import { EnhancedBlockBasedPRDEditor } from '@/components/prd/BlockBasedPRDEditor.enhanced'
import { NotionPRDEditorEnhanced } from '@/components/prd/NotionPRDEditor.enhanced'
import { PRDEditorV2 } from '@/components/prd/PRDEditorV2'
import { usePRDEditorStore } from '@/stores/prdEditorStoreSimple'
import { Button } from '@/components/ui/button'
import { TestContentDrag } from '@/components/test/TestContentDrag'

export function CompareEditors() {
  const [editorType, setEditorType] = useState<'original' | 'block' | 'enhanced' | 'v2'>('v2')
  const projectId = 'cf11334e-4483-4802-b6d8-224e59988d35' // Using the Fitness Tracker project
  const { loadSections } = usePRDEditorStore()
  
  // Load mock sections for V2 editor when it's selected
  useEffect(() => {
    if (editorType === 'v2') {
      // Load with default sections from the store
      loadSections([])
    }
  }, [editorType, loadSections])
  
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-7xl mx-auto">
        <div className="mb-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold">Editor Comparison</h1>
          <div className="flex gap-2">
            <Button 
              onClick={() => setEditorType('original')}
              variant={editorType === 'original' ? "default" : "outline"}
            >
              Original NotionPRDEditor
            </Button>
            <Button 
              onClick={() => setEditorType('block')}
              variant={editorType === 'block' ? "default" : "outline"}
            >
              BlockBasedPRDEditor
            </Button>
            <Button 
              onClick={() => setEditorType('enhanced')}
              variant={editorType === 'enhanced' ? "default" : "outline"}
            >
              Enhanced NotionPRDEditor
            </Button>
            <Button 
              onClick={() => setEditorType('v2')}
              variant={editorType === 'v2' ? "default" : "outline"}
            >
              PRD Editor V2 (Isolated)
            </Button>
          </div>
        </div>
        
        {/* Test Component for Drag & Drop */}
        <TestContentDrag />
        
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg overflow-hidden" style={{ height: '80vh' }}>
          {editorType === 'original' ? (
            <div className="h-full">
              <h2 className="p-4 bg-blue-50 dark:bg-blue-900/20 text-lg font-semibold">
                Original NotionPRDEditor (Single Document)
              </h2>
              <NotionPRDEditor projectId={projectId} />
            </div>
          ) : editorType === 'block' ? (
            <div className="h-full">
              <h2 className="p-4 bg-green-50 dark:bg-green-900/20 text-lg font-semibold">
                BlockBasedPRDEditor (Section Cards)
              </h2>
              <EnhancedBlockBasedPRDEditor projectId={projectId} />
            </div>
          ) : editorType === 'v2' ? (
            <div className="h-full">
              <h2 className="p-4 bg-orange-50 dark:bg-orange-900/20 text-lg font-semibold">
                PRD Editor V2 (Isolated TipTap Instances - No Duplication)
              </h2>
              <PRDEditorV2 
                prdId="test-prd-123" 
                projectId={projectId}
                className="h-[calc(100%-60px)]"
              />
            </div>
          ) : (
            <div className="h-full">
              <h2 className="p-4 bg-purple-50 dark:bg-purple-900/20 text-lg font-semibold">
                Enhanced NotionPRDEditor (Unified with Section Management)
              </h2>
              <NotionPRDEditorEnhanced projectId={projectId} />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}