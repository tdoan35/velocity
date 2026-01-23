# Design OS Integration Plan for Velocity

## Overview

Integrate Design OS's structured product planning workflow into Velocity to enhance the design-to-code pipeline. Design OS provides a 7-phase guided design process that produces AI-ready implementation artifacts.

**Goal:** Replace the existing ProjectDesign flow with a structured 7-phase design workflow that produces better specifications for AI code generation.

---

## Current State Analysis

### Design OS (Source)
- **Location:** `design-os-main/`
- **Data Storage:** File-based (markdown + JSON in `/product/` directory)
- **State Management:** Vite's `import.meta.glob()` for loading files at build time
- **Phases:** Product → Data Model → Design → Sections → Export (5 phases in UI, but 7 logical phases)

### Velocity (Target)
- **Location:** `frontend/`
- **Data Storage:** Supabase (PostgreSQL)
- **State Management:** Zustand stores with persistence middleware
- **Current Design Flow:** `ProjectDesign.tsx` with PRD editor + AI chat

### Key Adaptation Required
Transform file-based loaders (`loadProductData()`, `import.meta.glob`) into Supabase database queries with Zustand state management.

---

## Database Schema

### Table: `design_phases`

Stores the main design phase data for each project. One record per project.

```sql
CREATE TABLE design_phases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),

    -- Phase tracking
    current_phase VARCHAR(50) NOT NULL DEFAULT 'product-vision',
    phases_completed JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Phase 1: Product Vision
    -- Structure: { name: string, description: string, problems: Array<{problem: string, solution: string}>, features: Array<{title: string, description: string}> }
    product_overview JSONB,

    -- Phase 2: Product Roadmap
    -- Structure: { sections: Array<{id: string, title: string, description: string, order: number}> }
    product_roadmap JSONB,

    -- Phase 3: Data Model
    -- Structure: { entities: Array<{name: string, fields: Array<{name: string, type: string, required: boolean}>}>, relationships: Array<{from: string, to: string, type: string, label: string}> }
    data_model JSONB,

    -- Phase 4: Design System
    -- Structure: { colors: {primary: {name: string, value: string}, secondary: {...}, neutral: {...}, accent: {...}}, typography: {heading: {family: string, weights: number[]}, body: {...}, mono: {...}} }
    design_system JSONB,

    -- Phase 5: Application Shell
    -- Structure: { overview: string, navigationItems: Array<{label: string, icon: string, route: string, sectionId: string}>, layoutPattern: string, raw: string }
    shell_spec JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_project_design_phase UNIQUE(project_id)
);

-- Enable RLS
ALTER TABLE design_phases ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own design phases"
    ON design_phases FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own design phases"
    ON design_phases FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own design phases"
    ON design_phases FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own design phases"
    ON design_phases FOR DELETE
    USING (auth.uid() = user_id);

-- Index for project lookups
CREATE INDEX idx_design_phases_project_id ON design_phases(project_id);
CREATE INDEX idx_design_phases_user_id ON design_phases(user_id);

-- Updated_at trigger
CREATE TRIGGER update_design_phases_updated_at
    BEFORE UPDATE ON design_phases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

### Table: `design_sections`

Stores individual section designs. Multiple records per project (one per section defined in roadmap).

```sql
CREATE TABLE design_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    design_phase_id UUID NOT NULL REFERENCES design_phases(id) ON DELETE CASCADE,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),

    -- Section identification (matches roadmap section)
    section_id VARCHAR(100) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    order_index INTEGER NOT NULL,

    -- Phase 6: Section Details
    -- Structure: { overview: string, keyFeatures: string[], requirements: string[], acceptance: string[] }
    spec JSONB,

    -- Sample data for the section
    -- Structure: any JSON matching the section's data needs
    sample_data JSONB,

    -- TypeScript type definitions
    types_definition TEXT,

    -- Screen designs (component references)
    -- Structure: Array<{id: string, name: string, description: string, componentPath: string}>
    screen_designs JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Screenshot references (storage paths)
    -- Structure: Array<{id: string, name: string, path: string, createdAt: string}>
    screenshots JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT unique_project_section UNIQUE(project_id, section_id)
);

-- Enable RLS
ALTER TABLE design_sections ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own design sections"
    ON design_sections FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own design sections"
    ON design_sections FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own design sections"
    ON design_sections FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own design sections"
    ON design_sections FOR DELETE
    USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_design_sections_design_phase_id ON design_sections(design_phase_id);
CREATE INDEX idx_design_sections_project_id ON design_sections(project_id);
CREATE INDEX idx_design_sections_user_id ON design_sections(user_id);
CREATE INDEX idx_design_sections_order ON design_sections(project_id, order_index);

-- Updated_at trigger
CREATE TRIGGER update_design_sections_updated_at
    BEFORE UPDATE ON design_sections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

---

## TypeScript Types

### File: `frontend/src/types/design-phases.ts`

```typescript
// ============================================================================
// Phase 1: Product Vision
// ============================================================================

export interface ProblemSolution {
  problem: string;
  solution: string;
}

export interface Feature {
  title: string;
  description: string;
}

export interface ProductOverview {
  name: string;
  description: string;
  problems: ProblemSolution[];
  features: Feature[];
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

export interface EntityField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface Entity {
  name: string;
  description?: string;
  fields: EntityField[];
}

export interface Relationship {
  from: string;
  to: string;
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  label: string;
}

export interface DataModel {
  entities: Entity[];
  relationships: Relationship[];
}

// ============================================================================
// Phase 4: Design System
// ============================================================================

export interface ColorToken {
  name: string;
  value: string;
  tailwindClass?: string;
}

export interface ColorPalette {
  primary: ColorToken;
  secondary: ColorToken;
  neutral: ColorToken;
  accent: ColorToken;
}

export interface FontFamily {
  family: string;
  weights: number[];
  googleFontsUrl?: string;
}

export interface Typography {
  heading: FontFamily;
  body: FontFamily;
  mono: FontFamily;
}

export interface DesignSystem {
  colors: ColorPalette;
  typography: Typography;
}

// ============================================================================
// Phase 5: Application Shell
// ============================================================================

export interface NavigationItem {
  label: string;
  icon: string;
  route: string;
  sectionId?: string;
}

export type LayoutPattern =
  | 'sidebar-left'
  | 'sidebar-right'
  | 'top-nav'
  | 'bottom-nav'
  | 'no-nav';

export interface ShellSpec {
  overview: string;
  navigationItems: NavigationItem[];
  layoutPattern: LayoutPattern;
  raw?: string;
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
  componentPath?: string;
}

export interface Screenshot {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

export type SectionStatus = 'pending' | 'in-progress' | 'completed';

export interface DesignSection {
  id: string;
  designPhaseId: string;
  projectId: string;
  userId: string;
  sectionId: string;
  title: string;
  description: string | null;
  orderIndex: number;
  spec: SectionSpec | null;
  sampleData: unknown | null;
  typesDefinition: string | null;
  screenDesigns: ScreenDesign[];
  screenshots: Screenshot[];
  status: SectionStatus;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Phase Tracking
// ============================================================================

export type DesignPhaseName =
  | 'product-vision'
  | 'product-roadmap'
  | 'data-model'
  | 'design-system'
  | 'shell'
  | 'sections'
  | 'export';

export interface DesignPhaseInfo {
  id: DesignPhaseName;
  label: string;
  description: string;
  route: string;
  required: boolean;
}

export const DESIGN_PHASES: DesignPhaseInfo[] = [
  {
    id: 'product-vision',
    label: 'Product Vision',
    description: 'Define your product name, description, problems, and features',
    route: 'vision',
    required: true,
  },
  {
    id: 'product-roadmap',
    label: 'Roadmap',
    description: 'Break down your product into sections for incremental development',
    route: 'roadmap',
    required: true,
  },
  {
    id: 'data-model',
    label: 'Data Model',
    description: 'Define entities and their relationships',
    route: 'data-model',
    required: false,
  },
  {
    id: 'design-system',
    label: 'Design System',
    description: 'Choose colors and typography for your app',
    route: 'tokens',
    required: false,
  },
  {
    id: 'shell',
    label: 'App Shell',
    description: 'Design navigation and layout structure',
    route: 'shell',
    required: false,
  },
  {
    id: 'sections',
    label: 'Sections',
    description: 'Design individual feature sections with specs and screens',
    route: 'sections',
    required: true,
  },
  {
    id: 'export',
    label: 'Export',
    description: 'Review and generate AI-ready implementation artifacts',
    route: 'export',
    required: true,
  },
];

// ============================================================================
// Main Design Phase Record
// ============================================================================

export interface DesignPhase {
  id: string;
  projectId: string;
  userId: string;
  currentPhase: DesignPhaseName;
  phasesCompleted: DesignPhaseName[];
  productOverview: ProductOverview | null;
  productRoadmap: ProductRoadmap | null;
  dataModel: DataModel | null;
  designSystem: DesignSystem | null;
  shellSpec: ShellSpec | null;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// Phase 7: Export
// ============================================================================

export interface DesignExport {
  productOverview: ProductOverview;
  roadmap: ProductRoadmap;
  dataModel: DataModel | null;
  designSystem: DesignSystem | null;
  shell: ShellSpec | null;
  sections: DesignSection[];
  prompts: {
    oneShot: string;
    sectionTemplate: string;
  };
  generatedAt: string;
}

// ============================================================================
// API Types (for Supabase responses)
// ============================================================================

export interface DesignPhaseRow {
  id: string;
  project_id: string;
  user_id: string;
  current_phase: DesignPhaseName;
  phases_completed: DesignPhaseName[];
  product_overview: ProductOverview | null;
  product_roadmap: ProductRoadmap | null;
  data_model: DataModel | null;
  design_system: DesignSystem | null;
  shell_spec: ShellSpec | null;
  created_at: string;
  updated_at: string;
}

export interface DesignSectionRow {
  id: string;
  design_phase_id: string;
  project_id: string;
  user_id: string;
  section_id: string;
  title: string;
  description: string | null;
  order_index: number;
  spec: SectionSpec | null;
  sample_data: unknown | null;
  types_definition: string | null;
  screen_designs: ScreenDesign[];
  screenshots: Screenshot[];
  status: SectionStatus;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Utility Functions
// ============================================================================

export function transformDesignPhaseRow(row: DesignPhaseRow): DesignPhase {
  return {
    id: row.id,
    projectId: row.project_id,
    userId: row.user_id,
    currentPhase: row.current_phase,
    phasesCompleted: row.phases_completed,
    productOverview: row.product_overview,
    productRoadmap: row.product_roadmap,
    dataModel: row.data_model,
    designSystem: row.design_system,
    shellSpec: row.shell_spec,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function transformDesignSectionRow(row: DesignSectionRow): DesignSection {
  return {
    id: row.id,
    designPhaseId: row.design_phase_id,
    projectId: row.project_id,
    userId: row.user_id,
    sectionId: row.section_id,
    title: row.title,
    description: row.description,
    orderIndex: row.order_index,
    spec: row.spec,
    sampleData: row.sample_data,
    typesDefinition: row.types_definition,
    screenDesigns: row.screen_designs,
    screenshots: row.screenshots,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
```

---

## Component Structure

### Directory Layout

```
frontend/src/
├── components/
│   └── design-phases/
│       ├── index.ts                    # Barrel export
│       ├── PhaseNav.tsx                # Phase navigation sidebar
│       ├── PhaseLayout.tsx             # Layout wrapper with nav + content
│       ├── PhaseHeader.tsx             # Phase title + description header
│       ├── PhaseProgress.tsx           # Overall progress indicator
│       ├── NextPhaseButton.tsx         # Navigation to next phase
│       ├── SaveIndicator.tsx           # Auto-save status indicator
│       ├── AIAssistButton.tsx          # Trigger AI assistance for phase
│       ├── cards/
│       │   ├── ProductOverviewCard.tsx # Summary card for vision
│       │   ├── RoadmapCard.tsx         # Summary card for roadmap
│       │   ├── DataModelCard.tsx       # Summary card for data model
│       │   ├── DesignSystemCard.tsx    # Summary card for design tokens
│       │   ├── ShellCard.tsx           # Summary card for shell
│       │   └── SectionCard.tsx         # Summary card for a section
│       └── forms/
│           ├── ProductVisionForm.tsx   # Form for product overview
│           ├── ProblemSolutionEditor.tsx  # Editable list of problems/solutions
│           ├── FeatureListEditor.tsx   # Editable list of features
│           ├── RoadmapEditor.tsx       # Section list with drag-drop reorder
│           ├── DataModelEditor.tsx     # Entity/relationship visual editor
│           ├── EntityEditor.tsx        # Single entity field editor
│           ├── RelationshipEditor.tsx  # Relationship line editor
│           ├── ColorPicker.tsx         # Tailwind color palette picker
│           ├── TypographyPicker.tsx    # Google Fonts family picker
│           ├── ShellEditor.tsx         # Navigation item + layout editor
│           ├── SectionSpecEditor.tsx   # Section spec form
│           └── SampleDataEditor.tsx    # JSON editor for sample data
├── pages/
│   └── design/
│       ├── DesignPhaseIndex.tsx        # Hub page showing all phases
│       ├── ProductVisionPage.tsx       # Phase 1: Product vision
│       ├── ProductRoadmapPage.tsx      # Phase 2: Roadmap
│       ├── DataModelPage.tsx           # Phase 3: Data model
│       ├── DesignSystemPage.tsx        # Phase 4: Design tokens
│       ├── ShellDesignPage.tsx         # Phase 5: App shell
│       ├── SectionsOverviewPage.tsx    # Phase 6: Sections list
│       ├── SectionDetailPage.tsx       # Phase 6: Single section detail
│       └── ExportPage.tsx              # Phase 7: Export & build
├── services/
│   └── designPhaseService.ts           # Supabase CRUD operations
└── stores/
    └── useDesignPhaseStore.ts          # Zustand store for design state
```

---

## Routing Structure

### File: `frontend/src/App.tsx` (additions)

```typescript
// Add these routes inside the existing Router configuration

// Design Phase Routes (nested under /project/:id)
<Route path="project/:id/design" element={<DesignPhaseIndex />} />
<Route path="project/:id/design/vision" element={<ProductVisionPage />} />
<Route path="project/:id/design/roadmap" element={<ProductRoadmapPage />} />
<Route path="project/:id/design/data-model" element={<DataModelPage />} />
<Route path="project/:id/design/tokens" element={<DesignSystemPage />} />
<Route path="project/:id/design/shell" element={<ShellDesignPage />} />
<Route path="project/:id/design/sections" element={<SectionsOverviewPage />} />
<Route path="project/:id/design/sections/:sectionId" element={<SectionDetailPage />} />
<Route path="project/:id/design/export" element={<ExportPage />} />
```

---

## Implementation Tasks

### Phase 1: Foundation

#### Task 1.1: Create Database Migration
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_design_phases_tables.sql`

**Description:** Create the `design_phases` and `design_sections` tables with all columns, constraints, indexes, RLS policies, and triggers as defined in the Database Schema section above.

**Acceptance Criteria:**
- [ ] Migration file created with timestamp prefix
- [ ] `design_phases` table created with all columns and correct types
- [ ] `design_sections` table created with all columns and correct types
- [ ] Foreign key constraints reference `projects(id)` and `auth.users(id)`
- [ ] Unique constraints on `(project_id)` for design_phases and `(project_id, section_id)` for design_sections
- [ ] RLS enabled on both tables
- [ ] RLS policies allow users to CRUD only their own records
- [ ] Indexes created for common query patterns
- [ ] `updated_at` triggers created for both tables
- [ ] Migration runs successfully via `npx supabase db push` or equivalent

**Dependencies:** None

---

#### Task 1.2: Create TypeScript Types
**File:** `frontend/src/types/design-phases.ts`

**Description:** Create all TypeScript interfaces and types for design phases as defined in the TypeScript Types section above. Include utility functions for transforming database rows to frontend objects.

**Acceptance Criteria:**
- [ ] All interfaces defined with JSDoc comments
- [ ] `DESIGN_PHASES` constant array defined with all 7 phases
- [ ] Row types match Supabase snake_case naming
- [ ] Frontend types use camelCase naming
- [ ] Transform functions convert between row and frontend types
- [ ] All types use `import type` syntax per project conventions
- [ ] File exports all types and constants

**Dependencies:** None

---

#### Task 1.3: Create Supabase Service
**File:** `frontend/src/services/designPhaseService.ts`

**Description:** Create a service module with functions for all CRUD operations on `design_phases` and `design_sections` tables.

**Functions to implement:**
```typescript
// Design Phase CRUD
getDesignPhase(projectId: string): Promise<DesignPhase | null>
createDesignPhase(projectId: string): Promise<DesignPhase>
updateDesignPhase(projectId: string, updates: Partial<DesignPhaseRow>): Promise<DesignPhase>
deleteDesignPhase(projectId: string): Promise<void>

// Phase-specific updates (convenience wrappers)
updateProductOverview(projectId: string, data: ProductOverview): Promise<DesignPhase>
updateProductRoadmap(projectId: string, data: ProductRoadmap): Promise<DesignPhase>
updateDataModel(projectId: string, data: DataModel): Promise<DesignPhase>
updateDesignSystem(projectId: string, data: DesignSystem): Promise<DesignPhase>
updateShellSpec(projectId: string, data: ShellSpec): Promise<DesignPhase>
markPhaseComplete(projectId: string, phase: DesignPhaseName): Promise<DesignPhase>
setCurrentPhase(projectId: string, phase: DesignPhaseName): Promise<DesignPhase>

// Design Section CRUD
getDesignSections(projectId: string): Promise<DesignSection[]>
getDesignSection(projectId: string, sectionId: string): Promise<DesignSection | null>
createDesignSection(projectId: string, data: Omit<DesignSectionRow, 'id' | 'created_at' | 'updated_at'>): Promise<DesignSection>
updateDesignSection(projectId: string, sectionId: string, updates: Partial<DesignSectionRow>): Promise<DesignSection>
deleteDesignSection(projectId: string, sectionId: string): Promise<void>
reorderSections(projectId: string, orderedSectionIds: string[]): Promise<DesignSection[]>

// Sync sections from roadmap
syncSectionsFromRoadmap(projectId: string, roadmap: ProductRoadmap): Promise<DesignSection[]>
```

**Acceptance Criteria:**
- [ ] All functions use Supabase client from existing auth setup
- [ ] Proper error handling with descriptive error messages
- [ ] Transform functions used to convert responses
- [ ] TypeScript types used for all parameters and returns
- [ ] Functions are async and return Promises
- [ ] Null handling for optional data
- [ ] `syncSectionsFromRoadmap` creates/updates/deletes sections to match roadmap

**Dependencies:** Task 1.1, Task 1.2

---

#### Task 1.4: Create Zustand Store
**File:** `frontend/src/stores/useDesignPhaseStore.ts`

**Description:** Create a Zustand store for managing design phase state in the UI. Include loading states, error handling, and optimistic updates.

**Store shape:**
```typescript
interface DesignPhaseState {
  // Data
  designPhase: DesignPhase | null;
  sections: DesignSection[];

  // Loading states
  isLoading: boolean;
  isSaving: boolean;
  loadError: string | null;
  saveError: string | null;

  // Computed
  currentPhaseInfo: DesignPhaseInfo | null;
  completedPhases: DesignPhaseName[];
  canProceedToNextPhase: boolean;
  readinessChecklist: { phase: DesignPhaseName; ready: boolean; reason?: string }[];

  // Actions
  loadDesignPhase: (projectId: string) => Promise<void>;
  initializeDesignPhase: (projectId: string) => Promise<void>;

  updateProductOverview: (data: ProductOverview) => Promise<void>;
  updateProductRoadmap: (data: ProductRoadmap) => Promise<void>;
  updateDataModel: (data: DataModel) => Promise<void>;
  updateDesignSystem: (data: DesignSystem) => Promise<void>;
  updateShellSpec: (data: ShellSpec) => Promise<void>;

  navigateToPhase: (phase: DesignPhaseName) => void;
  completeCurrentPhase: () => Promise<void>;

  loadSections: (projectId: string) => Promise<void>;
  updateSection: (sectionId: string, updates: Partial<DesignSection>) => Promise<void>;

  reset: () => void;
}
```

**Acceptance Criteria:**
- [ ] Store follows existing Zustand patterns in codebase
- [ ] Uses devtools middleware for debugging
- [ ] Loading and error states for async operations
- [ ] Optimistic updates where appropriate
- [ ] `canProceedToNextPhase` computes based on required data
- [ ] `readinessChecklist` returns status for each phase
- [ ] Auto-saves with debounce (500ms) on data changes
- [ ] Reset function clears all state

**Dependencies:** Task 1.2, Task 1.3

---

#### Task 1.5: Set Up Routing Structure
**File:** `frontend/src/App.tsx` (modify)

**Description:** Add all design phase routes to the existing router configuration. Routes should be nested under the project route and protected by authentication.

**Routes to add:**
```
/project/:id/design              -> DesignPhaseIndex
/project/:id/design/vision       -> ProductVisionPage
/project/:id/design/roadmap      -> ProductRoadmapPage
/project/:id/design/data-model   -> DataModelPage
/project/:id/design/tokens       -> DesignSystemPage
/project/:id/design/shell        -> ShellDesignPage
/project/:id/design/sections     -> SectionsOverviewPage
/project/:id/design/sections/:sectionId -> SectionDetailPage
/project/:id/design/export       -> ExportPage
```

**Acceptance Criteria:**
- [ ] All routes added inside authenticated route group
- [ ] Routes use lazy loading for code splitting
- [ ] Placeholder components created for each page (can be empty)
- [ ] Navigation between phases works
- [ ] URL params accessible via `useParams()`
- [ ] Back button behavior works correctly

**Dependencies:** None (placeholder components)

---

### Phase 2: Core Navigation & Layout

#### Task 2.1: Create PhaseNav Component
**File:** `frontend/src/components/design-phases/PhaseNav.tsx`

**Description:** Create a vertical navigation sidebar showing all 7 phases with completion status indicators. Adapt from `design-os-main/src/components/PhaseNav.tsx` but use database state instead of file loaders.

**Props:**
```typescript
interface PhaseNavProps {
  projectId: string;
  currentPhase: DesignPhaseName;
  completedPhases: DesignPhaseName[];
  onPhaseSelect: (phase: DesignPhaseName) => void;
}
```

**Features:**
- List all 7 phases with icons
- Show checkmark for completed phases
- Highlight current phase
- Show lock icon for phases that can't be accessed yet
- Click to navigate (if accessible)
- Collapse on mobile (hamburger menu)

**Acceptance Criteria:**
- [ ] Renders all 7 phases from `DESIGN_PHASES` constant
- [ ] Shows completion status with visual indicator (checkmark/circle)
- [ ] Highlights current phase with different background
- [ ] Disabled/locked phases have reduced opacity and no click handler
- [ ] Phase 1 always accessible, others require previous phase complete
- [ ] Responsive: sidebar on desktop, collapsible on mobile
- [ ] Uses Tailwind CSS for styling
- [ ] Accessible (keyboard navigation, ARIA labels)

**Dependencies:** Task 1.2

---

#### Task 2.2: Create PhaseLayout Component
**File:** `frontend/src/components/design-phases/PhaseLayout.tsx`

**Description:** Create a wrapper layout component that provides consistent structure for all phase pages: navigation sidebar on left, content area on right, with header showing current phase.

**Props:**
```typescript
interface PhaseLayoutProps {
  children: React.ReactNode;
  showAIAssist?: boolean;
  aiAssistPrompt?: string;
}
```

**Features:**
- Fetch design phase data on mount using `useDesignPhaseStore`
- Render PhaseNav on left (collapsible)
- Render content area on right
- Show phase header with title and description
- Show save indicator in header
- Optional AI assist button that opens chat panel

**Acceptance Criteria:**
- [ ] Loads design phase data on mount via store
- [ ] Shows loading skeleton while fetching
- [ ] Renders PhaseNav with current state
- [ ] Content area takes remaining width
- [ ] Responsive layout (stacked on mobile)
- [ ] Header shows current phase name and description
- [ ] SaveIndicator shows "Saved" / "Saving..." / error state
- [ ] AI assist button triggers callback with prompt

**Dependencies:** Task 1.4, Task 2.1

---

#### Task 2.3: Create PhaseHeader Component
**File:** `frontend/src/components/design-phases/PhaseHeader.tsx`

**Description:** Header component for each phase page showing the phase title, description, and action buttons.

**Props:**
```typescript
interface PhaseHeaderProps {
  phase: DesignPhaseInfo;
  isSaving: boolean;
  saveError: string | null;
  onAIAssist?: () => void;
}
```

**Acceptance Criteria:**
- [ ] Shows phase label as h1
- [ ] Shows phase description as subtitle
- [ ] Shows SaveIndicator component
- [ ] Shows AI Assist button if `onAIAssist` provided
- [ ] Styling matches design system

**Dependencies:** Task 1.2

---

#### Task 2.4: Create NextPhaseButton Component
**File:** `frontend/src/components/design-phases/NextPhaseButton.tsx`

**Description:** Button component for navigating to the next phase. Shows different states based on current phase completion.

**Props:**
```typescript
interface NextPhaseButtonProps {
  currentPhase: DesignPhaseName;
  canProceed: boolean;
  onProceed: () => void;
  reason?: string; // Why can't proceed
}
```

**Acceptance Criteria:**
- [ ] Shows "Continue to [Next Phase]" when ready
- [ ] Disabled state with tooltip explaining why if not ready
- [ ] On last phase (export), shows "Finish" or similar
- [ ] Click triggers navigation to next phase route
- [ ] Primary button styling

**Dependencies:** Task 1.2

---

#### Task 2.5: Implement DesignPhaseIndex Page
**File:** `frontend/src/pages/design/DesignPhaseIndex.tsx`

**Description:** Hub page showing overview of all phases with their completion status. Entry point for the design workflow.

**Features:**
- Grid of cards, one per phase
- Each card shows: phase name, description, status (completed/current/locked)
- Click card to navigate to that phase
- Progress bar showing overall completion
- "Start" button if no phases started yet

**Acceptance Criteria:**
- [ ] Fetches design phase data on mount
- [ ] Creates design phase record if none exists for project
- [ ] Renders 7 phase cards in grid layout
- [ ] Cards show visual status (completed checkmark, current highlight, locked icon)
- [ ] Cards are clickable (if accessible)
- [ ] Progress bar shows X/7 phases complete
- [ ] Responsive grid (3 cols desktop, 2 tablet, 1 mobile)
- [ ] Loading skeleton while fetching

**Dependencies:** Task 1.4, Task 2.2

---

### Phase 3: Vision & Roadmap Pages

#### Task 3.1: Create ProductVisionForm Component
**File:** `frontend/src/components/design-phases/forms/ProductVisionForm.tsx`

**Description:** Form component for editing product overview data (name, description, problems/solutions, features).

**Props:**
```typescript
interface ProductVisionFormProps {
  initialData: ProductOverview | null;
  onChange: (data: ProductOverview) => void;
  disabled?: boolean;
}
```

**Features:**
- Text input for product name
- Textarea for product description
- Dynamic list of problem/solution pairs (add/remove/edit)
- Dynamic list of features (add/remove/edit)
- Auto-save on change (debounced)

**Acceptance Criteria:**
- [ ] Controlled form with all fields
- [ ] Name input with validation (required, max 100 chars)
- [ ] Description textarea with character count
- [ ] Problem/solution list with add button
- [ ] Each problem/solution has problem field and solution field
- [ ] Remove button on each problem/solution item
- [ ] Features list with add button
- [ ] Each feature has title and description
- [ ] Remove button on each feature item
- [ ] Calls onChange with debounce (500ms) on any change
- [ ] Shows validation errors inline

**Dependencies:** Task 1.2

---

#### Task 3.2: Implement ProductVisionPage
**File:** `frontend/src/pages/design/ProductVisionPage.tsx`

**Description:** Phase 1 page for defining product vision. Uses PhaseLayout and ProductVisionForm.

**Features:**
- PhaseLayout wrapper
- ProductVisionForm for editing
- Auto-save to database
- AI assist for generating problems/features from description
- Next phase button when complete

**Acceptance Criteria:**
- [ ] Wrapped in PhaseLayout
- [ ] Loads existing productOverview from store
- [ ] ProductVisionForm receives data and handles changes
- [ ] Changes trigger store update (auto-save)
- [ ] AI assist button visible
- [ ] AI assist generates problems/features from description text
- [ ] NextPhaseButton enabled when name + description + 1 problem + 1 feature exist
- [ ] Completing phase navigates to roadmap

**Dependencies:** Task 2.2, Task 3.1, Task 1.4

---

#### Task 3.3: Create RoadmapEditor Component
**File:** `frontend/src/components/design-phases/forms/RoadmapEditor.tsx`

**Description:** Editor for managing roadmap sections with drag-and-drop reordering.

**Props:**
```typescript
interface RoadmapEditorProps {
  sections: RoadmapSection[];
  onChange: (sections: RoadmapSection[]) => void;
  disabled?: boolean;
}
```

**Features:**
- List of section cards
- Drag handle for reordering
- Inline edit for title and description
- Add new section button
- Delete section (with confirmation)
- Auto-generates section IDs (kebab-case from title)

**Acceptance Criteria:**
- [ ] Renders list of section cards
- [ ] Each card shows order number, title, description
- [ ] Drag handle on left side of each card
- [ ] Drag-and-drop reorders items (update order property)
- [ ] Click title/description to edit inline
- [ ] Add button creates new section at bottom
- [ ] New section has auto-generated ID from title
- [ ] Delete button with confirmation dialog
- [ ] Calls onChange on any change

**Dependencies:** Task 1.2, may use `@dnd-kit` or similar library

---

#### Task 3.4: Implement ProductRoadmapPage
**File:** `frontend/src/pages/design/ProductRoadmapPage.tsx`

**Description:** Phase 2 page for defining product roadmap (sections breakdown).

**Features:**
- PhaseLayout wrapper
- RoadmapEditor for editing sections
- AI assist for suggesting sections based on product overview
- Sync sections to design_sections table on save
- Next phase button when complete

**Acceptance Criteria:**
- [ ] Wrapped in PhaseLayout
- [ ] Loads existing productRoadmap from store
- [ ] RoadmapEditor receives data and handles changes
- [ ] Changes trigger store update (auto-save)
- [ ] After saving, syncs to design_sections table
- [ ] AI assist generates section suggestions from product overview
- [ ] NextPhaseButton enabled when at least 1 section exists
- [ ] Shows recommended: 3-7 sections

**Dependencies:** Task 2.2, Task 3.3, Task 1.4

---

### Phase 4: Data Model & Design System Pages

#### Task 4.1: Create DataModelEditor Component
**File:** `frontend/src/components/design-phases/forms/DataModelEditor.tsx`

**Description:** Visual editor for defining entities and relationships. Shows entities as cards and relationships as connections.

**Props:**
```typescript
interface DataModelEditorProps {
  dataModel: DataModel | null;
  onChange: (dataModel: DataModel) => void;
  disabled?: boolean;
}
```

**Features:**
- Grid of entity cards
- Each entity shows name and list of fields
- Add entity button
- Click entity to edit (modal or inline)
- Relationship list below entities
- Add relationship with from/to dropdowns

**Acceptance Criteria:**
- [ ] Renders entity cards in responsive grid
- [ ] Each entity card shows name and field list
- [ ] Add entity button opens editor
- [ ] Entity editor allows: name, description, add/remove fields
- [ ] Each field has: name, type dropdown, required checkbox
- [ ] Type options: string, number, boolean, date, uuid, json, array
- [ ] Delete entity button (with confirmation if has relationships)
- [ ] Relationship list shows: from entity -> to entity (type)
- [ ] Add relationship: select from, select to, select type
- [ ] Type options: one-to-one, one-to-many, many-to-many
- [ ] Delete relationship button
- [ ] Calls onChange on any change

**Dependencies:** Task 1.2

---

#### Task 4.2: Implement DataModelPage
**File:** `frontend/src/pages/design/DataModelPage.tsx`

**Description:** Phase 3 page for defining data model. This phase is optional.

**Features:**
- PhaseLayout wrapper
- DataModelEditor for editing
- AI assist for suggesting entities from product overview
- Skip button (phase is optional)
- Next phase button

**Acceptance Criteria:**
- [ ] Wrapped in PhaseLayout
- [ ] Loads existing dataModel from store
- [ ] DataModelEditor receives data and handles changes
- [ ] Changes trigger store update (auto-save)
- [ ] AI assist generates entity suggestions from product overview and sections
- [ ] "Skip this phase" link/button available
- [ ] NextPhaseButton always enabled (optional phase)
- [ ] Shows info that this phase is optional

**Dependencies:** Task 2.2, Task 4.1, Task 1.4

---

#### Task 4.3: Create ColorPicker Component
**File:** `frontend/src/components/design-phases/forms/ColorPicker.tsx`

**Description:** Component for selecting Tailwind color palette. Shows color swatches with names.

**Props:**
```typescript
interface ColorPickerProps {
  label: string;
  value: ColorToken | null;
  onChange: (color: ColorToken) => void;
}
```

**Features:**
- Show current selected color with swatch
- Click to open palette dropdown
- Tailwind color palette (slate, gray, zinc, neutral, stone, red, orange, amber, yellow, lime, green, emerald, teal, cyan, sky, blue, indigo, violet, purple, fuchsia, pink, rose)
- Each color shows shades (50-950)
- Select color + shade

**Acceptance Criteria:**
- [ ] Shows current color swatch and name
- [ ] Dropdown/popover with full Tailwind palette
- [ ] Colors organized by hue
- [ ] Each hue shows shade range (50, 100, 200, ..., 950)
- [ ] Click shade to select
- [ ] Returns ColorToken with name (e.g., "blue-500") and value (hex)
- [ ] Close dropdown on selection or outside click
- [ ] Accessible (keyboard navigation)

**Dependencies:** Task 1.2

---

#### Task 4.4: Create TypographyPicker Component
**File:** `frontend/src/components/design-phases/forms/TypographyPicker.tsx`

**Description:** Component for selecting Google Fonts families.

**Props:**
```typescript
interface TypographyPickerProps {
  label: string;
  value: FontFamily | null;
  onChange: (font: FontFamily) => void;
  category: 'heading' | 'body' | 'mono';
}
```

**Features:**
- Show current selected font with preview
- Searchable dropdown of Google Fonts
- Filter by category (serif, sans-serif, monospace, display)
- Weight selection (multiple checkboxes)
- Live preview of font

**Acceptance Criteria:**
- [ ] Shows current font family name and preview
- [ ] Dropdown with search input
- [ ] Popular fonts shown first
- [ ] Category filter buttons (based on `category` prop)
- [ ] For 'mono' category, only show monospace fonts
- [ ] Weight checkboxes (400, 500, 600, 700)
- [ ] Preview text updates with selected font
- [ ] Returns FontFamily with name, weights, and Google Fonts URL

**Dependencies:** Task 1.2, may use Google Fonts API

---

#### Task 4.5: Implement DesignSystemPage
**File:** `frontend/src/pages/design/DesignSystemPage.tsx`

**Description:** Phase 4 page for selecting design tokens (colors and typography).

**Features:**
- PhaseLayout wrapper
- Color section with 4 pickers (primary, secondary, neutral, accent)
- Typography section with 3 pickers (heading, body, mono)
- Live preview panel showing sample UI
- AI assist for color harmony suggestions
- Skip button (optional phase)

**Acceptance Criteria:**
- [ ] Wrapped in PhaseLayout
- [ ] Loads existing designSystem from store
- [ ] Four ColorPicker components for color palette
- [ ] Three TypographyPicker components for typography
- [ ] Preview panel shows sample button, card, text with selected tokens
- [ ] Changes trigger store update (auto-save)
- [ ] AI assist suggests complementary colors
- [ ] "Skip this phase" option
- [ ] Uses sensible defaults if skipped (Tailwind stone + Inter)

**Dependencies:** Task 2.2, Task 4.3, Task 4.4, Task 1.4

---

### Phase 5: Shell Design Page

#### Task 5.1: Create ShellEditor Component
**File:** `frontend/src/components/design-phases/forms/ShellEditor.tsx`

**Description:** Editor for defining app shell (navigation items and layout pattern).

**Props:**
```typescript
interface ShellEditorProps {
  shellSpec: ShellSpec | null;
  sections: RoadmapSection[];
  onChange: (shellSpec: ShellSpec) => void;
  disabled?: boolean;
}
```

**Features:**
- Layout pattern selector (radio buttons with visual preview)
- Navigation items list
- Each nav item: label, icon picker, route, link to section
- Add/remove/reorder nav items
- Textarea for overview/notes

**Acceptance Criteria:**
- [ ] Layout pattern radio group with visual examples
- [ ] Options: sidebar-left, sidebar-right, top-nav, bottom-nav, no-nav
- [ ] Navigation items list with drag reorder
- [ ] Each item: label input, icon picker, route input, section dropdown
- [ ] Section dropdown populated from `sections` prop
- [ ] Add nav item button
- [ ] Remove nav item button
- [ ] Overview textarea for notes
- [ ] Calls onChange on any change

**Dependencies:** Task 1.2

---

#### Task 5.2: Implement ShellDesignPage
**File:** `frontend/src/pages/design/ShellDesignPage.tsx`

**Description:** Phase 5 page for designing app shell.

**Features:**
- PhaseLayout wrapper
- ShellEditor for editing
- Visual preview of shell layout
- AI assist for suggesting navigation structure
- Skip button (optional phase)

**Acceptance Criteria:**
- [ ] Wrapped in PhaseLayout
- [ ] Loads existing shellSpec and roadmap sections from store
- [ ] ShellEditor receives data and handles changes
- [ ] Visual preview updates with changes
- [ ] Changes trigger store update (auto-save)
- [ ] AI assist generates nav structure from sections
- [ ] "Skip this phase" option
- [ ] Uses default layout if skipped

**Dependencies:** Task 2.2, Task 5.1, Task 1.4

---

### Phase 6: Sections Pages

#### Task 6.1: Create SectionCard Component
**File:** `frontend/src/components/design-phases/cards/SectionCard.tsx`

**Description:** Card component for displaying section summary in the overview grid.

**Props:**
```typescript
interface SectionCardProps {
  section: DesignSection;
  onClick: () => void;
}
```

**Features:**
- Shows section title and description
- Status indicator (pending/in-progress/completed)
- Thumbnail of first screen design (if any)
- Clickable to navigate to detail

**Acceptance Criteria:**
- [ ] Shows section title as heading
- [ ] Shows truncated description (2 lines max)
- [ ] Status badge with color (gray/yellow/green)
- [ ] If screen_designs not empty, show first as thumbnail
- [ ] Hover state for interactivity
- [ ] Click triggers onClick callback

**Dependencies:** Task 1.2

---

#### Task 6.2: Implement SectionsOverviewPage
**File:** `frontend/src/pages/design/SectionsOverviewPage.tsx`

**Description:** Phase 6 overview page showing grid of all sections from roadmap.

**Features:**
- PhaseLayout wrapper
- Grid of SectionCard components
- Empty state if no sections (link to roadmap)
- Filter by status (all/pending/completed)
- Progress indicator (X/Y sections complete)

**Acceptance Criteria:**
- [ ] Wrapped in PhaseLayout
- [ ] Loads sections from store
- [ ] Renders SectionCard for each section
- [ ] Cards ordered by orderIndex
- [ ] Click card navigates to `/project/:id/design/sections/:sectionId`
- [ ] Progress bar shows sections completed
- [ ] Filter tabs for status
- [ ] Empty state with link to roadmap if no sections
- [ ] Responsive grid layout

**Dependencies:** Task 2.2, Task 6.1, Task 1.4

---

#### Task 6.3: Create SectionSpecEditor Component
**File:** `frontend/src/components/design-phases/forms/SectionSpecEditor.tsx`

**Description:** Form for editing section specification (overview, features, requirements, acceptance).

**Props:**
```typescript
interface SectionSpecEditorProps {
  spec: SectionSpec | null;
  onChange: (spec: SectionSpec) => void;
  disabled?: boolean;
}
```

**Features:**
- Overview textarea
- Key features list (add/remove)
- Requirements list (add/remove)
- Acceptance criteria list (add/remove)

**Acceptance Criteria:**
- [ ] Overview textarea with placeholder
- [ ] Key features as editable list
- [ ] Requirements as editable list
- [ ] Acceptance criteria as editable list
- [ ] Add button for each list
- [ ] Remove button for each item
- [ ] Calls onChange on any change

**Dependencies:** Task 1.2

---

#### Task 6.4: Create SampleDataEditor Component
**File:** `frontend/src/components/design-phases/forms/SampleDataEditor.tsx`

**Description:** JSON editor for defining sample data for a section.

**Props:**
```typescript
interface SampleDataEditorProps {
  data: unknown;
  onChange: (data: unknown) => void;
  disabled?: boolean;
}
```

**Features:**
- JSON editor with syntax highlighting
- Validation of JSON format
- Pretty print button
- Error display for invalid JSON

**Acceptance Criteria:**
- [ ] Monaco editor or similar with JSON mode
- [ ] Syntax highlighting
- [ ] Line numbers
- [ ] Validation on change
- [ ] Error message for invalid JSON
- [ ] Format/pretty-print button
- [ ] Calls onChange only with valid JSON

**Dependencies:** Existing Monaco setup in project

---

#### Task 6.5: Implement SectionDetailPage
**File:** `frontend/src/pages/design/SectionDetailPage.tsx`

**Description:** Detail page for a single section showing spec, sample data, and screen designs.

**Features:**
- PhaseLayout wrapper (or simpler layout with back button)
- Section header with title and description
- Tabs: Spec | Sample Data | Screens
- SectionSpecEditor in Spec tab
- SampleDataEditor in Sample Data tab
- Screen designs gallery in Screens tab
- Mark as complete button

**Acceptance Criteria:**
- [ ] Gets sectionId from URL params
- [ ] Loads section data from store
- [ ] Shows section title and description
- [ ] Tabbed interface for different editors
- [ ] Spec tab: SectionSpecEditor
- [ ] Sample Data tab: SampleDataEditor
- [ ] Screens tab: grid of screen thumbnails (if any)
- [ ] Changes auto-save to database
- [ ] "Mark Complete" button updates status
- [ ] Back button returns to sections overview
- [ ] AI assist for generating spec from section description

**Dependencies:** Task 6.3, Task 6.4, Task 1.4

---

### Phase 7: Export Page & Integration

#### Task 7.1: Implement ExportPage
**File:** `frontend/src/pages/design/ExportPage.tsx`

**Description:** Final phase page showing readiness checklist and export options.

**Features:**
- PhaseLayout wrapper
- Readiness checklist (required items with status)
- Summary cards for each completed phase
- Export buttons (JSON, prompts)
- "Build" button to proceed to ProjectEditor

**Acceptance Criteria:**
- [ ] Wrapped in PhaseLayout
- [ ] Readiness checklist shows:
  - [ ] Product vision complete (required)
  - [ ] Roadmap with 1+ sections (required)
  - [ ] At least 1 section with spec (required)
  - [ ] Data model defined (optional, shows if done)
  - [ ] Design system defined (optional, shows if done)
  - [ ] Shell defined (optional, shows if done)
- [ ] Each checklist item shows check or X
- [ ] Summary cards for completed phases
- [ ] "Export as JSON" downloads complete DesignExport
- [ ] "Copy One-Shot Prompt" copies AI prompt to clipboard
- [ ] "Build" button enabled only when required items complete
- [ ] "Build" navigates to `/project/:id/editor` with context

**Dependencies:** Task 2.2, Task 1.4

---

#### Task 7.2: Create Export Generation Logic
**File:** `frontend/src/services/designExportService.ts`

**Description:** Service functions for generating export artifacts from design phase data.

**Functions:**
```typescript
generateDesignExport(designPhase: DesignPhase, sections: DesignSection[]): DesignExport
generateOneShotPrompt(designExport: DesignExport): string
generateSectionPrompt(section: DesignSection, designExport: DesignExport): string
downloadExportAsJson(designExport: DesignExport, filename: string): void
```

**Acceptance Criteria:**
- [ ] `generateDesignExport` combines all phase data into export structure
- [ ] `generateOneShotPrompt` creates comprehensive AI prompt with:
  - Product overview
  - Tech stack (React, Tailwind, etc.)
  - Data model summary
  - Design tokens (colors, fonts)
  - All section specs
- [ ] `generateSectionPrompt` creates focused prompt for one section
- [ ] `downloadExportAsJson` triggers browser download
- [ ] Prompts follow patterns from design-os-main/.claude/commands/

**Dependencies:** Task 1.2

---

#### Task 7.3: Update Project Creation Flow
**Files:**
- `frontend/src/pages/Dashboard.tsx` (or wherever projects are created)
- `frontend/src/services/projectService.ts`

**Description:** Update project creation to route to the new design phases workflow.

**Changes:**
- "Create Project" button navigates to `/project/:id/design` instead of `/project/:id`
- Create project record with status = "designing"
- Initialize empty design_phases record

**Acceptance Criteria:**
- [ ] New project creation flow:
  1. User enters project name/description
  2. Create project record in database
  3. Create design_phases record for project
  4. Navigate to `/project/:id/design`
- [ ] Project list shows design status
- [ ] Can resume design from project list

**Dependencies:** Task 1.3, existing project flow

---

#### Task 7.4: Connect Build to ProjectEditor
**File:** `frontend/src/pages/design/ExportPage.tsx` (update)

**Description:** Implement the "Build" button to pass design context to the project editor.

**Features:**
- Generate export on build click
- Store export in project context or local storage
- Navigate to ProjectEditor
- ProjectEditor loads context and provides to AI

**Acceptance Criteria:**
- [ ] Build button generates DesignExport
- [ ] Export stored in project record or session storage
- [ ] Navigate to `/project/:id/editor`
- [ ] ProjectEditor reads export context
- [ ] AI chat receives context for code generation
- [ ] User can reference design decisions in chat

**Dependencies:** Task 7.2, existing ProjectEditor

---

#### Task 7.5: Update Project Status Flow
**File:** `frontend/src/services/projectService.ts` (update)

**Description:** Add project status tracking for design workflow.

**Changes:**
- Add status field to project: 'designing' | 'building' | 'deployed'
- Update status when transitioning phases
- Show status in project list

**Acceptance Criteria:**
- [ ] Project has status field
- [ ] Status = 'designing' when in design phases
- [ ] Status = 'building' when in editor
- [ ] Project list shows current status
- [ ] Can filter projects by status

**Dependencies:** Existing project structure

---

### Phase 8: AI Integration

#### Task 8.1: Create Phase-Specific AI Prompts
**File:** `frontend/src/services/designAIService.ts`

**Description:** Create service with AI prompts for each design phase.

**Functions:**
```typescript
getVisionAssistPrompt(currentData: ProductOverview | null): string
getRoadmapAssistPrompt(overview: ProductOverview): string
getDataModelAssistPrompt(overview: ProductOverview, roadmap: ProductRoadmap): string
getDesignSystemAssistPrompt(overview: ProductOverview): string
getShellAssistPrompt(sections: RoadmapSection[]): string
getSectionSpecAssistPrompt(section: DesignSection, overview: ProductOverview): string
```

**Acceptance Criteria:**
- [ ] Each function returns system prompt for AI
- [ ] Prompts include context from existing data
- [ ] Prompts guide AI to generate structured output
- [ ] Output format matches expected data structures
- [ ] Prompts are concise but comprehensive

**Dependencies:** Task 1.2, reference design-os-main/.claude/commands/

---

#### Task 8.2: Integrate AI Assist with Phase Pages
**Files:** All phase pages

**Description:** Connect AI assist buttons to the existing chat interface with phase-specific prompts.

**Features:**
- AI assist button on each phase
- Click opens chat panel (or modal)
- Chat pre-loaded with phase-specific system prompt
- AI responses can be applied to form

**Acceptance Criteria:**
- [ ] Each phase page has AI assist button
- [ ] Clicking opens EnhancedChatInterface (or similar)
- [ ] Chat has phase-specific system prompt
- [ ] "Apply" button on AI suggestions
- [ ] Applying updates form with AI output
- [ ] Handles structured output from AI

**Dependencies:** Task 8.1, existing chat infrastructure

---

## Verification Plan

### Database Verification
1. Run migration: `npx supabase db push`
2. Verify tables exist: `SELECT * FROM design_phases LIMIT 1`
3. Verify RLS works: attempt query without auth (should fail)
4. Verify triggers: update record, check updated_at changes

### Navigation Verification
1. Navigate to `/project/:id/design` - see hub page
2. Click each phase card - navigates correctly
3. Use PhaseNav to switch phases
4. Verify locked phases can't be accessed
5. Complete phase, verify next unlocks

### Data Persistence Verification
1. Enter data in vision form, refresh - data persists
2. Add sections to roadmap, refresh - data persists
3. Complete phase, refresh - completion status persists
4. Delete project - verify cascade deletes design data

### Export Verification
1. Complete minimum required phases
2. Click export JSON - file downloads
3. Verify JSON structure matches DesignExport interface
4. Copy one-shot prompt - verify it's comprehensive

### Build Flow Verification
1. Complete required phases
2. Click Build on export page
3. Verify navigation to ProjectEditor
4. Verify AI chat has access to design context
5. Ask AI about design decisions - should reference export

### End-to-End Verification
1. Create new project
2. Complete all 7 phases with real data
3. Export and review artifacts
4. Build and generate code
5. Preview application
6. Verify code matches design specifications

---

## File Checklist

### New Files to Create

**Database:**
- [ ] `supabase/migrations/YYYYMMDDHHMMSS_create_design_phases_tables.sql`

**Types:**
- [ ] `frontend/src/types/design-phases.ts`

**Services:**
- [ ] `frontend/src/services/designPhaseService.ts`
- [ ] `frontend/src/services/designExportService.ts`
- [ ] `frontend/src/services/designAIService.ts`

**Store:**
- [ ] `frontend/src/stores/useDesignPhaseStore.ts`

**Components:**
- [ ] `frontend/src/components/design-phases/index.ts`
- [ ] `frontend/src/components/design-phases/PhaseNav.tsx`
- [ ] `frontend/src/components/design-phases/PhaseLayout.tsx`
- [ ] `frontend/src/components/design-phases/PhaseHeader.tsx`
- [ ] `frontend/src/components/design-phases/PhaseProgress.tsx`
- [ ] `frontend/src/components/design-phases/NextPhaseButton.tsx`
- [ ] `frontend/src/components/design-phases/SaveIndicator.tsx`
- [ ] `frontend/src/components/design-phases/AIAssistButton.tsx`
- [ ] `frontend/src/components/design-phases/cards/ProductOverviewCard.tsx`
- [ ] `frontend/src/components/design-phases/cards/RoadmapCard.tsx`
- [ ] `frontend/src/components/design-phases/cards/DataModelCard.tsx`
- [ ] `frontend/src/components/design-phases/cards/DesignSystemCard.tsx`
- [ ] `frontend/src/components/design-phases/cards/ShellCard.tsx`
- [ ] `frontend/src/components/design-phases/cards/SectionCard.tsx`
- [ ] `frontend/src/components/design-phases/forms/ProductVisionForm.tsx`
- [ ] `frontend/src/components/design-phases/forms/ProblemSolutionEditor.tsx`
- [ ] `frontend/src/components/design-phases/forms/FeatureListEditor.tsx`
- [ ] `frontend/src/components/design-phases/forms/RoadmapEditor.tsx`
- [ ] `frontend/src/components/design-phases/forms/DataModelEditor.tsx`
- [ ] `frontend/src/components/design-phases/forms/EntityEditor.tsx`
- [ ] `frontend/src/components/design-phases/forms/RelationshipEditor.tsx`
- [ ] `frontend/src/components/design-phases/forms/ColorPicker.tsx`
- [ ] `frontend/src/components/design-phases/forms/TypographyPicker.tsx`
- [ ] `frontend/src/components/design-phases/forms/ShellEditor.tsx`
- [ ] `frontend/src/components/design-phases/forms/SectionSpecEditor.tsx`
- [ ] `frontend/src/components/design-phases/forms/SampleDataEditor.tsx`

**Pages:**
- [ ] `frontend/src/pages/design/DesignPhaseIndex.tsx`
- [ ] `frontend/src/pages/design/ProductVisionPage.tsx`
- [ ] `frontend/src/pages/design/ProductRoadmapPage.tsx`
- [ ] `frontend/src/pages/design/DataModelPage.tsx`
- [ ] `frontend/src/pages/design/DesignSystemPage.tsx`
- [ ] `frontend/src/pages/design/ShellDesignPage.tsx`
- [ ] `frontend/src/pages/design/SectionsOverviewPage.tsx`
- [ ] `frontend/src/pages/design/SectionDetailPage.tsx`
- [ ] `frontend/src/pages/design/ExportPage.tsx`

### Files to Modify
- [ ] `frontend/src/App.tsx` - Add design phase routes
- [ ] `frontend/src/services/projectService.ts` - Add status field handling
- [ ] `frontend/src/pages/Dashboard.tsx` - Update create project flow

---

## Notes

- **Full Replacement**: This workflow replaces the existing ProjectDesign page entirely
- **Progressive Enhancement**: Optional phases can be skipped
- **Minimum Required**: Product Vision + Roadmap + 1 Section with spec
- **Tailwind v4**: Verify alignment with Design OS styling
- **AI Integration**: Each phase will include AI chat assistance
- **Reference Code**: Adapt patterns from `design-os-main/src/` components
