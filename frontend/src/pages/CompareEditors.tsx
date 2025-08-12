import React, { useState } from 'react'
import { NotionPRDEditor } from '@/components/prd/NotionPRDEditor'
import { EnhancedBlockBasedPRDEditor } from '@/components/prd/BlockBasedPRDEditor.enhanced'
import { NotionPRDEditorEnhanced } from '@/components/prd/NotionPRDEditor.enhanced'
import { Button } from '@/components/ui/button'

export function CompareEditors() {
  const [editorType, setEditorType] = useState<'original' | 'block' | 'enhanced'>('enhanced')
  const projectId = 'cf11334e-4483-4802-b6d8-224e59988d35' // Using the Fitness Tracker project
  
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
          </div>
        </div>
        
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