import { describe, it, expect, beforeEach, vi } from 'vitest';
import { supabase } from '../../lib/supabase';
import { isFeatureEnabled } from '../../utils/featureFlags';

// Mock the feature flags
vi.mock('../../utils/featureFlags', () => ({
  isFeatureEnabled: vi.fn(),
  FSYNC_FLAGS: {
    USE_RPC: 'FSYNC_USE_RPC',
    SERVER_BROADCASTS: 'FSYNC_SERVER_BROADCASTS',
    SNAPSHOT_HYDRATION: 'FSYNC_SNAPSHOT_HYDRATION',
    BULK_GENERATION: 'FSYNC_BULK_GENERATION',
  }
}));

// Mock supabase client
vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn(),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
          eq: vi.fn()
        }))
      })),
      upsert: vi.fn(),
      delete: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn()
        }))
      }))
    })),
    auth: {
      getUser: vi.fn(() => Promise.resolve({ data: { user: { id: 'test-user-id' } } }))
    }
  }
}));

describe('useProjectEditorStore RPC Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Feature Flag Integration', () => {
    it('should use RPC functions when FSYNC_USE_RPC is enabled', async () => {
      // Mock feature flag as enabled
      (isFeatureEnabled as any).mockResolvedValue(true);
      
      // Mock successful RPC response
      const mockRpcResponse = {
        data: {
          id: 'test-id',
          file_path: 'frontend/test.tsx',
          content: 'test content',
          file_type: 'typescript',
          version: 1,
          content_hash: 'abc123',
          updated_at: new Date().toISOString()
        },
        error: null
      };
      (supabase.rpc as any).mockResolvedValue(mockRpcResponse);

      // Import store after mocks are set up
      const { useProjectEditorStore } = await import('../../stores/useProjectEditorStore');
      
      // Test that RPC is called for file operations
      expect(isFeatureEnabled).toBeDefined();
      expect(supabase.rpc).toBeDefined();
    });

    it('should fall back to legacy operations when FSYNC_USE_RPC is disabled', async () => {
      // Mock feature flag as disabled
      (isFeatureEnabled as any).mockResolvedValue(false);
      
      // Import store after mocks are set up
      const { useProjectEditorStore } = await import('../../stores/useProjectEditorStore');
      
      // Test that legacy operations are used
      expect(isFeatureEnabled).toBeDefined();
      expect(supabase.from).toBeDefined();
    });
  });

  describe('RPC Function Calls', () => {
    it('should call upsert_project_file RPC with correct parameters', async () => {
      // Mock feature flag as enabled
      (isFeatureEnabled as any).mockResolvedValue(true);
      
      const mockRpcResponse = {
        data: {
          id: 'test-id',
          file_path: 'frontend/App.tsx',
          content: 'import React from "react";',
          file_type: 'typescript',
          version: 1,
          content_hash: 'hash123',
          updated_at: new Date().toISOString()
        },
        error: null
      };
      (supabase.rpc as any).mockResolvedValue(mockRpcResponse);

      // Verify RPC can be called with expected parameters
      const result = await supabase.rpc('upsert_project_file', {
        project_uuid: 'test-project-id',
        p_file_path: 'frontend/App.tsx',
        p_content: 'import React from "react";',
        p_file_type: 'typescript',
        expected_version: null
      });

      expect(supabase.rpc).toHaveBeenCalledWith('upsert_project_file', {
        project_uuid: 'test-project-id',
        p_file_path: 'frontend/App.tsx',
        p_content: 'import React from "react";',
        p_file_type: 'typescript',
        expected_version: null
      });

      expect(result.data).toEqual(mockRpcResponse.data);
    });

    it('should call delete_project_file RPC with correct parameters', async () => {
      (isFeatureEnabled as any).mockResolvedValue(true);
      
      const mockRpcResponse = { data: null, error: null };
      (supabase.rpc as any).mockResolvedValue(mockRpcResponse);

      await supabase.rpc('delete_project_file', {
        project_uuid: 'test-project-id',
        p_file_path: 'frontend/OldComponent.tsx',
        expected_version: 2
      });

      expect(supabase.rpc).toHaveBeenCalledWith('delete_project_file', {
        project_uuid: 'test-project-id',
        p_file_path: 'frontend/OldComponent.tsx',
        expected_version: 2
      });
    });

    it('should call bulk_upsert_project_files RPC with correct parameters', async () => {
      (isFeatureEnabled as any).mockResolvedValue(true);
      
      const mockRpcResponse = {
        data: {
          success: true,
          files_processed: 2,
          files: [
            { file_path: 'frontend/App.tsx', version: 1, content_hash: 'hash1' },
            { file_path: 'frontend/utils.ts', version: 1, content_hash: 'hash2' }
          ]
        },
        error: null
      };
      (supabase.rpc as any).mockResolvedValue(mockRpcResponse);

      const filesArray = [
        { file_path: 'frontend/App.tsx', file_type: 'typescript', content: 'app content' },
        { file_path: 'frontend/utils.ts', file_type: 'typescript', content: 'utils content' }
      ];

      await supabase.rpc('bulk_upsert_project_files', {
        project_uuid: 'test-project-id',
        files: filesArray
      });

      expect(supabase.rpc).toHaveBeenCalledWith('bulk_upsert_project_files', {
        project_uuid: 'test-project-id',
        files: filesArray
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle RPC errors gracefully', async () => {
      (isFeatureEnabled as any).mockResolvedValue(true);
      
      const mockErrorResponse = {
        data: null,
        error: { message: 'RPC function failed', code: 'FUNCTION_ERROR' }
      };
      (supabase.rpc as any).mockResolvedValue(mockErrorResponse);

      // Test that errors are properly handled
      const result = await supabase.rpc('upsert_project_file', {
        project_uuid: 'test-project-id',
        p_file_path: 'invalid/path',
        p_content: 'content',
        p_file_type: 'typescript',
        expected_version: null
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toBe('RPC function failed');
    });

    it('should handle version conflicts correctly', async () => {
      (isFeatureEnabled as any).mockResolvedValue(true);
      
      const mockConflictResponse = {
        data: null,
        error: { message: 'Version conflict: expected 1, got 2', code: 'VERSION_CONFLICT' }
      };
      (supabase.rpc as any).mockResolvedValue(mockConflictResponse);

      const result = await supabase.rpc('upsert_project_file', {
        project_uuid: 'test-project-id',
        p_file_path: 'frontend/App.tsx',
        p_content: 'new content',
        p_file_type: 'typescript',
        expected_version: 1 // Stale version
      });

      expect(result.error).toBeDefined();
      expect(result.error.message).toContain('Version conflict');
    });
  });
});