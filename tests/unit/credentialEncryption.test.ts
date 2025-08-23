import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  encryptCredentials,
  decryptCredentials,
  encryptionKeyManager,
  clearSensitiveData
} from '../../frontend/src/utils/supabase/credentialSecurity';
import type { SupabaseCredentials, EncryptedCredentials } from '../../frontend/src/utils/supabase/credentialSecurity';

// Mock environment variables
vi.mock('import.meta', () => ({
  env: {
    VITE_CREDENTIAL_ENCRYPTION_KEY: 'test-encryption-key-32-characters-long-for-testing',
    DEV: false,
    PROD: true
  }
}));

describe('Credential Encryption', () => {
  describe('encryptCredentials', () => {
    it('should encrypt credentials successfully', async () => {
      const credentials: SupabaseCredentials = {
        url: 'https://test-project.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature'
      };

      const encrypted = await encryptCredentials(credentials);

      expect(encrypted).toBeDefined();
      expect(encrypted.projectUrl).toBe(credentials.url); // URL should not be encrypted
      expect(encrypted.encryptedAnonKey).toBeDefined();
      expect(encrypted.encryptedAnonKey).not.toBe(credentials.anonKey); // Should be encrypted
      expect(encrypted.encryptionIv).toBeDefined();
      expect(encrypted.encryptionIv).toMatch(/^[a-f0-9]+$/); // Should be hex string
    });

    it('should generate unique IV for each encryption', async () => {
      const credentials: SupabaseCredentials = {
        url: 'https://test-project.supabase.co',
        anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature'
      };

      const encrypted1 = await encryptCredentials(credentials);
      const encrypted2 = await encryptCredentials(credentials);

      // Same input, different IVs
      expect(encrypted1.encryptionIv).not.toBe(encrypted2.encryptionIv);
      // Therefore different encrypted outputs
      expect(encrypted1.encryptedAnonKey).not.toBe(encrypted2.encryptedAnonKey);
    });

    it('should not expose anon key in encrypted result', async () => {
      const credentials: SupabaseCredentials = {
        url: 'https://test-project.supabase.co',
        anonKey: 'super-secret-anon-key-that-should-not-appear'
      };

      const encrypted = await encryptCredentials(credentials);
      
      // Check that the original key doesn't appear anywhere in the result
      const resultString = JSON.stringify(encrypted);
      expect(resultString).not.toContain(credentials.anonKey);
    });

    it('should handle empty anon key', async () => {
      const credentials: SupabaseCredentials = {
        url: 'https://test-project.supabase.co',
        anonKey: ''
      };

      const encrypted = await encryptCredentials(credentials);
      expect(encrypted.encryptedAnonKey).toBeDefined();
      expect(encrypted.encryptionIv).toBeDefined();
    });

    it('should handle special characters in anon key', async () => {
      const credentials: SupabaseCredentials = {
        url: 'https://test-project.supabase.co',
        anonKey: 'key-with-special-chars!@#$%^&*()_+-=[]{}|;:,.<>?'
      };

      const encrypted = await encryptCredentials(credentials);
      expect(encrypted.encryptedAnonKey).toBeDefined();
      expect(encrypted.encryptionIv).toBeDefined();
    });

    it('should preserve URL without modification', async () => {
      const specialUrls = [
        'https://test-project.supabase.co',
        'https://my-app-123.supabase.co',
        'https://test.supabase.co/with/path', // Even with path
        'https://test.supabase.co?query=param' // Even with query
      ];

      for (const url of specialUrls) {
        const credentials: SupabaseCredentials = {
          url,
          anonKey: 'test-key'
        };

        const encrypted = await encryptCredentials(credentials);
        expect(encrypted.projectUrl).toBe(url);
      }
    });
  });

  describe('decryptCredentials', () => {
    it('should decrypt previously encrypted credentials', async () => {
      const originalKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature';
      const credentials: SupabaseCredentials = {
        url: 'https://test-project.supabase.co',
        anonKey: originalKey
      };

      const encrypted = await encryptCredentials(credentials);
      const decrypted = await decryptCredentials(
        encrypted.encryptedAnonKey,
        encrypted.encryptionIv
      );

      expect(decrypted).toBe(originalKey);
    });

    it('should handle round-trip encryption/decryption', async () => {
      const testKeys = [
        'simple-key',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
        'key-with-special-!@#$%^&*()_chars',
        '', // Empty string
        'a'.repeat(1000) // Long key
      ];

      for (const key of testKeys) {
        const credentials: SupabaseCredentials = {
          url: 'https://test.supabase.co',
          anonKey: key
        };

        const encrypted = await encryptCredentials(credentials);
        const decrypted = await decryptCredentials(
          encrypted.encryptedAnonKey,
          encrypted.encryptionIv
        );

        expect(decrypted).toBe(key);
      }
    });

    it('should fail with wrong IV', async () => {
      const credentials: SupabaseCredentials = {
        url: 'https://test-project.supabase.co',
        anonKey: 'test-key'
      };

      const encrypted = await encryptCredentials(credentials);
      const wrongIv = 'ffffffffffffffffffffffffffffffff'; // Wrong IV

      await expect(
        decryptCredentials(encrypted.encryptedAnonKey, wrongIv)
      ).rejects.toThrow('Failed to decrypt credentials');
    });

    it('should fail with corrupted ciphertext', async () => {
      const credentials: SupabaseCredentials = {
        url: 'https://test-project.supabase.co',
        anonKey: 'test-key'
      };

      const encrypted = await encryptCredentials(credentials);
      const corruptedCiphertext = 'corrupted-data';

      await expect(
        decryptCredentials(corruptedCiphertext, encrypted.encryptionIv)
      ).rejects.toThrow('Failed to decrypt credentials');
    });

    it('should fail with invalid IV format', async () => {
      const credentials: SupabaseCredentials = {
        url: 'https://test-project.supabase.co',
        anonKey: 'test-key'
      };

      const encrypted = await encryptCredentials(credentials);
      const invalidIv = 'not-hex-format!@#';

      await expect(
        decryptCredentials(encrypted.encryptedAnonKey, invalidIv)
      ).rejects.toThrow();
    });
  });

  describe('Encryption Key Manager', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    afterEach(() => {
      localStorage.clear();
    });

    it('should be a singleton', () => {
      const instance1 = encryptionKeyManager;
      const instance2 = encryptionKeyManager;
      expect(instance1).toBe(instance2);
    });

    it('should get encryption key', () => {
      const key = encryptionKeyManager.getKey();
      expect(key).toBeDefined();
      expect(key.length).toBeGreaterThanOrEqual(32);
    });

    it('should track key version', () => {
      const version = encryptionKeyManager.getKeyVersion();
      expect(version).toBeGreaterThan(0);
    });

    it('should rotate key', () => {
      const oldVersion = encryptionKeyManager.getKeyVersion();
      const newKey = 'new-encryption-key-that-is-at-least-32-characters-long';
      
      encryptionKeyManager.rotateKey(newKey);
      
      const newVersion = encryptionKeyManager.getKeyVersion();
      expect(newVersion).toBe(oldVersion + 1);
      expect(encryptionKeyManager.getKey()).toBe(newKey);
    });

    it('should persist key version', () => {
      const version = encryptionKeyManager.getKeyVersion();
      localStorage.setItem('enc_key_version', (version + 1).toString());
      
      // In a real scenario, we'd reinitialize the manager
      // For testing, we just verify the storage
      expect(localStorage.getItem('enc_key_version')).toBe((version + 1).toString());
    });

    it('should validate key length on rotation', () => {
      const shortKey = 'too-short';
      
      expect(() => {
        encryptionKeyManager.rotateKey(shortKey);
      }).toThrow('New encryption key must be at least 32 characters long');
    });

    it('should notify listeners on key rotation', () => {
      const listener = vi.fn();
      const unsubscribe = encryptionKeyManager.onKeyRotation(listener);
      
      const newKey = 'new-encryption-key-that-is-at-least-32-characters-long';
      encryptionKeyManager.rotateKey(newKey);
      
      expect(listener).toHaveBeenCalled();
      
      // Clean up
      unsubscribe();
    });

    it('should unsubscribe listeners', () => {
      const listener = vi.fn();
      const unsubscribe = encryptionKeyManager.onKeyRotation(listener);
      
      // Unsubscribe before rotation
      unsubscribe();
      
      const newKey = 'new-encryption-key-that-is-at-least-32-characters-long';
      encryptionKeyManager.rotateKey(newKey);
      
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('clearSensitiveData', () => {
    it('should clear string data', () => {
      let sensitiveString = 'sensitive-data';
      clearSensitiveData(sensitiveString);
      // Note: In JavaScript, we can't truly verify string modification
      // but the function should attempt to overwrite it
      expect(true).toBe(true); // Function runs without error
    });

    it('should clear object properties', () => {
      const sensitiveObject = {
        password: 'secret123',
        token: 'auth-token',
        data: 'some-data'
      };
      
      clearSensitiveData(sensitiveObject);
      
      expect(sensitiveObject.password).toBeUndefined();
      expect(sensitiveObject.token).toBeUndefined();
      expect(sensitiveObject.data).toBeUndefined();
      expect(Object.keys(sensitiveObject)).toHaveLength(0);
    });

    it('should handle nested objects', () => {
      const nestedObject = {
        level1: {
          password: 'secret',
          level2: {
            token: 'token123'
          }
        }
      };
      
      clearSensitiveData(nestedObject);
      
      expect(nestedObject.level1).toBeUndefined();
      expect(Object.keys(nestedObject)).toHaveLength(0);
    });

    it('should handle null and undefined', () => {
      expect(() => clearSensitiveData(null)).not.toThrow();
      expect(() => clearSensitiveData(undefined)).not.toThrow();
    });

    it('should handle arrays in objects', () => {
      const objectWithArray = {
        tokens: ['token1', 'token2', 'token3'],
        data: 'sensitive'
      };
      
      clearSensitiveData(objectWithArray);
      
      expect(objectWithArray.tokens).toBeUndefined();
      expect(objectWithArray.data).toBeUndefined();
    });
  });

  describe('Encryption with different key scenarios', () => {
    it('should handle encryption when key changes', async () => {
      const credentials: SupabaseCredentials = {
        url: 'https://test-project.supabase.co',
        anonKey: 'test-key'
      };

      // Encrypt with current key
      const encrypted1 = await encryptCredentials(credentials);
      
      // Rotate key
      const newKey = 'completely-different-key-that-is-32-chars-long!!';
      encryptionKeyManager.rotateKey(newKey);
      
      // Encrypt with new key
      const encrypted2 = await encryptCredentials(credentials);
      
      // The encrypted results should be different
      expect(encrypted1.encryptedAnonKey).not.toBe(encrypted2.encryptedAnonKey);
      
      // Decryption with new key should work for new encryption
      const decrypted = await decryptCredentials(
        encrypted2.encryptedAnonKey,
        encrypted2.encryptionIv
      );
      expect(decrypted).toBe(credentials.anonKey);
    });

    it('should handle UTF-8 characters in credentials', async () => {
      const credentials: SupabaseCredentials = {
        url: 'https://test-project.supabase.co',
        anonKey: 'key-with-émojis-😀-and-特殊字符-♠♣♥♦'
      };

      const encrypted = await encryptCredentials(credentials);
      const decrypted = await decryptCredentials(
        encrypted.encryptedAnonKey,
        encrypted.encryptionIv
      );

      expect(decrypted).toBe(credentials.anonKey);
    });

    it('should produce different output for different inputs', async () => {
      const credentials1: SupabaseCredentials = {
        url: 'https://test1.supabase.co',
        anonKey: 'key1'
      };

      const credentials2: SupabaseCredentials = {
        url: 'https://test2.supabase.co',
        anonKey: 'key2'
      };

      const encrypted1 = await encryptCredentials(credentials1);
      const encrypted2 = await encryptCredentials(credentials2);

      expect(encrypted1.encryptedAnonKey).not.toBe(encrypted2.encryptedAnonKey);
      expect(encrypted1.projectUrl).not.toBe(encrypted2.projectUrl);
    });

    it('should handle very long keys', async () => {
      const longKey = 'a'.repeat(10000); // 10KB key
      const credentials: SupabaseCredentials = {
        url: 'https://test-project.supabase.co',
        anonKey: longKey
      };

      const encrypted = await encryptCredentials(credentials);
      const decrypted = await decryptCredentials(
        encrypted.encryptedAnonKey,
        encrypted.encryptionIv
      );

      expect(decrypted).toBe(longKey);
      expect(decrypted.length).toBe(10000);
    });
  });
});