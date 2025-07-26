# API Rate Limiting Implementation Guide

## Overview

This guide provides comprehensive API rate limiting for the Velocity platform with DDoS protection, fair usage enforcement, and tiered access controls based on user subscription levels.

## Rate Limiting Architecture

### Multi-Tier Rate Limiting
- **Anonymous Users**: Very restrictive (5-10 requests/minute)
- **Authenticated Users**: Basic limits (10-30 requests/minute)
- **Free Tier**: Standard limits with AI restrictions
- **Pro Tier**: Higher limits for power users
- **Enterprise Tier**: Maximum limits for organizations
- **Service Role**: Unlimited for internal operations

### Time Windows
- **Minute Window**: Short-term burst protection
- **Hour Window**: Medium-term usage control
- **Day Window**: Long-term quota management

## Implementation Steps

### Step 1: Apply Database Schema

1. Go to **Supabase Dashboard → SQL Editor**
2. Copy and paste the entire contents of `rate_limiting_config.sql`
3. Execute the script to create all tables, functions, and policies
4. Verify successful execution

COMPLETED ✅ 

### Step 2: Deploy Edge Function

1. Create the Edge Function directory:
```bash
mkdir -p supabase/functions/rate-limit-middleware
```

2. Copy the Edge Function code:
```bash
cp edge_functions/rate-limit-middleware.ts supabase/functions/rate-limit-middleware/index.ts
```

3. Deploy the Edge Function:
```bash
supabase functions deploy rate-limit-middleware
```

### Step 3: Configure Environment Variables

Add these environment variables to your Supabase project:

```bash
# In Supabase Dashboard → Settings → Environment Variables
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Rate Limit Configuration

### Default Limits by User Tier

#### Anonymous Users
- Auth endpoints: 5/min, 20/hour, 100/day
- Public endpoints: 10/min, 100/hour, 500/day
- General API: 5/min, 50/hour, 200/day

#### Authenticated Users
- Projects: 30/min, 500/hour, 2000/day
- File operations: 50/min, 800/hour, 3000/day
- AI operations: 5/min, 30/hour, 100/day
- Builds: 2/min, 10/hour, 30/day

#### Free Tier
- AI operations: 10/min, 50/hour, 200/day
- Build operations: 3/min, 15/hour, 50/day
- Project creation: 10/min, 50/hour, 200/day

#### Pro Tier
- AI operations: 30/min, 200/hour, 1000/day
- Build operations: 10/min, 60/hour, 300/day
- File uploads: 50/min, 500/hour, 2000/day

#### Enterprise Tier
- AI operations: 100/min, 1000/hour, 5000/day
- Build operations: 30/min, 200/hour, 1000/day
- File uploads: 200/min, 2000/hour, 10000/day

### Customizing Rate Limits

Update rate limits through the database:

```sql
-- Update rate limit for specific endpoint
UPDATE public.rate_limit_config 
SET requests_per_minute = 50,
    requests_per_hour = 1000,
    requests_per_day = 5000
WHERE endpoint = '/api/projects/*' 
  AND method = 'GET' 
  AND user_role = 'pro';

-- Add new rate limit configuration
INSERT INTO public.rate_limit_config (
  endpoint, method, user_role, 
  requests_per_minute, requests_per_hour, requests_per_day, burst_limit
) VALUES (
  '/api/custom/*', 'POST', 'enterprise',
  200, 5000, 50000, 50
);
```

## Client Integration

### Frontend Implementation

```typescript
// Rate limiting client wrapper
class RateLimitedClient {
  private supabase: SupabaseClient;
  
  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }
  
  async makeRequest(endpoint: string, method: string, data?: any) {
    // Check rate limit first
    const rateLimitCheck = await this.checkRateLimit(endpoint, method);
    
    if (!rateLimitCheck.allowed) {
      throw new Error(`Rate limited: ${rateLimitCheck.reason}. Retry after ${rateLimitCheck.retry_after} seconds`);
    }
    
    // Make the actual API request
    return this.performRequest(endpoint, method, data);
  }
  
  private async checkRateLimit(endpoint: string, method: string) {
    const { data, error } = await this.supabase.functions.invoke('rate-limit-middleware', {
      body: {
        endpoint,
        method,
        userAgent: navigator.userAgent
      }
    });
    
    if (error) throw error;
    return data;
  }
  
  private async performRequest(endpoint: string, method: string, data?: any) {
    // Your actual API request logic here
    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${await this.supabase.auth.getSession().then(s => s.data.session?.access_token)}`
      },
      body: data ? JSON.stringify(data) : undefined
    });
    
    return response.json();
  }
}

// Usage
const client = new RateLimitedClient(supabase);

try {
  const result = await client.makeRequest('/api/projects', 'POST', {
    name: 'My Project',
    description: 'Test project'
  });
  console.log('Success:', result);
} catch (error) {
  console.error('Rate limited or other error:', error.message);
}
```

### React Hook for Rate Limiting

```typescript
import { useState, useCallback } from 'react';
import { useSupabaseClient } from '@supabase/auth-helpers-react';

interface RateLimitState {
  isLoading: boolean;
  error: string | null;
  rateLimitInfo: {
    remainingMinute?: number;
    remainingHour?: number;
    remainingDay?: number;
    resetTime?: string;
  };
}

export function useRateLimitedRequest() {
  const supabase = useSupabaseClient();
  const [state, setState] = useState<RateLimitState>({
    isLoading: false,
    error: null,
    rateLimitInfo: {}
  });
  
  const makeRequest = useCallback(async (endpoint: string, method: string, data?: any) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    
    try {
      // Check rate limit
      const { data: rateLimitResult } = await supabase.functions.invoke('rate-limit-middleware', {
        body: { endpoint, method, userAgent: navigator.userAgent }
      });
      
      if (!rateLimitResult.allowed) {
        throw new Error(`Rate limited: ${rateLimitResult.reason}`);
      }
      
      // Update rate limit info
      setState(prev => ({
        ...prev,
        rateLimitInfo: {
          remainingMinute: rateLimitResult.requests_remaining_minute,
          remainingHour: rateLimitResult.requests_remaining_hour,
          remainingDay: rateLimitResult.requests_remaining_day,
          resetTime: rateLimitResult.reset_time_minute
        }
      }));
      
      // Make actual request
      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        },
        body: data ? JSON.stringify(data) : undefined
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      setState(prev => ({ ...prev, isLoading: false }));
      return result;
      
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error instanceof Error ? error.message : 'Unknown error'
      }));
      throw error;
    }
  }, [supabase]);
  
  return { ...state, makeRequest };
}
```

## Monitoring and Analytics

### Rate Limit Dashboard Queries

```sql
-- Current rate limit usage by endpoint
SELECT 
  endpoint,
  method,
  user_role,
  total_requests,
  avg_requests_per_window
FROM public.rate_limit_stats
ORDER BY total_requests DESC
LIMIT 20;

-- Recent violations
SELECT 
  endpoint,
  violation_type,
  violation_count,
  unique_users,
  violation_hour
FROM public.rate_limit_violation_stats
WHERE violation_hour > NOW() - INTERVAL '24 hours'
ORDER BY violation_count DESC;

-- Active bans
SELECT 
  ban_type,
  reason,
  violation_count,
  minutes_remaining,
  created_at
FROM public.active_rate_limit_bans
ORDER BY created_at DESC;

-- Top violators
SELECT 
  user_id,
  ip_address,
  COUNT(*) as violation_count,
  array_agg(DISTINCT violation_type) as violation_types,
  array_agg(DISTINCT endpoint) as endpoints,
  MAX(created_at) as last_violation
FROM public.rate_limit_violations
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY user_id, ip_address
ORDER BY violation_count DESC
LIMIT 10;
```

### Setting Up Alerts

Create alerts for suspicious activity:

```sql
-- Function to detect unusual patterns
CREATE OR REPLACE FUNCTION public.detect_rate_limit_anomalies()
RETURNS TABLE (
  alert_type text,
  details jsonb,
  severity text
)
LANGUAGE plpgsql
AS $$
BEGIN
  -- High violation rate alert
  RETURN QUERY
  SELECT 
    'high_violation_rate'::text,
    jsonb_build_object(
      'endpoint', endpoint,
      'violations_per_hour', COUNT(*),
      'unique_users', COUNT(DISTINCT user_id)
    ),
    'high'::text
  FROM public.rate_limit_violations
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY endpoint
  HAVING COUNT(*) > 100;
  
  -- Distributed attack pattern
  RETURN QUERY
  SELECT 
    'distributed_attack'::text,
    jsonb_build_object(
      'endpoint', endpoint,
      'unique_ips', COUNT(DISTINCT ip_address),
      'total_violations', COUNT(*)
    ),
    'critical'::text
  FROM public.rate_limit_violations
  WHERE created_at > NOW() - INTERVAL '10 minutes'
  GROUP BY endpoint
  HAVING COUNT(DISTINCT ip_address) > 50 AND COUNT(*) > 200;
END;
$$;

-- Run anomaly detection
SELECT * FROM public.detect_rate_limit_anomalies();
```

## Maintenance and Operations

### Daily Maintenance

```sql
-- Clean up old data (run daily)
SELECT public.cleanup_rate_limit_data(7); -- Keep 7 days of data

-- Check system health
SELECT 
  'tracking_records' as metric,
  COUNT(*) as value
FROM public.rate_limit_tracking
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'violations_24h' as metric,
  COUNT(*) as value
FROM public.rate_limit_violations
WHERE created_at > NOW() - INTERVAL '24 hours'

UNION ALL

SELECT 
  'active_bans' as metric,
  COUNT(*) as value
FROM public.active_rate_limit_bans;
```

### Manual Ban Management

```sql
-- Apply manual ban
SELECT public.apply_rate_limit_ban(
  'user-uuid'::uuid,        -- user_id
  '192.168.1.100'::inet,    -- ip_address
  'Manual ban for abuse',   -- reason
  1440,                     -- duration in minutes (24 hours)
  auth.uid()                -- applied_by
);

-- Remove ban early
UPDATE public.rate_limit_bans 
SET banned_until = NOW() 
WHERE user_id = 'user-uuid' AND banned_until > NOW();

-- Permanent ban (be careful!)
UPDATE public.rate_limit_bans 
SET is_permanent = true 
WHERE user_id = 'malicious-user-uuid';
```

## Security Considerations

### Protection Against Evasion

1. **IP + User Tracking**: Track both IP and user ID
2. **Automatic Escalation**: Increase ban duration for repeat offenders
3. **Pattern Detection**: Identify distributed attacks
4. **Header Analysis**: Consider User-Agent and other headers

### Performance Optimization

1. **Database Indexes**: Ensure proper indexing on tracking tables
2. **Data Cleanup**: Regular cleanup of old tracking data
3. **Caching**: Consider Redis for high-traffic scenarios
4. **Batch Processing**: Batch database updates where possible

## Testing Rate Limits

### Manual Testing

```bash
# Test rate limiting with curl
for i in {1..35}; do
  curl -X POST "https://your-project.supabase.co/functions/v1/rate-limit-middleware" \
    -H "Authorization: Bearer $JWT_TOKEN" \
    -H "Content-Type: application/json" \
    -d '{"endpoint":"/api/projects","method":"POST"}' \
    -w "Request $i: Status %{http_code}\n"
  sleep 1
done
```

### Automated Testing

```typescript
// Jest test for rate limiting
describe('Rate Limiting', () => {
  test('should enforce minute rate limits', async () => {
    const requests = [];
    
    // Make requests up to the limit
    for (let i = 0; i < 35; i++) {
      requests.push(
        client.makeRequest('/api/projects', 'POST', { name: `Project ${i}` })
      );
    }
    
    // First 30 should succeed, rest should be rate limited
    const results = await Promise.allSettled(requests);
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const rateLimited = results.filter(r => r.status === 'rejected').length;
    
    expect(successful).toBe(30);
    expect(rateLimited).toBe(5);
  });
});
```

## Troubleshooting

### Common Issues

**Issue**: Rate limiting not working
**Solution**: Check if Edge Function is deployed and database functions exist

**Issue**: Users getting rate limited too quickly
**Solution**: Review rate limit configuration for their tier

**Issue**: High database load from rate limiting
**Solution**: Review indexes and consider cleanup frequency

**Issue**: False positives in violation detection
**Solution**: Adjust violation thresholds and ban triggers

### Debugging Queries

```sql
-- Check user's current rate limit status
SELECT 
  endpoint,
  method,
  window_type,
  request_count,
  window_start,
  window_end
FROM public.rate_limit_tracking
WHERE user_id = 'user-uuid'
  AND window_end > NOW()
ORDER BY window_start DESC;

-- Check why user was banned
SELECT 
  violation_type,
  limit_exceeded,
  actual_requests,
  time_window,
  created_at
FROM public.rate_limit_violations
WHERE user_id = 'user-uuid'
ORDER BY created_at DESC
LIMIT 10;
```

## Next Steps

After implementing rate limiting:

1. ✅ Database schema and functions deployed
2. ✅ Edge Function for middleware deployed  
3. ✅ Client integration implemented
4. ✅ Monitoring and alerts configured
5. 📊 Performance testing completed
6. 🚀 Ready for production traffic

The rate limiting system provides comprehensive protection against abuse while maintaining fair access for legitimate users across all subscription tiers.