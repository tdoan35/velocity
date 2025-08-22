import { exportPRDAsMarkdown, generateMarkdownFilename } from '../markdownExporter'
import type { PRD, FlexiblePRDSection } from '@/services/prdService'

// Mock DOM for testing
const mockDiv = {
  innerHTML: '',
  childNodes: [],
  innerHTML: ''
} as any

Object.defineProperty(global, 'document', {
  value: {
    createElement: jest.fn(() => mockDiv)
  }
})

describe('markdownExporter', () => {
  const mockPRD: PRD = {
    id: 'test-prd-id',
    project_id: 'test-project',
    title: 'Test PRD',
    status: 'draft' as const,
    completion_percentage: 75,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2023-01-02T00:00:00Z',
    sections: [
      {
        id: 'section-1',
        title: 'Overview',
        order: 1,
        agent: 'project_manager' as const,
        required: true,
        content: {
          html: '<h2>Overview</h2><p>This is a test PRD overview section.</p>',
          text: 'Overview\n\nThis is a test PRD overview section.'
        },
        status: 'completed' as const,
        isCustom: false
      },
      {
        id: 'section-2',
        title: 'Features',
        order: 2,
        agent: 'project_manager' as const,
        required: true,
        content: {
          html: '<ul><li>Feature 1</li><li>Feature 2</li></ul>',
          text: '• Feature 1\n• Feature 2'
        },
        status: 'in_progress' as const,
        isCustom: false
      }
    ] as FlexiblePRDSection[]
  }

  describe('exportPRDAsMarkdown', () => {
    it('should convert PRD to markdown format', () => {
      const result = exportPRDAsMarkdown(mockPRD)
      
      expect(result).toContain('# Test PRD')
      expect(result).toContain('**Status:** draft')
      expect(result).toContain('**Completion:** 75%')
      expect(result).toContain('## Overview')
      expect(result).toContain('## Features')
    })

    it('should handle empty sections array', () => {
      const prdWithNoSections: PRD = {
        ...mockPRD,
        sections: []
      }
      
      const result = exportPRDAsMarkdown(prdWithNoSections)
      
      expect(result).toContain('# Test PRD')
      expect(result).not.toContain('## Overview')
    })
  })

  describe('generateMarkdownFilename', () => {
    it('should generate proper filename', () => {
      const result = generateMarkdownFilename(mockPRD)
      const today = new Date().toISOString().split('T')[0]
      
      expect(result).toBe(`test_prd_${today}.md`)
    })

    it('should sanitize title with special characters', () => {
      const prdWithSpecialChars: PRD = {
        ...mockPRD,
        title: 'My App! v2.0 (Beta)'
      }
      
      const result = generateMarkdownFilename(prdWithSpecialChars)
      const today = new Date().toISOString().split('T')[0]
      
      expect(result).toBe(`my_app_v2_0_beta_${today}.md`)
    })
  })
})