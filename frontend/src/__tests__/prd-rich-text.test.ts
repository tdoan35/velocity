import { describe, it, expect } from 'vitest'
import { validateRichTextContent, extractTextFromHtml } from '@/services/prdService'
import { sectionTemplates } from '@/hooks/usePRDTemplates'

describe('PRD Rich Text Implementation', () => {
  it('should validate rich text content correctly', () => {
    const validContent = {
      html: '<h2>Vision</h2><p>AI-powered mobile development platform</p>',
      text: 'Vision: AI-powered mobile development platform'
    }

    const result = validateRichTextContent(validContent)
    
    expect(result.isValid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should detect invalid content', () => {
    const invalidContent = {
      html: '<p></p>',
      text: ''
    }

    const result = validateRichTextContent(invalidContent)
    
    expect(result.isValid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should extract text from HTML correctly', () => {
    const html = '<h2>Vision</h2><p>My app vision</p><ul><li>Feature 1</li><li>Feature 2</li></ul>'
    const text = extractTextFromHtml(html)
    
    expect(text).toBe('Vision My app vision Feature 1 Feature 2')
  })

  it('should detect template placeholders', () => {
    const templateContent = {
      html: '<p class="template-placeholder">Start writing...</p>',
      text: 'Start writing...'
    }

    const result = validateRichTextContent(templateContent)
    
    expect(result.warnings).toContain('Template placeholders should be replaced with actual content')
  })

  it('should have section templates defined', () => {
    expect(sectionTemplates).toBeDefined()
    expect(sectionTemplates.overview).toBeDefined()
    expect(sectionTemplates.core_features).toBeDefined()
    expect(sectionTemplates.overview.html).toContain('<h2>Vision</h2>')
  })

  it('should validate all section templates', () => {
    Object.entries(sectionTemplates).forEach(([sectionId, template]) => {
      expect(template.html).toBeTruthy()
      expect(template.text).toBeTruthy()
      expect(template.html.includes('template-placeholder')).toBe(true)
    })
  })

  it('should handle rich text content transformation', () => {
    const richContent = {
      html: '<h2>Core Features</h2><ul><li>Feature 1</li><li>Feature 2</li></ul>',
      text: 'Core Features Feature 1 Feature 2'
    }

    // Validate content structure
    expect(richContent.html).toContain('<h2>')
    expect(richContent.html).toContain('<ul>')
    expect(richContent.html).toContain('<li>')
    
    // Validate text extraction
    const extractedText = extractTextFromHtml(richContent.html)
    expect(extractedText).toBe(richContent.text)
  })
})