# JWT Authentication and Security Configuration

## Supabase Dashboard Configuration Required

### 1. JWT Settings (Authentication → Settings)
Configure these settings in your Supabase dashboard:

- **JWT expiry**: Set to **3600 seconds (1 hour)** for access tokens
- **Refresh token rotation**: **Enabled** (default in Supabase)
- **Refresh token reuse interval**: **10 seconds** (prevents token replay)
- **Refresh token lifetime**: **2592000 seconds (30 days)**

### 2. Authentication Security Settings

In Supabase Dashboard → Authentication → Settings:

1. **Enable Double Submit Cookie Pattern**:
   - Set `GOTRUE_COOKIE_SAME_SITE` to `strict`
   - Enable `GOTRUE_COOKIE_SECURE` for HTTPS

2. **Session Management**:
   - Set `GOTRUE_JWT_DEFAULT_GROUP_NAME` to `authenticated`
   - Enable `GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION`

3. **Rate Limiting**:
   - Set `GOTRUE_RATE_LIMIT_HEADER` to `60` requests per minute
   - Enable `GOTRUE_RATE_LIMIT_EMAIL_SENT` to `5` per hour

## Client-Side Implementation Notes

### Token Storage Strategy
- Use HTTP-only cookies for refresh tokens (server-side only)
- Store access tokens in memory (not localStorage/sessionStorage)
- Implement automatic token refresh before expiration

### Security Headers Implementation
Add these headers to your application:

```javascript
// Security headers for JWT protection
{
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
}
```

## Monitoring and Security

### JWT Security Events to Monitor
1. **Excessive refresh attempts** (>10 in 5 minutes)
2. **Multiple IP addresses** (>5 different IPs in 1 hour) 
3. **Token replay attempts**
4. **Failed authentication attempts**

### Recommended Client Implementation

```javascript
// Example JWT token management
class TokenManager {
  constructor(supabaseClient) {
    this.supabase = supabaseClient;
    this.refreshPromise = null;
  }

  async getValidToken() {
    const { data: { session } } = await this.supabase.auth.getSession();
    
    if (!session?.access_token) {
      throw new Error('No active session');
    }

    // Check if token expires in the next 5 minutes
    const expiresAt = session.expires_at * 1000;
    const now = Date.now();
    const fiveMinutes = 5 * 60 * 1000;

    if (expiresAt - now < fiveMinutes) {
      return this.refreshToken();
    }

    return session.access_token;
  }

  async refreshToken() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.supabase.auth.refreshSession()
      .then(({ data: { session }, error }) => {
        if (error) throw error;
        return session?.access_token;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  async revokeAllSessions() {
    await this.supabase.auth.signOut({ scope: 'global' });
  }
}
```

## Security Testing Checklist

- [ ] JWT tokens expire after 1 hour
- [ ] Refresh tokens rotate on each use
- [ ] Tokens are properly validated server-side
- [ ] Session invalidation works correctly
- [ ] Rate limiting prevents brute force attacks
- [ ] Secure cookie settings are applied
- [ ] CSRF protection is implemented
- [ ] Token theft scenarios are mitigated

## Environment Variables for Security

Add these to your `.env` file:

```env
# JWT Security Configuration
VITE_JWT_EXPIRY_TIME=3600
VITE_REFRESH_TOKEN_LIFETIME=2592000
VITE_ENABLE_REFRESH_TOKEN_ROTATION=true
VITE_COOKIE_SAME_SITE=strict
VITE_COOKIE_SECURE=true
```

## Production Deployment Notes

1. **Always use HTTPS** in production
2. **Set secure cookie flags** for refresh tokens
3. **Implement proper CORS** policy
4. **Monitor JWT security events** in application logs
5. **Set up alerts** for suspicious authentication activity
6. **Regular security audits** of authentication flows

## Next Steps

After configuring these settings in the Supabase dashboard:

1. Test JWT token generation and validation
2. Verify refresh token rotation works correctly
3. Test token expiration and automatic renewal
4. Validate security against token theft scenarios
5. Test session invalidation and forced logout
6. Implement client-side token management
7. Set up monitoring and alerting for security events