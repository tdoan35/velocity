# Container Preview IFRAME CORS Issue Analysis

**Date**: 2025-09-05  
**Environment**: Development (localhost:5173)  
**Browser**: Chromium (Playwright)  
**Session ID**: 5e618f2d-0797-426a-b6a2-63b6e4fac359  

## Issue Summary

The container preview system successfully creates and starts containers, but the iframe fails to load the container content due to Content Security Policy (CSP) violations.

## Error Details

### Primary Error
```
Refused to frame 'https://5e618f2d-0797-426a-b6a2-63b6e4fac359.preview.velocity-dev.com/' 
because it violates the following Content Security Policy directive: 
"frame-src 'self' https://snack.expo.dev https://*.expo.dev https://snack-web-player.s3.us-west-1.amazonaws.com https://*.fly.dev".
```

### Container URL Pattern
- **URL Format**: `https://{session-id}.preview.velocity-dev.com`
- **Example**: `https://5e618f2d-0797-426a-b6a2-63b6e4fac359.preview.velocity-dev.com`

## Root Cause Analysis

The CSP directive currently allows:
1. `'self'` (same origin)
2. `https://snack.expo.dev`
3. `https://*.expo.dev`
4. `https://snack-web-player.s3.us-west-1.amazonaws.com`
5. `https://*.fly.dev`

However, the container URLs use the domain pattern `*.preview.velocity-dev.com`, which is **not included** in the allowed frame sources.

## Technical Context

### Container Session Flow
1. **Authentication**: Successfully authenticated as `tdoan351@gmail.com`
2. **Session Start**: POST to `https://velocity-orchestrator.fly.dev/api/sessions/start` returns 200
3. **Container Creation**: Container successfully created with session ID
4. **Status**: Container transitions from `starting` → `running` successfully
5. **URL Assignment**: Container URL assigned as subdomain of `preview.velocity-dev.com`
6. **Iframe Load**: **FAILS** due to CSP violation

### Request Details
```javascript
Request: {
  url: "https://velocity-orchestrator.fly.dev/api/sessions/start",
  method: "POST",
  body: {
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "tier": "free",
    "deviceType": "mobile",
    "options": {}
  }
}

Response: {
  status: 200,
  data: {
    "sessionId": "5e618f2d-0797-426a-b6a2-63b6e4fac359",
    "containerUrl": "https://5e618f2d-0797-426a-b6a2-63b6e4fac359.preview.velocity-dev.com",
    "status": "active"
  }
}
```

## Impact

- **User Experience**: Users see "This content is blocked" message in the iframe
- **Functionality**: Preview feature is completely broken despite successful container creation
- **Development**: Cannot test or develop preview-related features

## Proposed Solutions

### Solution 1: Update CSP Headers (Recommended)
Add the velocity-dev.com domain to the CSP frame-src directive:

```javascript
// In Vite config or server headers
"frame-src 'self' https://snack.expo.dev https://*.expo.dev https://snack-web-player.s3.us-west-1.amazonaws.com https://*.fly.dev https://*.preview.velocity-dev.com https://*.velocity-dev.com"
```

### Solution 2: Use Fly.dev Subdomains
Since `*.fly.dev` is already allowed, consider using Fly.dev subdomains directly:
- Change from: `{session-id}.preview.velocity-dev.com`
- Change to: `{session-id}.preview.fly.dev`

### Solution 3: Dynamic CSP Headers
Implement dynamic CSP headers that are generated based on active sessions:

```javascript
function generateCSP(sessionId) {
  const baseCSP = "frame-src 'self' https://snack.expo.dev https://*.expo.dev";
  if (sessionId) {
    return `${baseCSP} https://${sessionId}.preview.velocity-dev.com`;
  }
  return baseCSP;
}
```

## Implementation Location

The CSP headers need to be updated in one of these locations:

1. **Vite Configuration** (`vite.config.ts`):
```javascript
export default defineConfig({
  server: {
    headers: {
      'Content-Security-Policy': "frame-src 'self' https://*.preview.velocity-dev.com ..."
    }
  }
})
```

2. **Index.html Meta Tag**:
```html
<meta http-equiv="Content-Security-Policy" 
      content="frame-src 'self' https://*.preview.velocity-dev.com ...">
```

3. **Server Middleware** (if using Express/Node backend)

## Related Files

- `/src/components/preview/ContainerPreviewPanel.tsx` - Main preview component
- `/src/hooks/usePreviewSession.ts` - Session management hook
- `/vite.config.ts` - Vite configuration (needs CSP update)
- `/index.html` - HTML entry point (potential CSP location)

## Screenshots

- Initial load: `.playwright-mcp/container-preview-initial-load.png`
- CORS error state: `.playwright-mcp/container-preview-cors-error.png`

## Additional Observations

1. **Service Worker Issue**: There's also a service worker registration failure with unsupported MIME type, but this appears unrelated to the iframe CORS issue.

2. **Authentication Working**: The authentication flow with Supabase is working correctly.

3. **Orchestrator Working**: The orchestrator service successfully creates and manages containers.

4. **Subdomain Routing**: The subdomain routing pattern suggests a multi-tenant architecture where each session gets its own subdomain.

## Next Steps

1. **Immediate Fix**: Update CSP headers to include `*.preview.velocity-dev.com`
2. **Test**: Verify iframe loads correctly after CSP update
3. **Security Review**: Ensure the CSP changes don't introduce security vulnerabilities
4. **Documentation**: Update deployment documentation with CSP requirements

## Testing Checklist

After implementing the fix:

- [ ] Iframe loads without CORS errors
- [ ] Container preview displays correctly
- [ ] No console errors related to CSP
- [ ] Device switching works (mobile/tablet/desktop)
- [ ] Refresh and external link buttons function
- [ ] Session cleanup on unmount works
- [ ] Security headers remain appropriately restrictive

## References

- [MDN: Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- [MDN: frame-src Directive](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Content-Security-Policy/frame-src)