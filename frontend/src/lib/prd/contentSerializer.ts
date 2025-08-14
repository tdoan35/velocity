import type { JSONContent } from '@tiptap/core'

/**
 * ContentSerializer handles transformation between TipTap JSON and structured PRD data
 */
export class ContentSerializer {
  /**
   * Extract structured data from TipTap JSON based on section type
   */
  static extractStructuredData(
    sectionId: string,
    editorJSON: JSONContent
  ): Record<string, any> {
    switch (sectionId) {
      case 'overview':
        return this.extractOverviewData(editorJSON)
      case 'core_features':
        return this.extractFeaturesData(editorJSON)
      case 'additional_features':
        return this.extractFeaturesData(editorJSON)
      case 'ui_design_patterns':
        return this.extractDesignData(editorJSON)
      case 'technical_architecture':
        return this.extractTechnicalData(editorJSON)
      default:
        return { content: editorJSON }
    }
  }

  /**
   * Convert structured data to TipTap JSON for editing
   */
  static structuredToJSON(
    sectionId: string,
    structuredData: Record<string, any>
  ): JSONContent {
    switch (sectionId) {
      case 'overview':
        return this.overviewToJSON(structuredData)
      case 'core_features':
        return this.featuresToJSON(structuredData)
      case 'additional_features':
        return this.featuresToJSON(structuredData)
      case 'ui_design_patterns':
        return this.designToJSON(structuredData)
      case 'technical_architecture':
        return this.technicalToJSON(structuredData)
      default:
        return structuredData.editorJSON || structuredData.content || {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: '' }],
            },
          ],
        }
    }
  }

  // Extract overview section data
  private static extractOverviewData(json: JSONContent): Record<string, any> {
    const data = {
      vision: '',
      problem: '',
      targetUsers: [] as string[],
      businessGoals: [] as string[],
    }

    if (!json.content) return data

    let currentSection = ''
    
    json.content.forEach((node) => {
      if (node.type === 'heading') {
        const headingText = this.extractText(node).toLowerCase()
        if (headingText.includes('vision')) {
          currentSection = 'vision'
        } else if (headingText.includes('problem')) {
          currentSection = 'problem'
        } else if (headingText.includes('target') || headingText.includes('user')) {
          currentSection = 'targetUsers'
        } else if (headingText.includes('goal') || headingText.includes('objective')) {
          currentSection = 'businessGoals'
        }
      } else if (node.type === 'paragraph' && currentSection) {
        const text = this.extractText(node)
        if (text && currentSection === 'vision') {
          data.vision = text
        } else if (text && currentSection === 'problem') {
          data.problem = text
        }
      } else if (node.type === 'bulletList' && currentSection) {
        const items = this.extractListItems(node)
        if (currentSection === 'targetUsers') {
          data.targetUsers = items
        } else if (currentSection === 'businessGoals') {
          data.businessGoals = items
        }
      }
    })

    return data
  }

  // Extract features data from task lists or bullet lists
  private static extractFeaturesData(json: JSONContent): Record<string, any> {
    const features: Array<{
      id?: string
      title: string
      description: string
      priority?: string
      completed?: boolean
    }> = []

    if (!json.content) return { features }

    json.content.forEach((node) => {
      if (node.type === 'taskList') {
        node.content?.forEach((item) => {
          if (item.type === 'taskItem') {
            const text = this.extractText(item)
            const [title, ...descParts] = text.split(':')
            features.push({
              id: `feature_${Date.now()}_${Math.random()}`,
              title: title.trim(),
              description: descParts.join(':').trim() || '',
              completed: item.attrs?.checked || false,
            })
          }
        })
      } else if (node.type === 'bulletList' || node.type === 'orderedList') {
        node.content?.forEach((item) => {
          const text = this.extractText(item)
          const [title, ...descParts] = text.split(':')
          features.push({
            id: `feature_${Date.now()}_${Math.random()}`,
            title: title.trim(),
            description: descParts.join(':').trim() || '',
          })
        })
      }
    })

    return { features }
  }

  // Extract design patterns data
  private static extractDesignData(json: JSONContent): Record<string, any> {
    const data = {
      designSystem: {
        colors: {},
        typography: {},
        spacing: {},
        components: [] as string[],
      },
      patterns: [] as string[],
      accessibility: [] as string[],
    }

    // Simple extraction - can be enhanced based on needs
    if (json.content) {
      json.content.forEach((node) => {
        if (node.type === 'bulletList') {
          const items = this.extractListItems(node)
          data.patterns = [...data.patterns, ...items]
        }
      })
    }

    return data
  }

  // Extract technical architecture data
  private static extractTechnicalData(json: JSONContent): Record<string, any> {
    const data = {
      platforms: [] as string[],
      techStack: {
        frontend: [] as string[],
        backend: [] as string[],
        database: [] as string[],
        infrastructure: [] as string[],
      },
      architecture: {
        pattern: '',
        dataFlow: '',
        components: [] as string[],
      },
      performance: [] as string[],
      security: [] as string[],
      scalability: [] as string[],
    }

    // Simple extraction - can be enhanced
    if (json.content) {
      let currentSection = ''
      
      json.content.forEach((node) => {
        if (node.type === 'heading') {
          const headingText = this.extractText(node).toLowerCase()
          if (headingText.includes('platform')) {
            currentSection = 'platforms'
          } else if (headingText.includes('stack') || headingText.includes('technology')) {
            currentSection = 'techStack'
          }
        } else if (node.type === 'bulletList' && currentSection) {
          const items = this.extractListItems(node)
          if (currentSection === 'platforms') {
            data.platforms = items
          }
        }
      })
    }

    return data
  }

  // Convert overview structured data to TipTap JSON
  private static overviewToJSON(data: Record<string, any>): JSONContent {
    const content: any[] = []

    if (data.vision) {
      content.push(
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Vision' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: data.vision }],
        }
      )
    }

    if (data.problem) {
      content.push(
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Problem Statement' }],
        },
        {
          type: 'paragraph',
          content: [{ type: 'text', text: data.problem }],
        }
      )
    }

    if (data.targetUsers && data.targetUsers.length > 0) {
      content.push(
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Target Users' }],
        },
        {
          type: 'bulletList',
          content: data.targetUsers.map((user: string) => ({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: user }],
              },
            ],
          })),
        }
      )
    }

    return {
      type: 'doc',
      content: content.length > 0 ? content : [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '' }],
        },
      ],
    }
  }

  // Convert features to TipTap JSON
  private static featuresToJSON(data: Record<string, any>): JSONContent {
    const content: any[] = [
      {
        type: 'heading',
        attrs: { level: 3 },
        content: [{ type: 'text', text: 'Features' }],
      },
    ]

    if (data.features && data.features.length > 0) {
      content.push({
        type: 'taskList',
        content: data.features.map((feature: any) => ({
          type: 'taskItem',
          attrs: { checked: feature.completed || false },
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: feature.description
                    ? `${feature.title}: ${feature.description}`
                    : feature.title,
                },
              ],
            },
          ],
        })),
      })
    }

    return {
      type: 'doc',
      content,
    }
  }

  // Convert design patterns to TipTap JSON
  private static designToJSON(data: Record<string, any>): JSONContent {
    const content: any[] = []

    if (data.patterns && data.patterns.length > 0) {
      content.push(
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Design Patterns' }],
        },
        {
          type: 'bulletList',
          content: data.patterns.map((pattern: string) => ({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: pattern }],
              },
            ],
          })),
        }
      )
    }

    return {
      type: 'doc',
      content: content.length > 0 ? content : [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '' }],
        },
      ],
    }
  }

  // Convert technical architecture to TipTap JSON
  private static technicalToJSON(data: Record<string, any>): JSONContent {
    const content: any[] = []

    if (data.platforms && data.platforms.length > 0) {
      content.push(
        {
          type: 'heading',
          attrs: { level: 3 },
          content: [{ type: 'text', text: 'Target Platforms' }],
        },
        {
          type: 'bulletList',
          content: data.platforms.map((platform: string) => ({
            type: 'listItem',
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: platform }],
              },
            ],
          })),
        }
      )
    }

    return {
      type: 'doc',
      content: content.length > 0 ? content : [
        {
          type: 'paragraph',
          content: [{ type: 'text', text: '' }],
        },
      ],
    }
  }

  // Helper: Extract text from a node
  private static extractText(node: JSONContent): string {
    if (node.type === 'text') {
      return node.text || ''
    }
    if (node.content) {
      return node.content.map((n) => this.extractText(n)).join('')
    }
    return ''
  }

  // Helper: Extract list items as strings
  private static extractListItems(node: JSONContent): string[] {
    const items: string[] = []
    if (node.content) {
      node.content.forEach((item) => {
        if (item.type === 'listItem' || item.type === 'taskItem') {
          items.push(this.extractText(item))
        }
      })
    }
    return items
  }

  /**
   * Validate if content matches expected schema for a section
   */
  static validateContent(
    sectionId: string,
    content: Record<string, any>
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    switch (sectionId) {
      case 'overview':
        if (!content.vision || content.vision.length < 10) {
          errors.push('Vision statement is required (minimum 10 characters)')
        }
        if (!content.problem || content.problem.length < 20) {
          errors.push('Problem statement is required (minimum 20 characters)')
        }
        if (!content.targetUsers || content.targetUsers.length === 0) {
          errors.push('At least one target user group is required')
        }
        break

      case 'core_features':
        if (!content.features || content.features.length < 3) {
          errors.push('At least 3 core features are required')
        }
        break

      case 'technical_architecture':
        if (!content.platforms || content.platforms.length === 0) {
          errors.push('At least one target platform is required')
        }
        break
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}