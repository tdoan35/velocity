# Preview System Error Reference

This comprehensive guide lists all error codes you may encounter while using the Velocity Preview System, along with their meanings, causes, and solutions.

## Error Code Format

All preview system errors follow the format: `PREV_XXXX` where:
- `PREV` indicates a preview system error
- `XXXX` is a 4-digit code where the first digit indicates the category

## Error Categories

- **1xxx**: Session-related errors
- **2xxx**: Build and bundling errors
- **3xxx**: Device-related errors
- **4xxx**: Network and connectivity errors
- **5xxx**: Resource and quota errors
- **6xxx**: Integration errors
- **9xxx**: Unknown/uncategorized errors

## Session Errors (1xxx)

### PREV_1001: Session Creation Failed
**Severity**: High  
**Message**: "Unable to create preview session"

**Causes**:
- Appetize.io API is unavailable
- Invalid project configuration
- Authentication issues

**Solutions**:
1. Check your internet connection
2. Try refreshing the page
3. Verify your project settings
4. Contact support if the issue persists

**Recovery**: Automatic retry with exponential backoff

---

### PREV_1002: Session Not Found
**Severity**: High  
**Message**: "Preview session no longer exists"

**Causes**:
- Session expired due to inactivity
- Session was terminated
- Server restart or maintenance

**Solutions**:
1. Click "Start Preview" to create a new session
2. Check if you're still logged in
3. Refresh the entire page

**Recovery**: Automatic session recreation

---

### PREV_1003: Session Timeout
**Severity**: Low  
**Message**: "Preview session timed out due to inactivity"

**Causes**:
- No interaction for extended period (30 minutes)
- Browser tab was inactive
- Network disconnection

**Solutions**:
1. Click "Start Preview" to create a new session
2. Enable "Keep Alive" in settings to prevent timeouts

**Recovery**: New session creation required

---

### PREV_1004: Session Allocation Failed
**Severity**: High  
**Message**: "Could not allocate preview resources"

**Causes**:
- Specific device type unavailable
- Resource constraints
- Invalid device configuration

**Solutions**:
1. Try a different device type
2. Wait a few moments and retry
3. Check device compatibility

**Recovery**: Fallback to alternative device

---

### PREV_1005: Session Pool Exhausted
**Severity**: Medium  
**Message**: "Preview sessions are currently at capacity"

**Causes**:
- All available sessions in use
- High platform usage
- Quota limitations

**Solutions**:
1. Wait a few moments and try again
2. Close any unused preview sessions
3. Consider upgrading your plan for more concurrent sessions

**Recovery**: Automatic retry with queue system

---

### PREV_1006: Session Warmup Failed
**Severity**: Medium  
**Message**: "Could not pre-warm preview session"

**Causes**:
- Background optimization failed
- Resource constraints
- Network issues

**Solutions**:
1. Preview will still work but may be slower to start
2. Try manual preview start
3. Report if consistently occurring

**Recovery**: Falls back to cold start

## Build Errors (2xxx)

### PREV_2001: Build Failed
**Severity**: High  
**Message**: "Failed to build your application"

**Causes**:
- Syntax errors in code
- Missing dependencies
- Invalid React Native configuration
- Import/export errors

**Solutions**:
1. Check for syntax errors in your code
2. Ensure all dependencies are properly installed
3. Review the build logs for specific errors
4. Verify React Native version compatibility

**Recovery**: Fix code and retry build

---

### PREV_2002: Build Timeout
**Severity**: Medium  
**Message**: "Build process took too long to complete"

**Causes**:
- Very large application
- Too many dependencies
- Circular dependencies
- Build system overload

**Solutions**:
1. Try simplifying your application
2. Remove large assets or unnecessary dependencies
3. Split code into smaller modules
4. Contact support for build optimization tips

**Recovery**: Automatic retry with extended timeout

---

### PREV_2003: Bundle Creation Failed
**Severity**: High  
**Message**: "Could not create application bundle"

**Causes**:
- Metro bundler error
- Asset processing failure
- Memory constraints

**Solutions**:
1. Check Metro bundler configuration
2. Verify all assets are valid
3. Reduce bundle size
4. Clear build cache

**Recovery**: Cache clear and rebuild

---

### PREV_2004: Asset Processing Failed
**Severity**: Medium  
**Message**: "Failed to process application assets"

**Causes**:
- Invalid image formats
- Corrupted asset files
- Unsupported asset types
- File size too large

**Solutions**:
1. Verify all images are valid (PNG, JPG, GIF)
2. Check asset file sizes (max 10MB per file)
3. Remove or replace corrupted assets
4. Use supported formats only

**Recovery**: Skip failed assets and continue

---

### PREV_2005: Dependency Resolution Failed
**Severity**: High  
**Message**: "Could not resolve project dependencies"

**Causes**:
- Missing npm packages
- Version conflicts
- Private package access issues
- Network problems during install

**Solutions**:
1. Run `npm install` or `yarn install`
2. Check package.json for errors
3. Resolve version conflicts
4. Verify npm registry access

**Recovery**: Automatic retry with fallback registry

## Device Errors (3xxx)

### PREV_3001: Device Not Supported
**Severity**: Medium  
**Message**: "Selected device is not available"

**Causes**:
- Device temporarily unavailable
- Device type deprecated
- Regional restrictions

**Solutions**:
1. Select a different device model
2. Check supported devices list
3. Try similar device type

**Recovery**: Automatic fallback to similar device

---

### PREV_3002: Device Configuration Invalid
**Severity**: Medium  
**Message**: "Device settings are invalid"

**Causes**:
- Incompatible OS version selected
- Invalid screen configuration
- Unsupported feature requested

**Solutions**:
1. Reset device settings to defaults
2. Select compatible OS version
3. Verify device capabilities

**Recovery**: Reset to default configuration

---

### PREV_3003: Orientation Change Failed
**Severity**: Low  
**Message**: "Could not change device orientation"

**Causes**:
- App doesn't support orientation
- Temporary device state issue
- Animation in progress

**Solutions**:
1. Wait for current operation to complete
2. Try again after a moment
3. Refresh the preview

**Recovery**: Automatic retry

## Network Errors (4xxx)

### PREV_4001: Network Timeout
**Severity**: Medium  
**Message**: "Network request timed out"

**Causes**:
- Slow internet connection
- Server response delay
- Firewall blocking
- VPN interference

**Solutions**:
1. Check your internet connection
2. Try again in a few moments
3. Disable VPN if active
4. Check firewall settings

**Recovery**: Automatic retry with backoff

---

### PREV_4002: WebSocket Connection Failed
**Severity**: High  
**Message**: "Real-time connection failed"

**Causes**:
- WebSocket blocked by firewall
- Proxy interference
- Browser restrictions
- Network instability

**Solutions**:
1. Check if WebSockets are blocked
2. Try disabling browser extensions
3. Switch to a different network
4. Use a modern browser

**Recovery**: Automatic reconnection attempts

---

### PREV_4003: Hot Reload Failed
**Severity**: Medium  
**Message**: "Could not apply code changes"

**Causes**:
- Syntax error in new code
- WebSocket disconnection
- Build cache corruption
- State incompatibility

**Solutions**:
1. Check for syntax errors
2. Perform full refresh
3. Clear build cache
4. Reset preview session

**Recovery**: Fallback to full reload

---

### PREV_4004: API Request Failed
**Severity**: High  
**Message**: "Backend API request failed"

**Causes**:
- Server error
- Authentication expired
- Rate limiting
- Invalid request

**Solutions**:
1. Check authentication status
2. Retry the request
3. Reduce request frequency
4. Verify request parameters

**Recovery**: Automatic retry with auth refresh

## Resource Errors (5xxx)

### PREV_5001: Quota Exceeded
**Severity**: High  
**Message**: "Monthly preview quota exceeded"

**Causes**:
- Preview minute limit reached
- Billing cycle quota exhausted
- Plan limitations

**Solutions**:
1. Upgrade to a higher tier for more preview minutes
2. Wait until next billing cycle
3. Contact sales for custom plans
4. Optimize preview usage

**Recovery**: No automatic recovery

---

### PREV_5002: Memory Limit Exceeded
**Severity**: High  
**Message**: "Application exceeded memory limits"

**Causes**:
- Memory leak in application
- Too many large assets
- Infinite loops
- Complex computations

**Solutions**:
1. Profile memory usage
2. Optimize image assets
3. Fix memory leaks
4. Reduce complexity

**Recovery**: Session restart with monitoring

---

### PREV_5003: Storage Limit Exceeded
**Severity**: Medium  
**Message**: "Build cache storage full"

**Causes**:
- Too many cached builds
- Large asset accumulation
- Old cache not cleared

**Solutions**:
1. Clear build cache
2. Remove unused assets
3. Enable auto-cache cleanup
4. Upgrade storage limits

**Recovery**: Automatic cache cleanup

---

### PREV_5004: Rate Limit Exceeded
**Severity**: Medium  
**Message**: "Too many requests, please slow down"

**Causes**:
- Rapid repeated actions
- Automated scripts
- Multiple concurrent sessions

**Solutions**:
1. Wait 60 seconds before retrying
2. Reduce request frequency
3. Implement request throttling
4. Batch operations

**Recovery**: Automatic retry after cooldown

## Integration Errors (6xxx)

### PREV_6001: Appetize API Error
**Severity**: Critical  
**Message**: "Preview service is temporarily unavailable"

**Causes**:
- Appetize.io service outage
- API maintenance
- Account issues

**Solutions**:
1. Check status page for outages
2. Try again in a few minutes
3. Contact support for updates
4. Use fallback preview mode

**Recovery**: Automatic service monitoring

---

### PREV_6002: Supabase Connection Error
**Severity**: High  
**Message**: "Database connection failed"

**Causes**:
- Database unavailable
- Connection pool exhausted
- Network issues

**Solutions**:
1. Check service status
2. Retry operation
3. Report persistent issues
4. Check network connectivity

**Recovery**: Connection pool reset

---

### PREV_6003: Authentication Failed
**Severity**: High  
**Message**: "Authentication required"

**Causes**:
- Session expired
- Invalid credentials
- Account suspended
- Token revoked

**Solutions**:
1. Sign in to your account
2. Check account status
3. Clear cookies and re-login
4. Verify subscription active

**Recovery**: Automatic auth refresh attempt

---

### PREV_6004: Permission Denied
**Severity**: High  
**Message**: "You don't have permission for this action"

**Causes**:
- Insufficient privileges
- Feature not in plan
- Project access revoked
- Team permissions

**Solutions**:
1. Check your role permissions
2. Verify plan includes feature
3. Request access from admin
4. Upgrade plan if needed

**Recovery**: No automatic recovery

## Unknown Errors (9xxx)

### PREV_9999: Unknown Error
**Severity**: High  
**Message**: "An unexpected error occurred"

**Causes**:
- Unhandled exception
- New error type
- System failure
- Corruption

**Solutions**:
1. Try refreshing the page
2. Clear browser cache
3. Contact support with error details
4. Provide session ID for investigation

**Recovery**: Basic retry mechanisms

## Error Patterns and Trends

### Recurring Errors
If you see the same error multiple times:
1. The system will detect patterns
2. Suggestions will be provided
3. Self-healing may activate
4. Support will be notified

### Error Cascades
Some errors may trigger others:
- Network errors → WebSocket failures
- Build errors → Hot reload failures
- Auth errors → Permission errors

## Getting Help

When reporting errors:
1. Note the error code
2. Copy the session ID
3. Describe what you were doing
4. Include browser/OS information
5. Attach diagnostic report if available

### Quick Support Checklist
- [ ] Error code: PREV_XXXX
- [ ] Session ID: (from preview panel)
- [ ] Time of occurrence
- [ ] Steps to reproduce
- [ ] Browser and version
- [ ] Network type (WiFi/Cellular/VPN)

---

For real-time help, join our [Discord community](https://discord.gg/velocity) or contact support@velocity.dev