-- Add user_id column as an alias for owner_id in projects table
-- This maintains backward compatibility with migrations that expect user_id
ALTER TABLE projects ADD COLUMN IF NOT EXISTS user_id UUID;

-- Copy existing owner_id values to user_id
UPDATE projects SET user_id = owner_id WHERE user_id IS NULL;

-- Add foreign key constraint
ALTER TABLE projects 
  DROP CONSTRAINT IF EXISTS projects_user_id_fkey,
  ADD CONSTRAINT projects_user_id_fkey 
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Create index on user_id
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);

-- Create trigger to keep user_id and owner_id in sync
CREATE OR REPLACE FUNCTION sync_projects_user_id()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- If owner_id is set but user_id is not, copy owner_id to user_id
    IF NEW.owner_id IS NOT NULL AND NEW.user_id IS NULL THEN
      NEW.user_id := NEW.owner_id;
    -- If user_id is set but owner_id is not, copy user_id to owner_id
    ELSIF NEW.user_id IS NOT NULL AND NEW.owner_id IS NULL THEN
      NEW.owner_id := NEW.user_id;
    -- If both are set but different, prioritize owner_id
    ELSIF NEW.owner_id IS NOT NULL AND NEW.user_id IS NOT NULL AND NEW.owner_id != NEW.user_id THEN
      NEW.user_id := NEW.owner_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS sync_projects_user_id_trigger ON projects;
CREATE TRIGGER sync_projects_user_id_trigger
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION sync_projects_user_id();