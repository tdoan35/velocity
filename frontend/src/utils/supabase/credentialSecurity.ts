import CryptoJS from 'crypto-js';
import { logSecurityEvent, logError } from '../logging/supabaseConnectionLogger';

// Encryption key management with rotation support
class EncryptionKeyManager {
  private static instance: EncryptionKeyManager;
  private currentKey: string | null = null;
  private keyVersion: number = 1;
  private keyRotationListeners: Set<() => void> = new Set();

  private constructor() {
    this.loadKey();
  }

  public static getInstance(): EncryptionKeyManager {
    if (!EncryptionKeyManager.instance) {
      EncryptionKeyManager.instance = new EncryptionKeyManager();
    }
    return EncryptionKeyManager.instance;
  }

  private loadKey(): void {
    const key = import.meta.env?.VITE_CREDENTIAL_ENCRYPTION_KEY;
    
    if (!key) {
      // Use console.error during initialization to avoid circular dependency
      console.error('[CredentialSecurity] No encryption key found in environment variables');
      
      // Use a development key - NEVER use this in production
      if (import.meta.env?.DEV) {
        this.currentKey = 'dev-encryption-key-do-not-use-in-production-2024';
        console.warn('[Credential Security] Using development encryption key - DO NOT USE IN PRODUCTION');
      } else {
        throw new Error('Encryption key not configured for production environment');
      }
    } else {
      // Validate key strength
      if (key.length < 32) {
        throw new Error('Encryption key must be at least 32 characters long');
      }
      this.currentKey = key;
    }
    
    // Load key version from storage if available
    const storedVersion = localStorage.getItem('enc_key_version');
    if (storedVersion) {
      this.keyVersion = parseInt(storedVersion, 10);
    }
  }

  public getKey(): string {
    if (!this.currentKey) {
      throw new Error('Encryption key not initialized');
    }
    return this.currentKey;
  }

  public getKeyVersion(): number {
    return this.keyVersion;
  }

  public rotateKey(newKey: string): void {
    if (newKey.length < 32) {
      throw new Error('New encryption key must be at least 32 characters long');
    }
    
    const oldKey = this.currentKey;
    this.currentKey = newKey;
    this.keyVersion++;
    
    // Store new version
    localStorage.setItem('enc_key_version', this.keyVersion.toString());
    
    // Notify listeners for re-encryption
    this.keyRotationListeners.forEach(listener => listener());
    
    logSecurityEvent('Encryption key rotated', undefined, { 
      keyVersion: this.keyVersion,
      timestamp: new Date().toISOString() 
    });
  }

  public onKeyRotation(listener: () => void): () => void {
    this.keyRotationListeners.add(listener);
    return () => this.keyRotationListeners.delete(listener);
  }
}

// Lazy-load singleton to avoid circular dependency during module initialization
let keyManager: EncryptionKeyManager | null = null;

// Get encryption key from manager (lazy initialization)
const getEncryptionKey = (): string => {
  if (!keyManager) {
    keyManager = EncryptionKeyManager.getInstance();
  }
  return keyManager.getKey();
};

export interface SupabaseCredentials {
  url: string;
  anonKey: string;
}

export interface EncryptedCredentials {
  projectUrl: string; // URLs are not sensitive, stored in plain text
  encryptedAnonKey: string;
  encryptionIv: string;
}

/**
 * Encrypt Supabase credentials using AES-256
 * @param credentials - The credentials to encrypt
 * @returns Encrypted credentials with IV
 */
export async function encryptCredentials(
  credentials: SupabaseCredentials
): Promise<EncryptedCredentials> {
  try {
    const encryptionKey = getEncryptionKey();
    
    // Generate a random IV for this encryption
    const iv = CryptoJS.lib.WordArray.random(16);
    
    // Encrypt the anon key
    const encrypted = CryptoJS.AES.encrypt(
      credentials.anonKey,
      CryptoJS.enc.Utf8.parse(encryptionKey),
      {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );
    
    return {
      projectUrl: credentials.url, // URLs are not sensitive
      encryptedAnonKey: encrypted.toString(),
      encryptionIv: iv.toString(CryptoJS.enc.Hex),
    };
  } catch (error) {
    console.error('[Credential Security] Encryption failed:', error);
    throw new Error('Failed to encrypt credentials');
  }
}

/**
 * Decrypt Supabase credentials
 * @param encryptedAnonKey - The encrypted anon key
 * @param encryptionIv - The IV used for encryption
 * @returns Decrypted anon key
 */
export async function decryptCredentials(
  encryptedAnonKey: string,
  encryptionIv: string
): Promise<string> {
  try {
    const encryptionKey = getEncryptionKey();
    
    // Parse the IV from hex string
    const iv = CryptoJS.enc.Hex.parse(encryptionIv);
    
    // Decrypt the anon key
    const decrypted = CryptoJS.AES.decrypt(
      encryptedAnonKey,
      CryptoJS.enc.Utf8.parse(encryptionKey),
      {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );
    
    const decryptedString = decrypted.toString(CryptoJS.enc.Utf8);
    
    if (!decryptedString) {
      throw new Error('Decryption resulted in empty string');
    }
    
    return decryptedString;
  } catch (error) {
    console.error('[Credential Security] Decryption failed:', error);
    throw new Error('Failed to decrypt credentials');
  }
}

/**
 * Hash a value for secure comparison without exposing the original
 * Useful for logging and debugging without exposing sensitive data
 */
export function hashForLogging(value: string): string {
  if (!value) return 'empty';
  
  const hash = CryptoJS.SHA256(value).toString();
  // Return first 8 characters of hash for identification
  return `${hash.substring(0, 8)}...`;
}

/**
 * Validate that a string looks like a Supabase anon key
 * This is a basic format check, not a security validation
 */
export function isValidAnonKeyFormat(anonKey: string): boolean {
  // Supabase anon keys are typically long base64 strings with dots
  // Format: header.payload.signature (JWT format)
  const jwtPattern = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/;
  return jwtPattern.test(anonKey);
}

/**
 * Validate that a URL is a valid Supabase project URL
 */
export function isValidSupabaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Check if it's a Supabase domain
    const supabasePattern = /^[a-z0-9-]+\.supabase\.co$/;
    return (
      parsed.protocol === 'https:' &&
      supabasePattern.test(parsed.hostname) &&
      !parsed.pathname || parsed.pathname === '/'
    );
  } catch {
    return false;
  }
}

/**
 * Sanitize credentials for logging
 * Never log actual credentials, only metadata
 */
export function sanitizeForLogging(credentials: Partial<SupabaseCredentials>): Record<string, string> {
  const sanitized: Record<string, string> = {};
  
  if (credentials.url) {
    // Extract project ID from URL for logging
    const match = credentials.url.match(/https:\/\/([^.]+)\.supabase\.co/);
    sanitized.projectId = match ? match[1].substring(0, 8) + '...' : 'unknown';
    sanitized.urlValid = isValidSupabaseUrl(credentials.url) ? 'valid' : 'invalid';
  }
  
  if (credentials.anonKey) {
    sanitized.keyHash = hashForLogging(credentials.anonKey);
    sanitized.keyFormat = isValidAnonKeyFormat(credentials.anonKey) ? 'valid' : 'invalid';
    sanitized.keyLength = credentials.anonKey.length.toString();
  }
  
  return sanitized;
}

/**
 * Securely compare two values in constant time
 * Prevents timing attacks when comparing sensitive values
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Generate a secure random token
 * Useful for session tokens, temporary passwords, etc.
 */
export function generateSecureToken(length: number = 32): string {
  const wordArray = CryptoJS.lib.WordArray.random(length);
  return wordArray.toString(CryptoJS.enc.Hex);
}

/**
 * Clear sensitive data from memory
 * JavaScript doesn't guarantee memory clearing, but this helps
 */
export function clearSensitiveData(data: any): void {
  if (typeof data === 'string') {
    // Overwrite string contents (best effort in JS)
    data = '0'.repeat(data.length);
  } else if (typeof data === 'object' && data !== null) {
    // Clear object properties
    for (const key in data) {
      if (data.hasOwnProperty(key)) {
        if (typeof data[key] === 'string') {
          data[key] = '0'.repeat(data[key].length);
        }
        delete data[key];
      }
    }
  }
}

/**
 * Validate credential strength and format
 */
export function validateCredentialStrength(credentials: SupabaseCredentials): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Validate URL
  if (!isValidSupabaseUrl(credentials.url)) {
    errors.push('Invalid Supabase project URL format');
  }
  
  // Validate anon key format
  if (!isValidAnonKeyFormat(credentials.anonKey)) {
    errors.push('Invalid anon key format - must be a valid JWT');
  }
  
  // Check for common mistakes
  if (credentials.anonKey.includes('service_role')) {
    errors.push('Service role key detected - please use anon key instead for security');
  }
  
  if (credentials.url.includes('localhost') || credentials.url.includes('127.0.0.1')) {
    warnings.push('Local Supabase URL detected - ensure this is intentional');
  }
  
  // Check key length (typical Supabase keys are quite long)
  if (credentials.anonKey.length < 100) {
    warnings.push('Anon key seems unusually short - please verify');
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Create a time-limited access token for temporary credential access
 */
export function createTemporaryAccessToken(
  expirationMinutes: number = 5
): { token: string; expiresAt: number } {
  const token = generateSecureToken(32);
  const expiresAt = Date.now() + (expirationMinutes * 60 * 1000);
  
  // Store token with expiration
  sessionStorage.setItem(`temp_token_${token}`, JSON.stringify({
    expiresAt,
    used: false,
  }));
  
  return { token, expiresAt };
}

/**
 * Verify a temporary access token
 */
export function verifyTemporaryAccessToken(token: string): boolean {
  const stored = sessionStorage.getItem(`temp_token_${token}`);
  if (!stored) {
    return false;
  }
  
  try {
    const { expiresAt, used } = JSON.parse(stored);
    
    if (used || Date.now() > expiresAt) {
      sessionStorage.removeItem(`temp_token_${token}`);
      return false;
    }
    
    // Mark as used
    sessionStorage.setItem(`temp_token_${token}`, JSON.stringify({
      expiresAt,
      used: true,
    }));
    
    return true;
  } catch {
    return false;
  }
}

/**
 * Export a function to get the key manager for advanced use cases
 */
export const getEncryptionKeyManager = (): EncryptionKeyManager => {
  if (!keyManager) {
    keyManager = EncryptionKeyManager.getInstance();
  }
  return keyManager;
};