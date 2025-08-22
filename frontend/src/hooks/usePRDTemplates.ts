import { useCallback } from 'react'

interface TemplateContent {
  html: string
  text: string
}

export const sectionTemplates: Record<string, TemplateContent> = {
  'overview': {
    html: `<h2>Vision</h2><p class="template-placeholder">What is your app's core vision?</p><h2>Problem</h2><p class="template-placeholder">What problem does it solve?</p><h2>Target Users</h2><p class="template-placeholder">Who are your target users?</p><h2>Business Goals</h2><p class="template-placeholder">What are your business objectives?</p>`,
    text: 'Vision: What is your app\'s core vision? Problem: What problem does it solve? Target Users: Who are your target users? Business Goals: What are your business objectives?'
  },
  'core_features': {
    html: `<h2>Core Features</h2><ul><li class="template-placeholder">Essential feature 1</li><li class="template-placeholder">Essential feature 2</li><li class="template-placeholder">Essential feature 3</li></ul>`,
    text: 'Core Features: Essential feature 1, Essential feature 2, Essential feature 3'
  },
  'additional_features': {
    html: `<h2>Additional Features</h2><ul><li class="template-placeholder">Nice-to-have feature 1</li><li class="template-placeholder">Future enhancement 2</li></ul>`,
    text: 'Additional Features: Nice-to-have feature 1, Future enhancement 2'
  },
  'ui_design_patterns': {
    html: `<h2>Design System</h2><p class="template-placeholder">Define your visual design approach</p><h2>Component Patterns</h2><p class="template-placeholder">Describe UI component patterns</p><h2>Accessibility</h2><p class="template-placeholder">Accessibility requirements</p>`,
    text: 'Design System: Define your visual design approach. Component Patterns: Describe UI component patterns. Accessibility: Accessibility requirements'
  },
  'ux_flows': {
    html: `<h2>User Journeys</h2><p class="template-placeholder">Map key user flows</p><h2>Navigation Structure</h2><p class="template-placeholder">Define app navigation</p><h2>Interaction Patterns</h2><p class="template-placeholder">Describe user interactions</p>`,
    text: 'User Journeys: Map key user flows. Navigation Structure: Define app navigation. Interaction Patterns: Describe user interactions'
  },
  'technical_architecture': {
    html: `<h2>Platforms</h2><p class="template-placeholder">Target platforms (iOS, Android, Web)</p><h2>Tech Stack</h2><p class="template-placeholder">Frontend, backend, database technologies</p><h2>Architecture Pattern</h2><p class="template-placeholder">System architecture approach</p><h2>Security</h2><p class="template-placeholder">Security considerations</p>`,
    text: 'Platforms: Target platforms (iOS, Android, Web). Tech Stack: Frontend, backend, database technologies. Architecture Pattern: System architecture approach. Security: Security considerations'
  },
  'tech_integrations': {
    html: `<h2>Third-Party Services</h2><p class="template-placeholder">External APIs and services</p><h2>Authentication</h2><p class="template-placeholder">Auth providers and methods</p><h2>Environment Configuration</h2><p class="template-placeholder">Environment variables and config</p>`,
    text: 'Third-Party Services: External APIs and services. Authentication: Auth providers and methods. Environment Configuration: Environment variables and config'
  }
}

export function usePRDTemplates() {
  const getTemplate = useCallback((sectionId: string): TemplateContent => {
    return sectionTemplates[sectionId] || {
      html: '<p class="template-placeholder">Start writing...</p>',
      text: 'Start writing...'
    }
  }, [])

  const isTemplatePlaceholder = useCallback((content: TemplateContent): boolean => {
    if (!content || !content.html || !content.text) return true
    
    // Check for explicit template-placeholder class
    if (content.html.includes('template-placeholder')) return true
    
    // Check for common template phrases (matching backend validation)
    const templatePhrases = [
      'Start writing...',
      'Start writing your section content here...',
      'Click to start writing...',
      'Enter content here...',
      'Add your content...'
    ]
    
    const normalizedText = content.text.trim().toLowerCase()
    return templatePhrases.some(phrase => 
      normalizedText === phrase.toLowerCase() || 
      normalizedText.includes(phrase.toLowerCase())
    )
  }, [])

  const extractTextFromHtml = useCallback((html: string): string => {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }, [])

  return {
    getTemplate,
    isTemplatePlaceholder,
    extractTextFromHtml,
    sectionTemplates
  }
}