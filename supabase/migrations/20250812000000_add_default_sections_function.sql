-- Create function to initialize PRD with default sections
CREATE OR REPLACE FUNCTION initialize_prd_with_default_sections(p_prd_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_sections JSONB;
BEGIN
    -- Define default sections with agent assignments
    v_sections := '[
        {
            "id": "overview",
            "title": "Overview",
            "order": 1,
            "agent": "project_manager",
            "required": true,
            "content": {
                "vision": "",
                "problem": "",
                "targetUsers": [],
                "businessGoals": []
            },
            "status": "pending",
            "isCustom": false,
            "description": "Project vision, problem statement, and target users"
        },
        {
            "id": "core_features",
            "title": "Core Features",
            "order": 2,
            "agent": "project_manager",
            "required": true,
            "content": {
                "features": []
            },
            "status": "pending",
            "isCustom": false,
            "description": "Essential features that define the core product value"
        },
        {
            "id": "additional_features",
            "title": "Additional Features",
            "order": 3,
            "agent": "project_manager",
            "required": false,
            "content": {
                "features": []
            },
            "status": "pending",
            "isCustom": false,
            "description": "Nice-to-have features for future iterations"
        },
        {
            "id": "ui_design_patterns",
            "title": "UI Design Guidance/Patterns",
            "order": 4,
            "agent": "design_assistant",
            "required": true,
            "content": {
                "designSystem": {
                    "colors": {},
                    "typography": {},
                    "spacing": {},
                    "components": []
                },
                "patterns": [],
                "accessibility": []
            },
            "status": "pending",
            "isCustom": false,
            "description": "Design system, component patterns, and visual guidelines"
        },
        {
            "id": "ux_flows",
            "title": "User Experience Flows",
            "order": 5,
            "agent": "design_assistant",
            "required": true,
            "content": {
                "userJourneys": [],
                "navigationStructure": {},
                "interactionPatterns": [],
                "responsiveStrategy": ""
            },
            "status": "pending",
            "isCustom": false,
            "description": "User journey maps, interaction flows, and navigation patterns"
        },
        {
            "id": "technical_architecture",
            "title": "Technical Architecture",
            "order": 6,
            "agent": "engineering_assistant",
            "required": true,
            "content": {
                "platforms": [],
                "techStack": {
                    "frontend": [],
                    "backend": [],
                    "database": [],
                    "infrastructure": []
                },
                "architecture": {
                    "pattern": "",
                    "components": [],
                    "dataFlow": ""
                },
                "security": [],
                "scalability": [],
                "performance": []
            },
            "status": "pending",
            "isCustom": false,
            "description": "System architecture, technology stack, and implementation approach"
        },
        {
            "id": "tech_integrations",
            "title": "Tech Integrations",
            "order": 7,
            "agent": "config_helper",
            "required": true,
            "content": {
                "integrations": [],
                "apiConfigurations": [],
                "environmentVariables": [],
                "deploymentConfig": {},
                "monitoring": []
            },
            "status": "pending",
            "isCustom": false,
            "description": "Third-party services, APIs, and integration configurations"
        }
    ]'::jsonb;
    
    -- Update the PRD with default sections
    UPDATE prds 
    SET sections = v_sections,
        updated_at = NOW()
    WHERE id = p_prd_id;
    
    RETURN v_sections;
END;
$$ LANGUAGE plpgsql;

-- Create function to get current agent based on incomplete sections
CREATE OR REPLACE FUNCTION get_current_prd_agent(p_prd_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_sections JSONB;
    v_section JSONB;
    v_agent_sequence TEXT[] := ARRAY['project_manager', 'design_assistant', 'engineering_assistant', 'config_helper'];
    v_agent TEXT;
BEGIN
    -- Get sections from PRD
    SELECT sections INTO v_sections FROM prds WHERE id = p_prd_id;
    
    -- If no sections, return first agent
    IF v_sections IS NULL OR v_sections = '[]'::jsonb THEN
        RETURN 'project_manager';
    END IF;
    
    -- Check each agent in sequence for incomplete required sections
    FOREACH v_agent IN ARRAY v_agent_sequence
    LOOP
        -- Check if this agent has incomplete required sections
        FOR v_section IN SELECT * FROM jsonb_array_elements(v_sections)
        LOOP
            IF v_section->>'agent' = v_agent 
               AND (v_section->>'required')::boolean = true
               AND v_section->>'status' != 'completed' THEN
                RETURN v_agent;
            END IF;
        END LOOP;
    END LOOP;
    
    -- All required sections complete, return last agent
    RETURN 'config_helper';
END;
$$ LANGUAGE plpgsql;

-- Create function to check if agent's required sections are complete
CREATE OR REPLACE FUNCTION are_agent_sections_complete(p_prd_id UUID, p_agent TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_sections JSONB;
    v_section JSONB;
    v_incomplete_count INTEGER := 0;
BEGIN
    -- Get sections from PRD
    SELECT sections INTO v_sections FROM prds WHERE id = p_prd_id;
    
    -- If no sections, return false
    IF v_sections IS NULL OR v_sections = '[]'::jsonb THEN
        RETURN false;
    END IF;
    
    -- Count incomplete required sections for this agent
    FOR v_section IN SELECT * FROM jsonb_array_elements(v_sections)
    LOOP
        IF v_section->>'agent' = p_agent 
           AND (v_section->>'required')::boolean = true
           AND v_section->>'status' != 'completed' THEN
            v_incomplete_count := v_incomplete_count + 1;
        END IF;
    END LOOP;
    
    RETURN v_incomplete_count = 0;
END;
$$ LANGUAGE plpgsql;

-- Create function to get next agent in sequence
CREATE OR REPLACE FUNCTION get_next_agent_in_sequence(p_current_agent TEXT)
RETURNS TEXT AS $$
DECLARE
    v_agent_sequence TEXT[] := ARRAY['project_manager', 'design_assistant', 'engineering_assistant', 'config_helper'];
    v_current_index INTEGER;
BEGIN
    -- Find current agent index
    v_current_index := array_position(v_agent_sequence, p_current_agent);
    
    -- If not found or last agent, return NULL
    IF v_current_index IS NULL OR v_current_index = array_length(v_agent_sequence, 1) THEN
        RETURN NULL;
    END IF;
    
    -- Return next agent
    RETURN v_agent_sequence[v_current_index + 1];
END;
$$ LANGUAGE plpgsql;

-- Create function to update section content and mark as completed
CREATE OR REPLACE FUNCTION update_prd_section_content(
    p_prd_id UUID,
    p_section_id TEXT,
    p_content JSONB
)
RETURNS JSONB AS $$
DECLARE
    v_sections JSONB;
    v_updated_sections JSONB := '[]'::jsonb;
    v_section JSONB;
    v_found BOOLEAN := false;
BEGIN
    -- Get current sections
    SELECT sections INTO v_sections FROM prds WHERE id = p_prd_id;
    
    -- Update the specific section
    FOR v_section IN SELECT * FROM jsonb_array_elements(v_sections)
    LOOP
        IF v_section->>'id' = p_section_id THEN
            -- Update content and mark as completed
            v_section := v_section || jsonb_build_object(
                'content', p_content,
                'status', 'completed'
            );
            v_found := true;
        END IF;
        v_updated_sections := v_updated_sections || v_section;
    END LOOP;
    
    IF NOT v_found THEN
        RAISE EXCEPTION 'Section with id % not found', p_section_id;
    END IF;
    
    -- Update PRD
    UPDATE prds 
    SET sections = v_updated_sections,
        completion_percentage = calculate_prd_completion_flexible(p_prd_id),
        updated_at = NOW()
    WHERE id = p_prd_id;
    
    RETURN v_section;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to initialize sections when PRD is created
CREATE OR REPLACE FUNCTION auto_initialize_prd_sections()
RETURNS TRIGGER AS $$
BEGIN
    -- Only initialize if sections are empty
    IF NEW.sections IS NULL OR NEW.sections = '[]'::jsonb THEN
        PERFORM initialize_prd_with_default_sections(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER initialize_prd_sections_on_insert
AFTER INSERT ON prds
FOR EACH ROW
EXECUTE FUNCTION auto_initialize_prd_sections();