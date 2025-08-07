-- Create PRD (Product Requirements Document) tables
CREATE TABLE IF NOT EXISTS prds (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- PRD Content
    title TEXT NOT NULL,
    version INTEGER DEFAULT 1,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'in_progress', 'review', 'finalized', 'archived')),
    
    -- PRD Sections stored as JSONB for flexibility
    overview JSONB DEFAULT '{}',
    core_features JSONB DEFAULT '[]',
    additional_features JSONB DEFAULT '[]',
    technical_requirements JSONB DEFAULT '{}',
    success_metrics JSONB DEFAULT '{}',
    
    -- Metadata
    completion_percentage INTEGER DEFAULT 0 CHECK (completion_percentage >= 0 AND completion_percentage <= 100),
    last_section_completed TEXT,
    creation_flow_state TEXT DEFAULT 'initialization',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    finalized_at TIMESTAMPTZ,
    
    -- Indexes for performance
    CONSTRAINT unique_active_prd_per_project UNIQUE (project_id, status)
);

-- Create PRD versions table for tracking changes
CREATE TABLE IF NOT EXISTS prd_versions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    prd_id UUID REFERENCES prds(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    
    -- Snapshot of PRD at this version
    title TEXT NOT NULL,
    overview JSONB,
    core_features JSONB,
    additional_features JSONB,
    technical_requirements JSONB,
    success_metrics JSONB,
    
    -- Version metadata
    change_summary TEXT,
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_prd_version UNIQUE (prd_id, version_number)
);

-- Create PRD conversation state table
CREATE TABLE IF NOT EXISTS prd_conversation_states (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    prd_id UUID REFERENCES prds(id) ON DELETE CASCADE,
    conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
    
    -- Current state in PRD creation flow
    current_section TEXT NOT NULL DEFAULT 'initialization',
    section_progress JSONB DEFAULT '{}',
    
    -- Suggested responses tracking
    last_suggestions JSONB DEFAULT '[]',
    suggestion_context JSONB DEFAULT '{}',
    
    -- Validation tracking
    validation_errors JSONB DEFAULT '[]',
    validation_warnings JSONB DEFAULT '[]',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_conversation_state UNIQUE (conversation_id)
);

-- Create indexes for performance
CREATE INDEX idx_prds_project_id ON prds(project_id);
CREATE INDEX idx_prds_user_id ON prds(user_id);
CREATE INDEX idx_prds_conversation_id ON prds(conversation_id);
CREATE INDEX idx_prds_status ON prds(status);
CREATE INDEX idx_prds_created_at ON prds(created_at DESC);
CREATE INDEX idx_prd_versions_prd_id ON prd_versions(prd_id);
CREATE INDEX idx_prd_conversation_states_conversation_id ON prd_conversation_states(conversation_id);

-- Create RLS policies
ALTER TABLE prds ENABLE ROW LEVEL SECURITY;
ALTER TABLE prd_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE prd_conversation_states ENABLE ROW LEVEL SECURITY;

-- PRD policies
CREATE POLICY "Users can view their own PRDs"
    ON prds FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

CREATE POLICY "Users can create PRDs"
    ON prds FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own PRDs"
    ON prds FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own PRDs"
    ON prds FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- PRD versions policies
CREATE POLICY "Users can view versions of their PRDs"
    ON prd_versions FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM prds 
            WHERE prds.id = prd_versions.prd_id 
            AND prds.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create versions of their PRDs"
    ON prd_versions FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM prds 
            WHERE prds.id = prd_versions.prd_id 
            AND prds.user_id = auth.uid()
        )
    );

-- PRD conversation states policies  
CREATE POLICY "Users can view their conversation states"
    ON prd_conversation_states FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversations 
            WHERE conversations.id = prd_conversation_states.conversation_id 
            AND conversations.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can manage their conversation states"
    ON prd_conversation_states FOR ALL
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversations 
            WHERE conversations.id = prd_conversation_states.conversation_id 
            AND conversations.user_id = auth.uid()
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM conversations 
            WHERE conversations.id = prd_conversation_states.conversation_id 
            AND conversations.user_id = auth.uid()
        )
    );

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_prds_updated_at BEFORE UPDATE ON prds
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_prd_conversation_states_updated_at BEFORE UPDATE ON prd_conversation_states
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to calculate PRD completion percentage
CREATE OR REPLACE FUNCTION calculate_prd_completion(prd_row prds)
RETURNS INTEGER AS $$
DECLARE
    completion INTEGER := 0;
    sections_complete INTEGER := 0;
BEGIN
    -- Check overview (20%)
    IF prd_row.overview IS NOT NULL AND prd_row.overview != '{}'::jsonb 
       AND prd_row.overview->>'vision' IS NOT NULL 
       AND prd_row.overview->>'problem' IS NOT NULL 
       AND prd_row.overview->>'targetUsers' IS NOT NULL THEN
        sections_complete := sections_complete + 20;
    END IF;
    
    -- Check core features (30% - minimum 3 features required)
    IF prd_row.core_features IS NOT NULL 
       AND jsonb_array_length(prd_row.core_features) >= 3 THEN
        sections_complete := sections_complete + 30;
    END IF;
    
    -- Check additional features (20%)
    IF prd_row.additional_features IS NOT NULL 
       AND jsonb_array_length(prd_row.additional_features) > 0 THEN
        sections_complete := sections_complete + 20;
    END IF;
    
    -- Check technical requirements (15%)
    IF prd_row.technical_requirements IS NOT NULL 
       AND prd_row.technical_requirements != '{}'::jsonb
       AND prd_row.technical_requirements->>'platforms' IS NOT NULL THEN
        sections_complete := sections_complete + 15;
    END IF;
    
    -- Check success metrics (15%)
    IF prd_row.success_metrics IS NOT NULL 
       AND prd_row.success_metrics != '{}'::jsonb
       AND prd_row.success_metrics->>'kpis' IS NOT NULL THEN
        sections_complete := sections_complete + 15;
    END IF;
    
    RETURN sections_complete;
END;
$$ LANGUAGE plpgsql;