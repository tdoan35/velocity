import { z } from 'zod'

// Base section schema
export const BaseSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  order: z.number(),
  agent: z.enum(['project_manager', 'design_assistant', 'engineering_assistant', 'config_helper']),
  required: z.boolean(),
  status: z.enum(['pending', 'in_progress', 'completed']),
  isCustom: z.boolean().default(false),
  description: z.string().optional()
})

// Overview section content schema
export const OverviewSectionSchema = z.object({
  vision: z.string().min(10, 'Vision statement must be at least 10 characters'),
  problem: z.string().min(10, 'Problem statement must be at least 10 characters'),
  targetUsers: z.array(z.string().min(1)).min(1, 'At least one target user must be defined')
})

// Feature schema (used by both core and additional features)
export const FeatureSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(2, 'Feature title must be at least 2 characters'),
  description: z.string().min(10, 'Feature description must be at least 10 characters'),
  priority: z.enum(['high', 'medium', 'low']).optional(),
  acceptance_criteria: z.array(z.string()).optional()
})

// Core features section content schema
export const CoreFeaturesSectionSchema = z.object({
  features: z.array(FeatureSchema).min(1, 'At least one core feature must be defined')
})

// Additional features section content schema
export const AdditionalFeaturesSectionSchema = z.object({
  features: z.array(FeatureSchema)
})

// UI Design patterns schema
export const UIDesignPatternsSectionSchema = z.object({
  designSystem: z.string().optional(),
  colorScheme: z.object({
    primary: z.string().optional(),
    secondary: z.string().optional(),
    accent: z.string().optional(),
    neutral: z.array(z.string()).optional()
  }).optional(),
  typography: z.object({
    fontFamily: z.string().optional(),
    scale: z.array(z.string()).optional()
  }).optional(),
  components: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    usage: z.string().optional()
  })).optional(),
  patterns: z.array(z.object({
    name: z.string(),
    description: z.string(),
    example: z.string().optional()
  })).optional()
})

// UX Flows section schema
export const UXFlowsSectionSchema = z.object({
  userJourneys: z.array(z.object({
    name: z.string(),
    description: z.string(),
    steps: z.array(z.string()).optional(),
    persona: z.string().optional()
  })).min(1, 'At least one user journey must be defined'),
  navigationStructure: z.object({
    type: z.enum(['hierarchical', 'flat', 'hybrid']).optional(),
    mainSections: z.array(z.string()).optional()
  }).optional(),
  interactionPatterns: z.array(z.object({
    name: z.string(),
    description: z.string()
  })).optional()
})

// Technical Architecture section schema
export const TechnicalArchitectureSectionSchema = z.object({
  platforms: z.array(z.enum(['web', 'ios', 'android', 'desktop'])).min(1),
  techStack: z.object({
    frontend: z.array(z.string()).optional(),
    backend: z.array(z.string()).optional(),
    database: z.array(z.string()).optional(),
    infrastructure: z.array(z.string()).optional()
  }),
  architecture: z.object({
    pattern: z.enum(['monolithic', 'microservices', 'serverless', 'hybrid']).optional(),
    description: z.string().optional()
  }).optional(),
  scalability: z.object({
    targetLoad: z.string().optional(),
    strategy: z.string().optional()
  }).optional(),
  security: z.object({
    authentication: z.string().optional(),
    authorization: z.string().optional(),
    dataProtection: z.string().optional()
  }).optional()
})

// Tech Integrations section schema
export const TechIntegrationsSectionSchema = z.object({
  integrations: z.array(z.object({
    name: z.string(),
    type: z.enum(['api', 'sdk', 'webhook', 'database', 'service']),
    purpose: z.string(),
    configuration: z.record(z.any()).optional()
  })),
  apis: z.array(z.object({
    name: z.string(),
    endpoint: z.string().optional(),
    authentication: z.string().optional()
  })).optional(),
  environment: z.object({
    development: z.record(z.string()).optional(),
    staging: z.record(z.string()).optional(),
    production: z.record(z.string()).optional()
  }).optional()
})

// Custom section schema (flexible)
export const CustomSectionSchema = z.record(z.any())

// Map section IDs to their schemas
export const sectionSchemas: Record<string, z.ZodType<any>> = {
  overview: OverviewSectionSchema,
  core_features: CoreFeaturesSectionSchema,
  additional_features: AdditionalFeaturesSectionSchema,
  ui_design_patterns: UIDesignPatternsSectionSchema,
  ux_flows: UXFlowsSectionSchema,
  technical_architecture: TechnicalArchitectureSectionSchema,
  tech_integrations: TechIntegrationsSectionSchema
}

// Complete PRD Section schema
export const PRDSectionSchema = BaseSectionSchema.extend({
  content: z.any() // Will be validated based on section type
})

// Validation function that uses the appropriate schema based on section type
export function validateSectionContent(sectionId: string, content: any): {
  success: boolean
  data?: any
  errors?: string[]
} {
  const schema = sectionSchemas[sectionId] || CustomSectionSchema
  
  try {
    const validated = schema.parse(content)
    return { success: true, data: validated }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        errors: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      }
    }
    return {
      success: false,
      errors: ['Unknown validation error']
    }
  }
}

// Type exports derived from schemas
export type OverviewSection = z.infer<typeof OverviewSectionSchema>
export type Feature = z.infer<typeof FeatureSchema>
export type CoreFeaturesSection = z.infer<typeof CoreFeaturesSectionSchema>
export type AdditionalFeaturesSection = z.infer<typeof AdditionalFeaturesSectionSchema>
export type UIDesignPatternsSection = z.infer<typeof UIDesignPatternsSectionSchema>
export type UXFlowsSection = z.infer<typeof UXFlowsSectionSchema>
export type TechnicalArchitectureSection = z.infer<typeof TechnicalArchitectureSectionSchema>
export type TechIntegrationsSection = z.infer<typeof TechIntegrationsSectionSchema>
export type PRDSection = z.infer<typeof PRDSectionSchema>

// Helper to get empty content for a section type
export function getEmptySectionContent(sectionId: string): any {
  switch (sectionId) {
    case 'overview':
      return { vision: '', problem: '', targetUsers: [] }
    case 'core_features':
    case 'additional_features':
      return { features: [] }
    case 'ui_design_patterns':
      return { patterns: [] }
    case 'ux_flows':
      return { userJourneys: [] }
    case 'technical_architecture':
      return { platforms: [], techStack: {} }
    case 'tech_integrations':
      return { integrations: [] }
    default:
      return {}
  }
}