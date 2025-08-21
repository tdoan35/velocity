/**
 * AI Content Extraction Service
 * Extracts structured data from rich text PRD content for agent processing
 */

import { createClient } from '@supabase/supabase-js'

export interface ExtractedStructuredData {
  [key: string]: any
}

export interface ExtractionPrompt {
  sectionType: string
  expectedFields: string[]
  html: string
}

export class ContentExtractionService {
  private supabase: any

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey)
  }

  /**
   * Extract structured data from HTML content based on section type
   */
  async extractStructuredData(
    html: string, 
    sectionType: string
  ): Promise<ExtractedStructuredData> {
    const extractionPrompts = this.getExtractionPrompts()
    const prompt = extractionPrompts[sectionType]
    
    if (!prompt) {
      // Default extraction for unknown section types
      return this.extractGenericStructure(html)
    }

    // Build the extraction prompt
    const systemPrompt = `You are a PRD content analyzer. Extract structured data from the given HTML content.
    Return only valid JSON without any markdown formatting or explanation.
    If a field is not present in the content, set it to null or an empty array as appropriate.`

    const userPrompt = `${prompt.instruction}
    
    HTML Content:
    ${html}
    
    Expected JSON structure:
    ${JSON.stringify(prompt.expectedStructure, null, 2)}`

    try {
      // Call the AI service to extract structured data
      const extractedData = await this.callAIService(systemPrompt, userPrompt)
      return extractedData
    } catch (error) {
      console.error('Error extracting structured data:', error)
      return this.extractGenericStructure(html)
    }
  }

  /**
   * Get extraction prompts for each section type
   */
  private getExtractionPrompts(): Record<string, { instruction: string; expectedStructure: any }> {
    return {
      'overview': {
        instruction: 'Extract the vision, problem statement, target users, and business goals from this PRD overview section.',
        expectedStructure: {
          vision: 'string - The product vision statement',
          problem: 'string - The problem being solved',
          targetUsers: ['array of target user descriptions'],
          businessGoals: ['array of business objectives']
        }
      },
      'core_features': {
        instruction: 'Extract the list of core features with their titles and descriptions.',
        expectedStructure: {
          features: [
            {
              title: 'Feature name',
              description: 'Feature description',
              priority: 'high|medium|low (if mentioned)'
            }
          ]
        }
      },
      'additional_features': {
        instruction: 'Extract the list of additional/future features.',
        expectedStructure: {
          features: [
            {
              title: 'Feature name',
              description: 'Feature description',
              timeframe: 'optional timeframe if mentioned'
            }
          ]
        }
      },
      'ui_design_patterns': {
        instruction: 'Extract design system details, component patterns, and accessibility requirements.',
        expectedStructure: {
          designSystem: {
            colors: 'color scheme description',
            typography: 'font and text styling approach',
            spacing: 'spacing and layout system',
            components: ['list of UI components']
          },
          patterns: ['list of design patterns'],
          accessibility: ['accessibility requirements']
        }
      },
      'ux_flows': {
        instruction: 'Extract user journeys, navigation structure, and interaction patterns.',
        expectedStructure: {
          userJourneys: ['list of user journey descriptions'],
          navigationStructure: 'navigation hierarchy description',
          interactionPatterns: ['list of interaction patterns'],
          responsiveStrategy: 'responsive design approach'
        }
      },
      'technical_architecture': {
        instruction: 'Extract platform targets, technology stack, architecture patterns, and technical requirements.',
        expectedStructure: {
          platforms: ['target platforms'],
          techStack: {
            frontend: ['frontend technologies'],
            backend: ['backend technologies'],
            database: ['database technologies'],
            infrastructure: ['infrastructure components']
          },
          architecture: {
            pattern: 'architecture pattern (e.g., microservices, monolithic)',
            components: ['system components'],
            dataFlow: 'data flow description'
          },
          security: ['security considerations'],
          scalability: ['scalability requirements'],
          performance: ['performance requirements']
        }
      },
      'tech_integrations': {
        instruction: 'Extract third-party services, APIs, and configuration requirements.',
        expectedStructure: {
          integrations: [
            {
              name: 'service name',
              purpose: 'what it\'s used for',
              type: 'API|SDK|webhook|etc'
            }
          ],
          apiConfigurations: ['API configuration details'],
          environmentVariables: ['required environment variables'],
          deploymentConfig: 'deployment configuration details',
          monitoring: ['monitoring and logging services']
        }
      }
    }
  }

  /**
   * Extract generic structure from HTML when section type is unknown
   */
  private extractGenericStructure(html: string): ExtractedStructuredData {
    // Simple extraction based on HTML structure
    const result: ExtractedStructuredData = {}
    
    // Extract headings and their content
    const headingPattern = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi
    const headings = html.match(headingPattern) || []
    
    headings.forEach((heading, index) => {
      const headingText = heading.replace(/<[^>]*>/g, '').trim()
      const headingKey = this.slugify(headingText)
      
      // Try to extract content after this heading until the next heading
      const nextHeadingIndex = headings[index + 1] ? html.indexOf(headings[index + 1]) : html.length
      const currentHeadingIndex = html.indexOf(heading)
      const content = html.substring(currentHeadingIndex + heading.length, nextHeadingIndex)
      
      // Extract lists if present
      const listItems = this.extractListItems(content)
      if (listItems.length > 0) {
        result[headingKey] = listItems
      } else {
        // Extract paragraph text
        const paragraphText = this.extractParagraphText(content)
        if (paragraphText) {
          result[headingKey] = paragraphText
        }
      }
    })
    
    return result
  }

  /**
   * Extract list items from HTML content
   */
  private extractListItems(html: string): string[] {
    const listItemPattern = /<li[^>]*>(.*?)<\/li>/gi
    const matches = html.match(listItemPattern) || []
    return matches.map(item => item.replace(/<[^>]*>/g, '').trim()).filter(item => item.length > 0)
  }

  /**
   * Extract paragraph text from HTML content
   */
  private extractParagraphText(html: string): string {
    const paragraphPattern = /<p[^>]*>(.*?)<\/p>/gi
    const matches = html.match(paragraphPattern) || []
    const text = matches.map(p => p.replace(/<[^>]*>/g, '').trim()).filter(p => p.length > 0).join(' ')
    return text
  }

  /**
   * Convert string to slug format for object keys
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
  }

  /**
   * Call AI service to extract structured data
   * This is a placeholder for actual AI service integration
   */
  private async callAIService(systemPrompt: string, userPrompt: string): Promise<ExtractedStructuredData> {
    // TODO: Integrate with actual AI service (Claude, OpenAI, etc.)
    // For now, we'll use the generic extraction as a fallback
    
    // In production, this would make an API call to Claude or another LLM:
    // const response = await fetch('https://api.anthropic.com/v1/messages', {
    //   method: 'POST',
    //   headers: {
    //     'x-api-key': process.env.ANTHROPIC_API_KEY,
    //     'anthropic-version': '2023-06-01',
    //     'content-type': 'application/json',
    //   },
    //   body: JSON.stringify({
    //     model: 'claude-3-opus-20240229',
    //     messages: [
    //       { role: 'system', content: systemPrompt },
    //       { role: 'user', content: userPrompt }
    //     ],
    //     max_tokens: 1000
    //   })
    // })
    
    // For now, return empty object
    return {}
  }

  /**
   * Extract plain text from HTML content
   */
  extractTextFromHtml(html: string): string {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
  }

  /**
   * Check if content has been meaningfully edited from template
   */
  isTemplateContent(html: string): boolean {
    return html.includes('template-placeholder') || 
           html.includes('Start writing...') ||
           html.includes('Click to start typing...')
  }

  /**
   * Validate extracted data against expected schema
   */
  validateExtractedData(
    data: ExtractedStructuredData, 
    sectionType: string
  ): { isValid: boolean; missingFields: string[] } {
    const prompts = this.getExtractionPrompts()
    const expectedStructure = prompts[sectionType]?.expectedStructure
    
    if (!expectedStructure) {
      return { isValid: true, missingFields: [] }
    }
    
    const missingFields: string[] = []
    
    // Check for required fields based on section type
    switch (sectionType) {
      case 'overview':
        if (!data.vision) missingFields.push('vision')
        if (!data.problem) missingFields.push('problem')
        if (!data.targetUsers || data.targetUsers.length === 0) missingFields.push('targetUsers')
        break
        
      case 'core_features':
        if (!data.features || data.features.length === 0) missingFields.push('features')
        break
        
      case 'technical_architecture':
        if (!data.platforms || data.platforms.length === 0) missingFields.push('platforms')
        if (!data.techStack) missingFields.push('techStack')
        break
        
      // Add other section validations as needed
    }
    
    return {
      isValid: missingFields.length === 0,
      missingFields
    }
  }
}

// Export a factory function for easy instantiation
export function createContentExtractionService(
  supabaseUrl?: string,
  supabaseKey?: string
): ContentExtractionService {
  const url = supabaseUrl || Deno.env.get('SUPABASE_URL')!
  const key = supabaseKey || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  
  return new ContentExtractionService(url, key)
}