# Deploy Edge Functions to Supabase

## Prerequisites

1. You need a Supabase cloud project. If you don't have one, create it at https://supabase.com
2. Get your project URL and anon key from the Supabase dashboard
3. Set up environment variables for your Edge Functions

## Step 1: Link Your Project

First, link your local project to your Supabase cloud instance:

```bash
npx supabase link --project-ref your-project-ref
```

You can find your project reference in your Supabase dashboard URL: `https://supabase.com/dashboard/project/[your-project-ref]`

## Step 2: Set Environment Variables

Edit the `.env` file in `supabase/functions/.env` with your actual API keys:

```env
ANTHROPIC_API_KEY=your_actual_anthropic_api_key
OPENAI_API_KEY=your_actual_openai_api_key
```

## Step 3: Set Secrets in Supabase

Set the environment variables as secrets in your Supabase project:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=your_actual_anthropic_api_key
npx supabase secrets set OPENAI_API_KEY=your_actual_openai_api_key
```

## Step 4: Deploy Edge Functions

Deploy all Edge Functions:

```bash
# Deploy generate-code function
npx supabase functions deploy generate-code

# Deploy optimize-prompt function
npx supabase functions deploy optimize-prompt

# Deploy conversation function
npx supabase functions deploy conversation

# Deploy context-analyzer function
npx supabase functions deploy context-analyzer
```

Or deploy all at once:

```bash
npx supabase functions deploy
```

## Step 5: Apply Database Migrations

Apply the database schemas we created:

```bash
# Apply AI integration schema
npx supabase db push --include-all

# Or apply specific migration files
npx supabase migration up
```

## Step 6: Verify Deployment

Test your deployed functions:

```bash
# List deployed functions
npx supabase functions list

# Check function logs
npx supabase functions logs generate-code
```

## Testing the Endpoints

Once deployed, your Edge Functions will be available at:

- `https://[your-project-ref].supabase.co/functions/v1/generate-code`
- `https://[your-project-ref].supabase.co/functions/v1/optimize-prompt`
- `https://[your-project-ref].supabase.co/functions/v1/conversation`
- `https://[your-project-ref].supabase.co/functions/v1/context-analyzer`

### Example Test Request

```bash
curl -i --location --request POST \
  'https://[your-project-ref].supabase.co/functions/v1/generate-code' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"prompt":"Create a simple React Native button component"}'
```

## Troubleshooting

1. If you get authentication errors, make sure you've set the secrets correctly
2. Check function logs: `npx supabase functions logs [function-name]`
3. Ensure your database has the required tables by checking the Supabase dashboard
4. Make sure pgvector extension is enabled in your Supabase project

## Next Steps

1. Update your frontend code to use the deployed function URLs
2. Set up monitoring and alerts in the Supabase dashboard
3. Configure rate limiting and usage quotas as needed