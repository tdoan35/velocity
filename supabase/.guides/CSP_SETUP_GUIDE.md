# Content Security Policy (CSP) Setup Guide

## Overview

This guide provides comprehensive setup instructions for implementing Content Security Policy (CSP) headers in the Velocity platform for XSS protection and enhanced security.

## CSP Architecture

### Multi-Environment Configuration
The CSP system supports three distinct environments with tailored security policies:

1. **Production** - Strict security policies for live deployment
2. **Staging** - Balanced policies for testing with some flexibility
3. **Development** - Permissive policies to support local development

### CSP Components
- **Database Configuration** - Centralized CSP policy management
- **Edge Function Middleware** - Dynamic CSP header generation
- **Violation Reporting** - Comprehensive monitoring and analysis
- **Real-time Monitoring** - Security event detection and alerting

## Step 1: Apply Database Schema

### 1.1 Execute CSP Configuration SQL
1. Go to **Supabase Dashboard → SQL Editor**
2. Copy the entire contents of `content_security_policy.sql`
3. Execute the script to create tables, functions, and policies
4. Verify successful execution

### 1.2 Verify CSP Tables
Run this query to confirm tables were created:

```sql
SELECT table_name, table_type 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name LIKE 'csp_%'
ORDER BY table_name;
```

Expected tables:
- `csp_policies`
- `csp_violation_reports`

## Step 2: Deploy CSP Edge Function

### 2.1 Create Edge Function Directory
```bash
mkdir -p supabase/functions/csp-middleware
```

### 2.2 Deploy the Edge Function
```bash
# Copy the CSP middleware code
cp edge_functions/csp-middleware.ts supabase/functions/csp-middleware/index.ts

# Deploy to Supabase
supabase functions deploy csp-middleware
```

### 2.3 Configure Environment Variables
Set these in your Supabase project settings:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

## Step 3: Configure Environment-Specific CSP Policies

### 3.1 Production Environment
Strict security policies for live deployment:

```
default-src 'self';
script-src 'self' https://cdn.jsdelivr.net https://unpkg.com;
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: https: blob:;
connect-src 'self' https://*.supabase.co wss://*.supabase.co;
font-src 'self' https://fonts.gstatic.com;
object-src 'none';
frame-ancestors 'none';
upgrade-insecure-requests;
block-all-mixed-content;
```

### 3.2 Development Environment
More permissive policies for local development:

```
default-src 'self';
script-src 'self' 'unsafe-inline' 'unsafe-eval' localhost:*;
style-src 'self' 'unsafe-inline' localhost:*;
img-src 'self' data: https: http: blob:;
connect-src 'self' localhost:* ws://localhost:* wss://localhost:*;
```

### 3.3 Staging Environment
Balanced policies for testing:

```
default-src 'self';
script-src 'self' 'unsafe-inline' https://staging.velocity-app.dev;
style-src 'self' 'unsafe-inline' https://staging.velocity-app.dev;
img-src 'self' data: https: blob:;
connect-src 'self' https://staging.velocity-app.dev;
```

## Step 4: Frontend Integration

### 4.1 React/Next.js Integration

```javascript
// utils/csp.js
export class CSPManager {
  constructor(environment = 'production') {
    this.environment = environment;
    this.supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  }

  async getCSPHeader() {
    try {
      const response = await fetch(
        `${this.supabaseUrl}/functions/v1/csp-middleware?environment=${this.environment}`
      );
      const data = await response.json();
      return data.cspHeader;
    } catch (error) {
      console.error('Failed to fetch CSP header:', error);
      return this.getFallbackCSP();
    }
  }

  getFallbackCSP() {
    // Fallback CSP for when service is unavailable
    return "default-src 'self'; script-src 'self' 'unsafe-inline'";
  }

  applyCSPToDocument(cspHeader) {
    // Remove existing CSP meta tag
    const existingTag = document.querySelector(
      'meta[http-equiv="Content-Security-Policy"]'
    );
    if (existingTag) {
      existingTag.remove();
    }

    // Add new CSP meta tag
    const metaTag = document.createElement('meta');
    metaTag.setAttribute('http-equiv', 'Content-Security-Policy');
    metaTag.setAttribute('content', cspHeader);
    document.head.appendChild(metaTag);
  }

  async initializeCSP() {
    const cspHeader = await this.getCSPHeader();
    this.applyCSPToDocument(cspHeader);
  }
}

// Usage in React app
import { useEffect } from 'react';
import { CSPManager } from '../utils/csp';

export function App() {
  useEffect(() => {
    const cspManager = new CSPManager(
      process.env.NODE_ENV === 'development' ? 'development' : 'production'
    );
    cspManager.initializeCSP();
  }, []);

  return <div>Your App Content</div>;
}
```

### 4.2 Next.js Middleware Integration

```javascript
// middleware.js
import { NextResponse } from 'next/server';

export async function middleware(request) {
  const environment = process.env.NODE_ENV === 'development' ? 'development' : 'production';
  
  try {
    // Fetch CSP header from Edge Function
    const cspResponse = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/csp-middleware?environment=${environment}`
    );
    const { cspHeader } = await cspResponse.json();

    // Apply CSP header to response
    const response = NextResponse.next();
    response.headers.set('Content-Security-Policy', cspHeader);
    
    return response;
  } catch (error) {
    console.error('CSP middleware error:', error);
    
    // Fallback CSP
    const response = NextResponse.next();
    response.headers.set(
      'Content-Security-Policy', 
      "default-src 'self'; script-src 'self' 'unsafe-inline'"
    );
    
    return response;
  }
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
};
```

### 4.3 React Native Integration

```javascript
// utils/cspManager.js
import { supabase } from './supabase';

export class ReactNativeCSPManager {
  constructor() {
    this.environment = __DEV__ ? 'development' : 'production';
  }

  async getCSPHeader() {
    try {
      const { data, error } = await supabase.functions.invoke('csp-middleware', {
        body: {
          action: 'get-header',
          environment: this.environment
        }
      });

      if (error) throw error;
      return data.cspHeader;
    } catch (error) {
      console.error('Failed to fetch CSP header:', error);
      return null;
    }
  }

  async applyToWebView(webViewRef, url) {
    const cspHeader = await this.getCSPHeader();
    
    if (cspHeader && webViewRef.current) {
      // Inject CSP into WebView
      const injectedJS = `
        const metaTag = document.createElement('meta');
        metaTag.setAttribute('http-equiv', 'Content-Security-Policy');
        metaTag.setAttribute('content', '${cspHeader}');
        document.head.appendChild(metaTag);
        true;
      `;
      
      webViewRef.current.injectJavaScript(injectedJS);
    }
  }
}
```

## Step 5: CSP Violation Reporting

### 5.1 Enable Violation Reporting

Add CSP report-only mode for testing:

```html
<!-- Add to HTML head for testing -->
<meta http-equiv="Content-Security-Policy-Report-Only" 
      content="default-src 'self'; report-uri /functions/v1/csp-middleware">
```

### 5.2 Monitor Violations

Use the provided database views to monitor violations:

```sql
-- Recent violations
SELECT * FROM public.recent_csp_violations 
ORDER BY created_at DESC 
LIMIT 20;

-- Violation summary by directive
SELECT * FROM public.csp_violation_summary 
ORDER BY total_violations DESC;

-- Blocked URI analysis
SELECT * FROM public.csp_blocked_uri_analysis 
WHERE violation_count > 10;
```

### 5.3 Set Up Automated Alerts

```sql
-- Detect attack patterns
SELECT * FROM public.detect_csp_attack_patterns();

-- Get violation statistics
SELECT * FROM public.get_csp_violation_stats(7, 'production');
```

## Step 6: Testing and Validation

### 6.1 Test CSP Header Generation

```bash
# Test production CSP header
curl "https://your-project.supabase.co/functions/v1/csp-middleware?environment=production"

# Test development CSP header
curl "https://your-project.supabase.co/functions/v1/csp-middleware?environment=development"
```

### 6.2 Validate CSP Effectiveness

```javascript
// Test script to validate CSP
async function testCSP() {
  // This should be blocked by CSP
  try {
    eval('console.log("This should be blocked")');
    console.error('CSP FAILED: eval() was not blocked');
  } catch (error) {
    console.log('CSP SUCCESS: eval() was blocked');
  }

  // This should be blocked by CSP
  try {
    const script = document.createElement('script');
    script.innerHTML = 'console.log("Inline script")';
    document.head.appendChild(script);
    console.error('CSP FAILED: Inline script was not blocked');
  } catch (error) {
    console.log('CSP SUCCESS: Inline script was blocked');
  }
}

// Run tests
testCSP();
```

### 6.3 Browser Testing Checklist

✅ **Production Environment Tests:**
- [ ] CSP header correctly applied to all pages
- [ ] Inline scripts blocked (unless whitelisted)
- [ ] External scripts from untrusted domains blocked
- [ ] Mixed content blocked
- [ ] Frame embedding prevented
- [ ] Violation reports generated

✅ **Development Environment Tests:**
- [ ] Hot reloading works correctly
- [ ] Local development servers accessible
- [ ] Debugging tools functional
- [ ] WebSocket connections allowed

## Step 7: Performance Optimization

### 7.1 Cache CSP Headers

```javascript
// Client-side caching
class CSPCache {
  constructor(ttl = 3600000) { // 1 hour default
    this.cache = new Map();
    this.ttl = ttl;
  }

  get(environment) {
    const cached = this.cache.get(environment);
    if (cached && Date.now() - cached.timestamp < this.ttl) {
      return cached.cspHeader;
    }
    return null;
  }

  set(environment, cspHeader) {
    this.cache.set(environment, {
      cspHeader,
      timestamp: Date.now()
    });
  }
}

const cspCache = new CSPCache();
```

### 7.2 Minimize Violation Reports

Configure sampling for high-traffic applications:

```javascript
// Sample violation reports (report only 10%)
const shouldReportViolation = () => Math.random() < 0.1;

if (shouldReportViolation()) {
  // Report violation
  await reportCSPViolation(violationData);
}
```

## Step 8: Monitoring and Maintenance

### 8.1 Regular Monitoring Queries

```sql
-- Daily CSP health check
WITH violation_stats AS (
  SELECT 
    COUNT(*) as total_violations,
    COUNT(DISTINCT effective_directive) as unique_directives,
    COUNT(DISTINCT ip_address) as unique_ips
  FROM public.csp_violation_reports
  WHERE created_at > NOW() - INTERVAL '24 hours'
)
SELECT 
  total_violations,
  unique_directives,
  unique_ips,
  CASE 
    WHEN total_violations > 1000 THEN 'HIGH'
    WHEN total_violations > 100 THEN 'MEDIUM'
    ELSE 'LOW'
  END as alert_level
FROM violation_stats;
```

### 8.2 Automated Cleanup

Set up scheduled cleanup of old violation reports:

```sql
-- Run daily to clean up old reports
SELECT public.cleanup_csp_violation_reports(30); -- Keep 30 days
```

### 8.3 Performance Monitoring

```sql
-- Monitor CSP function performance
SELECT 
  COUNT(*) as csp_header_requests,
  AVG(EXTRACT(EPOCH FROM NOW() - created_at)) as avg_response_time
FROM pg_stat_statements 
WHERE query LIKE '%generate_csp_header%'
  AND calls > 0;
```

## Step 9: Security Best Practices

### 9.1 CSP Hardening Checklist

✅ **Security Measures:**
- [ ] `object-src 'none'` to block plugins
- [ ] `frame-ancestors 'none'` to prevent clickjacking
- [ ] `upgrade-insecure-requests` to enforce HTTPS
- [ ] `block-all-mixed-content` for mixed content protection
- [ ] No `unsafe-eval` in production
- [ ] Minimal use of `unsafe-inline`
- [ ] Whitelist only trusted domains
- [ ] Regular policy review and updates

### 9.2 Common CSP Mistakes to Avoid

❌ **Avoid These:**
- Using `'unsafe-eval'` in production
- Overly permissive `'unsafe-inline'` usage
- Including `data:` for scripts
- Using `*` wildcards for critical directives
- Not implementing violation reporting
- Ignoring violation reports
- Setting overly permissive development policies

## Step 10: Troubleshooting

### Common Issues and Solutions

**Issue**: CSP blocking legitimate resources
**Solution**: Review violation reports and whitelist necessary domains

**Issue**: Development tools not working
**Solution**: Ensure development environment has appropriate permissions

**Issue**: High volume of violation reports
**Solution**: Implement sampling and review policies for over-permissiveness

**Issue**: CSP header not applying
**Solution**: Check middleware deployment and environment configuration

**Issue**: Performance impact from CSP
**Solution**: Implement caching and optimize policy complexity

## Next Steps

After successful CSP implementation:

1. ✅ Database schema and functions deployed
2. ✅ Edge Function middleware deployed
3. ✅ Environment-specific policies configured
4. ✅ Frontend integration implemented
5. ✅ Violation reporting enabled
6. ✅ Monitoring and alerting set up
7. 🔒 Enterprise-grade XSS protection active

The Content Security Policy system provides comprehensive protection against XSS attacks, code injection, and other client-side security threats while maintaining the flexibility needed for modern web application development.