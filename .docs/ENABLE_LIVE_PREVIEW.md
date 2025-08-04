# How to Enable Live Preview

This guide walks you through setting up live mobile preview functionality using Appetize.io.

## Prerequisites

1. **Appetize.io Account**: Sign up at [appetize.io](https://appetize.io)
2. **Supabase Project**: For session management and analytics
3. **API Keys**: Both Appetize.io and Supabase credentials

## Step 1: Get Your API Keys

### Appetize.io
1. Log in to your [Appetize.io dashboard](https://appetize.io/dashboard)
2. Navigate to Account → API Keys
3. Copy your API Key and Public Key

### Supabase
1. Go to your [Supabase project](https://app.supabase.com)
2. Navigate to Settings → API
3. Copy the Project URL and anon/public key

## Step 2: Configure Environment Variables

1. Copy the example environment file:
   ```bash
   cp frontend/.env.example frontend/.env
   ```

2. Update the `.env` file with your credentials:
   ```env
   # Supabase Configuration
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key-here

   # Appetize.io Configuration
   VITE_APPETIZE_API_KEY=your-api-key-here
   VITE_APPETIZE_PUBLIC_KEY=your-public-key-here
   ```

## Step 3: Deploy Supabase Edge Functions

1. Install Supabase CLI:
   ```bash
   npm install -g supabase
   ```

2. Link your project:
   ```bash
   supabase link --project-ref your-project-ref
   ```

3. Deploy the edge functions:
   ```bash
   supabase functions deploy appetize-api
   supabase functions deploy preview-sessions
   ```

4. Set environment secrets:
   ```bash
   supabase secrets set APPETIZE_API_KEY=your-api-key-here
   ```

## Step 4: Run Database Migrations

Apply the preview sessions schema:

```bash
supabase db push
```

This creates the required tables:
- `preview_sessions`
- `preview_session_metrics`
- `preview_sharing`
- `preview_session_pool`

## Step 5: Update Frontend Configuration

1. Update the API endpoints in `useAppetizePreview.ts`:

```typescript
// Replace these URLs with your actual endpoints
const API_BASE_URL = import.meta.env.VITE_SUPABASE_URL;
const FUNCTIONS_URL = `${API_BASE_URL}/functions/v1`;
```

2. Restart the development server:
```bash
cd frontend
npm run dev
```

## Step 6: Test the Integration

1. Navigate to the Mobile Preview demo
2. Click "Start Preview"
3. Select a device from the dropdown
4. The preview should load with your app

## Troubleshooting

### "Missing authorization" error
- Ensure you're logged in to your Supabase auth
- Check that the anon key is correctly set in `.env`

### "Failed to start preview session"
- Verify your Appetize.io API key is valid
- Check the Supabase function logs: `supabase functions logs appetize-api`

### Preview not loading
- Ensure your app bundle is correctly formatted for Appetize.io
- Check browser console for WebSocket connection errors

## Advanced Configuration

### Session Pooling
To enable pre-warmed sessions for instant previews:

1. Set up a cron job to call the warming function:
   ```sql
   SELECT cron.schedule(
     'warm-preview-sessions',
     '*/5 * * * *', -- Every 5 minutes
     'SELECT warm_session_pool(''iphone15'', 3);'
   );
   ```

### Custom Devices
Add more devices in `appetize-api/index.ts`:

```typescript
const SUPPORTED_DEVICES: AppetizeDevice[] = [
  // Add your custom device configurations
  { id: 'custom-device', name: 'Custom Device', ... },
];
```

### WebSocket for Hot Reload
1. Deploy a WebSocket server (can use Supabase Realtime)
2. Update `VITE_WS_URL` in `.env`
3. The preview will automatically reload when code changes

## Security Considerations

1. **API Keys**: Never commit `.env` files with real keys
2. **CORS**: Configure allowed origins in Edge Functions
3. **Rate Limiting**: Implement quotas based on subscription tiers
4. **Session Expiry**: Sessions auto-expire after 1 hour

## Next Steps

- Set up preview sharing functionality
- Configure usage analytics dashboard
- Implement team collaboration features
- Add support for custom app builds

For more details, see the [technical documentation](../frontend/src/components/preview/README.md).