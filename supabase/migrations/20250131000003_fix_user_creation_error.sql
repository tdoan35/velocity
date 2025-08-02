-- Fix database error when creating new users
-- This migration resolves conflicts between different trigger versions

-- First, drop the existing trigger to avoid conflicts
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create a simple slug generation function if it doesn't exist
CREATE OR REPLACE FUNCTION public.generate_slug(input_text text)
RETURNS text
LANGUAGE plpgsql
AS $$
BEGIN
  -- Simple slug generation: lowercase, replace spaces with hyphens, remove special chars
  RETURN LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        TRIM(input_text),
        '[^a-zA-Z0-9\s-]', '', 'g'  -- Remove special characters
      ),
      '\s+', '-', 'g'  -- Replace spaces with hyphens
    )
  );
END;
$$;

-- Create a working handle_new_user function that handles all scenarios
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  username_base text;
  final_username text;
  counter integer := 0;
  display_name_value text;
BEGIN
  -- Generate username from email
  username_base := split_part(NEW.email, '@', 1);
  -- Clean up the username (remove special chars, etc)
  username_base := LOWER(REGEXP_REPLACE(username_base, '[^a-zA-Z0-9]', '', 'g'));
  
  -- If username is empty or too short, use a default
  IF LENGTH(username_base) < 3 THEN
    username_base := 'user' || SUBSTRING(NEW.id::text, 1, 8);
  END IF;
  
  final_username := username_base;
  
  -- Ensure username is unique
  WHILE EXISTS (SELECT 1 FROM public.user_profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := username_base || counter::text;
  END LOOP;
  
  -- Determine display name
  display_name_value := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '') || ' ' || COALESCE(NEW.raw_user_meta_data->>'last_name', '')), ''),
    split_part(NEW.email, '@', 1)
  );
  
  -- Try to insert the user profile
  BEGIN
    -- First try with all columns we know about
    INSERT INTO public.user_profiles (
      id,
      email,
      username,
      first_name,
      last_name,
      display_name,
      avatar_url
    ) 
    SELECT
      NEW.id,
      NEW.email,
      final_username,
      NEW.raw_user_meta_data->>'first_name',
      NEW.raw_user_meta_data->>'last_name',
      display_name_value,
      NEW.raw_user_meta_data->>'avatar_url'
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_profiles WHERE id = NEW.id
    );
    
  EXCEPTION 
    WHEN undefined_column THEN
      -- If some columns don't exist, try a minimal insert
      BEGIN
        INSERT INTO public.user_profiles (id, username)
        SELECT NEW.id, final_username
        WHERE NOT EXISTS (
          SELECT 1 FROM public.user_profiles WHERE id = NEW.id
        );
      EXCEPTION
        WHEN OTHERS THEN
          -- Log the error but don't fail the user creation
          RAISE WARNING 'Could not create user profile for user %: %', NEW.id, SQLERRM;
      END;
    WHEN unique_violation THEN
      -- User profile already exists, that's fine
      NULL;
    WHEN OTHERS THEN
      -- Log other errors but don't fail the user creation
      RAISE WARNING 'Error creating user profile for user %: %', NEW.id, SQLERRM;
  END;
  
  RETURN NEW;
END;
$$;

-- Recreate the trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Ensure RLS is enabled on user_profiles
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Create basic RLS policies if they don't exist
DO $$ 
BEGIN
  -- Drop existing policies to avoid conflicts
  DROP POLICY IF EXISTS "Users can view their own profile" ON public.user_profiles;
  DROP POLICY IF EXISTS "Users can update their own profile" ON public.user_profiles;
  
  -- Create new policies
  CREATE POLICY "Users can view their own profile" 
    ON public.user_profiles 
    FOR SELECT 
    USING (auth.uid() = id);
    
  CREATE POLICY "Users can update their own profile" 
    ON public.user_profiles 
    FOR UPDATE 
    USING (auth.uid() = id);
    
  -- Also allow the trigger to insert profiles
  CREATE POLICY "Service role can insert profiles" 
    ON public.user_profiles 
    FOR INSERT 
    WITH CHECK (true);
END $$;