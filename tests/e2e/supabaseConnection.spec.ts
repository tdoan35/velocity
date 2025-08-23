import { test, expect, Page } from '@playwright/test';
import { SupabaseClient } from '@supabase/supabase-js';

// Test configuration
const TEST_TIMEOUT = 60000; // 60 seconds for E2E tests
const TEST_USER = {
  email: 'tdoan351@gmail.com',
  password: 'qwerty'
};

// Mock Supabase credentials for testing
const MOCK_SUPABASE_CREDENTIALS = {
  url: 'https://test-project.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QtcHJvamVjdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjQ2MjM5MDIyLCJleHAiOjE5NjE4MTUwMjJ9.test_signature_for_testing'
};

// Helper function to navigate to connection page
async function navigateToConnectionPage(page: Page) {
  await page.goto('/dashboard');
  await page.waitForSelector('[data-testid="supabase-connect-button"]', { timeout: 10000 });
  await page.click('[data-testid="supabase-connect-button"]');
}

// Helper function to fill connection form
async function fillConnectionForm(page: Page, credentials = MOCK_SUPABASE_CREDENTIALS) {
  await page.fill('[data-testid="supabase-url-input"]', credentials.url);
  await page.fill('[data-testid="supabase-anon-key-input"]', credentials.anonKey);
}

// Helper function to verify connection status
async function verifyConnectionStatus(page: Page, expectedStatus: 'connected' | 'disconnected' | 'error') {
  const statusElement = await page.waitForSelector('[data-testid="connection-status"]', { timeout: 5000 });
  const status = await statusElement.getAttribute('data-status');
  expect(status).toBe(expectedStatus);
}

test.describe('Supabase Connection Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Set test timeout
    test.setTimeout(TEST_TIMEOUT);
    
    // Login before each test
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', TEST_USER.email);
    await page.fill('[data-testid="password-input"]', TEST_USER.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard', { timeout: 10000 });
  });

  test('should display connection form when no connection exists', async ({ page }) => {
    await navigateToConnectionPage(page);
    
    // Verify form elements are visible
    await expect(page.locator('[data-testid="supabase-connection-form"]')).toBeVisible();
    await expect(page.locator('[data-testid="supabase-url-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="supabase-anon-key-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="connect-button"]')).toBeVisible();
  });

  test('should validate URL format', async ({ page }) => {
    await navigateToConnectionPage(page);
    
    // Test invalid URL
    await page.fill('[data-testid="supabase-url-input"]', 'not-a-valid-url');
    await page.fill('[data-testid="supabase-anon-key-input"]', MOCK_SUPABASE_CREDENTIALS.anonKey);
    await page.click('[data-testid="connect-button"]');
    
    // Check for validation error
    await expect(page.locator('[data-testid="url-error"]')).toContainText('Invalid Supabase project URL');
    
    // Test non-Supabase URL
    await page.fill('[data-testid="supabase-url-input"]', 'https://example.com');
    await page.click('[data-testid="connect-button"]');
    await expect(page.locator('[data-testid="url-error"]')).toContainText('must be a Supabase project URL');
  });

  test('should validate anon key format', async ({ page }) => {
    await navigateToConnectionPage(page);
    
    // Test invalid JWT format
    await page.fill('[data-testid="supabase-url-input"]', MOCK_SUPABASE_CREDENTIALS.url);
    await page.fill('[data-testid="supabase-anon-key-input"]', 'not-a-valid-jwt');
    await page.click('[data-testid="connect-button"]');
    
    // Check for validation error
    await expect(page.locator('[data-testid="anon-key-error"]')).toContainText('Invalid JWT format');
    
    // Test service role key warning
    await page.fill('[data-testid="supabase-anon-key-input"]', 'service_role_key_example');
    await page.click('[data-testid="connect-button"]');
    await expect(page.locator('[data-testid="anon-key-error"]')).toContainText('Service role key detected');
  });

  test('should successfully connect with valid credentials', async ({ page }) => {
    await navigateToConnectionPage(page);
    
    // Fill form with valid credentials
    await fillConnectionForm(page);
    
    // Submit form
    await page.click('[data-testid="connect-button"]');
    
    // Wait for loading state
    await expect(page.locator('[data-testid="connection-loading"]')).toBeVisible();
    
    // Wait for success message
    await expect(page.locator('[data-testid="connection-success"]')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('[data-testid="connection-success"]')).toContainText('Successfully connected');
    
    // Verify connection status
    await verifyConnectionStatus(page, 'connected');
    
    // Verify connection details are displayed
    await expect(page.locator('[data-testid="connection-project-url"]')).toContainText(MOCK_SUPABASE_CREDENTIALS.url);
  });

  test('should handle connection errors gracefully', async ({ page }) => {
    await navigateToConnectionPage(page);
    
    // Mock network error
    await page.route('**/api/supabase/connect', route => {
      route.abort('failed');
    });
    
    await fillConnectionForm(page);
    await page.click('[data-testid="connect-button"]');
    
    // Verify error message
    await expect(page.locator('[data-testid="connection-error"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="connection-error"]')).toContainText('Connection failed');
    
    // Verify retry button is available
    await expect(page.locator('[data-testid="retry-connection-button"]')).toBeVisible();
  });

  test('should allow updating existing connection', async ({ page }) => {
    // First establish a connection
    await navigateToConnectionPage(page);
    await fillConnectionForm(page);
    await page.click('[data-testid="connect-button"]');
    await page.waitForSelector('[data-testid="connection-success"]', { timeout: 15000 });
    
    // Click update button
    await page.click('[data-testid="update-connection-button"]');
    
    // Update with new credentials
    const newCredentials = {
      url: 'https://new-project.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ldy1wcm9qZWN0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDYyMzkwMjIsImV4cCI6MTk2MTgxNTAyMn0.new_test_signature'
    };
    
    await fillConnectionForm(page, newCredentials);
    await page.click('[data-testid="save-connection-button"]');
    
    // Verify update success
    await expect(page.locator('[data-testid="update-success"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="connection-project-url"]')).toContainText(newCredentials.url);
  });

  test('should allow disconnecting from Supabase', async ({ page }) => {
    // First establish a connection
    await navigateToConnectionPage(page);
    await fillConnectionForm(page);
    await page.click('[data-testid="connect-button"]');
    await page.waitForSelector('[data-testid="connection-success"]', { timeout: 15000 });
    
    // Click disconnect button
    await page.click('[data-testid="disconnect-button"]');
    
    // Confirm disconnection in dialog
    await expect(page.locator('[data-testid="disconnect-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="disconnect-dialog"]')).toContainText('Are you sure');
    await page.click('[data-testid="confirm-disconnect-button"]');
    
    // Verify disconnection
    await expect(page.locator('[data-testid="disconnection-success"]')).toBeVisible({ timeout: 10000 });
    await verifyConnectionStatus(page, 'disconnected');
    
    // Verify connection form is shown again
    await expect(page.locator('[data-testid="supabase-connection-form"]')).toBeVisible();
  });

  test('should test connection before saving', async ({ page }) => {
    await navigateToConnectionPage(page);
    await fillConnectionForm(page);
    
    // Click test connection button
    await page.click('[data-testid="test-connection-button"]');
    
    // Verify test is running
    await expect(page.locator('[data-testid="testing-connection"]')).toBeVisible();
    
    // Verify test results
    await expect(page.locator('[data-testid="test-results"]')).toBeVisible({ timeout: 10000 });
    
    // Check for success indicators
    await expect(page.locator('[data-testid="test-url-valid"]')).toHaveClass(/success/);
    await expect(page.locator('[data-testid="test-key-valid"]')).toHaveClass(/success/);
    await expect(page.locator('[data-testid="test-connection-active"]')).toHaveClass(/success/);
  });

  test('should handle rate limiting', async ({ page }) => {
    await navigateToConnectionPage(page);
    
    // Mock rate limit response
    await page.route('**/api/supabase/connect', route => {
      route.fulfill({
        status: 429,
        body: JSON.stringify({ 
          error: 'Rate limit exceeded',
          retryAfter: 60
        })
      });
    });
    
    await fillConnectionForm(page);
    await page.click('[data-testid="connect-button"]');
    
    // Verify rate limit message
    await expect(page.locator('[data-testid="rate-limit-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="rate-limit-error"]')).toContainText('Too many attempts');
    await expect(page.locator('[data-testid="retry-timer"]')).toBeVisible();
  });

  test('should persist connection across page refreshes', async ({ page }) => {
    // Establish connection
    await navigateToConnectionPage(page);
    await fillConnectionForm(page);
    await page.click('[data-testid="connect-button"]');
    await page.waitForSelector('[data-testid="connection-success"]', { timeout: 15000 });
    
    // Refresh page
    await page.reload();
    
    // Verify connection persists
    await page.waitForSelector('[data-testid="connection-status"]', { timeout: 10000 });
    await verifyConnectionStatus(page, 'connected');
    await expect(page.locator('[data-testid="connection-project-url"]')).toContainText(MOCK_SUPABASE_CREDENTIALS.url);
  });

  test('should handle OAuth flow for enhanced permissions', async ({ page }) => {
    await navigateToConnectionPage(page);
    
    // Click OAuth connect button
    await page.click('[data-testid="oauth-connect-button"]');
    
    // Verify OAuth dialog/redirect
    await expect(page.locator('[data-testid="oauth-dialog"]')).toBeVisible();
    await expect(page.locator('[data-testid="oauth-dialog"]')).toContainText('Connect with Supabase Account');
    
    // Mock OAuth callback
    await page.evaluate(() => {
      window.postMessage({
        type: 'supabase-oauth-callback',
        code: 'mock_auth_code',
        state: 'mock_state'
      }, window.location.origin);
    });
    
    // Verify OAuth success
    await expect(page.locator('[data-testid="oauth-success"]')).toBeVisible({ timeout: 15000 });
    await verifyConnectionStatus(page, 'connected');
  });

  test('should show connection metrics in monitoring', async ({ page }) => {
    // Establish connection
    await navigateToConnectionPage(page);
    await fillConnectionForm(page);
    await page.click('[data-testid="connect-button"]');
    await page.waitForSelector('[data-testid="connection-success"]', { timeout: 15000 });
    
    // Navigate to monitoring section
    await page.click('[data-testid="connection-metrics-link"]');
    
    // Verify metrics are displayed
    await expect(page.locator('[data-testid="connection-success-rate"]')).toBeVisible();
    await expect(page.locator('[data-testid="last-connection-time"]')).toBeVisible();
    await expect(page.locator('[data-testid="connection-attempts"]')).toBeVisible();
    await expect(page.locator('[data-testid="average-connection-time"]')).toBeVisible();
  });

  test('should handle expired tokens gracefully', async ({ page }) => {
    // Mock expired token response
    await page.route('**/api/supabase/connect', route => {
      route.fulfill({
        status: 401,
        body: JSON.stringify({ 
          error: 'Token expired',
          code: 'TOKEN_EXPIRED'
        })
      });
    });
    
    await navigateToConnectionPage(page);
    await fillConnectionForm(page);
    await page.click('[data-testid="connect-button"]');
    
    // Verify expired token message
    await expect(page.locator('[data-testid="token-expired-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="refresh-token-button"]')).toBeVisible();
    
    // Click refresh token
    await page.click('[data-testid="refresh-token-button"]');
    await expect(page.locator('[data-testid="refreshing-token"]')).toBeVisible();
  });
});

test.describe('Supabase Connection Security', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT);
    
    // Login
    await page.goto('/login');
    await page.fill('[data-testid="email-input"]', TEST_USER.email);
    await page.fill('[data-testid="password-input"]', TEST_USER.password);
    await page.click('[data-testid="login-button"]');
    await page.waitForURL('/dashboard', { timeout: 10000 });
  });

  test('should not expose credentials in network requests', async ({ page }) => {
    const requests: any[] = [];
    
    // Monitor network requests
    page.on('request', request => {
      requests.push({
        url: request.url(),
        headers: request.headers(),
        postData: request.postData()
      });
    });
    
    await navigateToConnectionPage(page);
    await fillConnectionForm(page);
    await page.click('[data-testid="connect-button"]');
    
    // Wait for request to complete
    await page.waitForSelector('[data-testid="connection-success"], [data-testid="connection-error"]', { timeout: 15000 });
    
    // Verify no plain text credentials in requests
    for (const request of requests) {
      if (request.url.includes('/api/supabase')) {
        // Check that anon key is not in plain text
        expect(request.postData).not.toContain(MOCK_SUPABASE_CREDENTIALS.anonKey);
        
        // Verify encrypted payload exists
        if (request.postData) {
          const data = JSON.parse(request.postData);
          expect(data.encryptedAnonKey).toBeDefined();
          expect(data.encryptionIv).toBeDefined();
        }
      }
    }
  });

  test('should not store credentials in localStorage', async ({ page }) => {
    await navigateToConnectionPage(page);
    await fillConnectionForm(page);
    await page.click('[data-testid="connect-button"]');
    await page.waitForSelector('[data-testid="connection-success"]', { timeout: 15000 });
    
    // Check localStorage
    const localStorageData = await page.evaluate(() => {
      const data: Record<string, any> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          data[key] = localStorage.getItem(key);
        }
      }
      return data;
    });
    
    // Verify no plain text credentials
    const storageString = JSON.stringify(localStorageData);
    expect(storageString).not.toContain(MOCK_SUPABASE_CREDENTIALS.anonKey);
    expect(storageString).not.toContain('service_role');
  });

  test('should clear sensitive data on logout', async ({ page }) => {
    // Establish connection
    await navigateToConnectionPage(page);
    await fillConnectionForm(page);
    await page.click('[data-testid="connect-button"]');
    await page.waitForSelector('[data-testid="connection-success"]', { timeout: 15000 });
    
    // Logout
    await page.click('[data-testid="user-menu"]');
    await page.click('[data-testid="logout-button"]');
    
    // Verify redirect to login
    await page.waitForURL('/login', { timeout: 10000 });
    
    // Check that sensitive data is cleared
    const sessionData = await page.evaluate(() => {
      return {
        localStorage: localStorage.length,
        sessionStorage: sessionStorage.length
      };
    });
    
    expect(sessionData.localStorage).toBe(0);
    expect(sessionData.sessionStorage).toBe(0);
  });

  test('should validate CORS headers', async ({ page }) => {
    let responseHeaders: any = null;
    
    page.on('response', response => {
      if (response.url().includes('/api/supabase')) {
        responseHeaders = response.headers();
      }
    });
    
    await navigateToConnectionPage(page);
    await fillConnectionForm(page);
    await page.click('[data-testid="connect-button"]');
    
    await page.waitForSelector('[data-testid="connection-success"], [data-testid="connection-error"]', { timeout: 15000 });
    
    // Verify security headers
    expect(responseHeaders).toBeDefined();
    expect(responseHeaders['x-content-type-options']).toBe('nosniff');
    expect(responseHeaders['x-frame-options']).toMatch(/DENY|SAMEORIGIN/);
  });
});