# Testing Edge Functions

## Issue: Authentication Required

The Edge Functions are configured to require authenticated users, but you're testing with the anonymous key. This is actually the correct behavior for production.

## Solutions:

### Option 1: Create a Test User (Recommended)

1. Go to your Supabase dashboard: https://supabase.com/dashboard/project/ozjipxxukgrvjxlefslq/auth/users
2. Create a test user with email/password
3. Use the Supabase client to sign in and get an access token:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://ozjipxxukgrvjxlefslq.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96amlweHh1a2dydmp4bGVmc2xxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyMjY0MjIsImV4cCI6MjA2ODgwMjQyMn0.yfkspUAJEVOCcFu9lV1oOQNt4RggfowTmJZ-zUPwWi0'
)

// Sign in
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'test@example.com',
  password: 'your-password'
})

// Use data.session.access_token for API calls
```

### Option 2: Test with Service Role Key (Development Only)

For development testing, you can use the service role key which bypasses RLS:

```bash
# Get your service role key from the dashboard
# https://supabase.com/dashboard/project/ozjipxxukgrvjxlefslq/settings/api

curl -i --location --request POST \
  'https://ozjipxxukgrvjxlefslq.supabase.co/functions/v1/generate-code' \
  --header 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"prompt":"Create a simple React Native button component"}'
```

### Option 3: Create a Test Endpoint (Development Only)

You could create a test version of the function that allows anonymous access for development:

```typescript
// test-generate-code/index.ts
// WARNING: This is for testing only, do not use in production!
```

## Next Steps

1. **Apply Database Migrations First**: The functions expect certain database tables to exist
2. **Create a Test User**: This is the most realistic way to test
3. **Update Frontend**: The frontend should handle user authentication before calling Edge Functions

## Database Migrations

You still need to apply the database migrations. You can do this through the Supabase dashboard:

1. Go to: https://supabase.com/dashboard/project/ozjipxxukgrvjxlefslq/sql
2. Click "New query"
3. Copy and paste the contents of:
   - `supabase/migrations/20240725000001_ai_integration_schema.sql`
   - `supabase/migrations/20240725000002_context_assembly_schema.sql`
4. Run each migration in order

Or if you have the database password:
```bash
npx supabase db push
```