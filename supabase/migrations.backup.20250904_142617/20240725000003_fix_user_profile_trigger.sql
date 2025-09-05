-- Fix user profile trigger function
-- Updates the handle_new_user function to match the actual user_profiles table schema

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  full_name_value text;
  username_base text;
  final_username text;
  counter integer := 0;
BEGIN
  -- Extract full name from metadata or use email
  full_name_value := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'name',
    split_part(NEW.email, '@', 1)
  );
  
  -- Generate username base
  username_base := public.generate_slug(full_name_value);
  final_username := username_base;
  
  -- Ensure username is unique
  WHILE EXISTS (SELECT 1 FROM public.user_profiles WHERE username = final_username) LOOP
    counter := counter + 1;
    final_username := username_base || '-' || counter::text;
  END LOOP;
  
  -- Insert user profile (without email column, using correct column names)
  INSERT INTO public.user_profiles (
    id,
    username,
    full_name,
    avatar_url,
    metadata
  ) VALUES (
    NEW.id,
    final_username,
    full_name_value,
    NEW.raw_user_meta_data->>'avatar_url',
    jsonb_build_object(
      'provider', NEW.raw_app_meta_data->>'provider',
      'providers', NEW.raw_app_meta_data->'providers',
      'email_verified', NEW.email_confirmed_at IS NOT NULL,
      'created_via', 'auto_signup',
      'email', NEW.email  -- Store email in metadata instead
    )
  );
  
  RETURN NEW;
END;
$$;