import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useEditor, EditorContent, Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import { motion, AnimatePresence } from 'framer-motion'
import Placeholder from '@tiptap/extension-placeholder'
import Typography from '@tiptap/extension-typography'
import Highlight from '@tiptap/extension-highlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Dropcursor from '@tiptap/extension-dropcursor'
import Gapcursor from '@tiptap/extension-gapcursor'
import { Button } from '@/components/ui/button'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import { 
  FileText, 
  Download, 
  ArrowLeft,
  Loader2,
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
  GripVertical,
  Plus,
  Trash2,
  Copy,
  MoreVertical,
  ChevronRight,
  PanelRight,
  Save,
  RotateCcw
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { type FlexiblePRDSection, type AgentType } from '@/services/prdService'
import { type SectionType } from '@/components/prd/blocks/SectionBlock'
import { BlockControls } from '@/components/prd/BlockControls'
import { PRDStatusBadge } from '@/components/prd/PRDStatusBadge'
import '@/styles/notion-editor.css'

interface NotionPRDEditorEnhancedProps {
  projectId: string
  className?: string
}

// Section icons mapping
const sectionIcons: Record<string, string> = {
  overview: '📋',
  core_features: '✨',
  additional_features: '➕',
  ui_design_patterns: '🎨',
  ux_flows: '🔄',
  technical_architecture: '🏗️',
  tech_integrations: '🔌',
  custom: '📝'
}

// Get section type from FlexiblePRDSection
const getSectionType = (section: FlexiblePRDSection): SectionType => {
  // Map section ID to type - using ID as a proxy for type
  const typeMap: Record<string, SectionType> = {
    'overview': 'overview',
    'core_features': 'core_features',
    'additional_features': 'additional_features',
    'ui_design_patterns': 'ui_design_patterns',
    'ux_flows': 'ux_flows',
    'technical_architecture': 'technical_architecture',
    'tech_integrations': 'tech_integrations'
  }
  return typeMap[section.id] || 'custom'
}

// Clean HTML content by removing duplicates more aggressively
const cleanHTMLContent = (html: string): string => {
  if (!html || typeof html !== 'string') return ''
  
  try {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    
    // Strategy 1: Remove duplicate section wrappers based on data-section-id
    const sectionWrappers = Array.from(doc.querySelectorAll('[data-section-id]'))
    const seenSectionIds = new Set<string>()
    sectionWrappers.forEach(wrapper => {
      const sectionId = wrapper.getAttribute('data-section-id')
      if (sectionId && seenSectionIds.has(sectionId)) {
        wrapper.remove()
      } else if (sectionId) {
        seenSectionIds.add(sectionId)
      }
    })
    
    // Strategy 2: Remove duplicate headers (h1, h2, h3) and their content
    const allHeaders = Array.from(doc.querySelectorAll('h1, h2, h3'))
    const seenHeaderTexts = new Map<string, Element>()
    const elementsToRemove: Element[] = []
    
    allHeaders.forEach(header => {
      const headerText = header.textContent?.trim() || ''
      const headerLevel = header.tagName.toLowerCase()
      const headerKey = `${headerLevel}:${headerText}`
      
      if (seenHeaderTexts.has(headerKey)) {
        // This is a duplicate - mark for removal along with its content
        elementsToRemove.push(header)
        
        // Collect all siblings until next header of same or higher level
        let nextSibling = header.nextElementSibling
        while (nextSibling) {
          const isHeader = /^H[1-3]$/i.test(nextSibling.tagName)
          if (isHeader) {
            // Check if this is a header of same or higher level
            const nextLevel = parseInt(nextSibling.tagName.charAt(1))
            const currentLevel = parseInt(headerLevel.charAt(1))
            if (nextLevel <= currentLevel) break
          }
          elementsToRemove.push(nextSibling)
          nextSibling = nextSibling.nextElementSibling
        }
      } else {
        seenHeaderTexts.set(headerKey, header)
      }
    })
    
    // Strategy 3: Remove duplicate divs with identical content
    const contentDivs = Array.from(doc.querySelectorAll('div'))
    const seenDivContents = new Map<string, Element>()
    
    contentDivs.forEach(div => {
      // Skip if already marked for removal
      if (elementsToRemove.includes(div)) return
      
      // Create a normalized content signature
      const contentSignature = div.innerHTML.trim()
        .replace(/\s+/g, ' ') // Normalize whitespace
        .replace(/data-[\w-]+="[^"]*"/g, '') // Remove data attributes
        .replace(/class="[^"]*"/g, '') // Remove class attributes
        .replace(/style="[^"]*"/g, '') // Remove style attributes
        .replace(/id="[^"]*"/g, '') // Remove id attributes
      
      if (contentSignature.length > 50) { // Only check substantial content
        if (seenDivContents.has(contentSignature)) {
          elementsToRemove.push(div)
        } else {
          seenDivContents.set(contentSignature, div)
        }
      }
    })
    
    // Remove all marked elements
    elementsToRemove.forEach(el => {
      try {
        el.remove()
      } catch (e) {
        console.warn('Failed to remove element:', e)
      }
    })
    
    // Strategy 4: Clean up empty wrapper divs
    const emptyDivs = Array.from(doc.querySelectorAll('div'))
      .filter(div => {
        const content = div.textContent?.trim() || ''
        const hasOnlyWhitespace = content === ''
        const hasNoChildren = div.children.length === 0
        return hasOnlyWhitespace && hasNoChildren
      })
    
    emptyDivs.forEach(div => div.remove())
    
    // Log cleanup statistics
    console.log('HTML Cleanup Stats:', {
      duplicateSections: seenSectionIds.size > 0 ? sectionWrappers.length - seenSectionIds.size : 0,
      duplicateHeaders: elementsToRemove.filter(el => /^H[1-3]$/i.test(el.tagName)).length,
      duplicateDivs: seenDivContents.size > 0 ? contentDivs.length - seenDivContents.size : 0,
      emptyDivs: emptyDivs.length,
      totalRemoved: elementsToRemove.length + emptyDivs.length
    })
    
    return doc.body.innerHTML
  } catch (e) {
    console.error('Error cleaning HTML:', e)
    return html
  }
}

// Transform structured section data to HTML for TipTap
const transformSectionToHTML = (section: FlexiblePRDSection): string => {
  let html = ''
  const sectionType = getSectionType(section)
  
  // Add section wrapper to prevent duplication
  html += `<div class="prd-section" data-section-id="${section.id}" data-section-order="${section.order}">`
  
  // Add section header with icon and ID for tracking
  html += `<h2 id="section-${section.id}" class="section-header">`
  html += `${sectionIcons[sectionType] || '📝'} ${section.title}`
  html += '</h2>'
  
  // Check if content is raw HTML saved from editor
  if (section.content?.content && typeof section.content.content === 'string') {
    const rawContent = section.content.content
    
    // Check if this HTML already contains a section wrapper for this section
    const parser = new DOMParser()
    const doc = parser.parseFromString(rawContent, 'text/html')
    const existingWrapper = doc.querySelector(`[data-section-id="${section.id}"]`)
    
    if (existingWrapper) {
      // Content already has a wrapper, return as-is to prevent double-wrapping
      return rawContent
    }
    
    // Content needs wrapping - clean it first to remove any embedded duplicates
    const cleanedContent = cleanHTMLContent(rawContent)
    html += cleanedContent
    if (!cleanedContent.includes('section-divider')) {
      html += '<div class="section-divider"></div>'
    }
    html += '</div>' // Close section wrapper
    return html
  }
  
  // If section has no content or empty content, add a placeholder paragraph
  if (!section.content || (typeof section.content === 'object' && Object.keys(section.content).length === 0)) {
    html += '<p><em>Section content to be added...</em></p>'
    html += '<div class="section-divider"></div>'
    return html
  }
  
  // Transform content based on section type
  switch (sectionType) {
    case 'overview':
      if (section.content?.vision) {
        html += '<h3>Vision</h3>'
        html += `<p>${section.content.vision}</p>`
      }
      if (section.content?.problem) {
        html += '<h3>Problem Statement</h3>'
        html += `<p>${section.content.problem}</p>`
      }
      if (section.content?.targetUsers?.length > 0) {
        html += '<h3>Target Users</h3>'
        html += '<ul>'
        section.content.targetUsers.forEach((user: string) => {
          html += `<li>${user}</li>`
        })
        html += '</ul>'
      }
      break
      
    case 'core_features':
    case 'additional_features':
      if (section.content?.features?.length > 0) {
        section.content.features.forEach((feature: any, index: number) => {
          html += `<h3>${index + 1}. ${feature.title || feature.name || 'Feature'}</h3>`
          html += `<p>${feature.description || ''}</p>`
          if (feature.priority) {
            html += `<p class="feature-priority"><em>Priority: ${feature.priority}</em></p>`
          }
        })
      }
      break
      
    case 'technical_architecture':
      if (section.content?.platforms?.length > 0) {
        html += '<h3>Platforms</h3>'
        html += '<ul>'
        section.content.platforms.forEach((platform: string) => {
          html += `<li>${platform}</li>`
        })
        html += '</ul>'
      }
      if (section.content?.techStack) {
        html += '<h3>Technology Stack</h3>'
        if (section.content.techStack.frontend?.length > 0) {
          html += '<h4>Frontend</h4>'
          html += '<ul>'
          section.content.techStack.frontend.forEach((tech: string) => {
            html += `<li>${tech}</li>`
          })
          html += '</ul>'
        }
        if (section.content.techStack.backend?.length > 0) {
          html += '<h4>Backend</h4>'
          html += '<ul>'
          section.content.techStack.backend.forEach((tech: string) => {
            html += `<li>${tech}</li>`
          })
          html += '</ul>'
        }
      }
      break
      
    case 'ui_design_patterns':
      // Check if there's any content at all
      const hasUIContent = section.content?.patterns?.length > 0 || 
                          section.content?.designSystem || 
                          section.content?.accessibility?.length > 0
      
      if (!hasUIContent) {
        html += '<p><em>UI design patterns and guidelines to be defined...</em></p>'
      } else {
        if (section.content?.patterns?.length > 0) {
          html += '<h3>Design Patterns</h3>'
          html += '<ul>'
          section.content.patterns.forEach((pattern: string) => {
            html += `<li>${pattern}</li>`
          })
          html += '</ul>'
        }
        if (section.content?.designSystem) {
          html += '<h3>Design System</h3>'
          if (section.content.designSystem.colors && Object.keys(section.content.designSystem.colors).length > 0) {
            html += '<h4>Colors</h4>'
            html += '<ul>'
            Object.entries(section.content.designSystem.colors).forEach(([key, value]) => {
              html += `<li><strong>${key}:</strong> ${value}</li>`
            })
            html += '</ul>'
          }
          if (section.content.designSystem.typography && Object.keys(section.content.designSystem.typography).length > 0) {
            html += '<h4>Typography</h4>'
            html += '<ul>'
            Object.entries(section.content.designSystem.typography).forEach(([key, value]) => {
              html += `<li><strong>${key}:</strong> ${value}</li>`
            })
            html += '</ul>'
          }
          if (section.content.designSystem.spacing && Object.keys(section.content.designSystem.spacing).length > 0) {
            html += '<h4>Spacing</h4>'
            html += '<ul>'
            Object.entries(section.content.designSystem.spacing).forEach(([key, value]) => {
              html += `<li><strong>${key}:</strong> ${value}</li>`
            })
            html += '</ul>'
          }
          if (section.content.designSystem.components?.length > 0) {
            html += '<h4>Components</h4>'
            html += '<ul>'
            section.content.designSystem.components.forEach((component: any) => {
              if (typeof component === 'string') {
                html += `<li>${component}</li>`
              } else if (component.name) {
                html += `<li><strong>${component.name}</strong>${component.description ? `: ${component.description}` : ''}</li>`
              }
            })
            html += '</ul>'
          }
        }
        if (section.content?.accessibility?.length > 0) {
          html += '<h3>Accessibility Guidelines</h3>'
          html += '<ul>'
          section.content.accessibility.forEach((guideline: string) => {
            html += `<li>${guideline}</li>`
          })
          html += '</ul>'
        }
      }
      break
      
    case 'ux_flows':
      // Check if there's any UX content
      const hasUXContent = section.content?.userJourneys?.length > 0 ||
                          section.content?.navigationStructure ||
                          section.content?.interactionPatterns?.length > 0 ||
                          section.content?.responsiveStrategy
      
      if (!hasUXContent) {
        html += '<p><em>User experience flows and journeys to be defined...</em></p>'
      } else {
        if (section.content?.userJourneys?.length > 0) {
          html += '<h3>User Journeys</h3>'
          section.content.userJourneys.forEach((journey: any, index: number) => {
            if (typeof journey === 'string') {
              html += `<p>${index + 1}. ${journey}</p>`
            } else if (journey.title || journey.name) {
              html += `<h4>${index + 1}. ${journey.title || journey.name}</h4>`
              if (journey.steps?.length > 0) {
                html += '<ol>'
                journey.steps.forEach((step: string) => {
                  html += `<li>${step}</li>`
                })
                html += '</ol>'
              } else if (journey.description) {
                html += `<p>${journey.description}</p>`
              }
            }
          })
        }
        if (section.content?.navigationStructure) {
          html += '<h3>Navigation Structure</h3>'
          if (typeof section.content.navigationStructure === 'string') {
            html += `<p>${section.content.navigationStructure}</p>`
          } else if (Object.keys(section.content.navigationStructure).length > 0) {
            html += '<ul>'
            Object.entries(section.content.navigationStructure).forEach(([key, value]) => {
              html += `<li><strong>${key}:</strong> ${value}</li>`
            })
            html += '</ul>'
          }
        }
        if (section.content?.interactionPatterns?.length > 0) {
          html += '<h3>Interaction Patterns</h3>'
          html += '<ul>'
          section.content.interactionPatterns.forEach((pattern: any) => {
            if (typeof pattern === 'string') {
              html += `<li>${pattern}</li>`
            } else if (pattern.name || pattern.title) {
              html += `<li><strong>${pattern.name || pattern.title}</strong>${pattern.description ? `: ${pattern.description}` : ''}</li>`
            }
          })
          html += '</ul>'
        }
        if (section.content?.responsiveStrategy) {
          html += '<h3>Responsive Strategy</h3>'
          html += `<p>${section.content.responsiveStrategy}</p>`
        }
      }
      break
      
    case 'tech_integrations':
      // Check if there's any tech integrations content
      const hasTechContent = section.content?.integrations?.length > 0 ||
                            section.content?.apiConfigurations?.length > 0 ||
                            section.content?.monitoring?.length > 0 ||
                            section.content?.deploymentConfig ||
                            section.content?.environmentVariables?.length > 0
      
      if (!hasTechContent) {
        html += '<p><em>Technical integrations and configurations to be defined...</em></p>'
      } else {
        if (section.content?.integrations?.length > 0) {
          html += '<h3>Third-Party Integrations</h3>'
          html += '<ul>'
          section.content.integrations.forEach((integration: any) => {
            if (typeof integration === 'string') {
              html += `<li>${integration}</li>`
            } else if (integration.name) {
              html += `<li><strong>${integration.name}</strong>`
              if (integration.purpose) {
                html += `: ${integration.purpose}`
              }
              if (integration.apiKey || integration.config) {
                html += ' (Configured)'
              }
              html += '</li>'
            }
          })
          html += '</ul>'
        }
        if (section.content?.apiConfigurations?.length > 0) {
          html += '<h3>API Configurations</h3>'
          html += '<ul>'
          section.content.apiConfigurations.forEach((api: any) => {
            if (typeof api === 'string') {
              html += `<li>${api}</li>`
            } else if (api.name) {
              html += `<li><strong>${api.name}</strong>`
              if (api.endpoint) {
                html += `: ${api.endpoint}`
              }
              html += '</li>'
            }
          })
          html += '</ul>'
        }
        if (section.content?.monitoring?.length > 0) {
          html += '<h3>Monitoring & Analytics</h3>'
          html += '<ul>'
          section.content.monitoring.forEach((item: any) => {
            if (typeof item === 'string') {
              html += `<li>${item}</li>`
            } else if (item.tool || item.name) {
              html += `<li><strong>${item.tool || item.name}</strong>${item.purpose ? `: ${item.purpose}` : ''}</li>`
            }
          })
          html += '</ul>'
        }
        if (section.content?.deploymentConfig) {
          html += '<h3>Deployment Configuration</h3>'
          if (typeof section.content.deploymentConfig === 'string') {
            html += `<p>${section.content.deploymentConfig}</p>`
          } else if (Object.keys(section.content.deploymentConfig).length > 0) {
            html += '<ul>'
            Object.entries(section.content.deploymentConfig).forEach(([key, value]) => {
              html += `<li><strong>${key}:</strong> ${value}</li>`
            })
            html += '</ul>'
          }
        }
        if (section.content?.environmentVariables?.length > 0) {
          html += '<h3>Environment Variables</h3>'
          html += '<ul>'
          section.content.environmentVariables.forEach((envVar: any) => {
            if (typeof envVar === 'string') {
              html += `<li><code>${envVar}</code></li>`
            } else if (envVar.name) {
              html += `<li><code>${envVar.name}</code>${envVar.description ? `: ${envVar.description}` : ''}</li>`
            }
          })
          html += '</ul>'
        }
      }
      break
      
    default:
      // For custom sections, display content as is
      if (typeof section.content === 'string') {
        html += `<p>${section.content}</p>`
      } else if (section.content?.content && typeof section.content.content === 'string') {
        // If content was saved as raw HTML, display it directly
        html += section.content.content
      } else if (section.content && Object.keys(section.content).length > 0) {
        html += '<pre>' + JSON.stringify(section.content, null, 2) + '</pre>'
      }
  }
  
  // Add a subtle divider (will be styled with CSS)
  html += '<div class="section-divider"></div>'
  
  html += '</div>' // Close section wrapper
  return html
}

// Parse HTML back to structured data for a specific section
const parseHTMLToSection = (html: string, sectionId: string, sectionType: SectionType): any => {
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')
  
  // Find the section by its ID
  const sectionHeader = doc.querySelector(`#section-${sectionId}`)
  if (!sectionHeader) return null
  
  // Get all content between this section and the next
  const contentElements: Element[] = []
  let nextElement = sectionHeader.nextElementSibling
  while (nextElement && !nextElement.classList.contains('section-header') && !nextElement.id?.startsWith('section-')) {
    if (!nextElement.classList.contains('section-divider')) {
      contentElements.push(nextElement)
    }
    nextElement = nextElement.nextElementSibling
  }
  
  // Parse based on section type
  switch (sectionType) {
    case 'overview': {
      const content: any = {}
      
      contentElements.forEach((el, index) => {
        if (el.tagName === 'H3') {
          const headerText = el.textContent?.toLowerCase()
          if (headerText?.includes('vision')) {
            const next = contentElements[index + 1]
            if (next?.tagName === 'P') {
              content.vision = next.textContent || ''
            }
          } else if (headerText?.includes('problem')) {
            const next = contentElements[index + 1]
            if (next?.tagName === 'P') {
              content.problem = next.textContent || ''
            }
          } else if (headerText?.includes('users')) {
            const next = contentElements[index + 1]
            if (next?.tagName === 'UL') {
              content.targetUsers = Array.from(next.querySelectorAll('li'))
                .map(li => li.textContent || '')
                .filter(text => text.length > 0)
            }
          }
        }
      })
      
      return content
    }
    
    case 'core_features':
    case 'additional_features': {
      const features: any[] = []
      let currentFeature: any = null
      
      contentElements.forEach(el => {
        if (el.tagName === 'H3') {
          if (currentFeature) {
            features.push(currentFeature)
          }
          const title = el.textContent?.replace(/^\d+\.\s*/, '') || ''
          currentFeature = { title, description: '' }
        } else if (el.tagName === 'P' && currentFeature) {
          const text = el.textContent || ''
          if (text.toLowerCase().startsWith('priority:')) {
            currentFeature.priority = text.replace(/^priority:\s*/i, '').trim()
          } else if (!el.classList.contains('feature-priority')) {
            currentFeature.description = text
          }
        }
      })
      
      if (currentFeature) {
        features.push(currentFeature)
      }
      
      return { features }
    }
    
    default:
      // For other sections, extract text content
      const textContent = contentElements.map(el => el.textContent).join('\n').trim()
      return textContent || {}
  }
}

export function NotionPRDEditorEnhanced({ projectId, className }: NotionPRDEditorEnhancedProps) {
  const { toast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [prdId, setPrdId] = useState<string | null>(null)
  const [sections, setSections] = useState<FlexiblePRDSection[]>([])
  const [hoveredSectionId, setHoveredSectionId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [draggedSectionId, setDraggedSectionId] = useState<string | null>(null)
  const [showTOC, setShowTOC] = useState(false)
  const [completionPercentage, setCompletionPercentage] = useState(0)
  const [prdStatus, setPrdStatus] = useState<'draft' | 'in_progress' | 'review' | 'finalized' | 'archived'>('draft')
  const [showSlashCommand, setShowSlashCommand] = useState(false)
  const [slashCommandPosition, setSlashCommandPosition] = useState({ top: 0, left: 0 })
  const [hasLocalChanges, setHasLocalChanges] = useState(false)
  const editorRef = useRef<HTMLDivElement>(null)
  const editorContentRef = useRef<HTMLDivElement>(null)
  const sectionTimers = useRef<Map<string, NodeJS.Timeout>>(new Map())
  const isUpdatingFromSections = useRef(false)
  const lastSavedContent = useRef<string>('')
  const initialContentSet = useRef(false)
  const hasLoadedPRD = useRef(false)
  
  // Initialize TipTap editor
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3, 4],
        }
      }),
      Placeholder.configure({
        placeholder: 'Start typing or press "/" for commands...'
      }),
      Typography,
      Highlight.configure({
        multicolor: false
      }),
      TaskList,
      TaskItem.configure({
        nested: true
      }),
      Dropcursor.configure({
        color: '#10b981',
        width: 2
      }),
      Gapcursor
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'notion-editor focus:outline-none'
      },
      handleKeyDown: (view, event) => {
        // Handle slash command
        if (event.key === '/') {
          const { selection } = view.state
          const coords = view.coordsAtPos(selection.$from.pos)
          setSlashCommandPosition({
            top: coords.top - view.dom.offsetTop + 20,
            left: coords.left - view.dom.offsetLeft
          })
          setShowSlashCommand(true)
        } else if (event.key === 'Escape') {
          setShowSlashCommand(false)
        }
        return false
      }
    },
    onUpdate: ({ editor }) => {
      // Debounced section-aware saving
      handleContentUpdate(editor)
    }
  })
  
  // Helper function to extract HTML for a specific section
  const extractSectionHTML = (html: string, sectionId: string): string => {
    const parser = new DOMParser()
    const doc = parser.parseFromString(html, 'text/html')
    
    // Find the section wrapper
    const sectionWrapper = doc.querySelector(`[data-section-id="${sectionId}"]`)
    if (sectionWrapper) {
      // Return inner HTML to avoid double-wrapping
      return sectionWrapper.innerHTML
    }
    
    // Fallback: find by header ID
    const sectionHeader = doc.querySelector(`#section-${sectionId}`)
    if (!sectionHeader) return ''
    
    // Collect content between this header and the next
    let sectionHtml = ''
    let currentElement: Element | null = sectionHeader
    
    while (currentElement) {
      sectionHtml += currentElement.outerHTML
      currentElement = currentElement.nextElementSibling
      
      // Stop at next section header or section wrapper
      if (currentElement?.classList.contains('section-header') || 
          currentElement?.id?.startsWith('section-') ||
          currentElement?.hasAttribute('data-section-id')) {
        break
      }
    }
    
    return sectionHtml
  }
  
  // Load PRD and sections - only once
  useEffect(() => {
    if (!hasLoadedPRD.current) {
      loadPRD()
      hasLoadedPRD.current = true
    }
  }, [projectId])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up all timers on unmount
      sectionTimers.current.forEach(timer => clearTimeout(timer))
      sectionTimers.current.clear()
      // Reset refs
      initialContentSet.current = false
      hasLoadedPRD.current = false
    }
  }, [])
  
  // Helper function to safely set editor content with duplicate detection
  const setEditorContentSafely = useCallback((html: string) => {
    if (!editor) return
    
    const currentHTML = editor.getHTML()
    
    // Check if sections already exist in the editor
    const parser = new DOMParser()
    const currentDoc = parser.parseFromString(currentHTML, 'text/html')
    const newDoc = parser.parseFromString(html, 'text/html')
    
    const currentSectionIds = Array.from(
      currentDoc.querySelectorAll('[data-section-id]')
    ).map(el => el.getAttribute('data-section-id')).filter(Boolean)
    
    const newSectionIds = Array.from(
      newDoc.querySelectorAll('[data-section-id]')
    ).map(el => el.getAttribute('data-section-id')).filter(Boolean)
    
    // Only update if section IDs are different or editor is empty
    const isEditorEmpty = currentHTML === '<p></p>' || currentHTML === ''
    const isDifferent = JSON.stringify(currentSectionIds.sort()) !== 
                        JSON.stringify(newSectionIds.sort())
    
    if (isEditorEmpty || isDifferent) {
      console.log('Setting editor content safely, different:', isDifferent, 'empty:', isEditorEmpty)
      isUpdatingFromSections.current = true
      // CRITICAL FIX: Clear existing content before setting new content to prevent duplication
      editor.commands.clearContent(false)
      editor.commands.setContent(html)
      lastSavedContent.current = html
      setTimeout(() => {
        isUpdatingFromSections.current = false
      }, 100)
    } else {
      console.log('Skipping content update - sections already present')
    }
  }, [editor])
  
  // Update editor content when sections change - only on initial load
  useEffect(() => {
    if (!editor || sections.length === 0 || hasLocalChanges) return
    
    // Only set initial content once
    if (initialContentSet.current) {
      console.log('Initial content already set, skipping')
      return
    }
    
    const html = sections.map(section => transformSectionToHTML(section)).join('')
    
    if (html.length > 0) {
      console.log('Setting initial editor content from sections, count:', sections.length)
      setEditorContentSafely(html)
      initialContentSet.current = true
    }
  }, [editor, sections.length, hasLocalChanges, setEditorContentSafely])
  
  // Function to remove duplicate sections based on ID
  const removeDuplicateSections = (sections: FlexiblePRDSection[]): FlexiblePRDSection[] => {
    const seen = new Set<string>()
    const cleaned: FlexiblePRDSection[] = []
    
    for (const section of sections) {
      // Only keep the first occurrence of each section ID
      if (!seen.has(section.id)) {
        seen.add(section.id)
        cleaned.push(section)
      } else {
        console.warn(`Removing duplicate section: ${section.id} - ${section.title}`)
      }
    }
    
    // Re-order sections to ensure continuous ordering
    return cleaned.map((section, index) => ({
      ...section,
      order: index + 1
    }))
  }

  const loadPRD = async () => {
    setIsLoading(true)
    // Reset flags for new load
    initialContentSet.current = false
    // Set flag to prevent saves during load
    isUpdatingFromSections.current = true
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No active session')
      
      // Get or create PRD
      const { data, error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'get',
          projectId
        }
      })
      
      if (error) throw error
      
      if (data?.prd) {
        setPrdId(data.prd.id)
        // Ensure all sections have a status field, default to 'pending' if missing
        let sectionsWithStatus = (data.prd.sections || []).map((section: FlexiblePRDSection) => ({
          ...section,
          status: section.status || 'pending'
        }))
        
        // Clean up duplicate sections
        const originalCount = sectionsWithStatus.length
        sectionsWithStatus = removeDuplicateSections(sectionsWithStatus)
        const cleanedCount = sectionsWithStatus.length
        
        // Also clean the content of each section if it contains raw HTML
        let contentCleaned = false
        sectionsWithStatus = sectionsWithStatus.map(section => {
          if (section.content?.content && typeof section.content.content === 'string') {
            const originalContent = section.content.content
            const cleanedContent = cleanHTMLContent(originalContent)
            if (originalContent !== cleanedContent) {
              contentCleaned = true
              console.log(`Cleaned duplicates from content of section: ${section.id}`)
              return {
                ...section,
                content: { ...section.content, content: cleanedContent }
              }
            }
          }
          return section
        })
        
        if (originalCount !== cleanedCount || contentCleaned) {
          console.log(`Cleaned ${originalCount - cleanedCount} duplicate sections from PRD`)
          if (contentCleaned) {
            console.log('Also cleaned duplicate content within sections')
          }
          
          // Save the cleaned sections back to the database
          try {
            await supabase.functions.invoke('prd-management', {
              body: {
                action: 'updateAllSections',
                prdId: data.prd.id,
                sections: sectionsWithStatus
              }
            })
            console.log('Saved cleaned sections to database')
          } catch (saveError) {
            console.error('Error saving cleaned sections:', saveError)
          }
        }
        
        console.log('Loaded PRD sections:', sectionsWithStatus.length, sectionsWithStatus.map(s => s.title))
        setSections(sectionsWithStatus)
        // Set PRD status
        setPrdStatus(data.prd.status || 'draft')
        // Calculate completion percentage
        const completedSections = sectionsWithStatus.filter((s: FlexiblePRDSection) => s.status === 'completed').length
        const totalSections = sectionsWithStatus.length
        setCompletionPercentage(totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0)
      } else {
        // Create new PRD
        const { data: createData, error: createError } = await supabase.functions.invoke('prd-management', {
          body: {
            action: 'create',
            projectId
          }
        })
        
        if (createError) throw createError
        
        setPrdId(createData.prdId)
        // Ensure all sections have a status field, default to 'pending' if missing
        const sectionsWithStatus = (createData.sections || []).map((section: FlexiblePRDSection) => ({
          ...section,
          status: section.status || 'pending'
        }))
        console.log('Created new PRD with sections:', sectionsWithStatus.length, sectionsWithStatus.map(s => s.title))
        setSections(sectionsWithStatus)
        // New PRDs start at 0% completion
        setCompletionPercentage(0)
      }
    } catch (error) {
      console.error('Error loading PRD:', error)
      toast({
        title: 'Error',
        description: 'Failed to load PRD',
        variant: 'destructive'
      })
    } finally {
      setIsLoading(false)
      // Reset flag after loading is complete
      setTimeout(() => {
        isUpdatingFromSections.current = false
      }, 500)
    }
  }
  
  // Handle content updates with section-aware saving
  const handleContentUpdate = useCallback((editor: Editor) => {
    if (!prdId || !editor || isUpdatingFromSections.current || !initialContentSet.current) {
      if (isUpdatingFromSections.current) {
        console.log('Skipping save - updating from sections')
      }
      if (!initialContentSet.current) {
        console.log('Skipping save - initial content not yet set')
      }
      return
    }
    
    const html = editor.getHTML()
    
    // Check if this is the same content we just set programmatically
    if (html === lastSavedContent.current) {
      console.log('Skipping save - content unchanged')
      return
    }
    
    console.log('Content update detected, HTML length:', html.length)
    
    // Mark that we have local changes (this will prevent the useEffect from re-setting content)
    setHasLocalChanges(true)
    
    // Update lastSavedContent to prevent re-triggering
    lastSavedContent.current = html
    
    // If we have no sections yet or they're empty, save the entire content as a draft
    if (sections.length === 0 || sections.every(s => !s.content || Object.keys(s.content).length === 0)) {
      console.log('No sections or empty sections, saving as draft')
      // Clear any existing timer
      const existingTimer = sectionTimers.current.get('draft')
      if (existingTimer) {
        clearTimeout(existingTimer)
      }
      
      // Set new debounced save timer for draft content
      const timer = setTimeout(async () => {
        console.log('Autosaving draft content...')
        // Save as raw HTML content to the first section or create a draft section
        const targetSection = sections[0] || { id: 'draft', title: 'Draft Content' }
        await saveSection(targetSection.id, { content: html })
        setHasLocalChanges(false) // Clear flag after save
      }, 1500) as unknown as NodeJS.Timeout
      
      sectionTimers.current.set('draft', timer)
      return
    }
    
    // Parse each section and check for changes
    sections.forEach(section => {
      const sectionType = getSectionType(section)
      const sectionContent = parseHTMLToSection(html, section.id, sectionType)
      
      // If we couldn't parse the section (no header found), extract section-specific HTML
      if (sectionContent === null) {
        // Extract only this section's HTML, not the entire document
        const sectionHTML = extractSectionHTML(html, section.id)
        if (sectionHTML) {
          const existingTimer = sectionTimers.current.get(section.id)
          if (existingTimer) {
            clearTimeout(existingTimer)
          }
          
          const timer = setTimeout(async () => {
            await saveSection(section.id, { content: sectionHTML })
          }, 1500) as unknown as NodeJS.Timeout
          
          sectionTimers.current.set(section.id, timer)
        }
      } else if (JSON.stringify(sectionContent) !== JSON.stringify(section.content)) {
        // Clear existing timer for this section
        const existingTimer = sectionTimers.current.get(section.id)
        if (existingTimer) {
          clearTimeout(existingTimer)
        }
        
        // Set new debounced save timer (1.5 seconds)
        const timer = setTimeout(async () => {
          await saveSection(section.id, sectionContent)
          setHasLocalChanges(false) // Clear flag after save
        }, 1500) as unknown as NodeJS.Timeout
        
        sectionTimers.current.set(section.id, timer)
      }
    })
  }, [prdId, sections])
  
  // Save section to backend
  const saveSection = async (sectionId: string, content: any) => {
    if (!prdId) return
    
    setIsSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No active session')
      
      const { data, error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'updateSection',
          prdId,
          sectionId,
          data: content
        }
      })
      
      if (error) throw error
      
      // Update local state - only update content, not status
      // Use a flag to prevent re-rendering the editor
      isUpdatingFromSections.current = true
      setSections(prev => {
        const updated = prev.map(section => 
          section.id === sectionId 
            ? { ...section, content }
            : section
        )
        // Recalculate completion percentage based on existing statuses
        const completedSections = updated.filter(s => s.status === 'completed').length
        const totalSections = updated.length
        setCompletionPercentage(totalSections > 0 ? Math.round((completedSections / totalSections) * 100) : 0)
        return updated
      })
      // Reset flag after state update
      setTimeout(() => {
        isUpdatingFromSections.current = false
      }, 100)
      
      toast({
        title: 'Saved',
        description: 'Section updated successfully',
        duration: 1000
      })
    } catch (error) {
      console.error('Error saving section:', error)
      toast({
        title: 'Error',
        description: 'Failed to save section',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }
  
  // Manual save all sections
  const handleManualSave = async () => {
    console.log('Manual save triggered, prdId:', prdId, 'editor exists:', !!editor)
    if (!prdId || !editor) return
    
    setIsSaving(true)
    try {
      const html = editor.getHTML()
      console.log('Manual save HTML length:', html.length)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No active session')
      
      // If no sections exist or all are empty, save as draft
      if (sections.length === 0 || sections.every(s => !s.content || Object.keys(s.content).length === 0)) {
        const targetSection = sections[0] || { id: 'draft', title: 'Draft Content' }
        await supabase.functions.invoke('prd-management', {
          body: {
            action: 'updateSection',
            prdId,
            sectionId: targetSection.id,
            data: { content: html }
          }
        })
      } else {
        const savePromises: Promise<void>[] = []
        
        // Parse and save each section
        sections.forEach(section => {
          const sectionType = getSectionType(section)
          const sectionContent = parseHTMLToSection(html, section.id, sectionType)
          
          // If parsing failed, extract section-specific HTML
          const contentToSave = sectionContent === null 
            ? { content: extractSectionHTML(html, section.id) } 
            : sectionContent
          
          // Save if content exists
          if (contentToSave && Object.keys(contentToSave).length > 0) {
            savePromises.push(
              (async () => {
                await supabase.functions.invoke('prd-management', {
                  body: {
                    action: 'updateSection',
                    prdId,
                    sectionId: section.id,
                    data: contentToSave
                  }
                })
              })()
            )
          }
        })
        
        await Promise.all(savePromises)
      }
      
      // Clear the local changes flag after successful save
      setHasLocalChanges(false)
      lastSavedContent.current = editor.getHTML()
      
      toast({
        title: 'All changes saved',
        description: 'Document has been saved successfully',
        duration: 2000
      })
    } catch (error) {
      console.error('Error saving document:', error)
      toast({
        title: 'Error',
        description: 'Failed to save document',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Reset PRD to default state
  const handleResetPRD = async () => {
    if (!projectId || !editor) return
    
    // Confirm reset action
    if (!window.confirm('Are you sure you want to reset the PRD? This will clear all content and restore default sections.')) {
      return
    }
    
    setIsSaving(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No active session')
      
      // Reset PRD by reinitializing sections
      const { data, error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'initializeSections',
          prdId: prdId || undefined,
          projectId: projectId
        },
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      })
      
      if (error) throw error
      
      // Clear the editor and set default content
      const resetSections = data?.sections || []
      const defaultContent = resetSections.map(section => transformSectionToHTML(section)).join('')
      // Clear content first to prevent duplication
      editor.commands.clearContent(false)
      editor.commands.setContent(defaultContent)
      
      // Update sections state
      setSections(resetSections)
      
      // Reset local state
      initialContentSet.current = false
      hasLoadedPRD.current = false
      setHasLocalChanges(false)
      lastSavedContent.current = defaultContent
      
      // Reload the PRD to get fresh data
      await loadPRD()
      
      toast({
        title: 'PRD Reset',
        description: 'The PRD has been reset to default state',
        duration: 3000
      })
    } catch (error) {
      console.error('Error resetting PRD:', error)
      toast({
        title: 'Error',
        description: 'Failed to reset PRD',
        variant: 'destructive'
      })
    } finally {
      setIsSaving(false)
    }
  }
  
  // Handle section hover for controls
  const handleSectionHover = useCallback((sectionId: string | null) => {
    setHoveredSectionId(sectionId)
  }, [])
  
  // Insert slash command
  const insertSlashCommand = useCallback((commandType: string) => {
    if (!editor) return
    
    // Remove the slash character first
    editor.chain().focus().deleteRange({ from: editor.state.selection.$from.pos - 1, to: editor.state.selection.$from.pos }).run()
    
    switch (commandType) {
      case 'heading1':
        editor.chain().focus().toggleHeading({ level: 1 }).run()
        break
      case 'heading2':
        editor.chain().focus().toggleHeading({ level: 2 }).run()
        break
      case 'heading3':
        editor.chain().focus().toggleHeading({ level: 3 }).run()
        break
      case 'bulletList':
        editor.chain().focus().toggleBulletList().run()
        break
      case 'orderedList':
        editor.chain().focus().toggleOrderedList().run()
        break
      case 'taskList':
        editor.chain().focus().toggleTaskList().run()
        break
      case 'blockquote':
        editor.chain().focus().toggleBlockquote().run()
        break
      case 'codeBlock':
        editor.chain().focus().toggleCodeBlock().run()
        break
    }
    
    setShowSlashCommand(false)
  }, [editor])
  
  // Handle section actions
  const handleDuplicateSection = useCallback(async (sectionId: string) => {
    const section = sections.find(s => s.id === sectionId)
    if (!section || !prdId) return
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No active session')
      
      const { data, error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'addSection',
          prdId,
          title: `${section.title} (Copy)`,
          agent: section.agent || 'human',
          required: false
        }
      })
      
      if (error) throw error
      
      // Reload sections
      await loadPRD()
      
      toast({
        title: 'Section duplicated',
        description: 'A copy of the section has been created',
        duration: 2000
      })
    } catch (error) {
      console.error('Error duplicating section:', error)
      toast({
        title: 'Error',
        description: 'Failed to duplicate section',
        variant: 'destructive'
      })
    }
  }, [sections, prdId])
  
  const handleDeleteSection = useCallback(async (sectionId: string) => {
    if (!prdId) return
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No active session')
      
      const { data, error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'removeSection',
          prdId,
          sectionId
        }
      })
      
      if (error) throw error
      
      // Remove from local state
      setSections(prev => prev.filter(s => s.id !== sectionId))
      
      toast({
        title: 'Section deleted',
        description: 'The section has been removed',
        duration: 2000
      })
    } catch (error) {
      console.error('Error deleting section:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete section',
        variant: 'destructive'
      })
    }
  }, [prdId])
  
  // Handle drag and drop for reordering
  const handleDragStart = useCallback((e: React.DragEvent, sectionId: string) => {
    setIsDragging(true)
    setDraggedSectionId(sectionId)
    e.dataTransfer.effectAllowed = 'move'
  }, [])
  
  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
    setDraggedSectionId(null)
  }, [])
  
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])
  
  const handleDrop = useCallback(async (e: React.DragEvent, targetSectionId: string) => {
    e.preventDefault()
    
    if (!draggedSectionId || !prdId || draggedSectionId === targetSectionId) {
      return
    }
    
    const draggedIndex = sections.findIndex(s => s.id === draggedSectionId)
    const targetIndex = sections.findIndex(s => s.id === targetSectionId)
    
    if (draggedIndex === -1 || targetIndex === -1) return
    
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) throw new Error('No active session')
      
      const { data, error } = await supabase.functions.invoke('prd-management', {
        body: {
          action: 'reorderSections',
          prdId,
          sectionId: draggedSectionId,
          newOrder: targetIndex
        }
      })
      
      if (error) throw error
      
      // Update local state
      const newSections = [...sections]
      const [removed] = newSections.splice(draggedIndex, 1)
      newSections.splice(targetIndex, 0, removed)
      setSections(newSections)
      
      toast({
        title: 'Sections reordered',
        description: 'The section order has been updated',
        duration: 2000
      })
    } catch (error) {
      console.error('Error reordering sections:', error)
      toast({
        title: 'Error',
        description: 'Failed to reorder sections',
        variant: 'destructive'
      })
    }
    
    setIsDragging(false)
    setDraggedSectionId(null)
  }, [draggedSectionId, prdId, sections])
  
  // Add section controls overlay
  useEffect(() => {
    if (!editor || !editorRef.current) return
    
    const editorElement = editorRef.current.querySelector('.ProseMirror')
    if (!editorElement) return
    
    const handleMouseMove = (e: Event) => {
      const mouseEvent = e as MouseEvent
      const target = mouseEvent.target as HTMLElement
      const sectionHeader = target.closest('.section-header') as HTMLElement
      
      if (sectionHeader) {
        const sectionId = sectionHeader.getAttribute('data-section-id')
        if (sectionId) {
          handleSectionHover(sectionId)
        }
      } else {
        // Check if we're near a section header
        const headers = editorElement.querySelectorAll('.section-header')
        let foundNearby = false
        
        headers.forEach(header => {
          const rect = header.getBoundingClientRect()
          const mouseY = mouseEvent.clientY
          
          // Check if mouse is within 50px of the header
          if (Math.abs(rect.top + rect.height / 2 - mouseY) < 50) {
            const sectionId = header.getAttribute('data-section-id')
            if (sectionId) {
              handleSectionHover(sectionId)
              foundNearby = true
            }
          }
        })
        
        if (!foundNearby) {
          handleSectionHover(null)
        }
      }
    }
    
    editorElement.addEventListener('mousemove', handleMouseMove as EventListener)
    
    return () => {
      editorElement.removeEventListener('mousemove', handleMouseMove as EventListener)
    }
  }, [editor, handleSectionHover])
  
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    )
  }
  
  return (
    <div className={cn('flex flex-col h-full overflow-hidden', className)}>
      {/* Header - matching Original NotionPRDEditor style */}
      <div className="relative border-b border-gray-200 dark:border-gray-700/50 bg-transparent flex-shrink-0 rounded-t-lg">
        <div className="p-4 pl-5">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Product Requirements Document</h2>
            </div>
            <div className="flex items-center gap-2">
              {isSaving && (
                <div className="px-2 py-1 rounded-md bg-blue-500/10 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-500" />
                  <span className="text-xs font-medium text-blue-600 dark:text-blue-500">
                    Saving...
                  </span>
                </div>
              )}
              <PRDStatusBadge status={prdStatus} />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleManualSave}
                disabled={isSaving}
                title="Save document"
              >
                <Save className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleResetPRD}
                disabled={isSaving}
                title="Reset PRD to default"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  toast({
                    title: 'Export',
                    description: 'Export functionality coming soon',
                    duration: 2000
                  })
                }}
                title="Export as Markdown"
              >
                <Download className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowTOC(!showTOC)}
                title={showTOC ? "Hide Table of Contents" : "Show Table of Contents"}
              >
                <PanelRight className={cn("h-4 w-4", showTOC && "text-primary")} />
              </Button>
            </div>
          </div>
        </div>
        
        {/* Progress Bar as bottom border */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-200 dark:bg-gray-700">
          <div 
            className="h-full bg-emerald-500 transition-all duration-300 ease-out"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>
      
      {/* Main Content Area with Editor and TOC */}
      <div className="flex-1 relative overflow-hidden">
        {/* Editor Content - Full width with muted background */}
        <div className="absolute inset-0 overflow-y-auto bg-muted/50" ref={editorRef}>
          <div className="max-w-4xl mx-auto px-24 py-8 relative" ref={editorContentRef}>
            {/* Block Controls for drag and insert - positioned absolutely within the padded container */}
            <BlockControls editor={editor} containerRef={editorContentRef} />
            
            {/* Editor content */}
            <div className="relative">
              <EditorContent 
                editor={editor} 
                className="notion-editor-content"
              />
            
            {/* Floating Bubble Menu */}
            {editor && (
              <BubbleMenu
                editor={editor}
                className="flex items-center gap-1 p-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700/50"
              >
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
                  onClick={() => editor.chain().focus().toggleCode().run()}
                  data-active={editor.isActive('code')}
                >
                  <Code className="h-3 w-3" />
                </Button>
                <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
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
              </BubbleMenu>
            )}

            {/* Slash Command Menu */}
            {showSlashCommand && (
              <div 
                className="absolute z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700/50 p-2 min-w-[200px]"
                style={{ top: slashCommandPosition.top, left: slashCommandPosition.left }}
              >
                <div className="space-y-1">
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('heading1')}
                  >
                    <Heading1 className="h-4 w-4" />
                    <span className="text-sm">Heading 1</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('heading2')}
                  >
                    <Heading2 className="h-4 w-4" />
                    <span className="text-sm">Heading 2</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('heading3')}
                  >
                    <Heading3 className="h-4 w-4" />
                    <span className="text-sm">Heading 3</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('bulletList')}
                  >
                    <List className="h-4 w-4" />
                    <span className="text-sm">Bullet List</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('orderedList')}
                  >
                    <ListOrdered className="h-4 w-4" />
                    <span className="text-sm">Numbered List</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('taskList')}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span className="text-sm">Task List</span>
                  </button>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
                    onClick={() => insertSlashCommand('blockquote')}
                  >
                    <Quote className="h-4 w-4" />
                    <span className="text-sm">Quote</span>
                  </button>
                </div>
              </div>
            )}
        
              {/* Section Controls Overlay */}
              {hoveredSectionId && (
                <div
                  className="absolute left-0 flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity"
                  style={{
                    top: `${
                      editorRef.current
                        ?.querySelector(`[data-section-id="${hoveredSectionId}"]`)
                        ?.getBoundingClientRect().top ?? 0
                    }px`,
                    transform: 'translateX(-48px)'
                  }}
                >
                  {/* Drag Handle */}
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(e, hoveredSectionId)}
                    onDragEnd={handleDragEnd}
                    className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-move"
                  >
                    <GripVertical className="h-4 w-4 text-gray-400" />
                  </div>
                  
                  {/* Section Menu */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-6 w-6">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onClick={() => handleDuplicateSection(hoveredSectionId)}>
                        <Copy className="h-4 w-4 mr-2" />
                        Duplicate
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem 
                        onClick={() => handleDeleteSection(hoveredSectionId)}
                        className="text-red-600 dark:text-red-400"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              
              {/* Drag Indicator */}
              {isDragging && (
                <div className="absolute left-0 right-0 h-0.5 bg-blue-500 pointer-events-none z-20" />
              )}
            </div>
          </div>
        </div>
        
        {/* Table of Contents Sidebar - Overlay */}
        <AnimatePresence mode="wait">
          {showTOC && (
            <motion.div 
              className="absolute top-0 right-0 bottom-0 w-64 border-l border-gray-200 dark:border-gray-700/50 bg-gray-50/95 dark:bg-gray-800/95 backdrop-blur-sm overflow-y-auto z-40 shadow-xl"
              initial={{ x: "100%", opacity: 0 }}
              animate={{ 
                x: 0,
                opacity: 1,
                transition: {
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.2 }
                }
              }}
              exit={{ 
                x: "100%", 
                opacity: 0,
                transition: {
                  x: { type: "spring", stiffness: 300, damping: 30 },
                  opacity: { duration: 0.15 }
                }
              }}
            >
              <motion.div 
                className="p-4"
                initial={{ x: 20, opacity: 0 }}
                animate={{ 
                  x: 0, 
                  opacity: 1,
                  transition: { delay: 0.1, duration: 0.2 }
                }}
              >
                <h3 className="text-sm font-semibold text-gray-600 dark:text-gray-400 mb-3 uppercase tracking-wider text-xs">
                  Table of Contents
                </h3>
                <div className="space-y-1">
                  {sections.map((section, index) => {
                    const sectionType = getSectionType(section)
                    const icon = sectionIcons[sectionType] || '📝'
                    return (
                      <motion.button
                        key={section.id}
                        initial={{ x: 20, opacity: 0 }}
                        animate={{ 
                          x: 0, 
                          opacity: 1,
                          transition: { 
                            delay: 0.15 + (index * 0.03), 
                            duration: 0.2 
                          }
                        }}
                        className={cn(
                          "w-full text-left px-2 py-1.5 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors",
                          "flex items-center gap-2",
                          section.status === 'completed' && "text-green-600 dark:text-green-400"
                        )}
                        onClick={() => {
                          // Scroll to section
                          const element = document.querySelector(`[data-section-id="${section.id}"]`)
                          if (element) {
                            element.scrollIntoView({ behavior: 'smooth', block: 'start' })
                          }
                        }}
                      >
                        <span>{icon}</span>
                        <span className="flex-1 truncate">{section.title}</span>
                        {section.status === 'completed' && (
                          <CheckCircle2 className="h-3 w-3" />
                        )}
                      </motion.button>
                    )
                  })}
                </div>
                {sections.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700/50">
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      <div className="flex justify-between mb-1">
                        <span>Progress</span>
                        <span>{completionPercentage}%</span>
                      </div>
                      <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                        <div 
                          className="bg-emerald-500 h-1.5 rounded-full transition-all duration-300"
                          style={{ width: `${completionPercentage}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      
      {/* Add custom styles */}
      <style dangerouslySetInnerHTML={{ __html: `
        .notion-editor-content {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
        }
        
        .notion-editor-content .ProseMirror {
          min-height: calc(100vh - 120px);
        }
        
        /* Heading styles for ProseMirror */
        .notion-editor-content .ProseMirror h1 {
          font-size: 2rem;
          font-weight: 700;
          margin-top: 2rem;
          margin-bottom: 1rem;
          line-height: 1.3;
        }
        
        .notion-editor-content .ProseMirror h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-top: 2rem;
          margin-bottom: 1rem;
          line-height: 1.4;
          cursor: pointer;
          transition: background-color 0.2s;
          padding: 0.25rem 0;
          border-radius: 0.25rem;
        }
        
        .notion-editor-content .ProseMirror h2:hover {
          background-color: rgba(0, 0, 0, 0.02);
        }
        
        .dark .notion-editor-content .ProseMirror h2:hover {
          background-color: rgba(255, 255, 255, 0.02);
        }
        
        .notion-editor-content .ProseMirror h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.75rem;
          line-height: 1.5;
        }
        
        .notion-editor-content .ProseMirror h4 {
          font-size: 1.1rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
          line-height: 1.5;
        }
        
        .notion-editor-content .ProseMirror p {
          margin-bottom: 0.75rem;
          line-height: 1.7;
          font-size: 1rem;
        }
        
        .notion-editor-content .ProseMirror ul {
          margin-bottom: 1rem;
          padding-left: 2rem !important;
          list-style-type: disc !important;
          list-style-position: outside !important;
        }
        
        .notion-editor-content .ProseMirror ol {
          margin-bottom: 1rem;
          padding-left: 2rem !important;
          list-style-type: decimal !important;
          list-style-position: outside !important;
        }
        
        .notion-editor-content .ProseMirror li {
          margin-bottom: 0.25rem;
          line-height: 1.7;
          display: list-item !important;
          list-style: inherit !important;
        }
        
        .notion-editor-content .ProseMirror ul ul {
          list-style-type: circle !important;
        }
        
        .notion-editor-content .ProseMirror ul ul ul {
          list-style-type: square !important;
        }
        
        /* Ensure list items in the editor show their markers */
        .notion-editor-content .ProseMirror li::marker {
          color: inherit;
        }
        
        .notion-editor-content .ProseMirror li p {
          margin: 0;
          display: inline;
        }
        
        /* Section-specific styles */
        .notion-editor-content .ProseMirror .section-header {
          font-size: 1.5rem !important;
          font-weight: 600 !important;
        }
        
        .notion-editor-content .ProseMirror .section-divider {
          height: 1px;
          background: linear-gradient(to right, transparent, rgba(0, 0, 0, 0.1), transparent);
          margin: 2rem 0;
        }
        
        .dark .notion-editor-content .ProseMirror .section-divider {
          background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.1), transparent);
        }
        
        .notion-editor-content .ProseMirror .feature-priority {
          color: #6b7280;
          font-size: 0.875rem;
        }
        
        /* Reset Tailwind's list reset for ProseMirror content */
        .notion-editor-content .ProseMirror ul:not([data-type="taskList"]) {
          list-style: disc !important;
        }
        
        .notion-editor-content .ProseMirror ol {
          list-style: decimal !important;
        }
        
        /* Task list styles - these should NOT have bullets */
        .notion-editor-content .ProseMirror ul[data-type="taskList"] {
          list-style: none !important;
          padding-left: 0;
        }
        
        .notion-editor-content .ProseMirror ul[data-type="taskList"] li {
          display: flex;
          align-items: flex-start;
          list-style: none !important;
        }
        
        .notion-editor-content .ProseMirror ul[data-type="taskList"] li > label {
          margin-right: 0.5rem;
        }
        
        /* Placeholder text */
        .notion-editor-content .ProseMirror .placeholder-text {
          color: #9ca3af;
          font-style: italic;
        }
        
        /* Code blocks */
        .notion-editor-content .ProseMirror pre {
          background: #1e293b;
          color: #e2e8f0;
          padding: 1rem;
          border-radius: 0.375rem;
          overflow-x: auto;
          margin-bottom: 1rem;
        }
        
        .notion-editor-content .ProseMirror code {
          background: rgba(0, 0, 0, 0.05);
          padding: 0.125rem 0.25rem;
          border-radius: 0.25rem;
          font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
          font-size: 0.875em;
        }
        
        .dark .notion-editor-content .ProseMirror code {
          background: rgba(255, 255, 255, 0.1);
        }
        
        /* Blockquote styles */
        .notion-editor-content .ProseMirror blockquote {
          border-left: 3px solid #e5e7eb;
          padding-left: 1rem;
          margin-left: 0;
          margin-bottom: 1rem;
          color: #6b7280;
        }
        
        .dark .notion-editor-content .ProseMirror blockquote {
          border-left-color: #4b5563;
          color: #9ca3af;
        }
        
        /* Selection styles */
        .notion-editor-content .ProseMirror ::selection {
          background: rgba(125, 188, 255, 0.3);
        }
        
        /* Focus styles */
        .notion-editor-content .ProseMirror:focus {
          outline: none;
        }
        
        /* Drag and drop styles */
        .notion-editor-content .is-dragging {
          opacity: 0.5;
        }
        
        .notion-editor-content .drag-over {
          background-color: rgba(59, 130, 246, 0.05);
        }
      ` }} />
    </div>
  )
}