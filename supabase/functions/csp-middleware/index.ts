// Supabase Edge Function for Content Security Policy Middleware
// Deploy this to: supabase/functions/csp-middleware/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface CSPViolationReport {
  'document-uri': string
  'referrer'?: string
  'blocked-uri': string
  'effective-directive': string
  'original-policy': string
  'disposition': string
  'status-code'?: number
  'script-sample'?: string
  'line-number'?: number
  'column-number'?: number
  'source-file'?: string
}

interface CSPRequest {
  environment?: string
  action: 'get-header' | 'report-violation'
  violationReport?: CSPViolationReport
}

serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  }

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Handle GET request for CSP header
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const environment = url.searchParams.get('environment') || 'production'
      
      // Get CSP header from database
      const { data: cspHeader, error } = await supabase.rpc(
        'generate_csp_header',
        { env_name: environment }
      )

      if (error) {
        console.error('Error generating CSP header:', error)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to generate CSP header',
            details: error.message 
          }),
          {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        )
      }

      return new Response(
        JSON.stringify({
          cspHeader,
          environment,
          timestamp: new Date().toISOString()
        }),
        {
          status: 200,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Content-Security-Policy': cspHeader
          }
        }
      )
    }

    // Handle POST request for violation reporting or header generation
    if (req.method === 'POST') {
      const contentType = req.headers.get('content-type') || ''
      
      // Handle CSP violation reports (content-type: application/csp-report)
      if (contentType.includes('application/csp-report')) {
        const violationData = await req.json()
        const clientIP = 
          req.headers.get('cf-connecting-ip') ||
          req.headers.get('x-forwarded-for')?.split(',')[0] ||
          req.headers.get('x-real-ip') ||
          'unknown'
        
        const userAgent = req.headers.get('user-agent') || 'unknown'

        // Log violation to database
        const { data: violationId, error } = await supabase.rpc(
          'log_csp_violation',
          {
            violation_report: violationData['csp-report'] || violationData,
            user_agent_string: userAgent,
            client_ip: clientIP
          }
        )

        if (error) {
          console.error('Error logging CSP violation:', error)
          return new Response(
            JSON.stringify({ 
              error: 'Failed to log violation',
              details: error.message 
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }

        // Return success response (CSP violation endpoint should return 204)
        return new Response(null, {
          status: 204,
          headers: corsHeaders
        })
      }

      // Handle JSON requests for CSP configuration
      const { environment, action }: CSPRequest = await req.json()
      
      if (action === 'get-header') {
        const env = environment || 'production'
        
        // Get CSP header from database
        const { data: cspHeader, error } = await supabase.rpc(
          'generate_csp_header',
          { env_name: env }
        )

        if (error) {
          console.error('Error generating CSP header:', error)
          return new Response(
            JSON.stringify({ 
              error: 'Failed to generate CSP header',
              details: error.message 
            }),
            {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            }
          )
        }

        return new Response(
          JSON.stringify({
            cspHeader,
            environment: env,
            timestamp: new Date().toISOString()
          }),
          {
            status: 200,
            headers: { 
              ...corsHeaders, 
              'Content-Type': 'application/json'
            }
          }
        )
      }

      return new Response(
        JSON.stringify({ error: 'Invalid action' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('CSP middleware error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})

/* 
Usage Examples:

1. Get CSP header for production:
GET /functions/v1/csp-middleware?environment=production

Response:
{
  "cspHeader": "default-src 'self'; script-src 'self' 'unsafe-inline'...",
  "environment": "production",
  "timestamp": "2024-01-01T12:00:00.000Z"
}

2. Get CSP header via POST:
POST /functions/v1/csp-middleware
Content-Type: application/json

{
  "action": "get-header",
  "environment": "development"
}

3. Report CSP violation:
POST /functions/v1/csp-middleware
Content-Type: application/csp-report

{
  "csp-report": {
    "document-uri": "https://velocity-app.dev/dashboard",
    "referrer": "https://velocity-app.dev/",
    "blocked-uri": "eval",
    "effective-directive": "script-src",
    "original-policy": "default-src 'self'; script-src 'self'",
    "disposition": "enforce"
  }
}

Response: 204 No Content

4. Environment-specific headers:
- production: Strict CSP with only trusted sources
- staging: Moderate CSP with staging domain allowed  
- development: Permissive CSP with localhost allowed

5. Integration with React/Next.js:
```javascript
// Fetch CSP header and apply to meta tag
const response = await fetch('/functions/v1/csp-middleware?environment=production');
const { cspHeader } = await response.json();

// Apply to meta tag
document.querySelector('meta[http-equiv="Content-Security-Policy"]')
  ?.setAttribute('content', cspHeader);
```

6. Violation reporting setup:
```html
<!-- Add to HTML head -->
<meta http-equiv="Content-Security-Policy-Report-Only" 
      content="default-src 'self'; report-uri /functions/v1/csp-middleware">
```
*/