-- Drop deprecated PRD columns after migration to flexible sections structure
-- These columns have been replaced by the sections JSONB column

-- First drop the old completion calculation function since it references old columns
DROP FUNCTION IF EXISTS calculate_prd_completion(prds);

-- Drop from prds table
ALTER TABLE prds 
DROP COLUMN IF EXISTS overview CASCADE,
DROP COLUMN IF EXISTS core_features CASCADE,
DROP COLUMN IF EXISTS additional_features CASCADE,
DROP COLUMN IF EXISTS technical_requirements CASCADE,
DROP COLUMN IF EXISTS success_metrics CASCADE;

-- Drop from prd_versions table
ALTER TABLE prd_versions 
DROP COLUMN IF EXISTS overview CASCADE,
DROP COLUMN IF EXISTS core_features CASCADE,
DROP COLUMN IF EXISTS additional_features CASCADE,
DROP COLUMN IF EXISTS technical_requirements CASCADE,
DROP COLUMN IF EXISTS success_metrics CASCADE;