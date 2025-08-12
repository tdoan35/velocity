import React, { useState, useCallback } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ChevronDown, ChevronRight, Check, Edit2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import type { FlexiblePRDSection } from '@/services/prdService'

interface SectionEditorProps {
  section: FlexiblePRDSection
  onUpdate: (sectionId: string, content: any) => Promise<void>
  isEditing?: boolean
  onEditingChange?: (editing: boolean) => void
}

export function SectionEditor({ 
  section, 
  onUpdate, 
  isEditing = false,
  onEditingChange 
}: SectionEditorProps) {
  const [isExpanded, setIsExpanded] = useState(true)
  const [isLocalEditing, setIsLocalEditing] = useState(isEditing)
  const [isSaving, setIsSaving] = useState(false)

  // Create editor for this specific section
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: getPlaceholderForSection(section.id)
      })
    ],
    content: formatSectionContent(section),
    editable: isLocalEditing,
    onUpdate: ({ editor }) => {
      // Auto-save on content change with debounce
      handleSave(editor.getHTML())
    }
  })

  const handleSave = useCallback(
    debounce(async (html: string) => {
      setIsSaving(true)
      try {
        const content = parseSectionContent(section.id, html)
        await onUpdate(section.id, content)
      } catch (error) {
        console.error('Failed to save section:', error)
      } finally {
        setIsSaving(false)
      }
    }, 1000),
    [section.id, onUpdate]
  )

  const toggleEdit = () => {
    const newEditState = !isLocalEditing
    setIsLocalEditing(newEditState)
    editor?.setEditable(newEditState)
    onEditingChange?.(newEditState)
  }

  const getStatusColor = () => {
    switch (section.status) {
      case 'completed': return 'text-green-500'
      case 'in_progress': return 'text-yellow-500'
      default: return 'text-gray-400'
    }
  }

  return (
    <Card className="mb-4 overflow-hidden">
      <div 
        className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <button className="p-1">
            {isExpanded ? <ChevronDown /> : <ChevronRight />}
          </button>
          <h3 className="text-lg font-semibold">{section.title}</h3>
          {section.required && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
              Required
            </span>
          )}
          <span className={`text-sm ${getStatusColor()}`}>
            {section.status === 'completed' && <Check className="w-4 h-4" />}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {section.agent.replace('_', ' ')}
          </span>
          <Button
            size="sm"
            variant={isLocalEditing ? "default" : "outline"}
            onClick={(e) => {
              e.stopPropagation()
              toggleEdit()
            }}
          >
            <Edit2 className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="border-t"
          >
            <div className="p-4">
              {isSaving && (
                <div className="text-xs text-gray-500 mb-2">Saving...</div>
              )}
              <EditorContent 
                editor={editor} 
                className={`prose max-w-none ${
                  isLocalEditing ? 'border rounded-lg p-4' : ''
                }`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  )
}

// Helper functions
function getPlaceholderForSection(sectionId: string): string {
  const placeholders: Record<string, string> = {
    overview: 'Describe your project vision, problem statement, and target users...',
    core_features: 'List the essential features that deliver core value...',
    additional_features: 'Describe nice-to-have features for future iterations...',
    ui_design_patterns: 'Define your design system, colors, and patterns...',
    ux_flows: 'Map out user journeys and interaction flows...',
    technical_architecture: 'Describe your tech stack and architecture...',
    tech_integrations: 'List third-party services and integrations...'
  }
  return placeholders[sectionId] || 'Add content for this section...'
}

function formatSectionContent(section: FlexiblePRDSection): string {
  if (!section.content || Object.keys(section.content).length === 0) {
    return ''
  }

  // Format content based on section type
  let html = ''
  switch (section.id) {
    case 'overview':
      if (section.content.vision) {
        html += `<h4>Vision</h4><p>${section.content.vision}</p>`
      }
      if (section.content.problem) {
        html += `<h4>Problem Statement</h4><p>${section.content.problem}</p>`
      }
      if (section.content.targetUsers?.length > 0) {
        html += '<h4>Target Users</h4><ul>'
        section.content.targetUsers.forEach((user: string) => {
          html += `<li>${user}</li>`
        })
        html += '</ul>'
      }
      break
    
    case 'core_features':
    case 'additional_features':
      if (section.content.features?.length > 0) {
        section.content.features.forEach((feature: any) => {
          html += `<h4>${feature.title}</h4><p>${feature.description}</p>`
        })
      }
      break
    
    default:
      // For other sections, display as is
      if (typeof section.content === 'string') {
        html = section.content
      } else {
        html = `<pre>${JSON.stringify(section.content, null, 2)}</pre>`
      }
  }
  
  return html
}

function parseSectionContent(sectionId: string, html: string): any {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  switch (sectionId) {
    case 'overview': {
      const content: any = {}
      const headers = Array.from(doc.querySelectorAll('h4'))
      
      headers.forEach(header => {
        const headerText = header.textContent?.toLowerCase()
        const nextElement = header.nextElementSibling
        
        if (headerText?.includes('vision') && nextElement) {
          content.vision = nextElement.textContent || ''
        } else if (headerText?.includes('problem') && nextElement) {
          content.problem = nextElement.textContent || ''
        } else if (headerText?.includes('target users')) {
          const list = header.nextElementSibling
          if (list?.tagName === 'UL') {
            content.targetUsers = Array.from(list.querySelectorAll('li'))
              .map(li => li.textContent || '')
          }
        }
      })
      return content
    }
    
    case 'core_features':
    case 'additional_features': {
      const features: any[] = []
      const headers = Array.from(doc.querySelectorAll('h4'))
      
      headers.forEach(header => {
        const title = header.textContent || ''
        const description = header.nextElementSibling?.textContent || ''
        features.push({ title, description })
      })
      
      return { features }
    }
    
    default:
      // For other sections, return raw text
      return doc.body.textContent || ''
  }
}

function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout
  return (...args: Parameters<T>) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => func(...args), wait)
  }
}