# Authentication Setup Guide

This guide explains how to set up authentication for the Velocity platform using Supabase.

## Overview

Velocity uses Supabase for authentication, supporting:
- Email/password authentication
- Google OAuth
- GitHub OAuth

## Setup Instructions

### 1. Configure Environment Variables

Copy `.env.example` to `.env` in the frontend directory and update:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 2. Configure OAuth Providers in Supabase

1. Go to your Supabase Dashboard
2. Navigate to Authentication > Providers
3. Enable and configure:

#### Google OAuth
- Enable Google provider
- Add redirect URL: `http://localhost:5173/auth/callback` (dev)
- Add redirect URL: `https://yourdomain.com/auth/callback` (production)
- Follow Google Cloud Console setup for OAuth credentials

#### GitHub OAuth
- Enable GitHub provider  
- Add redirect URL: `http://localhost:5173/auth/callback` (dev)
- Add redirect URL: `https://yourdomain.com/auth/callback` (production)
- Create OAuth app in GitHub settings

### 3. Database Setup

The authentication system expects a `user_profiles` table with specific columns. 

**Option 1: Run the migration file**
```bash
# This will apply all migrations including the user_profiles updates
supabase db push
```

**Option 2: Manual SQL (if migration fails)**

Run this SQL in your Supabase SQL Editor:

```sql
-- Add email and name columns to user_profiles table if they don't exist
ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS email text UNIQUE;

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS first_name text;

ALTER TABLE public.user_profiles 
ADD COLUMN IF NOT EXISTS last_name text;

-- Update existing rows to populate email from auth.users if needed
UPDATE public.user_profiles up
SET email = u.email
FROM auth.users u
WHERE up.id = u.id
AND up.email IS NULL;

-- Create an index on email for performance
CREATE INDEX IF NOT EXISTS idx_user_profiles_email ON public.user_profiles(email);
```

## Authentication Flow

### Sign Up
1. User fills out the signup form
2. Supabase creates auth user
3. User profile is created in `user_profiles` table
4. Email verification is sent (if enabled)

### Login
1. User enters credentials or uses OAuth
2. Supabase validates and returns session
3. Session is stored in localStorage
4. User is redirected to dashboard

### OAuth Flow
1. User clicks OAuth provider button
2. Redirected to provider authorization
3. Provider redirects back to `/auth/callback`
4. Session is established and user is redirected

## Code Structure

- `/src/services/auth.ts` - Authentication service methods
- `/src/stores/useAuthStore.ts` - Authentication state management
- `/src/components/ui/signup-form.tsx` - Signup/login form component
- `/src/components/auth/ProtectedRoute.tsx` - Route protection component
- `/src/pages/AuthCallback.tsx` - OAuth callback handler

## Security Considerations

- Never expose service role key in frontend
- Use Row Level Security (RLS) policies
- Validate user input on both frontend and backend
- Implement rate limiting for auth endpoints
- Use HTTPS in production

## Troubleshooting

### Common Issues

1. **"Could not find the 'email' column of 'user_profiles'" error**
   - Run the database migration to add missing columns
   - Use the SQL commands in the Database Setup section above
   - Make sure to run `supabase db push` or execute the SQL manually

2. **"Database error saving new user" error**
   - This is usually caused by conflicting triggers or missing functions
   - Run this SQL to fix the issue:
   ```sql
   -- Run the fix from migration 20250131000003_fix_user_creation_error.sql
   -- This creates a more robust trigger that handles various table schemas
   ```
   - Or run: `npx supabase db push` to apply all migrations

2. **OAuth redirect not working**
   - Check redirect URLs in Supabase match your app URL
   - Ensure OAuth app is properly configured

3. **Session not persisting**
   - Check localStorage is not blocked
   - Verify Supabase client configuration

4. **Email verification not sending**
   - Configure SMTP in Supabase settings
   - Check email templates

## Testing

To test authentication:

1. Create test accounts with different providers
2. Test signup flow with validation
3. Test login with correct/incorrect credentials
4. Test OAuth flows
5. Test session persistence
6. Test logout functionality