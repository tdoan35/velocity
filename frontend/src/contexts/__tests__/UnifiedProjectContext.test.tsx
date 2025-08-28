import React from 'react';
import { render, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { UnifiedProjectProvider, useUnifiedProjectContext, useSecurity } from '../UnifiedProjectContext';

// Mock dependencies
jest.mock('../hooks/useSupabaseConnection', () => ({
  useSupabaseConnection: jest.fn(() => ({
    connectionState: {
      isConnected: false,
      isConnecting: false,
      isHealthy: false,
      projectUrl: null,
      lastValidated: null,
      connectionStatus: 'disconnected',
      error: null,
      supabaseClient: null
    },
    connectSupabase: jest.fn(),
    disconnectSupabase: jest.fn(),
    updateConnection: jest.fn(),
    checkConnectionHealth: jest.fn(),
    refreshConnection: jest.fn(),
  }))
}));

jest.mock('../services/securityService', () => ({
  securityService: {
    getConfig: jest.fn(() => ({
      enableCodeScanning: true,
      enableDependencyChecks: true,
      enableDatabaseSecurityChecks: true,
      enableAPISecurityValidation: true,
      allowedDomains: ['localhost'],
      blockedPackages: [],
      maxFileSize: 5 * 1024 * 1024,
      maxProjectSize: 100 * 1024 * 1024,
    })),
    updateConfig: jest.fn(),
    scanCode: jest.fn(),
    validateDatabaseSecurity: jest.fn(),
    validateAPIEndpoint: jest.fn(),
    validateFileUpload: jest.fn(),
  }
}));

jest.mock('../utils/performance/navigationMetrics', () => ({
  useNavigationTracking: () => ({
    recordComponentRemount: jest.fn(),
    startNavigation: jest.fn(),
    endNavigation: jest.fn(),
    recordAPICall: jest.fn(),
    getStats: jest.fn(),
    exportMetrics: jest.fn(),
  }),
}));

jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
  },
}));

// Test wrapper with router
const TestWrapper: React.FC<{ children: React.ReactNode; projectId?: string }> = ({ children, projectId = 'test-project-123' }) => (
  <MemoryRouter initialEntries={[`/project/${projectId}`]}>
    <Route path="/project/:id">
      <UnifiedProjectProvider projectId={projectId}>
        {children}
      </UnifiedProjectProvider>
    </Route>
  </MemoryRouter>
);

describe('UnifiedProjectContext', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear localStorage before each test
    localStorage.clear();
  });

  describe('Provider Initialization', () => {
    it('should provide unified context without errors', () => {
      const { result } = renderHook(() => useUnifiedProjectContext(), {
        wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
      });

      expect(result.current).toBeDefined();
      expect(result.current.currentProject).toBeDefined();
      expect(result.current.supabaseConnection).toBeDefined();
      expect(result.current.security).toBeDefined();
    });

    it('should initialize project data when projectId is provided', async () => {
      const { result } = renderHook(() => useUnifiedProjectContext(), {
        wrapper: ({ children }) => <TestWrapper projectId="test-123">{children}</TestWrapper>,
      });

      await waitFor(() => {
        expect(result.current.currentProject).toEqual({
          id: 'test-123',
          name: 'My Project',
          description: 'A sample project',
          createdAt: expect.any(Date),
          updatedAt: expect.any(Date),
          status: 'active'
        });
      });
    });

    it('should initialize security configuration', async () => {
      const { result } = renderHook(() => useUnifiedProjectContext(), {
        wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
      });

      await waitFor(() => {
        expect(result.current.security.config).toBeDefined();
        expect(result.current.security.isSecurityEnabled).toBe(true);
        expect(result.current.security.activeThreats).toBe(0);
        expect(result.current.security.recentScans).toEqual([]);
      });
    });
  });

  describe('Context Hook', () => {
    it('should throw error when used outside provider', () => {
      const { result } = renderHook(() => useUnifiedProjectContext());
      
      expect(result.error).toEqual(
        new Error('useUnifiedProjectContext must be used within a UnifiedProjectProvider')
      );
    });

    it('should return the same context object on re-renders', () => {
      const { result, rerender } = renderHook(() => useUnifiedProjectContext(), {
        wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
      });

      const firstResult = result.current;
      rerender();
      const secondResult = result.current;

      // The context object should be memoized
      expect(firstResult).toBe(secondResult);
    });
  });

  describe('Security Integration', () => {
    it('should provide security context through useSecurity hook', () => {
      const { result } = renderHook(() => useSecurity(), {
        wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
      });

      expect(result.current.config).toBeDefined();
      expect(result.current.isSecurityEnabled).toBe(true);
      expect(result.current.activeThreats).toBe(0);
      expect(result.current.recentScans).toEqual([]);
      expect(typeof result.current.scanCode).toBe('function');
      expect(typeof result.current.enableSecurity).toBe('function');
      expect(typeof result.current.disableSecurity).toBe('function');
    });

    it('should handle security configuration updates', async () => {
      const { result } = renderHook(() => useUnifiedProjectContext(), {
        wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
      });

      const newConfig = {
        enableCodeScanning: false,
        maxFileSize: 1024 * 1024
      };

      result.current.updateSecurityConfig(newConfig);

      await waitFor(() => {
        expect(result.current.security.config).toMatchObject(newConfig);
      });
    });
  });

  describe('Supabase Integration', () => {
    it('should provide supabase connection state', () => {
      const { result } = renderHook(() => useUnifiedProjectContext(), {
        wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
      });

      expect(result.current.supabaseConnection).toEqual({
        isConnected: false,
        isConnecting: false,
        isHealthy: false,
        projectUrl: null,
        lastValidated: null,
        connectionStatus: 'disconnected',
        error: null
      });
    });

    it('should provide connection action methods', () => {
      const { result } = renderHook(() => useUnifiedProjectContext(), {
        wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
      });

      expect(typeof result.current.connectSupabase).toBe('function');
      expect(typeof result.current.disconnectSupabase).toBe('function');
      expect(typeof result.current.updateSupabaseConnection).toBe('function');
      expect(typeof result.current.testSupabaseConnection).toBe('function');
      expect(typeof result.current.refreshSupabaseConnection).toBe('function');
    });
  });

  describe('Build Readiness', () => {
    it('should calculate build readiness based on project and connection state', () => {
      const { result } = renderHook(() => useUnifiedProjectContext(), {
        wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
      });

      // Initially should be false (no connection)
      expect(result.current.isBuildReady).toBe(false);
    });
  });

  describe('Performance Tracking', () => {
    it('should record component remounts', () => {
      const recordComponentRemount = jest.fn();
      
      jest.doMock('../utils/performance/navigationMetrics', () => ({
        useNavigationTracking: () => ({
          recordComponentRemount,
          startNavigation: jest.fn(),
          endNavigation: jest.fn(),
          recordAPICall: jest.fn(),
          getStats: jest.fn(),
          exportMetrics: jest.fn(),
        }),
      }));

      render(
        <TestWrapper>
          <div>Test Content</div>
        </TestWrapper>
      );

      // Should record remount on provider mount
      expect(recordComponentRemount).toHaveBeenCalled();
    });
  });

  describe('Backward Compatibility', () => {
    it('should support legacy useProjectContext hook with warning', () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      
      const { result } = renderHook(() => {
        const { useProjectContext } = require('../UnifiedProjectContext');
        return useProjectContext();
      }, {
        wrapper: ({ children }) => <TestWrapper>{children}</TestWrapper>,
      });

      expect(result.current).toBeDefined();
      expect(consoleSpy).toHaveBeenCalledWith(
        'useProjectContext is deprecated, use useUnifiedProjectContext instead'
      );

      consoleSpy.mockRestore();
    });
  });
});