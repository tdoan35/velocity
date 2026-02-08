/**
 * TypeScript Types for Design Phases
 * Maps to database schema in supabase/migrations/20260125000001_create_design_phases_tables.sql
 */

// ============================================================================
// Phase Names & Status
// ============================================================================

export type PhaseName =
  | 'product-vision'
  | 'product-roadmap'
  | 'data-model'
  | 'design-system'
  | 'application-shell'
  | 'section-details'
  | 'export';

/** AI-facing phase identifiers used in the structured conversation flow */
export type DesignPhaseType =
  | 'product_vision'
  | 'product_roadmap'
  | 'data_model'
  | 'design_tokens'
  | 'design_shell'
  | 'shape_section'
  | 'sample_data';

export type SectionStatus = 'pending' | 'in-progress' | 'completed';

// ============================================================================
// Phase Metadata
// ============================================================================

export interface DesignPhaseInfo {
  id: PhaseName;
  label: string;
  description: string;
  route: string;
  required: boolean;
  icon: string;
}

export const DESIGN_PHASES: DesignPhaseInfo[] = [
  {
    id: 'product-vision',
    label: 'Product Vision',
    description: 'Define your product name, description, problems, and features',
    route: 'product-vision',
    required: true,
    icon: 'Lightbulb',
  },
  {
    id: 'product-roadmap',
    label: 'Product Roadmap',
    description: 'Break down your product into sections for incremental development',
    route: 'product-roadmap',
    required: true,
    icon: 'Map',
  },
  {
    id: 'data-model',
    label: 'Data Model',
    description: 'Define entities and their relationships',
    route: 'data-model',
    required: false,
    icon: 'Database',
  },
  {
    id: 'design-system',
    label: 'Design System',
    description: 'Choose colors and typography for your app',
    route: 'design-system',
    required: false,
    icon: 'Palette',
  },
  {
    id: 'application-shell',
    label: 'Application Shell',
    description: 'Design navigation and layout structure',
    route: 'application-shell',
    required: false,
    icon: 'Layout',
  },
  {
    id: 'section-details',
    label: 'Section Details',
    description: 'Design individual feature sections with specs and screens',
    route: 'section-details',
    required: true,
    icon: 'FileText',
  },
  {
    id: 'export',
    label: 'Export',
    description: 'Review and generate AI-ready implementation artifacts',
    route: 'export',
    required: true,
    icon: 'Download',
  },
];

// ============================================================================
// Phase 1: Product Vision
// ============================================================================

export interface ProductProblem {
  problem: string;
  solution: string;
}

export interface ProductFeature {
  title: string;
  description: string;
}

export interface ProductOverview {
  name: string;
  description: string;
  problems: ProductProblem[];
  features: ProductFeature[];
}

// ============================================================================
// Phase 2: Product Roadmap
// ============================================================================

export interface RoadmapSection {
  id: string;
  title: string;
  description: string;
  order: number;
}

export interface ProductRoadmap {
  sections: RoadmapSection[];
}

// ============================================================================
// Phase 3: Data Model
// ============================================================================

export interface DataModelField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface DataModelEntity {
  name: string;
  fields: DataModelField[];
}

export interface DataModelRelationship {
  from: string;
  to: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  label: string;
}

export interface DataModel {
  entities: DataModelEntity[];
  relationships: DataModelRelationship[];
}

// ============================================================================
// Phase 4: Design System
// ============================================================================

export interface ColorDefinition {
  name: string;
  value: string;
  description?: string;
}

export interface TypographyDefinition {
  family: string;
  weights: number[];
  sizes?: Record<string, string>;
}

export interface DesignSystem {
  colors: {
    primary: ColorDefinition;
    secondary: ColorDefinition;
    neutral: ColorDefinition;
    accent: ColorDefinition;
    [key: string]: ColorDefinition;
  };
  typography: {
    heading: TypographyDefinition;
    body: TypographyDefinition;
    mono: TypographyDefinition;
    [key: string]: TypographyDefinition;
  };
  spacing?: Record<string, string>;
  borderRadius?: Record<string, string>;
}

// ============================================================================
// Phase 5: Application Shell
// ============================================================================

export interface NavigationItem {
  label: string;
  icon: string;
  route: string;
  sectionId: string;
}

export interface ShellSpec {
  overview: string;
  navigationItems: NavigationItem[];
  layoutPattern: string;
  raw: string;
}

// ============================================================================
// Phase 6: Section Details
// ============================================================================

export interface SectionSpec {
  overview: string;
  keyFeatures: string[];
  requirements: string[];
  acceptance: string[];
}

export interface ScreenDesign {
  id: string;
  name: string;
  description: string;
  componentPath: string;
}

export interface Screenshot {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

// ============================================================================
// Main Tables
// ============================================================================

export interface DesignPhase {
  id: string;
  project_id: string;
  user_id: string;

  // Phase tracking
  current_phase: PhaseName;
  phases_completed: PhaseName[];

  // Phase data
  product_overview?: ProductOverview;
  product_roadmap?: ProductRoadmap;
  data_model?: DataModel;
  design_system?: DesignSystem;
  shell_spec?: ShellSpec;

  // Timestamps
  created_at: string;
  updated_at: string;
}

export interface DesignSection {
  id: string;
  design_phase_id: string;
  project_id: string;
  user_id: string;

  // Section identification
  section_id: string;
  title: string;
  description?: string;
  order_index: number;

  // Section data
  spec?: SectionSpec;
  sample_data?: Record<string, any>;
  types_definition?: string;
  screen_designs: ScreenDesign[];
  screenshots: Screenshot[];

  // Status
  status: SectionStatus;

  // Timestamps
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Request/Response Types for API
// ============================================================================

export interface CreateDesignPhaseRequest {
  project_id: string;
}

export interface UpdateDesignPhaseRequest {
  current_phase?: PhaseName;
  phases_completed?: PhaseName[];
  product_overview?: ProductOverview;
  product_roadmap?: ProductRoadmap;
  data_model?: DataModel;
  design_system?: DesignSystem;
  shell_spec?: ShellSpec;
}

export interface CreateDesignSectionRequest {
  design_phase_id: string;
  project_id: string;
  section_id: string;
  title: string;
  description?: string;
  order_index: number;
}

export interface UpdateDesignSectionRequest {
  spec?: SectionSpec;
  sample_data?: Record<string, any>;
  types_definition?: string;
  screen_designs?: ScreenDesign[];
  screenshots?: Screenshot[];
  status?: SectionStatus;
}

// ============================================================================
// Phase Output Types (AI conversation structured outputs)
// ============================================================================

export interface SampleDataOutput {
  sampleData: Record<string, any>;
  typesDefinition: string;
}

export type PhaseOutput =
  | { phase: 'product_vision'; data: ProductOverview }
  | { phase: 'product_roadmap'; data: ProductRoadmap }
  | { phase: 'data_model'; data: DataModel }
  | { phase: 'design_tokens'; data: DesignSystem }
  | { phase: 'design_shell'; data: ShellSpec }
  | { phase: 'shape_section'; data: SectionSpec }
  | { phase: 'sample_data'; data: SampleDataOutput };
