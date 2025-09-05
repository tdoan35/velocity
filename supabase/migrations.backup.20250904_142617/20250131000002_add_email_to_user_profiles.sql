-- Add email and name columns to user_profiles table to match auth service expectations
-- Also update the table structure to align with the authentication flow

-- Add email column if it doesn't exist
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS email text UNIQUE;

-- Add first_name and last_name columns if they don't exist
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS first_name text;

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS last_name text;

-- Update existing rows to populate email from auth.users
UPDATE public.user_profiles up
SET email = u.email
FROM auth.users u
WHERE up.id = u.id
AND up.email IS NULL;

-- Make email NOT NULL after populating existing rows
ALTER TABLE public.user_profiles 
ALTER COLUMN email SET NOT NULL;

-- Create or replace the handle_new_user function to work with new schema
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  username_base text;
  final_username text;
  counter integer := 0;
BEGIN
  -- Extract username base from email
  username_base := split_part(NEW.email, '@', 1);
  final_username := username_base;
  
  -- Ensure username is unique
  WHILE EXISTS (SELECT 1 FROM public.user_profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := username_base || '-' || counter::text;
  END LOOP;
  
  -- Insert user profile with new schema
  INSERT INTO public.user_profiles (
    id,
    email,
    username,
    first_name,
    last_name,
    display_name,
    avatar_url
  ) VALUES (
    NEW.id,
    NEW.email,
    final_username,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name',
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '') || ' ' || COALESCE(NEW.raw_user_meta_data->>'last_name', ''))
    ),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  
  RETURN NEW;
EXCEPTION
  WHEN unique_violation THEN
    -- If there's a conflict (e.g., email already exists), just return NEW without creating a profile
    -- This handles cases where a user signs up with OAuth after already having an account
    RETURN NEW;
END;
$$;

-- Drop and recreate the trigger to ensure it uses the updated function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Create an index on email for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);

-- Add RLS policy for user_profiles if not exists
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_profiles' 
    AND policyname = 'Users can view their own profile'
  ) THEN
    CREATE POLICY "Users can view their own profile" 
      ON public.user_profiles 
      FOR SELECT 
      USING (auth.uid() = id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_profiles' 
    AND policyname = 'Users can update their own profile'
  ) THEN
    CREATE POLICY "Users can update their own profile" 
      ON public.user_profiles 
      FOR UPDATE 
      USING (auth.uid() = id);
  END IF;
END $$;