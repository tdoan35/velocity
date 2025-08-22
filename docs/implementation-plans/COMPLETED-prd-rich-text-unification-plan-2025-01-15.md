# PRD Rich Text Unification Implementation Plan

**Date**: January 15, 2025  
**Approach**: Rich Text Only (Unified Content Model)  
**Goal**: Implement single rich text source of truth for PRD content from the start

## Overview

This plan implements a unified PRD content model using rich text (HTML/text) as the single source of truth, with AI-powered extraction for structured data when needed by agents. Since this is a pre-launch implementation, we can design the system correctly from the beginning without migration concerns.

## Phase 1: Backend Data Model Implementation

### 1.1 Update PRD Section Interface

**File**: `supabase/functions/shared/prd-sections-config.ts`  
**Lines**: 9-20

```typescript
// BEFORE (Line 15):
content: Record<string, any>;

// AFTER:
content: {
  html: string;
  text: string;
};
```

**Changes Required**:
- Line 15: Replace `content: Record<string, any>` with structured HTML/text content
- Lines 53-58: Update template structure in overview section
- Lines 67-70: Update template structure in core_features section
- Lines 78-81: Update template structure in additional_features section
- Lines 105-113: Update UI design patterns template
- Lines 122-127: Update UX flows template
- Lines 151-167: Update technical architecture template
- Lines 191-197: Update tech integrations template

### 1.2 Update Template Initialization Functions

**File**: `supabase/functions/shared/prd-sections-config.ts`  
**Lines**: 242-260

```typescript
// REPLACE initializePRDSections() function:
export function initializePRDSections(): PRDSection[] {
  const sections: PRDSection[] = [];
  let order = 1;

  const sectionTemplates = {
    'overview': `<h2>Vision</h2><p class="template-placeholder">What is your app's core vision?</p><h2>Problem</h2><p class="template-placeholder">What problem does it solve?</p><h2>Target Users</h2><p class="template-placeholder">Who are your target users?</p><h2>Business Goals</h2><p class="template-placeholder">What are your business objectives?</p>`,
    'core_features': `<h2>Core Features</h2><ul><li class="template-placeholder">Essential feature 1</li><li class="template-placeholder">Essential feature 2</li><li class="template-placeholder">Essential feature 3</li></ul>`,
    'additional_features': `<h2>Additional Features</h2><ul><li class="template-placeholder">Nice-to-have feature 1</li><li class="template-placeholder">Future enhancement 2</li></ul>`,
    'ui_design_patterns': `<h2>Design System</h2><p class="template-placeholder">Define your visual design approach</p><h2>Component Patterns</h2><p class="template-placeholder">Describe UI component patterns</p><h2>Accessibility</h2><p class="template-placeholder">Accessibility requirements</p>`,
    'ux_flows': `<h2>User Journeys</h2><p class="template-placeholder">Map key user flows</p><h2>Navigation Structure</h2><p class="template-placeholder">Define app navigation</p><h2>Interaction Patterns</h2><p class="template-placeholder">Describe user interactions</p>`,
    'technical_architecture': `<h2>Platforms</h2><p class="template-placeholder">Target platforms (iOS, Android, Web)</p><h2>Tech Stack</h2><p class="template-placeholder">Frontend, backend, database technologies</p><h2>Architecture Pattern</h2><p class="template-placeholder">System architecture approach</p><h2>Security</h2><p class="template-placeholder">Security considerations</p>`,
    'tech_integrations': `<h2>Third-Party Services</h2><p class="template-placeholder">External APIs and services</p><h2>Authentication</h2><p class="template-placeholder">Auth providers and methods</p><h2>Environment Configuration</h2><p class="template-placeholder">Environment variables and config</p>`
  };

  for (const agentType of AGENT_SEQUENCE) {
    const agentConfig = AGENT_SECTION_CONFIGS[agentType];
    for (const sectionConfig of agentConfig.sections) {
      const templateHtml = sectionTemplates[sectionConfig.id] || '<p class="template-placeholder">Start writing...</p>';
      
      sections.push({
        ...sectionConfig,
        order,
        content: {
          html: templateHtml,
          text: extractTextFromHtml(templateHtml)
        },
        status: 'pending'
      });
      order++;
    }
  }

  return sections;
}

// Add helper function
function extractTextFromHtml(html: string): string {
  // Simple text extraction - replace with more robust solution if needed
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
```

### 1.3 Update Content Update Functions

**File**: `supabase/functions/shared/prd-sections-config.ts`  
**Lines**: 308-317

```typescript
// REPLACE updateSectionContent function:
export function updateSectionContent(
  sections: PRDSection[],
  sectionId: string,
  content: { html: string; text: string }
): PRDSection[] {
  return sections.map(s => 
    s.id === sectionId ? { ...s, content, status: 'completed' } : s
  );
}
```

## Phase 2: Backend API Implementation

### 2.1 Update PRD Management Edge Function

**File**: `supabase/functions/prd-management/index.ts`  
**Lines**: 266-267

```typescript
// UPDATE updateSectionContent call (Line 267):
const updatedSections = updateSectionContent(sections, sectionId, data)
```

**Validation Updates**:
**Lines**: 756-803 - Update `validatePRDSectionFlexible` function:

```typescript
async function validatePRDSectionFlexible(
  prdId: string,
  sectionId: string,
  data: { html: string; text: string },
  supabase: any
): Promise<{ valid: boolean; errors: string[]; warnings: string[] }> {
  // ... existing validation logic
  
  const errors: string[] = []
  const warnings: string[] = []

  // Validate HTML content length and structure
  if (!data.html || data.html.length < 20) {
    errors.push('Content is too short or missing')
  }
  
  if (!data.text || data.text.length < 10) {
    errors.push('Text content is missing')
  }

  // Section-specific validation using AI-powered extraction
  switch (sectionId) {
    case 'overview':
      if (!data.html.includes('<h2>Vision</h2>') || !data.html.includes('<h2>Problem</h2>')) {
        warnings.push('Overview should include Vision and Problem sections')
      }
      break;
    
    case 'core_features':
      if (!data.html.includes('<ul>') && !data.html.includes('<ol>')) {
        warnings.push('Core features should be structured as a list')
      }
      break;
    
    // Add other section validations...
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings
  }
}
```

### 2.2 Add AI Content Extraction Service

**File**: `supabase/functions/_shared/ai/content-extraction-service.ts` (NEW FILE)

```typescript
import { createClient } from '@supabase/supabase-js'

export interface ExtractedStructuredData {
  [key: string]: any
}

export class ContentExtractionService {
  private supabase: any

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }

  async extractStructuredData(
    html: string, 
    sectionType: string
  ): Promise<ExtractedStructuredData> {
    const extractionPrompts = {
      'overview': `Extract structured data from this PRD overview HTML: ${html}
        Return JSON with fields: {vision: string, problem: string, targetUsers: string[], businessGoals: string[]}`,
      'core_features': `Extract core features from this HTML: ${html}
        Return JSON with fields: {features: Array<{title: string, description: string, priority: string}>}`,
      'technical_architecture': `Extract technical details from this HTML: ${html}
        Return JSON with fields: {platforms: string[], techStack: object, architecture: object, security: string[], scalability: string[]}`
      // Add other section types...
    }

    const prompt = extractionPrompts[sectionType] || `Extract key information from this HTML: ${html}`
    
    // TODO: Implement actual LLM call
    // For now, return empty structure
    return {}
  }

  extractTextFromHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }
}
```

## Phase 3: Frontend Service Implementation

### 3.1 Update PRD Service Interface

**File**: `frontend/src/services/prdService.ts`  
**Lines**: 21-30

```typescript
// UPDATE FlexiblePRDSection interface:
export interface FlexiblePRDSection {
  id: string
  title: string
  order: number
  agent: AgentType | 'human'
  required: boolean
  content: {
    html: string
    text: string
  }
  status: SectionStatus
  isCustom: boolean
  description?: string
  template?: {
    html: string
    text: string
  }
}
```

### 3.2 Update PRD API Calls

**File**: `frontend/src/services/prdService.ts`  
**Lines**: Add new functions

```typescript
// ADD new content validation function:
export function validateRichTextContent(content: { html: string; text: string }): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = []
  const warnings: string[] = []

  if (!content.html || content.html.length < 20) {
    errors.push('Content is too short')
  }

  if (!content.text || content.text.length < 10) {
    errors.push('Text content is missing')
  }

  // Check for template placeholders still present
  if (content.html.includes('template-placeholder')) {
    warnings.push('Template placeholders should be replaced with actual content')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

// ADD helper function for HTML text extraction:
export function extractTextFromHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
```

## Phase 4: Frontend Component Implementation

### 4.1 Update Rich Text Editor Component

**File**: `frontend/src/components/new-prd/blocks/NotionRichTextEditor.tsx`  
**Lines**: 20-27

```typescript
// UPDATE interface:
interface NotionRichTextEditorProps {
  content: {
    html: string
    text: string
  }
  onChange: (content: { html: string; text: string }) => void
  onBlur?: () => void
  placeholder?: string
  className?: string
  editable?: boolean
  sectionType?: string // Add for template awareness
}
```

**Lines**: 36-66 - Update component logic:

```typescript
export function NotionRichTextEditor({ 
  content, 
  onChange, 
  onBlur,
  placeholder = 'Click to start typing...',
  className,
  editable = true,
  sectionType
}: NotionRichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [2, 3]
        }
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: 'is-editor-empty'
      })
    ],
    content: content.html,
    editable,
    onUpdate: ({ editor }) => {
      const html = editor.getHTML()
      const text = editor.getText()
      onChange({ html, text })
    },
    onBlur: () => {
      onBlur?.()
    },
    // ... rest of editor props
  })

  // Update editor content when prop changes
  useEffect(() => {
    if (editor && content.html !== editor.getHTML()) {
      editor.commands.setContent(content.html)
    }
  }, [content.html, editor])

  // ... rest of component
}
```

### 4.2 Create Template Initialization Hook

**File**: `frontend/src/hooks/usePRDTemplates.ts` (NEW FILE)

```typescript
import { useCallback } from 'react'

interface TemplateContent {
  html: string
  text: string
}

export const sectionTemplates: Record<string, TemplateContent> = {
  'overview': {
    html: `<h2>Vision</h2><p class="template-placeholder">What is your app's core vision?</p><h2>Problem</h2><p class="template-placeholder">What problem does it solve?</p><h2>Target Users</h2><p class="template-placeholder">Who are your target users?</p><h2>Business Goals</h2><p class="template-placeholder">What are your business objectives?</p>`,
    text: 'Vision Problem Target Users Business Goals'
  },
  'core_features': {
    html: `<h2>Core Features</h2><ul><li class="template-placeholder">Essential feature 1</li><li class="template-placeholder">Essential feature 2</li><li class="template-placeholder">Essential feature 3</li></ul>`,
    text: 'Core Features'
  },
  // Add other templates...
}

export function usePRDTemplates() {
  const getTemplate = useCallback((sectionId: string): TemplateContent => {
    return sectionTemplates[sectionId] || {
      html: '<p class="template-placeholder">Start writing...</p>',
      text: 'Start writing...'
    }
  }, [])

  const isTemplatePlaceholder = useCallback((content: TemplateContent): boolean => {
    return content.html.includes('template-placeholder') || 
           content.text.includes('Start writing...')
  }, [])

  return {
    getTemplate,
    isTemplatePlaceholder,
    sectionTemplates
  }
}
```

### 4.3 Update Section Block Editor

**File**: `frontend/src/components/new-prd/blocks/SectionBlockEditor.tsx`  
**Lines**: Update to use new content structure

```typescript
import { NotionRichTextEditor } from './NotionRichTextEditor'
import { usePRDTemplates } from '@/hooks/usePRDTemplates'

interface SectionBlockEditorProps {
  section: FlexiblePRDSection
  onUpdate: (sectionId: string, content: { html: string; text: string }) => void
  isActive?: boolean
}

export function SectionBlockEditor({ section, onUpdate, isActive }: SectionBlockEditorProps) {
  const { getTemplate, isTemplatePlaceholder } = usePRDTemplates()

  const handleContentChange = (content: { html: string; text: string }) => {
    onUpdate(section.id, content)
  }

  // Initialize content if empty
  const effectiveContent = section.content.html 
    ? section.content 
    : getTemplate(section.id)

  return (
    <div className="section-block">
      <div className="section-header">
        <h3>{section.title}</h3>
        <span className={`status-badge ${section.status}`}>
          {section.status}
        </span>
      </div>
      
      <NotionRichTextEditor
        content={effectiveContent}
        onChange={handleContentChange}
        sectionType={section.id}
        placeholder={`Add content for ${section.title}...`}
        className="section-editor"
      />
    </div>
  )
}
```

## Phase 5: Database Schema Setup

### 5.1 Ensure Database Schema Supports Rich Text

**File**: `supabase/migrations/20250115000001_prd_rich_text_setup.sql` (NEW FILE)

```sql
-- Ensure PRD sections column supports rich text content structure
-- Since this is a pre-launch implementation, we're setting up the schema correctly from the start

-- Add index for better performance on HTML content searches
CREATE INDEX IF NOT EXISTS idx_prds_sections_content_text ON prds USING gin ((sections::text));

-- Add a comment to document the expected content structure
COMMENT ON COLUMN prds.sections IS 'PRD sections with rich text content structure: {content: {html: string, text: string}}';

-- Verify the sections column exists and has the right structure
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_name = 'prds' AND column_name = 'sections') THEN
    RAISE NOTICE 'PRD sections column exists and ready for rich text content';
  END IF;
END $$;
```

## Phase 6: Testing and Validation

### 6.1 Update Test Files

**File**: `frontend/src/__tests__/prd-rich-text.test.ts` (NEW FILE)

```typescript
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
})
```

## Implementation Timeline

### Week 1: Backend Implementation
- [ ] Update PRD section interfaces and types
- [ ] Modify template initialization functions
- [ ] Update content validation logic
- [ ] Create AI content extraction service

### Week 2: Database Schema Setup
- [ ] Create database schema documentation
- [ ] Add performance indexes
- [ ] Validate schema structure

### Week 3: Frontend Implementation
- [ ] Update PRD service interfaces
- [ ] Modify rich text editor component
- [ ] Create template management hooks
- [ ] Update section block editors

### Week 4: Testing and Integration
- [ ] Write comprehensive tests
- [ ] Test agent integration with rich text
- [ ] Performance optimization
- [ ] End-to-end testing

## Success Criteria

1. **Clean Implementation**: Rich text content model implemented correctly from the start
2. **Agent Compatibility**: AI agents can extract structured data from rich text content
3. **User Experience**: Seamless Notion-like editing experience
4. **Performance**: Optimized editor performance with proper indexing
5. **Validation**: Content validation works with rich text format

## Implementation Notes

Since this is a pre-launch implementation:
- No data migration concerns
- Can implement the optimal solution from the start
- Focus on clean, maintainable architecture
- Ensure proper testing coverage from day one

---

**Next Steps**: Begin with Phase 1 backend updates, focusing on the interface changes in `prd-sections-config.ts`.