import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isValidAnonKeyFormat,
  isValidSupabaseUrl,
  validateCredentialStrength,
  sanitizeForLogging,
  hashForLogging,
  secureCompare,
  generateSecureToken,
  createTemporaryAccessToken,
  verifyTemporaryAccessToken
} from '../../frontend/src/utils/supabase/credentialSecurity';

describe('Credential Validation', () => {
  describe('isValidAnonKeyFormat', () => {
    it('should validate correct JWT format', () => {
      const validJWT = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QtcHJvamVjdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjQ2MjM5MDIyLCJleHAiOjE5NjE4MTUwMjJ9.test_signature';
      expect(isValidAnonKeyFormat(validJWT)).toBe(true);
    });

    it('should reject invalid JWT format', () => {
      const invalidFormats = [
        'not-a-jwt',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', // Missing parts
        'part1.part2', // Missing third part
        'part1.part2.part3.part4', // Too many parts
        '', // Empty string
        'Bearer eyJhbGci.test.test' // With Bearer prefix
      ];

      invalidFormats.forEach(invalid => {
        expect(isValidAnonKeyFormat(invalid)).toBe(false);
      });
    });

    it('should handle special characters in JWT', () => {
      const jwtWithSpecialChars = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRlc3QtcHJvamVjdCIsInJvbGUiOiJhbm9uIn0.abc-123_XYZ';
      expect(isValidAnonKeyFormat(jwtWithSpecialChars)).toBe(true);
    });
  });

  describe('isValidSupabaseUrl', () => {
    it('should validate correct Supabase URLs', () => {
      const validUrls = [
        'https://myproject.supabase.co',
        'https://test-project.supabase.co',
        'https://my-app-123.supabase.co',
        'https://a1b2c3d4.supabase.co'
      ];

      validUrls.forEach(url => {
        expect(isValidSupabaseUrl(url)).toBe(true);
      });
    });

    it('should reject invalid Supabase URLs', () => {
      const invalidUrls = [
        'http://myproject.supabase.co', // HTTP instead of HTTPS
        'https://myproject.supabase.com', // .com instead of .co
        'https://supabase.co', // Missing project subdomain
        'https://myproject.supabase.co/path', // Has path
        'https://myproject.supabase.co?query=param', // Has query params
        'https://myproject.not-supabase.co', // Wrong domain
        'https://localhost:54321', // Local Supabase
        'not-a-url', // Not a URL
        '', // Empty string
        'https://my_project.supabase.co' // Underscore in subdomain
      ];

      invalidUrls.forEach(url => {
        expect(isValidSupabaseUrl(url)).toBe(false);
      });
    });

    it('should handle edge cases', () => {
      expect(isValidSupabaseUrl('https://a.supabase.co')).toBe(true); // Single char subdomain
      expect(isValidSupabaseUrl('https://123.supabase.co')).toBe(true); // Numeric subdomain
      expect(isValidSupabaseUrl('https://test-123-abc.supabase.co')).toBe(true); // Mixed subdomain
    });
  });

  describe('validateCredentialStrength', () => {
    it('should validate strong credentials', () => {
      const strongCredentials = {
        url: 'https://myproject.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im15cHJvamVjdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNjQ2MjM5MDIyLCJleHAiOjE5NjE4MTUwMjJ9.'.padEnd(150, 'a')
      };

      const result = validateCredentialStrength(strongCredentials);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('should detect invalid URL format', () => {
      const credentials = {
        url: 'https://example.com',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test'
      };

      const result = validateCredentialStrength(credentials);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid Supabase project URL format');
    });

    it('should detect invalid anon key format', () => {
      const credentials = {
        url: 'https://myproject.supabase.co',
        anonKey: 'not-a-valid-jwt'
      };

      const result = validateCredentialStrength(credentials);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid anon key format - must be a valid JWT');
    });

    it('should detect service role key', () => {
      const credentials = {
        url: 'https://myproject.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service_role.test'
      };

      const result = validateCredentialStrength(credentials);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Service role key detected - please use anon key instead for security');
    });

    it('should warn about local Supabase URL', () => {
      const credentials = {
        url: 'https://localhost.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.test'.padEnd(150, 'a')
      };

      const result = validateCredentialStrength(credentials);
      expect(result.isValid).toBe(true); // Still valid, just a warning
      expect(result.warnings).toContain('Local Supabase URL detected - ensure this is intentional');
    });

    it('should warn about short anon key', () => {
      const credentials = {
        url: 'https://myproject.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.sig' // Short but valid format
      };

      const result = validateCredentialStrength(credentials);
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Anon key seems unusually short - please verify');
    });

    it('should handle multiple errors and warnings', () => {
      const credentials = {
        url: 'https://localhost.example.com',
        anonKey: 'service_role_key_here'
      };

      const result = validateCredentialStrength(credentials);
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(1);
    });
  });

  describe('sanitizeForLogging', () => {
    it('should sanitize URL correctly', () => {
      const credentials = {
        url: 'https://myproject-123.supabase.co'
      };

      const sanitized = sanitizeForLogging(credentials);
      expect(sanitized.projectId).toBe('myproject...');
      expect(sanitized.urlValid).toBe('valid');
    });

    it('should sanitize anon key without exposing it', () => {
      const credentials = {
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature'
      };

      const sanitized = sanitizeForLogging(credentials);
      expect(sanitized.keyHash).toMatch(/^[a-f0-9]{8}\.\.\./);
      expect(sanitized.keyFormat).toBe('valid');
      expect(sanitized.keyLength).toBe(credentials.anonKey.length.toString());
      expect(sanitized.keyHash).not.toContain(credentials.anonKey);
    });

    it('should handle empty credentials', () => {
      const sanitized = sanitizeForLogging({});
      expect(sanitized).toEqual({});
    });

    it('should handle invalid formats', () => {
      const credentials = {
        url: 'not-a-url',
        anonKey: 'not-a-jwt'
      };

      const sanitized = sanitizeForLogging(credentials);
      expect(sanitized.urlValid).toBe('invalid');
      expect(sanitized.keyFormat).toBe('invalid');
    });
  });

  describe('hashForLogging', () => {
    it('should create consistent hash', () => {
      const value = 'test-value';
      const hash1 = hashForLogging(value);
      const hash2 = hashForLogging(value);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{8}\.\.\./);
    });

    it('should create different hashes for different values', () => {
      const hash1 = hashForLogging('value1');
      const hash2 = hashForLogging('value2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle empty string', () => {
      const hash = hashForLogging('');
      expect(hash).toBe('empty');
    });

    it('should not expose original value', () => {
      const sensitiveValue = 'super-secret-key';
      const hash = hashForLogging(sensitiveValue);
      
      expect(hash).not.toContain(sensitiveValue);
      expect(hash.length).toBeLessThan(sensitiveValue.length);
    });
  });

  describe('secureCompare', () => {
    it('should correctly compare equal strings', () => {
      expect(secureCompare('test123', 'test123')).toBe(true);
      expect(secureCompare('', '')).toBe(true);
      expect(secureCompare('a', 'a')).toBe(true);
    });

    it('should correctly identify different strings', () => {
      expect(secureCompare('test123', 'test124')).toBe(false);
      expect(secureCompare('test', 'test123')).toBe(false);
      expect(secureCompare('a', 'b')).toBe(false);
    });

    it('should handle different lengths', () => {
      expect(secureCompare('short', 'much longer string')).toBe(false);
      expect(secureCompare('', 'not empty')).toBe(false);
    });

    it('should be case sensitive', () => {
      expect(secureCompare('Test', 'test')).toBe(false);
      expect(secureCompare('ABC', 'abc')).toBe(false);
    });
  });

  describe('generateSecureToken', () => {
    it('should generate token of correct length', () => {
      const token32 = generateSecureToken(32);
      expect(token32.length).toBe(64); // Hex encoding doubles the length
      
      const token16 = generateSecureToken(16);
      expect(token16.length).toBe(32);
    });

    it('should generate unique tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateSecureToken(16));
      }
      expect(tokens.size).toBe(100); // All should be unique
    });

    it('should generate hex-only characters', () => {
      const token = generateSecureToken(32);
      expect(token).toMatch(/^[a-f0-9]+$/);
    });

    it('should use default length when not specified', () => {
      const token = generateSecureToken();
      expect(token.length).toBe(64); // Default 32 bytes = 64 hex chars
    });
  });

  describe('Temporary Access Tokens', () => {
    beforeEach(() => {
      // Clear sessionStorage before each test
      sessionStorage.clear();
    });

    afterEach(() => {
      // Clean up after tests
      sessionStorage.clear();
    });

    describe('createTemporaryAccessToken', () => {
      it('should create token with expiration', () => {
        const { token, expiresAt } = createTemporaryAccessToken(5);
        
        expect(token).toBeDefined();
        expect(token.length).toBe(64); // 32 bytes hex
        expect(expiresAt).toBeGreaterThan(Date.now());
        expect(expiresAt).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
      });

      it('should store token in sessionStorage', () => {
        const { token } = createTemporaryAccessToken(5);
        
        const stored = sessionStorage.getItem(`temp_token_${token}`);
        expect(stored).toBeDefined();
        
        const parsed = JSON.parse(stored!);
        expect(parsed.expiresAt).toBeDefined();
        expect(parsed.used).toBe(false);
      });

      it('should use default expiration when not specified', () => {
        const { expiresAt } = createTemporaryAccessToken();
        
        // Default is 5 minutes
        const expectedExpiration = Date.now() + 5 * 60 * 1000;
        expect(Math.abs(expiresAt - expectedExpiration)).toBeLessThan(1000); // Within 1 second
      });
    });

    describe('verifyTemporaryAccessToken', () => {
      it('should verify valid token', () => {
        const { token } = createTemporaryAccessToken(5);
        
        const isValid = verifyTemporaryAccessToken(token);
        expect(isValid).toBe(true);
      });

      it('should mark token as used after verification', () => {
        const { token } = createTemporaryAccessToken(5);
        
        verifyTemporaryAccessToken(token);
        
        const stored = sessionStorage.getItem(`temp_token_${token}`);
        const parsed = JSON.parse(stored!);
        expect(parsed.used).toBe(true);
      });

      it('should reject already used token', () => {
        const { token } = createTemporaryAccessToken(5);
        
        expect(verifyTemporaryAccessToken(token)).toBe(true);
        expect(verifyTemporaryAccessToken(token)).toBe(false); // Second attempt fails
      });

      it('should reject expired token', () => {
        const token = generateSecureToken(32);
        const expiredData = {
          expiresAt: Date.now() - 1000, // Expired 1 second ago
          used: false
        };
        sessionStorage.setItem(`temp_token_${token}`, JSON.stringify(expiredData));
        
        expect(verifyTemporaryAccessToken(token)).toBe(false);
      });

      it('should reject non-existent token', () => {
        const fakeToken = generateSecureToken(32);
        expect(verifyTemporaryAccessToken(fakeToken)).toBe(false);
      });

      it('should clean up expired/used tokens', () => {
        const token = generateSecureToken(32);
        const expiredData = {
          expiresAt: Date.now() - 1000,
          used: false
        };
        sessionStorage.setItem(`temp_token_${token}`, JSON.stringify(expiredData));
        
        verifyTemporaryAccessToken(token);
        
        expect(sessionStorage.getItem(`temp_token_${token}`)).toBeNull();
      });

      it('should handle corrupted token data', () => {
        const token = generateSecureToken(32);
        sessionStorage.setItem(`temp_token_${token}`, 'corrupted-json');
        
        expect(verifyTemporaryAccessToken(token)).toBe(false);
      });
    });
  });
});