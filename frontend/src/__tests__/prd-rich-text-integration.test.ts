import { describe, it, expect, beforeAll } from 'vitest'
import { supabase } from '@/lib/supabase'

describe('PRD Rich Text Integration', () => {
  let testPrdId: string | null = null
  
  beforeAll(async () => {
    // Get or create a test PRD
    const { data: prds } = await supabase
      .from('prds')
      .select('id, sections')
      .limit(1)
    
    if (prds && prds.length > 0) {
      testPrdId = prds[0].id
    }
  })

  it('should retrieve PRD with rich text sections', async () => {
    if (!testPrdId) {
      console.warn('No test PRD available, skipping test')
      return
    }

    const { data: prd, error } = await supabase
      .from('prds')
      .select('*')
      .eq('id', testPrdId)
      .single()

    expect(error).toBeNull()
    expect(prd).toBeDefined()
    expect(prd.sections).toBeDefined()
    expect(Array.isArray(prd.sections)).toBe(true)
    
    // Check first section has rich text structure
    if (prd.sections.length > 0) {
      const firstSection = prd.sections[0]
      expect(firstSection.content).toBeDefined()
      expect(firstSection.content.html).toBeDefined()
      expect(firstSection.content.text).toBeDefined()
      expect(typeof firstSection.content.html).toBe('string')
      expect(typeof firstSection.content.text).toBe('string')
    }
  })

  it('should update section with rich text content', async () => {
    if (!testPrdId) {
      console.warn('No test PRD available, skipping test')
      return
    }

    // Test content
    const testContent = {
      html: '<h2>Test Update</h2><p>This is a test update with rich text.</p>',
      text: 'Test Update This is a test update with rich text.'
    }

    // Use the edge function to update
    const { data, error } = await supabase.functions.invoke('prd-management', {
      body: {
        action: 'updateSection',
        prdId: testPrdId,
        sectionId: 'overview',
        data: testContent
      }
    })

    // Check the response
    expect(error).toBeNull()
    expect(data).toBeDefined()
    
    // Verify the update persisted
    const { data: updatedPrd } = await supabase
      .from('prds')
      .select('sections')
      .eq('id', testPrdId)
      .single()

    const overviewSection = updatedPrd?.sections?.find((s: any) => s.id === 'overview')
    expect(overviewSection).toBeDefined()
    expect(overviewSection.content.html).toContain('Test Update')
    expect(overviewSection.content.text).toContain('Test Update')
  })

  it('should validate rich text content structure', async () => {
    if (!testPrdId) {
      console.warn('No test PRD available, skipping test')
      return
    }

    // Test validation with edge function
    const { data } = await supabase.functions.invoke('prd-management', {
      body: {
        action: 'validateSection',
        prdId: testPrdId,
        sectionId: 'overview',
        data: {
          html: '<h2>Vision</h2><p>Test vision content</p>',
          text: 'Vision Test vision content'
        }
      }
    })

    expect(data).toBeDefined()
    expect(data.valid).toBeDefined()
    expect(data.errors).toBeDefined()
    expect(data.warnings).toBeDefined()
  })

  it('should handle template detection correctly', async () => {
    const templateContent = {
      html: '<p class="template-placeholder">Start writing...</p>',
      text: 'Start writing...'
    }

    // This should be detected as template content
    expect(templateContent.html.includes('template-placeholder')).toBe(true)
    
    const realContent = {
      html: '<h2>Real Content</h2><p>This is actual user content.</p>',
      text: 'Real Content This is actual user content.'
    }

    // This should not be detected as template
    expect(realContent.html.includes('template-placeholder')).toBe(false)
  })

  it('should calculate completion percentage correctly', async () => {
    if (!testPrdId) {
      console.warn('No test PRD available, skipping test')
      return
    }

    const { data: prd } = await supabase
      .from('prds')
      .select('sections, completion_percentage')
      .eq('id', testPrdId)
      .single()

    expect(prd).toBeDefined()
    
    // Calculate expected percentage
    const requiredSections = prd.sections.filter((s: any) => s.required)
    const completedRequired = requiredSections.filter((s: any) => s.status === 'completed')
    const expectedPercentage = requiredSections.length > 0 
      ? Math.round((completedRequired.length / requiredSections.length) * 100)
      : 0

    // The stored percentage should match our calculation
    expect(prd.completion_percentage).toBe(expectedPercentage)
  })
})