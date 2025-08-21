/**
 * PRD Sections Configuration
 * Defines the default sections for each agent type and the guided handoff sequence
 */

export type SectionStatus = 'pending' | 'in_progress' | 'completed';
export type AgentType = 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper';

export interface PRDSection {
  id: string;
  title: string;
  order: number;
  agent: AgentType;
  required: boolean;
  content: {
    html: string;
    text: string;
  };
  status: SectionStatus;
  isCustom: boolean;
  description?: string;
  template?: {
    html: string;
    text: string;
  };
}

export interface AgentSectionConfig {
  agent: AgentType;
  displayName: string;
  description: string;
  sections: Omit<PRDSection, 'order' | 'content' | 'status'>[];
  introPrompt: string;
  handoffPrompt?: string;
}

// Define the guided agent sequence
export const AGENT_SEQUENCE: AgentType[] = [
  'project_manager',
  'design_assistant',
  'engineering_assistant',
  'config_helper'
];

// Agent-specific section configurations
export const AGENT_SECTION_CONFIGS: Record<AgentType, AgentSectionConfig> = {
  project_manager: {
    agent: 'project_manager',
    displayName: 'Project Manager',
    description: 'Responsible for defining the project vision, core features, and success metrics',
    sections: [
      {
        id: 'overview',
        title: 'Overview',
        agent: 'project_manager',
        required: true,
        isCustom: false,
        description: 'Project vision, problem statement, and target users'
      },
      {
        id: 'core_features',
        title: 'Core Features',
        agent: 'project_manager',
        required: true,
        isCustom: false,
        description: 'Essential features that define the core product value'
      },
      {
        id: 'additional_features',
        title: 'Additional Features',
        agent: 'project_manager',
        required: false,
        isCustom: false,
        description: 'Nice-to-have features for future iterations'
      }
    ],
    introPrompt: `I'm the Project Manager and I'll help you define your project's vision and core features. I'm responsible for:
- Creating a clear project overview with vision and target users
- Defining the core features that deliver primary value
- Identifying additional features for future iterations

Let's start by understanding your project vision. What problem are you trying to solve?`,
    handoffPrompt: `Great! We've defined the project vision and core features. Now let me hand you over to our Design Assistant who will help you create the UI design patterns and user experience flows.`
  },

  design_assistant: {
    agent: 'design_assistant',
    displayName: 'Design Assistant',
    description: 'Specializes in UI/UX design patterns and user experience flows',
    sections: [
      {
        id: 'ui_design_patterns',
        title: 'UI Design Guidance/Patterns',
        agent: 'design_assistant',
        required: true,
        isCustom: false,
        description: 'Design system, component patterns, and visual guidelines'
      },
      {
        id: 'ux_flows',
        title: 'User Experience Flows',
        agent: 'design_assistant',
        required: true,
        isCustom: false,
        description: 'User journey maps, interaction flows, and navigation patterns'
      }
    ],
    introPrompt: `I'm the Design Assistant and I'll help you create intuitive UI patterns and user experience flows. I'm responsible for:
- Defining UI design patterns and component guidelines
- Creating user experience flows and journey maps
- Ensuring accessibility and responsive design

Based on the core features defined, let's design how users will interact with your application.`,
    handoffPrompt: `Excellent! The design patterns and user flows are defined. Let me hand you over to our Engineering Assistant who will help you plan the technical architecture.`
  },

  engineering_assistant: {
    agent: 'engineering_assistant',
    displayName: 'Engineering Assistant',
    description: 'Focuses on technical architecture and implementation details',
    sections: [
      {
        id: 'technical_architecture',
        title: 'Technical Architecture',
        agent: 'engineering_assistant',
        required: true,
        isCustom: false,
        description: 'System architecture, technology stack, and implementation approach'
      }
    ],
    introPrompt: `I'm the Engineering Assistant and I'll help you define the technical architecture. I'm responsible for:
- Planning the system architecture and technology stack
- Defining data models and API structures
- Ensuring scalability, security, and performance

Let's design the technical foundation for your application based on the features and design patterns.`,
    handoffPrompt: `Perfect! The technical architecture is planned. Now let me hand you over to our Config Helper who will help you set up the necessary integrations.`
  },

  config_helper: {
    agent: 'config_helper',
    displayName: 'Config Helper',
    description: 'Manages third-party integrations and configuration setup',
    sections: [
      {
        id: 'tech_integrations',
        title: 'Tech Integrations',
        agent: 'config_helper',
        required: true,
        isCustom: false,
        description: 'Third-party services, APIs, and integration configurations'
      }
    ],
    introPrompt: `I'm the Config Helper and I'll help you set up the necessary integrations and configurations. I'm responsible for:
- Configuring third-party service integrations
- Setting up API connections and authentication
- Managing environment variables and deployment configurations

Let's configure the integrations needed for your application.`,
    handoffPrompt: `Congratulations! Your PRD is now complete with all technical integrations configured. You can review and edit any section, or start building your application.`
  }
};

/**
 * Get the next agent in the guided sequence
 */
export function getNextAgent(currentAgent: AgentType): AgentType | null {
  const currentIndex = AGENT_SEQUENCE.indexOf(currentAgent);
  if (currentIndex === -1 || currentIndex === AGENT_SEQUENCE.length - 1) {
    return null;
  }
  return AGENT_SEQUENCE[currentIndex + 1];
}

/**
 * Get the previous agent in the guided sequence
 */
export function getPreviousAgent(currentAgent: AgentType): AgentType | null {
  const currentIndex = AGENT_SEQUENCE.indexOf(currentAgent);
  if (currentIndex <= 0) {
    return null;
  }
  return AGENT_SEQUENCE[currentIndex - 1];
}

/**
 * Get default sections for a specific agent
 */
export function getAgentDefaultSections(agent: AgentType): Omit<PRDSection, 'order' | 'content' | 'status'>[] {
  return AGENT_SECTION_CONFIGS[agent].sections;
}

/**
 * Initialize PRD with default sections for all agents
 */
export function initializePRDSections(): PRDSection[] {
  const sections: PRDSection[] = [];
  let order = 1;

  // Define rich text templates for each section type
  const sectionTemplates: Record<string, { html: string; text: string }> = {
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
  };

  for (const agentType of AGENT_SEQUENCE) {
    const agentConfig = AGENT_SECTION_CONFIGS[agentType];
    for (const sectionConfig of agentConfig.sections) {
      const template = sectionTemplates[sectionConfig.id] || {
        html: '<p class="template-placeholder">Start writing...</p>',
        text: 'Start writing...'
      };
      
      sections.push({
        ...sectionConfig,
        order,
        content: template,
        status: 'pending'
      });
      order++;
    }
  }

  return sections;
}

/**
 * Check if all required sections for an agent are completed
 */
export function areAgentSectionsComplete(sections: PRDSection[], agent: AgentType): boolean {
  const agentSections = sections.filter(s => s.agent === agent && s.required);
  return agentSections.every(s => s.status === 'completed');
}

/**
 * Get the current agent based on incomplete sections
 */
export function getCurrentAgentFromSections(sections: PRDSection[]): AgentType {
  for (const agentType of AGENT_SEQUENCE) {
    const incompleteSections = sections.filter(
      s => s.agent === agentType && s.required && s.status !== 'completed'
    );
    if (incompleteSections.length > 0) {
      return agentType;
    }
  }
  // If all required sections are complete, return the last agent
  return AGENT_SEQUENCE[AGENT_SEQUENCE.length - 1];
}

/**
 * Get section by ID
 */
export function getSectionById(sections: PRDSection[], sectionId: string): PRDSection | undefined {
  return sections.find(s => s.id === sectionId);
}

/**
 * Update section status
 */
export function updateSectionStatus(
  sections: PRDSection[],
  sectionId: string,
  status: SectionStatus
): PRDSection[] {
  return sections.map(s => 
    s.id === sectionId ? { ...s, status } : s
  );
}

/**
 * Update section content
 */
export function updateSectionContent(
  sections: PRDSection[],
  sectionId: string,
  content: { html: string; text: string }
): PRDSection[] {
  return sections.map(s => 
    s.id === sectionId ? { ...s, content, status: 'completed' } : s
  );
}

/**
 * Add a custom section
 */
export function addCustomSection(
  sections: PRDSection[],
  title: string,
  agent: AgentType,
  required: boolean = false
): PRDSection[] {
  const maxOrder = Math.max(...sections.map(s => s.order), 0);
  const newSection: PRDSection = {
    id: `custom_${Date.now()}`,
    title,
    order: maxOrder + 1,
    agent,
    required,
    content: {
      html: '<p class="template-placeholder">Start writing...</p>',
      text: 'Start writing...'
    },
    status: 'pending',
    isCustom: true
  };
  return [...sections, newSection];
}

/**
 * Reorder sections
 */
export function reorderSections(
  sections: PRDSection[],
  sectionId: string,
  newOrder: number
): PRDSection[] {
  const section = sections.find(s => s.id === sectionId);
  if (!section) return sections;

  const currentOrder = section.order;
  
  return sections.map(s => {
    if (s.id === sectionId) {
      return { ...s, order: newOrder };
    } else if (currentOrder < newOrder && s.order > currentOrder && s.order <= newOrder) {
      return { ...s, order: s.order - 1 };
    } else if (currentOrder > newOrder && s.order >= newOrder && s.order < currentOrder) {
      return { ...s, order: s.order + 1 };
    }
    return s;
  }).sort((a, b) => a.order - b.order);
}

/**
 * Get agent introduction and handoff prompts
 */
export function getAgentPrompts(agent: AgentType): { intro: string; handoff?: string } {
  const config = AGENT_SECTION_CONFIGS[agent];
  return {
    intro: config.introPrompt,
    handoff: config.handoffPrompt
  };
}

/**
 * Calculate PRD completion percentage
 */
export function calculatePRDCompletion(sections: PRDSection[]): number {
  const requiredSections = sections.filter(s => s.required);
  if (requiredSections.length === 0) return 0;
  
  const completedRequired = requiredSections.filter(s => s.status === 'completed');
  return Math.round((completedRequired.length / requiredSections.length) * 100);
}

/**
 * Extract plain text from HTML content
 */
export function extractTextFromHtml(html: string): string {
  // Simple text extraction - strips HTML tags and normalizes whitespace
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Validate rich text content
 */
export function validateRichTextContent(content: { html: string; text: string }): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!content.html || content.html.length < 20) {
    errors.push('Content is too short');
  }

  if (!content.text || content.text.length < 10) {
    errors.push('Text content is missing');
  }

  // Check for template placeholders still present
  if (content.html.includes('template-placeholder')) {
    warnings.push('Template placeholders should be replaced with actual content');
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}