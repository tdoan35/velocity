-- Migration: Update preview_sessions table for container-based real-time preview system
-- Date: August 30, 2025
-- Description: Migrate from Appetize.io-based preview system to Fly.io container-based system

BEGIN;

-- Add new container-specific columns
ALTER TABLE public.preview_sessions 
ADD COLUMN IF NOT EXISTS container_id text, -- ID from the Fly.io Machines API
ADD COLUMN IF NOT EXISTS container_url text; -- URL of the running container

-- Remove Appetize.io-specific columns
ALTER TABLE public.preview_sessions 
DROP COLUMN IF EXISTS device_id,
DROP COLUMN IF EXISTS public_key,
DROP COLUMN IF EXISTS app_url;

-- Update status constraint to support container lifecycle
ALTER TABLE public.preview_sessions 
DROP CONSTRAINT IF EXISTS preview_sessions_status_check;

ALTER TABLE public.preview_sessions 
ADD CONSTRAINT preview_sessions_status_check 
CHECK (status IN ('creating', 'active', 'ended', 'error'));

-- Rename preview_url to be more generic (if it exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'preview_sessions' 
        AND column_name = 'preview_url'
    ) THEN
        ALTER TABLE public.preview_sessions RENAME COLUMN preview_url TO container_url;
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
ALTER TABLE public.preview_sessions 
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT NOW();

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_preview_sessions_project ON public.preview_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_user ON public.preview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_status ON public.preview_sessions(status);
CREATE INDEX IF NOT EXISTS idx_preview_sessions_container ON public.preview_sessions(container_id);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_preview_sessions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_preview_sessions_updated_at_trigger ON public.preview_sessions;
CREATE TRIGGER update_preview_sessions_updated_at_trigger
    BEFORE UPDATE ON public.preview_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_preview_sessions_updated_at();

-- Comment the table with updated schema information
COMMENT ON TABLE public.preview_sessions IS 
'Container-based preview sessions for real-time development environment. 
Final schema after migration:
- id: Primary key UUID
- user_id: References auth.users(id)
- project_id: Foreign key to projects table  
- session_id: Session tracking identifier
- container_id: Fly.io Machine ID
- container_url: URL of the running container
- status: creating|active|ended|error
- error_message: Error details if applicable
- expires_at: For cleanup of orphaned containers
- created_at, ended_at, updated_at: Timestamps';

COMMIT;