import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createClient } from '@supabase/supabase-js';
import {
  isValidSupabaseUrl,
  validateSupabaseConnection,
  encryptCredentials,
  decryptCredentials,
  storeSupabaseConnection,
  testConnectionHealth,
  getStoredConnection,
  updateSupabaseConnection,
  disconnectSupabaseProject,
  SupabaseCredentials,
  EncryptedCredentials
} from '../supabaseConnection';

// Mock Supabase client
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn()
}));

// Mock fetch globally
global.fetch = vi.fn();

describe('supabaseConnection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup Web Crypto API mock for testing
    if (!global.crypto) {
      global.crypto = {
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) {
            arr[i] = Math.floor(Math.random() * 256);
          }
          return arr;
        },
        subtle: {
          importKey: vi.fn().mockResolvedValue('mock-key'),
          encrypt: vi.fn().mockResolvedValue(new ArrayBuffer(32)),
          decrypt: vi.fn().mockResolvedValue(new ArrayBuffer(16))
        }
      } as any;
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('isValidSupabaseUrl', () => {
    it('should validate correct Supabase URLs', () => {
      expect(isValidSupabaseUrl('https://project-ref.supabase.co')).toBe(true);
      expect(isValidSupabaseUrl('https://my-project.supabase.in')).toBe(true);
      expect(isValidSupabaseUrl('https://test-123.supabase.co')).toBe(true);
    });

    it('should reject invalid URLs', () => {
      expect(isValidSupabaseUrl('http://project.supabase.co')).toBe(false); // Not https
      expect(isValidSupabaseUrl('https://project.supabase.com')).toBe(false); // Wrong domain
      expect(isValidSupabaseUrl('https://google.com')).toBe(false);
      expect(isValidSupabaseUrl('not-a-url')).toBe(false);
      expect(isValidSupabaseUrl('')).toBe(false);
    });
  });

  describe('validateSupabaseConnection', () => {
    const validCredentials: SupabaseCredentials = {
      projectUrl: 'https://test-project.supabase.co',
      anonKey: 'test-anon-key-123'
    };

    it('should reject invalid URL format', async () => {
      const result = await validateSupabaseConnection({
        projectUrl: 'invalid-url',
        anonKey: 'test-key'
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid Supabase project URL format');
      expect(result.error).toBe('URL_FORMAT_INVALID');
    });

    it('should reject missing anon key', async () => {
      const result = await validateSupabaseConnection({
        projectUrl: 'https://test.supabase.co',
        anonKey: ''
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('Anon key is required');
      expect(result.error).toBe('ANON_KEY_MISSING');
    });

    it('should validate successful connection', async () => {
      const mockSupabaseClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              error: { code: 'PGRST116' } // Table doesn't exist error is OK
            })
          })
        })
      };

      (createClient as any).mockReturnValue(mockSupabaseClient);

      const result = await validateSupabaseConnection(validCredentials);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Connection successful');
      expect(createClient).toHaveBeenCalledWith(
        validCredentials.projectUrl,
        validCredentials.anonKey,
        expect.any(Object)
      );
    });

    it('should handle invalid credentials', async () => {
      const mockSupabaseClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              error: { code: 'AUTH_ERROR', message: 'Invalid API key' }
            })
          })
        })
      };

      (createClient as any).mockReturnValue(mockSupabaseClient);

      const result = await validateSupabaseConnection(validCredentials);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Invalid credentials or connection failed');
      expect(result.error).toBe('Invalid API key');
    });

    it('should handle network timeout', async () => {
      const mockSupabaseClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockRejectedValue(new DOMException('Aborted', 'AbortError'))
          })
        })
      };

      (createClient as any).mockReturnValue(mockSupabaseClient);

      const result = await validateSupabaseConnection(validCredentials);

      expect(result.success).toBe(false);
      expect(result.message).toBe('Connection timeout - please check your internet connection');
      expect(result.error).toBe('TIMEOUT');
    });
  });

  describe('encryptCredentials and decryptCredentials', () => {
    const credentials: SupabaseCredentials = {
      projectUrl: 'https://test.supabase.co',
      anonKey: 'secret-anon-key'
    };

    it('should encrypt credentials', async () => {
      const encrypted = await encryptCredentials(credentials);

      expect(encrypted.projectUrl).toBe(credentials.projectUrl);
      expect(encrypted.encryptedAnonKey).toBeDefined();
      expect(encrypted.encryptedAnonKey).not.toBe(credentials.anonKey);
      expect(encrypted.encryptionIv).toBeDefined();
    });

    it('should handle server-side encryption error', async () => {
      // Mock window as undefined to simulate server-side
      const originalWindow = global.window;
      global.window = undefined as any;

      await expect(encryptCredentials(credentials)).rejects.toThrow(
        'Server-side encryption not implemented in browser environment'
      );

      global.window = originalWindow;
    });
  });

  describe('storeSupabaseConnection', () => {
    const encryptedCredentials: EncryptedCredentials = {
      projectUrl: 'https://test.supabase.co',
      encryptedAnonKey: 'encrypted-key',
      encryptionIv: 'test-iv'
    };

    it('should successfully store connection', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const result = await storeSupabaseConnection('project-123', encryptedCredentials);

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith('/api/supabase/connection/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          velocityProjectId: 'project-123',
          ...encryptedCredentials
        })
      });
    });

    it('should handle storage failure', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'Database error' })
      });

      const result = await storeSupabaseConnection('project-123', encryptedCredentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Database error');
    });

    it('should handle network error', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await storeSupabaseConnection('project-123', encryptedCredentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('testConnectionHealth', () => {
    it('should return healthy connection status', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          message: 'Connection is healthy'
        })
      });

      const result = await testConnectionHealth('project-123');

      expect(result.success).toBe(true);
      expect(result.message).toBe('Connection is healthy');
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/supabase/connection/health/project-123',
        { method: 'GET' }
      );
    });

    it('should handle unhealthy connection', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        json: async () => ({
          message: 'Connection failed',
          error: 'AUTH_ERROR'
        })
      });

      const result = await testConnectionHealth('project-123');

      expect(result.success).toBe(false);
      expect(result.message).toBe('Connection failed');
      expect(result.error).toBe('AUTH_ERROR');
    });
  });

  describe('getStoredConnection', () => {
    it('should retrieve stored connection', async () => {
      const mockConnection = {
        velocityProjectId: 'project-123',
        projectUrl: 'https://test.supabase.co',
        encryptedAnonKey: 'encrypted',
        encryptionIv: 'iv',
        lastValidated: new Date(),
        connectionStatus: 'active'
      };

      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => mockConnection
      });

      const result = await getStoredConnection('project-123');

      expect(result).toEqual(mockConnection);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/supabase/connection/project-123',
        { method: 'GET' }
      );
    });

    it('should return null for non-existent connection', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        status: 404
      });

      const result = await getStoredConnection('project-123');

      expect(result).toBeNull();
    });

    it('should handle fetch errors', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await getStoredConnection('project-123');

      expect(result).toBeNull();
    });
  });

  describe('updateSupabaseConnection', () => {
    const newCredentials: SupabaseCredentials = {
      projectUrl: 'https://new-project.supabase.co',
      anonKey: 'new-anon-key'
    };

    it('should update connection with valid credentials', async () => {
      // Mock successful validation
      const mockSupabaseClient = {
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue({
              error: { code: 'PGRST116' }
            })
          })
        })
      };
      (createClient as any).mockReturnValue(mockSupabaseClient);

      // Mock successful storage
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const result = await updateSupabaseConnection('project-123', newCredentials);

      expect(result.success).toBe(true);
      expect(createClient).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalled();
    });

    it('should reject update with invalid credentials', async () => {
      const invalidCredentials: SupabaseCredentials = {
        projectUrl: 'invalid-url',
        anonKey: 'test-key'
      };

      const result = await updateSupabaseConnection('project-123', invalidCredentials);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid Supabase project URL format');
    });
  });

  describe('disconnectSupabaseProject', () => {
    it('should successfully disconnect project', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: true,
        json: async () => ({ success: true })
      });

      const result = await disconnectSupabaseProject('project-123');

      expect(result.success).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/supabase/connection/project-123',
        { method: 'DELETE' }
      );
    });

    it('should handle disconnection failure', async () => {
      (global.fetch as any).mockResolvedValue({
        ok: false,
        json: async () => ({ message: 'Failed to delete connection' })
      });

      const result = await disconnectSupabaseProject('project-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to delete connection');
    });

    it('should handle network errors', async () => {
      (global.fetch as any).mockRejectedValue(new Error('Network error'));

      const result = await disconnectSupabaseProject('project-123');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});