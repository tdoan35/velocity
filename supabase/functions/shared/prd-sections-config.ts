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
  content: Record<string, any>;
  status: SectionStatus;
  isCustom: boolean;
  description?: string;
  template?: Record<string, any>;
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
        description: 'Project vision, problem statement, and target users',
        template: {
          vision: '',
          problem: '',
          targetUsers: [],
          businessGoals: []
        }
      },
      {
        id: 'core_features',
        title: 'Core Features',
        agent: 'project_manager',
        required: true,
        isCustom: false,
        description: 'Essential features that define the core product value',
        template: {
          features: []
        }
      },
      {
        id: 'additional_features',
        title: 'Additional Features',
        agent: 'project_manager',
        required: false,
        isCustom: false,
        description: 'Nice-to-have features for future iterations',
        template: {
          features: []
        }
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
        description: 'Design system, component patterns, and visual guidelines',
        template: {
          designSystem: {
            colors: {},
            typography: {},
            spacing: {},
            components: []
          },
          patterns: [],
          accessibility: []
        }
      },
      {
        id: 'ux_flows',
        title: 'User Experience Flows',
        agent: 'design_assistant',
        required: true,
        isCustom: false,
        description: 'User journey maps, interaction flows, and navigation patterns',
        template: {
          userJourneys: [],
          navigationStructure: {},
          interactionPatterns: [],
          responsiveStrategy: ''
        }
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
        description: 'System architecture, technology stack, and implementation approach',
        template: {
          platforms: [],
          techStack: {
            frontend: [],
            backend: [],
            database: [],
            infrastructure: []
          },
          architecture: {
            pattern: '',
            components: [],
            dataFlow: ''
          },
          security: [],
          scalability: [],
          performance: []
        }
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
        description: 'Third-party services, APIs, and integration configurations',
        template: {
          integrations: [],
          apiConfigurations: [],
          environmentVariables: [],
          deploymentConfig: {},
          monitoring: []
        }
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

  for (const agentType of AGENT_SEQUENCE) {
    const agentConfig = AGENT_SECTION_CONFIGS[agentType];
    for (const sectionConfig of agentConfig.sections) {
      sections.push({
        ...sectionConfig,
        order,
        content: sectionConfig.template || {},
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
  content: Record<string, any>
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
    content: {},
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