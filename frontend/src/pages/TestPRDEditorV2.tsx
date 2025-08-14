import React, { useEffect } from 'react'
import { PRDEditorV2 } from '@/components/prd/PRDEditorV2'
import { usePRDEditorStore } from '@/stores/prdEditorStoreSimple'
import { Button } from '@/components/ui/button'
import { RotateCcw, Database, FileJson } from 'lucide-react'

// Mock PRD data for testing
const mockPRDSections = [
  {
    id: 'overview',
    title: '📋 Overview',
    order: 0,
    agent: 'project_manager' as const,
    required: true,
    content: {
      editorJSON: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Vision' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Build a revolutionary note-taking application that eliminates content duplication issues.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Problem Statement' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Current PRD editors suffer from content duplication when saving and loading, causing confusion and data corruption.',
              },
            ],
          },
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Target Users' }],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Product Managers' }],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Software Developers' }],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'UX Designers' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    status: 'in_progress' as const,
    isCustom: false,
    description: 'Project vision, problem statement, and target users',
    metadata: {
      lastModified: new Date().toISOString(),
      version: 1,
    },
  },
  {
    id: 'core_features',
    title: '✨ Core Features',
    order: 1,
    agent: 'project_manager' as const,
    required: true,
    content: {
      editorJSON: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Core Features' }],
          },
          {
            type: 'taskList',
            content: [
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Isolated section editors: Each section has its own TipTap instance',
                      },
                    ],
                  },
                ],
              },
              {
                type: 'taskItem',
                attrs: { checked: true },
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'JSON-first storage: No more HTML parsing issues',
                      },
                    ],
                  },
                ],
              },
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Real-time collaboration: Multiple users can edit simultaneously',
                      },
                    ],
                  },
                ],
              },
              {
                type: 'taskItem',
                attrs: { checked: false },
                content: [
                  {
                    type: 'paragraph',
                    content: [
                      {
                        type: 'text',
                        text: 'Version history: Track all changes with rollback capability',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    status: 'in_progress' as const,
    isCustom: false,
    description: 'Essential features that define the core product value',
    metadata: {
      lastModified: new Date().toISOString(),
      version: 2,
    },
  },
  {
    id: 'technical_architecture',
    title: '🏗️ Technical Architecture',
    order: 2,
    agent: 'engineering_assistant' as const,
    required: true,
    content: {
      editorJSON: {
        type: 'doc',
        content: [
          {
            type: 'heading',
            attrs: { level: 3 },
            content: [{ type: 'text', text: 'Technology Stack' }],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'bold' }],
                text: 'Frontend:',
              },
            ],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'React with TypeScript' }],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'TipTap Editor (isolated instances)' }],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Zustand for state management' }],
                  },
                ],
              },
            ],
          },
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                marks: [{ type: 'bold' }],
                text: 'Backend:',
              },
            ],
          },
          {
            type: 'bulletList',
            content: [
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Supabase Edge Functions' }],
                  },
                ],
              },
              {
                type: 'listItem',
                content: [
                  {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'PostgreSQL with JSONB' }],
                  },
                ],
              },
            ],
          },
        ],
      },
    },
    status: 'pending' as const,
    isCustom: false,
    description: 'System architecture, technology stack, and implementation approach',
    metadata: {
      lastModified: new Date().toISOString(),
      version: 1,
    },
  },
]

export default function TestPRDEditorV2() {
  const { loadSections, sections, reset, getCompletionPercentage } = usePRDEditorStore()

  // Load mock data on mount
  useEffect(() => {
    loadSections(mockPRDSections)
  }, [])

  const handleReset = () => {
    reset()
    setTimeout(() => {
      loadSections(mockPRDSections)
    }, 100)
  }

  const handleShowJSON = () => {
    console.log('Current sections state:', JSON.stringify(sections, null, 2))
    alert('Check console for current JSON state')
  }

  const handleShowStructured = () => {
    const structuredData = sections.map((section) => ({
      id: section.id,
      title: section.title,
      status: section.status,
      contentPreview: section.content.editorJSON
        ? JSON.stringify(section.content.editorJSON).substring(0, 100) + '...'
        : 'No content',
    }))
    console.log('Structured data:', structuredData)
    alert('Check console for structured data')
  }

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Test Controls */}
      <div className="border-b bg-muted/50 p-4">
        <div className="max-w-5xl mx-auto">
          <h1 className="text-2xl font-bold mb-4">PRD Editor V2 - Proof of Concept</h1>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              <p>✅ Isolated TipTap editors per section</p>
              <p>✅ JSON-first content storage</p>
              <p>✅ No HTML parsing or duplication issues</p>
              <p>✅ Drag-and-drop section reordering</p>
              <p>Completion: {getCompletionPercentage()}%</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset Data
              </Button>
              <Button variant="outline" size="sm" onClick={handleShowJSON}>
                <FileJson className="h-4 w-4 mr-2" />
                Show JSON
              </Button>
              <Button variant="outline" size="sm" onClick={handleShowStructured}>
                <Database className="h-4 w-4 mr-2" />
                Show Structured
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* PRD Editor */}
      <div className="flex-1 overflow-hidden">
        <PRDEditorV2
          prdId="test-prd-123"
          projectId="test-project-456"
          className="h-full"
        />
      </div>
    </div>
  )
}