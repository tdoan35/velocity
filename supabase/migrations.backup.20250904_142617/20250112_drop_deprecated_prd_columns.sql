-- Drop deprecated PRD columns after migration to flexible sections structure
-- These columns have been replaced by the sections JSONB column

-- Drop from prds table
ALTER TABLE prds 
DROP COLUMN IF EXISTS overview,
DROP COLUMN IF EXISTS core_features,
DROP COLUMN IF EXISTS additional_features,
DROP COLUMN IF EXISTS technical_requirements,
DROP COLUMN IF EXISTS success_metrics;

-- Drop from prd_versions table
ALTER TABLE prd_versions 
DROP COLUMN IF EXISTS overview,
DROP COLUMN IF EXISTS core_features,
DROP COLUMN IF EXISTS additional_features,
DROP COLUMN IF EXISTS technical_requirements,
DROP COLUMN IF EXISTS success_metrics;

-- Drop the old completion calculation function since it references old columns
DROP FUNCTION IF EXISTS calculate_prd_completion(prds);