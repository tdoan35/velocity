-- Design Phases Tables for Velocity
-- This migration creates tables for the 7-phase design workflow
-- Tables: design_phases (main record per project), design_sections (individual sections)

-- ============================================================================
-- Table: design_phases
-- Stores the main design phase data for each project. One record per project.
-- ============================================================================

CREATE TABLE IF NOT EXISTS design_phases (
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

-- RLS policies for design_phases
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

-- Indexes for design_phases
CREATE INDEX idx_design_phases_project_id ON design_phases(project_id);
CREATE INDEX idx_design_phases_user_id ON design_phases(user_id);

-- Updated_at trigger for design_phases
CREATE TRIGGER update_design_phases_updated_at
    BEFORE UPDATE ON design_phases
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Table: design_sections
-- Stores individual section designs. Multiple records per project (one per section defined in roadmap).
-- ============================================================================

CREATE TABLE IF NOT EXISTS design_sections (
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

-- RLS policies for design_sections
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

-- Indexes for design_sections
CREATE INDEX idx_design_sections_design_phase_id ON design_sections(design_phase_id);
CREATE INDEX idx_design_sections_project_id ON design_sections(project_id);
CREATE INDEX idx_design_sections_user_id ON design_sections(user_id);
CREATE INDEX idx_design_sections_order ON design_sections(project_id, order_index);

-- Updated_at trigger for design_sections
CREATE TRIGGER update_design_sections_updated_at
    BEFORE UPDATE ON design_sections
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
