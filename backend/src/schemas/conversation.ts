import { z } from 'zod'

// ============================================================================
// Base response schemas
// ============================================================================

export const suggestedResponseSchema = z.object({
  text: z.string()
    .max(50)
    .describe('Short suggested response (5-8 words maximum)'),
  category: z.enum(['continuation', 'clarification', 'example'])
    .optional()
    .describe('The type of suggestion'),
  section: z.string().optional().describe('Relevant PRD section if applicable'),
})

export const assistantResponseSchema = z.object({
  message: z.string().describe('The main response message from the assistant'),
  conversationTitle: z.string()
    .max(50)
    .optional()
    .describe('A brief, descriptive title for the conversation (only for first message in new conversations)'),
  suggestedResponses: z.array(suggestedResponseSchema)
    .max(3)
    .optional()
    .describe('Up to 3 suggested follow-up responses'),
  metadata: z.object({
    confidence: z.number().min(0).max(1).optional(),
    sources: z.array(z.string()).optional(),
    relatedTopics: z.array(z.string()).optional(),
  }).optional().describe('Additional metadata about the response'),
})

export const builderResponseSchema = z.object({
  message: z.string().describe('Status/progress message shown in chat'),
  conversationTitle: z.string().max(50).optional(),
  suggestedResponses: z.array(suggestedResponseSchema).max(3).optional(),
  fileOperations: z.array(z.object({
    operation: z.enum(['create', 'update', 'delete']),
    filePath: z.string().describe('Relative path, e.g. src/App.tsx'),
    content: z.string().optional().describe('Full file content'),
    reason: z.string().optional().describe('What this file does'),
  })).describe('Files to create or modify'),
  metadata: z.object({
    confidence: z.number().min(0).max(1).optional(),
    sources: z.array(z.string()).optional(),
    relatedTopics: z.array(z.string()).optional(),
  }).optional(),
})

export type AssistantResponse = z.infer<typeof assistantResponseSchema>
export type BuilderResponse = z.infer<typeof builderResponseSchema>
export type SuggestedResponse = z.infer<typeof suggestedResponseSchema>

// ============================================================================
// Design Phase Output Schemas
// ============================================================================

export const productOverviewOutputSchema = z.object({
  name: z.string().describe('The product/app name'),
  description: z.string().describe('A concise product description (1-2 sentences)'),
  problems: z.array(z.object({
    problem: z.string().describe('A specific problem the product solves'),
    solution: z.string().describe('How the product solves this problem'),
  })).min(1).max(5).describe('Key problems and their solutions'),
  features: z.array(z.object({
    title: z.string().describe('Feature name'),
    description: z.string().describe('Brief feature description'),
  })).min(3).max(8).describe('Core product features'),
})

export const productRoadmapOutputSchema = z.object({
  sections: z.array(z.object({
    id: z.string().describe('Kebab-case identifier for the section (e.g., "user-auth", "feed-timeline")'),
    title: z.string().describe('Human-readable section title'),
    description: z.string().describe('What this section covers'),
    order: z.number().int().describe('Display order (1-based)'),
  })).min(2).max(8).describe('Product sections for incremental development'),
})

export const dataModelOutputSchema = z.object({
  entities: z.array(z.object({
    name: z.string().describe('Entity name (e.g., "User", "Post")'),
    fields: z.array(z.object({
      name: z.string().describe('Field name'),
      type: z.string().describe('Field type (string, number, boolean, date, etc.)'),
      required: z.boolean().describe('Whether this field is required'),
      description: z.string().optional().describe('Brief description of this field'),
    })).min(1).describe('Entity fields'),
  })).min(1).max(15).describe('Data model entities'),
  relationships: z.array(z.object({
    from: z.string().describe('Source entity name'),
    to: z.string().describe('Target entity name'),
    type: z.enum(['one-to-one', 'one-to-many', 'many-to-many']).describe('Relationship type'),
    label: z.string().describe('Relationship label (e.g., "has many", "belongs to")'),
  })).describe('Relationships between entities'),
})

export const designSystemOutputSchema = z.object({
  colors: z.object({
    primary: z.object({ name: z.string(), value: z.string(), description: z.string().optional() }),
    secondary: z.object({ name: z.string(), value: z.string(), description: z.string().optional() }),
    neutral: z.object({ name: z.string(), value: z.string(), description: z.string().optional() }),
    accent: z.object({ name: z.string(), value: z.string(), description: z.string().optional() }),
  }).describe('Color palette with hex values'),
  typography: z.object({
    heading: z.object({ family: z.string(), weights: z.array(z.number()), sizes: z.record(z.string()).optional() }),
    body: z.object({ family: z.string(), weights: z.array(z.number()), sizes: z.record(z.string()).optional() }),
    mono: z.object({ family: z.string(), weights: z.array(z.number()), sizes: z.record(z.string()).optional() }),
  }).describe('Typography definitions using Google Fonts'),
  spacing: z.record(z.string()).optional().describe('Spacing scale'),
  borderRadius: z.record(z.string()).optional().describe('Border radius scale'),
})

export const shellSpecOutputSchema = z.object({
  overview: z.string().describe('Brief overview of the application shell design'),
  navigationItems: z.array(z.object({
    label: z.string().describe('Navigation item label'),
    icon: z.string().describe('Icon name (Lucide icon)'),
    route: z.string().describe('Route path'),
    sectionId: z.string().describe('Associated section ID from roadmap'),
  })).min(1).max(8).describe('Navigation items'),
  layoutPattern: z.string().describe('Layout pattern: sidebar, top-nav, bottom-tabs, or minimal'),
  raw: z.string().describe('Full text description of the shell design'),
})

export const sectionSpecOutputSchema = z.object({
  overview: z.string().describe('Overview of what this section does'),
  keyFeatures: z.array(z.string()).min(1).max(8).describe('Key features of this section'),
  requirements: z.array(z.string()).min(1).max(10).describe('Functional requirements'),
  acceptance: z.array(z.string()).min(1).max(8).describe('Acceptance criteria'),
})

export const sampleDataOutputSchema = z.object({
  sampleData: z.record(z.any()).describe('Realistic sample data as JSON with _meta field'),
  typesDefinition: z.string().describe('TypeScript interfaces as a string'),
})

export type DesignPhaseType =
  | 'product_vision'
  | 'product_roadmap'
  | 'data_model'
  | 'design_tokens'
  | 'design_shell'
  | 'shape_section'
  | 'sample_data'

export function getDesignPhaseSchema(phase: DesignPhaseType) {
  const phaseOutputSchemas: Record<DesignPhaseType, z.ZodTypeAny> = {
    product_vision: productOverviewOutputSchema,
    product_roadmap: productRoadmapOutputSchema,
    data_model: dataModelOutputSchema,
    design_tokens: designSystemOutputSchema,
    design_shell: shellSpecOutputSchema,
    shape_section: sectionSpecOutputSchema,
    sample_data: sampleDataOutputSchema,
  }
  const phaseOutputSchema = phaseOutputSchemas[phase]

  return z.object({
    message: z.string().describe('The main response message from the assistant'),
    conversationTitle: z.string()
      .max(50)
      .optional()
      .describe('A brief, descriptive title for the conversation (only for first message)'),
    suggestedResponses: z.array(suggestedResponseSchema)
      .max(3)
      .optional()
      .describe('Up to 3 suggested follow-up responses'),
    metadata: z.object({
      confidence: z.number().min(0).max(1).optional(),
      sources: z.array(z.string()).optional(),
      relatedTopics: z.array(z.string()).optional(),
    }).optional().describe('Additional metadata about the response'),
    readyToSave: z.boolean()
      .default(false)
      .describe('Set to true ONLY when you have presented a complete summary to the user and are asking for their approval. Keep false during questions and clarifications.'),
    phaseComplete: z.boolean()
      .default(false)
      .describe('Set to true when the user approves and you populate phaseOutput. Set to false otherwise.'),
    phaseOutput: phaseOutputSchema
      .optional()
      .describe('Structured phase output data. Populate this when the user approves your summary and set phaseComplete to true.'),
  })
}

// ============================================================================
// Request / state interfaces
// ============================================================================

export interface ConversationRequest {
  conversationId?: string
  message: string
  context?: {
    currentCode?: string
    fileContext?: string
    projectState?: any
    prdId?: string
    prdSection?: string
    productOverview?: any
    [key: string]: any
  }
  action?: 'continue' | 'refine' | 'explain' | 'debug'
  agentType?: 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper' | 'builder'
  projectId?: string
  designPhase?: DesignPhaseType
  sectionId?: string
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  metadata?: any
}

export interface ConversationState {
  id: string
  userId: string
  title?: string
  messages: ConversationMessage[]
  context: any
  metadata: {
    model: string
    totalTokens: number
    createdAt: string
    updatedAt: string
  }
}
