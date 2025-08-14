import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
// import Dropcursor from '@tiptap/extension-dropcursor' // Disabled - interferes with custom drag
import Gapcursor from '@tiptap/extension-gapcursor'
import { Button } from '@/components/ui/button'
import { SectionBlock, type SectionBlockProps, type SectionType } from './SectionBlock'
import { EnhancedBlockControls } from '../EnhancedBlockControls'
import { cn } from '@/lib/utils'
import { motion, AnimatePresence } from 'framer-motion'
import { useDragStore } from '@/stores/dragStateStore'
import { 
  getDragType, 
  setupContentDragData, 
  extractContentDragData, 
  dragDebug,
  validateDragOperation 
} from '@/utils/dragDetection'
import { useDragCleanup } from '@/hooks/useDragCleanup'
import { 
  Bold,
  Italic,
  Strikethrough,
  Code,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  CheckCircle2,
  Highlighter
} from 'lucide-react'

// Hybrid content model interface
export interface HybridContent {
  structuredData: any      // For backend/validation
  richContent: string       // TipTap HTML
  lastEditedIn: 'rich' | 'structured'
  version: number
}

export interface NotionSectionEditorProps extends Omit<SectionBlockProps, 'children'> {
  placeholder?: string
  enableSlashCommands?: boolean
  enableBubbleMenu?: boolean
  customCommands?: SlashCommand[]
  onContentSync?: (structured: any, rich: string) => void
  isDraggingSection?: boolean  // New prop to track when sections are being dragged
}

interface SlashCommand {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  action: (editor: Editor) => void
  keywords?: string[]
}

// Helper function to check if an object has actual content (not just empty arrays/objects)
const hasActualContent = (obj: any): boolean => {
  if (!obj || typeof obj !== 'object') return false
  
  // Check if any property has non-empty values
  return Object.keys(obj).some(key => {
    const value = obj[key]
    if (Array.isArray(value)) return value.length > 0
    if (typeof value === 'string') return value.trim().length > 0
    if (typeof value === 'object' && value !== null) return hasActualContent(value)
    return Boolean(value)
  })
}

// Content transformation utilities
const transformStructuredToRich = (type: SectionType, structured: any): string => {
  let html = ''
  
  switch (type) {
    case 'overview':
      // Handle simple description first
      if (structured?.description && typeof structured.description === 'string') {
        html += `<p>${structured.description}</p>`
      } else {
        // Handle structured format
        if (structured?.vision) {
          html += `<h3>Vision</h3><p>${structured.vision}</p>`
        }
        if (structured?.problem) {
          html += `<h3>Problem Statement</h3><p>${structured.problem}</p>`
        }
        if (structured?.targetUsers?.length > 0) {
          html += '<h3>Target Users</h3><ul>'
          structured.targetUsers.forEach((user: string) => {
            html += `<li>${user}</li>`
          })
          html += '</ul>'
        }
      }
      break
      
    case 'core_features':
    case 'additional_features':
      if (structured?.features?.length > 0) {
        structured.features.forEach((feature: any, index: number) => {
          html += `<h3>${index + 1}. ${feature.title || feature.name || 'Feature'}</h3>`
          html += `<p>${feature.description || ''}</p>`
          if (feature.priority) {
            html += `<p><em>Priority: ${feature.priority}</em></p>`
          }
        })
      }
      break
      
    case 'technical_architecture':
      if (structured?.platforms?.length > 0) {
        html += '<h3>Platforms</h3><ul>'
        structured.platforms.forEach((platform: string) => {
          html += `<li>${platform}</li>`
        })
        html += '</ul>'
      }
      if (structured?.techStack) {
        html += '<h3>Technology Stack</h3>'
        if (structured.techStack.frontend?.length > 0) {
          html += '<h4>Frontend</h4><ul>'
          structured.techStack.frontend.forEach((tech: string) => {
            html += `<li>${tech}</li>`
          })
          html += '</ul>'
        }
        if (structured.techStack.backend?.length > 0) {
          html += '<h4>Backend</h4><ul>'
          structured.techStack.backend.forEach((tech: string) => {
            html += `<li>${tech}</li>`
          })
          html += '</ul>'
        }
      }
      break
      
    case 'ui_design_patterns':
      if (structured?.patterns?.length > 0) {
        html += '<h3>Design Patterns</h3>'
        structured.patterns.forEach((pattern: any) => {
          html += `<h4>${pattern.name}</h4>`
          html += `<p>${pattern.description || ''}</p>`
          if (pattern.example) {
            html += `<p><em>Example: ${pattern.example}</em></p>`
          }
        })
      }
      if (structured?.designSystem) {
        html += `<h3>Design System</h3><p>${structured.designSystem}</p>`
      }
      if (structured?.colorScheme) {
        const hasColors = structured.colorScheme.primary || structured.colorScheme.secondary || 
                         structured.colorScheme.accent || structured.colorScheme.neutral?.length > 0
        if (hasColors) {
          html += '<h3>Color Scheme</h3>'
          if (structured.colorScheme.primary) {
            html += `<p><strong>Primary:</strong> ${structured.colorScheme.primary}</p>`
          }
          if (structured.colorScheme.secondary) {
            html += `<p><strong>Secondary:</strong> ${structured.colorScheme.secondary}</p>`
          }
          if (structured.colorScheme.accent) {
            html += `<p><strong>Accent:</strong> ${structured.colorScheme.accent}</p>`
          }
          if (structured.colorScheme.neutral?.length > 0) {
            html += '<p><strong>Neutral:</strong></p><ul>'
            structured.colorScheme.neutral.forEach((color: string) => {
              html += `<li>${color}</li>`
            })
            html += '</ul>'
          }
        }
      }
      if (structured?.typography) {
        const hasTypography = structured.typography.fontFamily || structured.typography.scale?.length > 0
        if (hasTypography) {
          html += '<h3>Typography</h3>'
          if (structured.typography.fontFamily) {
            html += `<p><strong>Font Family:</strong> ${structured.typography.fontFamily}</p>`
          }
          if (structured.typography.scale?.length > 0) {
            html += '<p><strong>Scale:</strong></p><ul>'
            structured.typography.scale.forEach((size: string) => {
              html += `<li>${size}</li>`
            })
            html += '</ul>'
          }
        }
      }
      if (structured?.components?.length > 0) {
        html += '<h3>Components</h3>'
        structured.components.forEach((component: any) => {
          html += `<h4>${component.name}</h4>`
          if (component.description) {
            html += `<p>${component.description}</p>`
          }
          if (component.usage) {
            html += `<p><em>Usage: ${component.usage}</em></p>`
          }
        })
      }
      break
      
    case 'ux_flows':
      if (structured?.userJourneys?.length > 0) {
        html += '<h3>User Journeys</h3>'
        structured.userJourneys.forEach((journey: any) => {
          html += `<h4>${journey.name}</h4>`
          html += `<p>${journey.description || ''}</p>`
          if (journey.persona) {
            html += `<p><em>Persona: ${journey.persona}</em></p>`
          }
          if (journey.steps?.length > 0) {
            html += '<ol>'
            journey.steps.forEach((step: string) => {
              html += `<li>${step}</li>`
            })
            html += '</ol>'
          }
        })
      }
      if (structured?.navigationStructure) {
        const hasNavigation = structured.navigationStructure.type || structured.navigationStructure.mainSections?.length > 0
        if (hasNavigation) {
          html += '<h3>Navigation Structure</h3>'
          if (structured.navigationStructure.type) {
            html += `<p><strong>Type:</strong> ${structured.navigationStructure.type}</p>`
          }
          if (structured.navigationStructure.mainSections?.length > 0) {
            html += '<p><strong>Main Sections:</strong></p><ul>'
            structured.navigationStructure.mainSections.forEach((section: string) => {
              html += `<li>${section}</li>`
            })
            html += '</ul>'
          }
        }
      }
      if (structured?.interactionPatterns?.length > 0) {
        html += '<h3>Interaction Patterns</h3>'
        structured.interactionPatterns.forEach((pattern: any) => {
          html += `<h4>${pattern.name}</h4>`
          html += `<p>${pattern.description}</p>`
        })
      }
      break
      
    case 'tech_integrations':
      if (structured?.integrations?.length > 0) {
        html += '<h3>Integrations</h3>'
        structured.integrations.forEach((integration: any) => {
          html += `<h4>${integration.name}</h4>`
          html += `<p><strong>Type:</strong> ${integration.type}</p>`
          html += `<p>${integration.purpose || ''}</p>`
          if (integration.configuration && Object.keys(integration.configuration).length > 0) {
            html += '<p><strong>Configuration:</strong></p>'
            html += '<pre>' + JSON.stringify(integration.configuration, null, 2) + '</pre>'
          }
        })
      }
      if (structured?.apis?.length > 0) {
        html += '<h3>APIs</h3>'
        structured.apis.forEach((api: any) => {
          html += `<h4>${api.name}</h4>`
          if (api.endpoint) {
            html += `<p><strong>Endpoint:</strong> <code>${api.endpoint}</code></p>`
          }
          if (api.authentication) {
            html += `<p><strong>Authentication:</strong> ${api.authentication}</p>`
          }
        })
      }
      if (structured?.environment) {
        const hasEnv = (structured.environment.development && Object.keys(structured.environment.development).length > 0) ||
                      (structured.environment.staging && Object.keys(structured.environment.staging).length > 0) ||
                      (structured.environment.production && Object.keys(structured.environment.production).length > 0)
        if (hasEnv) {
          html += '<h3>Environment Variables</h3>'
          if (structured.environment.development && Object.keys(structured.environment.development).length > 0) {
            html += '<h4>Development</h4>'
            html += '<pre>' + JSON.stringify(structured.environment.development, null, 2) + '</pre>'
          }
          if (structured.environment.staging && Object.keys(structured.environment.staging).length > 0) {
            html += '<h4>Staging</h4>'
            html += '<pre>' + JSON.stringify(structured.environment.staging, null, 2) + '</pre>'
          }
          if (structured.environment.production && Object.keys(structured.environment.production).length > 0) {
            html += '<h4>Production</h4>'
            html += '<pre>' + JSON.stringify(structured.environment.production, null, 2) + '</pre>'
          }
        }
      }
      break
      
    default:
      // For custom sections, only display JSON if there's actual content
      if (typeof structured === 'string') {
        html = `<p>${structured}</p>`
      } else if (hasActualContent(structured)) {
        html = '<pre>' + JSON.stringify(structured, null, 2) + '</pre>'
      }
      // Return empty string if no actual content so placeholder shows
  }
  
  return html || ''
}

const transformRichToStructured = (type: SectionType, html: string): any => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  // Check if content has structured elements (headings, lists, etc.)
  const hasStructuredElements = doc.querySelectorAll('h1, h2, h3, h4, h5, h6, ul, ol, table').length > 0
  
  switch (type) {
    case 'overview': {
      const result: any = {}
      
      // If no structured elements, treat as simple description
      if (!hasStructuredElements) {
        const textContent = doc.body.textContent?.trim()
        if (textContent && textContent.length > 0) {
          result.description = textContent
          return result
        }
        return {}
      }
      
      // Find Vision section
      const headings = Array.from(doc.querySelectorAll('h3'))
      const visionHeading = headings.find(h => h.textContent?.toLowerCase().includes('vision'))
      if (visionHeading) {
        const nextElement = visionHeading.nextElementSibling
        if (nextElement?.tagName === 'P') {
          result.vision = nextElement.textContent || ''
        }
      }
      
      // Find Problem Statement
      const problemHeading = headings.find(h => h.textContent?.toLowerCase().includes('problem'))
      if (problemHeading) {
        const nextElement = problemHeading.nextElementSibling
        if (nextElement?.tagName === 'P') {
          result.problem = nextElement.textContent || ''
        }
      }
      
      // Find Target Users
      const usersHeading = headings.find(h => h.textContent?.toLowerCase().includes('users'))
      if (usersHeading) {
        const nextElement = usersHeading.nextElementSibling
        if (nextElement?.tagName === 'UL') {
          result.targetUsers = Array.from(nextElement.querySelectorAll('li'))
            .map(li => li.textContent || '')
            .filter(text => text.length > 0)
        }
      }
      
      // If no structured content found but we have headings, add as description
      if (Object.keys(result).length === 0) {
        const textContent = doc.body.textContent?.trim()
        if (textContent && textContent.length > 0) {
          result.description = textContent
        }
      }
      
      return result
    }
    
    case 'core_features':
    case 'additional_features': {
      const features: any[] = []
      const headings = Array.from(doc.querySelectorAll('h3'))
      
      headings.forEach(heading => {
        const titleText = heading.textContent || ''
        // Skip section headers
        if (titleText.toLowerCase().includes('feature')) return
        
        const feature: any = {
          title: titleText.replace(/^\d+\.\s*/, ''),
          description: ''
        }
        
        let nextElement = heading.nextElementSibling
        while (nextElement && nextElement.tagName !== 'H3') {
          if (nextElement.tagName === 'P') {
            const text = nextElement.textContent || ''
            if (text.toLowerCase().startsWith('priority:')) {
              feature.priority = text.replace(/^priority:\s*/i, '').trim()
            } else if (!nextElement.querySelector('em')) {
              feature.description = text
            }
          }
          nextElement = nextElement.nextElementSibling
        }
        
        if (feature.title) {
          features.push(feature)
        }
      })
      
      return { features }
    }
    
    case 'technical_architecture': {
      const result: any = { platforms: [], techStack: {} }
      const headings = Array.from(doc.querySelectorAll('h3'))
      
      // Find Platforms
      const platformsHeading = headings.find(h => h.textContent?.toLowerCase().includes('platform'))
      if (platformsHeading) {
        const nextElement = platformsHeading.nextElementSibling
        if (nextElement?.tagName === 'UL') {
          result.platforms = Array.from(nextElement.querySelectorAll('li'))
            .map(li => li.textContent || '')
            .filter(text => text.length > 0)
        }
      }
      
      // Find Technology Stack
      const techStackHeading = headings.find(h => h.textContent?.toLowerCase().includes('technology stack'))
      if (techStackHeading) {
        let sibling = techStackHeading.nextElementSibling
        while (sibling && sibling.tagName !== 'H3') {
          if (sibling.tagName === 'H4') {
            const stackType = sibling.textContent?.toLowerCase()
            const list = sibling.nextElementSibling
            if (list?.tagName === 'UL') {
              const items = Array.from(list.querySelectorAll('li'))
                .map(li => li.textContent || '')
                .filter(text => text.length > 0)
              if (stackType?.includes('frontend')) {
                result.techStack.frontend = items
              } else if (stackType?.includes('backend')) {
                result.techStack.backend = items
              }
            }
          }
          sibling = sibling.nextElementSibling
        }
      }
      
      return result
    }
    
    case 'ui_design_patterns': {
      const result: any = {}
      const headings3 = Array.from(doc.querySelectorAll('h3'))
      const _headings4 = Array.from(doc.querySelectorAll('h4'))
      
      // Find Design Patterns
      const patternsHeading = headings3.find(h => h.textContent?.toLowerCase().includes('design patterns'))
      if (patternsHeading) {
        result.patterns = []
        let sibling = patternsHeading.nextElementSibling
        while (sibling && sibling.tagName !== 'H3') {
          if (sibling.tagName === 'H4') {
            const pattern: any = { name: sibling.textContent || '' }
            let next = sibling.nextElementSibling
            if (next?.tagName === 'P') {
              pattern.description = next.textContent || ''
              next = next.nextElementSibling
              if (next?.tagName === 'P' && next.textContent?.startsWith('Example:')) {
                pattern.example = next.textContent.replace(/^Example:\s*/i, '').trim()
              }
            }
            result.patterns.push(pattern)
          }
          sibling = sibling.nextElementSibling
        }
      }
      
      // Find Design System
      const designSystemHeading = headings3.find(h => h.textContent?.toLowerCase().includes('design system'))
      if (designSystemHeading) {
        const next = designSystemHeading.nextElementSibling
        if (next?.tagName === 'P') {
          result.designSystem = next.textContent || ''
        }
      }
      
      // Find Color Scheme
      const colorSchemeHeading = headings3.find(h => h.textContent?.toLowerCase().includes('color scheme'))
      if (colorSchemeHeading) {
        result.colorScheme = {}
        let sibling = colorSchemeHeading.nextElementSibling
        while (sibling && sibling.tagName !== 'H3') {
          if (sibling.tagName === 'P') {
            const text = sibling.textContent || ''
            if (text.includes('Primary:')) {
              result.colorScheme.primary = text.replace(/.*Primary:\s*/i, '').trim()
            } else if (text.includes('Secondary:')) {
              result.colorScheme.secondary = text.replace(/.*Secondary:\s*/i, '').trim()
            } else if (text.includes('Accent:')) {
              result.colorScheme.accent = text.replace(/.*Accent:\s*/i, '').trim()
            }
          }
          sibling = sibling.nextElementSibling
        }
      }
      
      return result
    }
    
    case 'ux_flows': {
      const result: any = {}
      const headings3 = Array.from(doc.querySelectorAll('h3'))
      
      // Find User Journeys
      const journeysHeading = headings3.find(h => h.textContent?.toLowerCase().includes('user journeys'))
      if (journeysHeading) {
        result.userJourneys = []
        let sibling = journeysHeading.nextElementSibling
        while (sibling && sibling.tagName !== 'H3') {
          if (sibling.tagName === 'H4') {
            const journey: any = { name: sibling.textContent || '' }
            let next = sibling.nextElementSibling
            if (next?.tagName === 'P') {
              journey.description = next.textContent || ''
              next = next.nextElementSibling
            }
            if (next?.tagName === 'P' && next.textContent?.includes('Persona:')) {
              journey.persona = next.textContent.replace(/.*Persona:\s*/i, '').trim()
              next = next.nextElementSibling
            }
            if (next?.tagName === 'OL') {
              journey.steps = Array.from(next.querySelectorAll('li'))
                .map(li => li.textContent || '')
                .filter(text => text.length > 0)
            }
            result.userJourneys.push(journey)
          }
          sibling = sibling.nextElementSibling
        }
      }
      
      // Find Navigation Structure
      const navHeading = headings3.find(h => h.textContent?.toLowerCase().includes('navigation structure'))
      if (navHeading) {
        result.navigationStructure = {}
        let sibling = navHeading.nextElementSibling
        while (sibling && sibling.tagName !== 'H3') {
          if (sibling.tagName === 'P') {
            const text = sibling.textContent || ''
            if (text.includes('Type:')) {
              result.navigationStructure.type = text.replace(/.*Type:\s*/i, '').trim()
            }
          } else if (sibling.tagName === 'UL') {
            result.navigationStructure.mainSections = Array.from(sibling.querySelectorAll('li'))
              .map(li => li.textContent || '')
              .filter(text => text.length > 0)
          }
          sibling = sibling.nextElementSibling
        }
      }
      
      return result
    }
    
    case 'tech_integrations': {
      const result: any = {}
      const headings3 = Array.from(doc.querySelectorAll('h3'))
      
      // Find Integrations
      const integrationsHeading = headings3.find(h => h.textContent?.toLowerCase().includes('integrations'))
      if (integrationsHeading) {
        result.integrations = []
        let sibling = integrationsHeading.nextElementSibling
        while (sibling && sibling.tagName !== 'H3') {
          if (sibling.tagName === 'H4') {
            const integration: any = { name: sibling.textContent || '' }
            let next = sibling.nextElementSibling
            while (next && next.tagName !== 'H4' && next.tagName !== 'H3') {
              if (next.tagName === 'P') {
                const text = next.textContent || ''
                if (text.includes('Type:')) {
                  integration.type = text.replace(/.*Type:\s*/i, '').trim()
                } else if (!text.includes('Configuration:')) {
                  integration.purpose = text
                }
              } else if (next.tagName === 'PRE') {
                try {
                  integration.configuration = JSON.parse(next.textContent || '{}')
                } catch {
                  // Invalid JSON, ignore
                }
              }
              next = next.nextElementSibling
            }
            result.integrations.push(integration)
          }
          sibling = sibling.nextElementSibling
        }
      }
      
      // Find APIs
      const apisHeading = headings3.find(h => h.textContent?.toLowerCase() === 'apis')
      if (apisHeading) {
        result.apis = []
        let sibling = apisHeading.nextElementSibling
        while (sibling && sibling.tagName !== 'H3') {
          if (sibling.tagName === 'H4') {
            const api: any = { name: sibling.textContent || '' }
            let next = sibling.nextElementSibling
            while (next && next.tagName !== 'H4' && next.tagName !== 'H3') {
              if (next.tagName === 'P') {
                const text = next.textContent || ''
                if (text.includes('Endpoint:')) {
                  api.endpoint = text.replace(/.*Endpoint:\s*/i, '').trim()
                } else if (text.includes('Authentication:')) {
                  api.authentication = text.replace(/.*Authentication:\s*/i, '').trim()
                }
              }
              next = next.nextElementSibling
            }
            result.apis.push(api)
          }
          sibling = sibling.nextElementSibling
        }
      }
      
      return result
    }
    
    default:
      // For custom sections, try to extract text content
      const textContent = doc.body.textContent || ''
      return textContent.trim() || {}
  }
}

// Section-specific placeholders
const getSectionPlaceholder = (type: SectionType): string => {
  const placeholders: Record<SectionType, string> = {
    overview: "Write your project vision, the problem you're solving, and who your target users are. Press '/' for formatting options...",
    core_features: "List the essential features that define your product's core value. Each feature should solve a key user problem...",
    additional_features: "Describe nice-to-have features that enhance the user experience but aren't critical for launch...",
    ui_design_patterns: "Define your visual design language, component library, color schemes, typography, and interaction patterns...",
    ux_flows: "Map out key user journeys, wireframes, and interaction flows. How will users navigate through your app?...",
    technical_architecture: "Describe your tech stack, system architecture, database design, API structure, and deployment strategy...",
    tech_integrations: "List third-party services, APIs, authentication providers, payment gateways, and other external dependencies...",
    custom: "Add any additional information relevant to your project..."
  }
  return placeholders[type] || "Start writing or press '/' for formatting options..."
}

// Section-specific slash commands
const getSectionCommands = (type: SectionType): SlashCommand[] => {
  const baseCommands: SlashCommand[] = [
    {
      id: 'heading1',
      label: 'Heading 1',
      icon: Heading1,
      action: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run()
    },
    {
      id: 'heading2',
      label: 'Heading 2',
      icon: Heading2,
      action: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run()
    },
    {
      id: 'heading3',
      label: 'Heading 3',
      icon: Heading3,
      action: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run()
    },
    {
      id: 'bulletList',
      label: 'Bullet List',
      icon: List,
      action: (editor) => editor.chain().focus().toggleBulletList().run()
    },
    {
      id: 'orderedList',
      label: 'Numbered List',
      icon: ListOrdered,
      action: (editor) => editor.chain().focus().toggleOrderedList().run()
    },
    {
      id: 'taskList',
      label: 'Task List',
      icon: CheckCircle2,
      action: (editor) => editor.chain().focus().toggleTaskList().run()
    },
    {
      id: 'quote',
      label: 'Quote',
      icon: Quote,
      action: (editor) => editor.chain().focus().toggleBlockquote().run()
    },
    {
      id: 'code',
      label: 'Code Block',
      icon: Code,
      action: (editor) => editor.chain().focus().toggleCodeBlock().run()
    }
  ]
  
  // Add section-specific commands
  switch (type) {
    case 'overview':
      return [
        {
          id: 'vision',
          label: 'Vision Statement',
          icon: Heading3,
          action: (editor) => {
            editor.chain()
              .focus()
              .insertContent('<h3>Vision</h3><p></p>')
              .run()
          }
        },
        {
          id: 'problem',
          label: 'Problem Statement',
          icon: Heading3,
          action: (editor) => {
            editor.chain()
              .focus()
              .insertContent('<h3>Problem Statement</h3><p></p>')
              .run()
          }
        },
        {
          id: 'users',
          label: 'Target Users',
          icon: Heading3,
          action: (editor) => {
            editor.chain()
              .focus()
              .insertContent('<h3>Target Users</h3><ul><li></li></ul>')
              .run()
          }
        },
        ...baseCommands
      ]
      
    case 'core_features':
    case 'additional_features':
      return [
        {
          id: 'feature',
          label: 'New Feature',
          icon: Heading3,
          action: (editor) => {
            const featureNum = editor.getHTML().match(/<h3>/g)?.length || 0
            editor.chain()
              .focus()
              .insertContent(`<h3>${featureNum + 1}. Feature Name</h3><p>Feature description...</p>`)
              .run()
          }
        },
        {
          id: 'priority',
          label: 'Priority Label',
          icon: Heading3,
          action: (editor) => {
            editor.chain()
              .focus()
              .insertContent('<p><em>Priority: High/Medium/Low</em></p>')
              .run()
          }
        },
        ...baseCommands
      ]
      
    default:
      return baseCommands
  }
}

// Section emojis for visual distinction
const getSectionEmoji = (type: SectionType): string => {
  const emojis: Record<SectionType, string> = {
    overview: '📋',
    core_features: '⭐',
    additional_features: '✨',
    ui_design_patterns: '🎨',
    ux_flows: '🗺️',
    technical_architecture: '🏗️',
    tech_integrations: '🔌',
    custom: '📝'
  }
  return emojis[type] || '📄'
}

export function NotionSectionEditor({
  id,
  type,
  title,
  content,
  ownership,
  isRequired,
  isExpanded = true,
  isEditable = true,
  isVisible = true,
  order,
  status,
  validationErrors,
  placeholder,
  enableSlashCommands = true,
  enableBubbleMenu = true,
  customCommands,
  onUpdate,
  onDelete,
  onDuplicate,
  onToggleVisibility,
  onToggleExpanded,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onContentSync,
  isDraggingSection: _isDraggingSection = false,
  className
}: NotionSectionEditorProps) {
  const [showSlashCommand, setShowSlashCommand] = useState(false)
  const [slashCommandPosition, setSlashCommandPosition] = useState({ top: 0, left: 0 })
  const [slashFilter, setSlashFilter] = useState('')
  const editorRef = useRef<HTMLDivElement>(null)
  
  // Use centralized drag state
  const { 
    type: dragType,
    sourceContainer,
    startContentDrag,
    resetDragState
  } = useDragStore()
  
  // Determine if content is being dragged within this section
  const isDraggingContent = dragType === 'content' && sourceContainer === id
  
  // Initialize drag cleanup system for this section
  useDragCleanup()
  
  // Initialize hybrid content
  const [hybridContent, setHybridContent] = useState<HybridContent>(() => ({
    structuredData: content || {},
    richContent: transformStructuredToRich(type, content || {}),
    lastEditedIn: 'structured',
    version: 1
  }))
  
  // Refs for tracking content updates and preventing loops
  const contentRef = useRef(content)
  const isExternalUpdate = useRef(false)
  const isInternalUpdate = useRef(false)
  
  // Get commands for this section type
  const commands = useMemo(() => 
    customCommands || getSectionCommands(type),
    [type, customCommands]
  )
  
  // Filter commands based on search
  const filteredCommands = useMemo(() => {
    if (!slashFilter) return commands
    const filter = slashFilter.toLowerCase()
    return commands.filter(cmd => 
      cmd.label.toLowerCase().includes(filter) ||
      cmd.keywords?.some(k => k.toLowerCase().includes(filter))
    )
  }, [commands, slashFilter])
  
  // Memoize extensions to prevent duplication warnings
  const extensions = useMemo(() => [
    StarterKit.configure({
      heading: {
        levels: [1, 2, 3],
        HTMLAttributes: {
          class: 'notion-heading'
        }
      },
      // Disable dropcursor and gapcursor from StarterKit to avoid duplication
      dropcursor: false,
      gapcursor: false
    }),
    Placeholder.configure({
      placeholder: placeholder || getSectionPlaceholder(type),
      emptyEditorClass: 'is-editor-empty',
      emptyNodeClass: 'is-empty',
      showOnlyWhenEditable: false  // Show placeholder even when not editable
    }),
    Typography,
    Highlight.configure({
      multicolor: false
    }),
    TaskList,
    TaskItem.configure({
      nested: true
    }),
    // DISABLE Dropcursor completely - it might interfere with our custom drag
    // Dropcursor shows a line where content will be dropped, but we handle this ourselves
    // ...(dragType === 'section' ? [] : [Dropcursor.configure({
    //   color: '#10b981',
    //   width: 2
    // })]),
    // Always include gapcursor for better UX
    Gapcursor
  ], [type, placeholder, dragType])
  
  // Initialize TipTap editor
  const editor = useEditor({
    extensions,
    content: hybridContent.richContent || undefined,
    editable: isEditable,  // Trust the isEditable prop from parent
    onUpdate: ({ editor }) => {
      // Prevent updates during external sync
      if (isExternalUpdate.current) return
      
      isInternalUpdate.current = true
      const html = editor.getHTML()
      const structured = transformRichToStructured(type, html)
      
      const newHybridContent: HybridContent = {
        structuredData: structured,
        richContent: html,
        lastEditedIn: 'rich',
        version: hybridContent.version + 1
      }
      
      setHybridContent(newHybridContent)
      onUpdate(id, structured)
      onContentSync?.(structured, html)
    },
    editorProps: {
      attributes: {
        class: 'notion-content focus:outline-none min-h-[100px]',
        'data-section-id': id,
        'data-section-type': type
      },
      // COMPLETELY DISABLE TIPTAP'S DRAG HANDLING
      // This prevents TipTap from interfering with our custom drag implementation
      handleDrop: () => false,  // Always return false to let browser handle it
      handleDragStart: () => false,  // Disable TipTap's drag start handling
      handleDrag: () => false,  // Disable TipTap's drag handling
      handleDragEnd: () => false,  // Disable TipTap's drag end handling
      handlePaste: () => false, // Also disable paste to avoid conflicts with drag/drop
      handleKeyDown: (view, event) => {
        // Handle slash command
        if (event.key === '/' && !showSlashCommand && enableSlashCommands) {
          const coords = view.coordsAtPos(view.state.selection.from)
          setSlashCommandPosition({
            top: coords.top + 25,
            left: coords.left
          })
          setShowSlashCommand(true)
          setSlashFilter('')
          return true
        }
        
        // Navigate slash menu
        if (showSlashCommand) {
          if (event.key === 'Escape') {
            setShowSlashCommand(false)
            setSlashFilter('')
            return true
          }
          
          if (event.key === 'Backspace' && slashFilter === '') {
            setShowSlashCommand(false)
            return false
          }
          
          // Let other keys update the filter
          if (event.key.length === 1) {
            setSlashFilter(prev => prev + event.key)
            return true
          }
        }
        
        return false
      }
    }
  })
  
  // Helper function to check if content has meaningful changes
  const hasSignificantContentChange = useCallback((oldContent: any, newContent: any): boolean => {
    // Deep comparison for objects
    if (typeof oldContent === 'object' && typeof newContent === 'object') {
      return JSON.stringify(oldContent) !== JSON.stringify(newContent)
    }
    return oldContent !== newContent
  }, [])
  
  // Sync content when it changes externally (only for significant changes)
  useEffect(() => {
    if (editor && !isInternalUpdate.current) {
      // Only update if content has significantly changed from external source
      if (hasSignificantContentChange(contentRef.current, content)) {
        isExternalUpdate.current = true
        const newRichContent = transformStructuredToRich(type, content || {})
        
        // Only update editor if the rich content is actually different
        const currentEditorContent = editor.getHTML()
        if (newRichContent !== currentEditorContent && newRichContent !== hybridContent.richContent) {
          editor.commands.setContent(newRichContent || '')
          setHybridContent({
            structuredData: content || {},
            richContent: newRichContent,
            lastEditedIn: 'structured',
            version: hybridContent.version + 1
          })
        }
        contentRef.current = content
        isExternalUpdate.current = false
      }
    }
    isInternalUpdate.current = false
  }, [content, type, editor, hasSignificantContentChange, hybridContent.richContent, hybridContent.version])
  
  // NOTE: Content drag & drop is now handled entirely by EnhancedBlockControls
  // This component only manages section-level operations
  
  const insertSlashCommand = useCallback((command: SlashCommand) => {
    if (!editor) return
    
    // Remove the slash and filter text
    const from = editor.state.selection.from - slashFilter.length - 1
    const to = editor.state.selection.from
    editor.commands.deleteRange({ from, to })
    
    // Execute the command action
    command.action(editor)
    
    setShowSlashCommand(false)
    setSlashFilter('')
  }, [editor, slashFilter])
  
  // Get emoji for section
  const emoji = getSectionEmoji(type)
  
  // Handle content-level drag events (delegated to EnhancedBlockControls)
  const handleContentDragStart = useCallback((e: React.DragEvent) => {
    // Prevent content drag if section is currently being dragged
    if (!validateDragOperation.canStartContentDrag(dragType)) {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    
    // Stop propagation to prevent section-level drag from triggering
    e.stopPropagation()
    
    // Update global state to indicate content drag
    startContentDrag('content', id)
    
    // Debug logging
    dragDebug.logDragStart('content', 'block', { section: id })
  }, [dragType, id, startContentDrag])

  const handleContentDragEnd = useCallback((e: React.DragEvent) => {
    // Stop propagation to keep drag isolated
    e.stopPropagation()
    
    // Reset global drag state
    resetDragState()
    
    // Debug logging
    dragDebug.logDragEnd('content', true)
  }, [resetDragState])

  const handleSectionDragStart = useCallback((e: React.DragEvent, draggedSectionId: string) => {
    // Only allow section drag if not dragging content
    if (dragType === 'content') {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    onDragStart?.(e, draggedSectionId)
  }, [dragType, onDragStart])

  const handleSectionDragOver = useCallback((e: React.DragEvent) => {
    // Only allow section drag over if not dragging content
    if (dragType === 'content') {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    onDragOver?.(e)
  }, [dragType, onDragOver])

  const handleSectionDrop = useCallback((e: React.DragEvent) => {
    // Only allow section drop if not dragging content
    if (dragType === 'content') {
      e.preventDefault()
      e.stopPropagation()
      return
    }
    onDrop?.(e, id)
  }, [dragType, onDrop])

  return (
    <SectionBlock
      id={id}
      type={type}
      title={`${emoji} ${title}`}
      content={hybridContent.structuredData}
      ownership={ownership}
      isRequired={isRequired}
      isExpanded={isExpanded}
      isEditable={isEditable}
      isVisible={isVisible}
      order={order}
      status={status}
      validationErrors={validationErrors}
      onUpdate={onUpdate}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
      onToggleVisibility={onToggleVisibility}
      onToggleExpanded={onToggleExpanded}
      onDragStart={handleSectionDragStart}
      onDragEnd={onDragEnd}
      onDragOver={handleSectionDragOver}
      onDrop={handleSectionDrop}
      className={className}
      hideCard={true}
    >
      <div ref={editorRef} className={cn(
        "relative",
        dragType === 'section' && "dragging-section",
        isDraggingContent && "dragging-content"
      )}>
        {/* Enhanced Block Controls */}
        {editor && (
          <EnhancedBlockControls 
            editor={editor} 
            containerRef={editorRef}
            sectionId={id}
            onContentDragStart={handleContentDragStart}
            onContentDragEnd={handleContentDragEnd}
            onBlockInsert={(type) => {
              console.log('Block inserted:', type)
            }}
          />
        )}
        
        <EditorContent 
          editor={editor} 
          className="notion-editor-content"
        />
        
        {/* Enhanced Bubble Menu for text formatting */}
        {editor && enableBubbleMenu && (
          <BubbleMenu 
            editor={editor}
            shouldShow={({ editor, state }) => {
              const { from, to } = state.selection
              return from !== to && !editor.isActive('link')
            }}
            className="bubble-menu-container flex items-center gap-1 p-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700"
          >
            {/* Text Formatting */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleBold().run()}
              data-active={editor.isActive('bold')}
            >
              <Bold className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleItalic().run()}
              data-active={editor.isActive('italic')}
            >
              <Italic className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleStrike().run()}
              data-active={editor.isActive('strike')}
            >
              <Strikethrough className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleHighlight().run()}
              data-active={editor.isActive('highlight')}
            >
              <Highlighter className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleCode().run()}
              data-active={editor.isActive('code')}
            >
              <Code className="h-3 w-3" />
            </Button>
            
            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
            
            {/* Headings */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
              data-active={editor.isActive('heading', { level: 1 })}
            >
              <Heading1 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
              data-active={editor.isActive('heading', { level: 2 })}
            >
              <Heading2 className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
              data-active={editor.isActive('heading', { level: 3 })}
            >
              <Heading3 className="h-3 w-3" />
            </Button>
            
            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
            
            {/* Lists */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleBulletList().run()}
              data-active={editor.isActive('bulletList')}
            >
              <List className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleOrderedList().run()}
              data-active={editor.isActive('orderedList')}
            >
              <ListOrdered className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleTaskList().run()}
              data-active={editor.isActive('taskList')}
            >
              <CheckCircle2 className="h-3 w-3" />
            </Button>
            
            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
            
            {/* Block Elements */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => editor.chain().focus().toggleBlockquote().run()}
              data-active={editor.isActive('blockquote')}
            >
              <Quote className="h-3 w-3" />
            </Button>
          </BubbleMenu>
        )}
        
        {/* Slash Command Menu */}
        <AnimatePresence>
          {showSlashCommand && enableSlashCommands && (
            <motion.div 
              className="absolute z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2 min-w-[200px] slash-command-menu"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.15 }}
              style={{ 
                top: slashCommandPosition.top, 
                left: slashCommandPosition.left,
                maxHeight: '300px',
                overflowY: 'auto'
              }}
            >
            {slashFilter && (
              <div className="px-3 py-1 text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700 mb-1">
                Searching: {slashFilter}
              </div>
            )}
            <div className="space-y-1">
              {filteredCommands.length > 0 ? (
                filteredCommands.map((command) => {
                  const Icon = command.icon
                  return (
                    <button
                      key={command.id}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                      onClick={() => insertSlashCommand(command)}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="text-sm">{command.label}</span>
                    </button>
                  )
                })
              ) : (
                <div className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No commands found
                </div>
              )}
            </div>
          </motion.div>
          )}
        </AnimatePresence>
      </div>
    </SectionBlock>
  )
}