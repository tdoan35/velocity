// Supabase Edge Function for Security Monitoring and Testing
// Deploy this to: supabase/functions/security-monitoring/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Security testing payload interfaces
interface SecurityTestRequest {
  test_type: 'sql_injection' | 'xss' | 'brute_force' | 'privilege_escalation' | 'comprehensive'
  test_input?: string
  test_context?: string
  target_user?: string
  requested_action?: string
  target_resource?: string
}

interface SecurityReportRequest {
  action: 'generate_report' | 'get_dashboard' | 'detect_anomalies' | 'auto_response'
  days_back?: number
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

    // Get client information
    const clientIP = 
      req.headers.get('cf-connecting-ip') ||
      req.headers.get('x-forwarded-for')?.split(',')[0] ||
      req.headers.get('x-real-ip') ||
      'unknown'
    
    const userAgent = req.headers.get('user-agent') || 'unknown'

    // Handle GET requests for security reports
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const action = url.searchParams.get('action') || 'get_dashboard'
      const daysBack = parseInt(url.searchParams.get('days_back') || '7')

      switch (action) {
        case 'generate_report':
          const { data: report, error: reportError } = await supabase.rpc(
            'generate_security_report',
            { days_back: daysBack }
          )

          if (reportError) throw reportError

          return new Response(JSON.stringify({
            success: true,
            report,
            generated_at: new Date().toISOString()
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })

        case 'get_dashboard':
          const { data: dashboard, error: dashboardError } = await supabase
            .from('security_dashboard')
            .select('*')

          if (dashboardError) throw dashboardError

          // Convert to key-value object
          const dashboardData = dashboard.reduce((acc: any, item: any) => {
            acc[item.metric] = item.value
            return acc
          }, {})

          return new Response(JSON.stringify({
            success: true,
            dashboard: dashboardData,
            timestamp: new Date().toISOString()
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })

        case 'detect_anomalies':
          const { data: anomalies, error: anomaliesError } = await supabase.rpc(
            'detect_security_anomalies'
          )

          if (anomaliesError) throw anomaliesError

          return new Response(JSON.stringify({
            success: true,
            anomalies: anomalies || [],
            detected_at: new Date().toISOString()
          }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })

        default:
          return new Response(JSON.stringify({
            error: 'Invalid action parameter'
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          })
      }
    }

    // Handle POST requests for security testing and actions
    if (req.method === 'POST') {
      const requestData = await req.json()

      // Handle security testing requests
      if ('test_type' in requestData) {
        const testRequest: SecurityTestRequest = requestData

        switch (testRequest.test_type) {
          case 'sql_injection':
            if (!testRequest.test_input) {
              throw new Error('test_input required for SQL injection testing')
            }

            const { data: sqlTest, error: sqlError } = await supabase.rpc(
              'test_sql_injection_protection',
              {
                test_input: testRequest.test_input,
                test_context: testRequest.test_context || 'edge_function'
              }
            )

            if (sqlError) throw sqlError

            return new Response(JSON.stringify({
              success: true,
              test_type: 'sql_injection',
              result: sqlTest
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })

          case 'xss':
            if (!testRequest.test_input) {
              throw new Error('test_input required for XSS testing')
            }

            const { data: xssTest, error: xssError } = await supabase.rpc(
              'test_xss_protection',
              {
                test_input: testRequest.test_input,
                test_context: testRequest.test_context || 'edge_function'
              }
            )

            if (xssError) throw xssError

            return new Response(JSON.stringify({
              success: true,
              test_type: 'xss',
              result: xssTest
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })

          case 'brute_force':
            const { data: bruteTest, error: bruteError } = await supabase.rpc(
              'check_brute_force_protection',
              {
                client_ip: clientIP,
                email_param: testRequest.test_input,
                attempt_type_param: testRequest.test_context || 'login'
              }
            )

            if (bruteError) throw bruteError

            return new Response(JSON.stringify({
              success: true,
              test_type: 'brute_force',
              result: bruteTest
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })

          case 'privilege_escalation':
            if (!testRequest.target_user || !testRequest.requested_action) {
              throw new Error('target_user and requested_action required for privilege escalation testing')
            }

            const { data: privTest, error: privError } = await supabase.rpc(
              'test_privilege_escalation',
              {
                user_uuid: testRequest.target_user,
                requested_action: testRequest.requested_action,
                target_resource: testRequest.target_resource || 'unknown'
              }
            )

            if (privError) throw privError

            return new Response(JSON.stringify({
              success: true,
              test_type: 'privilege_escalation',
              result: privTest
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })

          case 'comprehensive':
            // Run all security tests
            const comprehensiveResults = await runComprehensiveSecurityTests(supabase, {
              testInput: testRequest.test_input || '<script>alert("test")</script>',
              clientIP: clientIP,
              userAgent: userAgent
            })

            return new Response(JSON.stringify({
              success: true,
              test_type: 'comprehensive',
              results: comprehensiveResults,
              timestamp: new Date().toISOString()
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })

          default:
            throw new Error(`Unknown test type: ${testRequest.test_type}`)
        }
      }

      // Handle security report requests
      if ('action' in requestData) {
        const reportRequest: SecurityReportRequest = requestData

        switch (reportRequest.action) {
          case 'auto_response':
            const { data: responseData, error: responseError } = await supabase.rpc(
              'auto_security_response'
            )

            if (responseError) throw responseError

            return new Response(JSON.stringify({
              success: true,
              action: 'auto_response',
              result: responseData
            }), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })

          default:
            throw new Error(`Unknown action: ${reportRequest.action}`)
        }
      }

      throw new Error('Invalid request format')
    }

    return new Response(JSON.stringify({
      error: 'Method not allowed'
    }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Security monitoring error:', error)
    
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

// Comprehensive security testing function
async function runComprehensiveSecurityTests(supabase: any, params: {
  testInput: string
  clientIP: string
  userAgent: string
}) {
  const results: any = {}

  try {
    // Test SQL injection
    const { data: sqlResult } = await supabase.rpc('test_sql_injection_protection', {
      test_input: params.testInput,
      test_context: 'comprehensive_test'
    })
    results.sql_injection = sqlResult

    // Test XSS
    const { data: xssResult } = await supabase.rpc('test_xss_protection', {
      test_input: params.testInput,
      test_context: 'comprehensive_test'
    })
    results.xss = xssResult

    // Test brute force protection
    const { data: bruteResult } = await supabase.rpc('check_brute_force_protection', {
      client_ip: params.clientIP,
      attempt_type_param: 'login'
    })
    results.brute_force = bruteResult

    // Generate security report
    const { data: securityReport } = await supabase.rpc('generate_security_report', {
      days_back: 1
    })
    results.security_report = securityReport

    // Check for anomalies
    const { data: anomalies } = await supabase.rpc('detect_security_anomalies')
    results.anomalies = anomalies || []

    return results
  } catch (error) {
    console.error('Comprehensive test error:', error)
    return { error: error.message }
  }
}

/* 
Usage Examples:

1. Get Security Dashboard:
GET /functions/v1/security-monitoring?action=get_dashboard

Response:
{
  "success": true,
  "dashboard": {
    "incidents_24h": "5",
    "critical_incidents_24h": "1",
    "blocked_ips": "3",
    "active_lockouts": "0",
    "security_score": "85"
  }
}

2. Generate Security Report:
GET /functions/v1/security-monitoring?action=generate_report&days_back=7

Response:
{
  "success": true,
  "report": {
    "report_period_days": 7,
    "incident_statistics": {...},
    "brute_force_statistics": {...},
    "security_score": 85
  }
}

3. Test SQL Injection:
POST /functions/v1/security-monitoring
{
  "test_type": "sql_injection",
  "test_input": "'; DROP TABLE users; --",
  "test_context": "user_input"
}

Response:
{
  "success": true,
  "test_type": "sql_injection",
  "result": {
    "is_vulnerable": true,
    "detected_patterns": ["DROP TABLE"],
    "test_input": "'; DROP TABLE users; --"
  }
}

4. Test XSS Protection:
POST /functions/v1/security-monitoring
{
  "test_type": "xss",
  "test_input": "<script>alert('xss')</script>",
  "test_context": "comment_field"
}

5. Comprehensive Security Test:
POST /functions/v1/security-monitoring
{
  "test_type": "comprehensive",
  "test_input": "<script>alert('test')</script>"
}

6. Trigger Auto Security Response:
POST /functions/v1/security-monitoring
{
  "action": "auto_response"
}

7. Frontend Integration:
```javascript
// Security monitoring client
class SecurityMonitor {
  constructor(supabaseUrl) {
    this.baseUrl = `${supabaseUrl}/functions/v1/security-monitoring`;
  }

  async getDashboard() {
    const response = await fetch(`${this.baseUrl}?action=get_dashboard`);
    return await response.json();
  }

  async testSQLInjection(input, context = 'user_input') {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test_type: 'sql_injection',
        test_input: input,
        test_context: context
      })
    });
    return await response.json();
  }

  async runComprehensiveTest() {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test_type: 'comprehensive'
      })
    });
    return await response.json();
  }
}

// Usage
const monitor = new SecurityMonitor('https://your-project.supabase.co');
const dashboard = await monitor.getDashboard();
console.log('Security Score:', dashboard.dashboard.security_score);
```
*/