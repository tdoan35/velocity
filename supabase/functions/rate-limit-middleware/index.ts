// Supabase Edge Function for Rate Limiting Middleware
// Deploy this to: supabase/functions/rate-limit-middleware/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RateLimitRequest {
  endpoint: string
  method: string
  userAgent?: string
}

interface RateLimitResponse {
  allowed: boolean
  reason?: string
  violation_type?: string
  limit?: number
  current_requests?: number
  retry_after?: number
  requests_remaining_minute?: number
  requests_remaining_hour?: number
  requests_remaining_day?: number
  reset_time_minute?: string
  reset_time_hour?: string
  reset_time_day?: string
}

serve(async (req: Request) => {
  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

    // Get request data
    const { endpoint, method, userAgent }: RateLimitRequest = await req.json()
    
    // Get user info from JWT
    const authHeader = req.headers.get('Authorization')
    let userId: string | null = null
    
    if (authHeader) {
      try {
        const { data: { user } } = await supabase.auth.getUser(
          authHeader.replace('Bearer ', '')
        )
        userId = user?.id || null
      } catch (error) {
        console.error('Error getting user from token:', error)
      }
    }

    // Get client IP (from various possible headers)
    const clientIP = 
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0] ||
      req.headers.get('x-real-ip') ||
      'unknown'

    // Call rate limiting function
    const { data: rateLimitResult, error } = await supabase.rpc(
      'check_rate_limit',
      {
        user_uuid: userId,
        client_ip: clientIP,
        endpoint_path: endpoint,
        http_method: method,
        user_agent_string: userAgent
      }
    )

    if (error) {
      console.error('Rate limit check error:', error)
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit check failed',
          details: error.message 
        }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const result: RateLimitResponse = rateLimitResult

    // Set appropriate HTTP status
    const status = result.allowed ? 200 : 429

    // Add rate limit headers
    const headers = {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-RateLimit-Limit': result.limit?.toString() || 'unknown',
      'X-RateLimit-Remaining': result.requests_remaining_minute?.toString() || '0',
      'X-RateLimit-Reset': result.reset_time_minute || '',
      ...(result.retry_after && { 'Retry-After': result.retry_after.toString() })
    }

    return new Response(
      JSON.stringify(result),
      { status, headers }
    )

  } catch (error) {
    console.error('Rate limiting error:', error)
    
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
Usage example:

POST /functions/v1/rate-limit-middleware
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "endpoint": "/api/projects",
  "method": "POST",
  "userAgent": "Mozilla/5.0..."
}

Response (200 OK):
{
  "allowed": true,
  "requests_remaining_minute": 25,
  "requests_remaining_hour": 475,
  "requests_remaining_day": 1975,
  "reset_time_minute": "2024-01-01T12:01:00Z",
  "reset_time_hour": "2024-01-01T13:00:00Z", 
  "reset_time_day": "2024-01-02T00:00:00Z"
}

Response (429 Too Many Requests):
{
  "allowed": false,
  "reason": "rate_limited",
  "violation_type": "minute_limit",
  "limit": 30,
  "current_requests": 30,
  "retry_after": 60
}
*/