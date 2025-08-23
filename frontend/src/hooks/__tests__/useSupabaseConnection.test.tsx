import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useSupabaseConnection } from '../useSupabaseConnection';
import * as supabaseConnectionService from '../../services/supabaseConnection';

// Mock the supabase connection service
vi.mock('../../services/supabaseConnection', () => ({
  validateSupabaseConnection: vi.fn(),
  encryptCredentials: vi.fn(),
  storeSupabaseConnection: vi.fn(),
  getStoredConnection: vi.fn(),
  updateSupabaseConnection: vi.fn(),
  disconnectSupabaseProject: vi.fn(),
  testConnectionHealth: vi.fn(),
  createSupabaseClientFromStoredCredentials: vi.fn()
}));

describe('useSupabaseConnection', () => {
  const mockProjectId = 'test-project-123';
  const mockCredentials = {
    projectUrl: 'https://test.supabase.co',
    anonKey: 'test-anon-key'
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Clear the connection cache
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize with disconnected state when no stored connection exists', async () => {
      vi.mocked(supabaseConnectionService.getStoredConnection).mockResolvedValue(null);

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      await waitFor(() => {
        expect(result.current.connectionState.isConnecting).toBe(false);
      });

      expect(result.current.connectionState).toMatchObject({
        isConnected: false,
        isHealthy: false,
        projectUrl: null,
        connectionStatus: 'disconnected',
        error: null,
        supabaseClient: null
      });
    });

    it('should initialize with connected state when stored connection exists', async () => {
      const mockStoredConnection = {
        velocityProjectId: mockProjectId,
        projectUrl: 'https://test.supabase.co',
        encryptedAnonKey: 'encrypted',
        encryptionIv: 'iv',
        lastValidated: new Date(),
        connectionStatus: 'active' as const
      };

      const mockSupabaseClient = { auth: {}, from: vi.fn() };

      vi.mocked(supabaseConnectionService.getStoredConnection).mockResolvedValue(mockStoredConnection);
      vi.mocked(supabaseConnectionService.createSupabaseClientFromStoredCredentials).mockResolvedValue(mockSupabaseClient as any);
      vi.mocked(supabaseConnectionService.testConnectionHealth).mockResolvedValue({
        success: true,
        message: 'Connection healthy'
      });

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      await waitFor(() => {
        expect(result.current.connectionState.isConnected).toBe(true);
      });

      expect(result.current.connectionState).toMatchObject({
        isConnected: true,
        isHealthy: true,
        projectUrl: 'https://test.supabase.co',
        connectionStatus: 'connected',
        error: null,
        supabaseClient: mockSupabaseClient
      });
    });

    it('should handle initialization errors gracefully', async () => {
      vi.mocked(supabaseConnectionService.getStoredConnection).mockRejectedValue(
        new Error('Database error')
      );

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      await waitFor(() => {
        expect(result.current.connectionState.connectionStatus).toBe('error');
      });

      expect(result.current.connectionState).toMatchObject({
        isConnected: false,
        isHealthy: false,
        connectionStatus: 'error',
        error: 'Database error'
      });
    });
  });

  describe('connectSupabase', () => {
    it('should successfully connect with valid credentials', async () => {
      vi.mocked(supabaseConnectionService.validateSupabaseConnection).mockResolvedValue({
        success: true,
        message: 'Connection successful'
      });
      vi.mocked(supabaseConnectionService.encryptCredentials).mockResolvedValue({
        projectUrl: mockCredentials.projectUrl,
        encryptedAnonKey: 'encrypted',
        encryptionIv: 'iv'
      });
      vi.mocked(supabaseConnectionService.storeSupabaseConnection).mockResolvedValue({
        success: true
      });
      
      const mockSupabaseClient = { auth: {}, from: vi.fn() };
      vi.mocked(supabaseConnectionService.createSupabaseClientFromStoredCredentials).mockResolvedValue(mockSupabaseClient as any);

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      let connectResult: any;
      await act(async () => {
        connectResult = await result.current.connectSupabase(mockCredentials);
      });

      expect(connectResult).toEqual({
        success: true,
        message: 'Successfully connected to Supabase project'
      });

      expect(result.current.connectionState).toMatchObject({
        isConnected: true,
        isHealthy: true,
        projectUrl: mockCredentials.projectUrl,
        connectionStatus: 'connected',
        error: null
      });
    });

    it('should handle validation failure', async () => {
      vi.mocked(supabaseConnectionService.validateSupabaseConnection).mockResolvedValue({
        success: false,
        message: 'Invalid credentials'
      });

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      let connectResult: any;
      await act(async () => {
        connectResult = await result.current.connectSupabase(mockCredentials);
      });

      expect(connectResult).toEqual({
        success: false,
        message: 'Invalid credentials'
      });

      expect(result.current.connectionState.connectionStatus).toBe('error');
      expect(result.current.connectionState.error).toBe('Invalid credentials');
    });

    it('should handle storage failure', async () => {
      vi.mocked(supabaseConnectionService.validateSupabaseConnection).mockResolvedValue({
        success: true,
        message: 'Connection successful'
      });
      vi.mocked(supabaseConnectionService.encryptCredentials).mockResolvedValue({
        projectUrl: mockCredentials.projectUrl,
        encryptedAnonKey: 'encrypted',
        encryptionIv: 'iv'
      });
      vi.mocked(supabaseConnectionService.storeSupabaseConnection).mockResolvedValue({
        success: false,
        error: 'Storage failed'
      });

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      let connectResult: any;
      await act(async () => {
        connectResult = await result.current.connectSupabase(mockCredentials);
      });

      expect(connectResult).toEqual({
        success: false,
        message: 'Storage failed'
      });

      expect(result.current.connectionState.connectionStatus).toBe('error');
    });
  });

  describe('disconnectSupabase', () => {
    it('should successfully disconnect', async () => {
      vi.mocked(supabaseConnectionService.disconnectSupabaseProject).mockResolvedValue({
        success: true
      });

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      let disconnectResult: any;
      await act(async () => {
        disconnectResult = await result.current.disconnectSupabase();
      });

      expect(disconnectResult).toEqual({ success: true });
      expect(result.current.connectionState).toMatchObject({
        isConnected: false,
        isHealthy: false,
        projectUrl: null,
        connectionStatus: 'disconnected',
        error: null,
        supabaseClient: null
      });
    });

    it('should handle disconnection failure', async () => {
      vi.mocked(supabaseConnectionService.disconnectSupabaseProject).mockResolvedValue({
        success: false,
        error: 'Failed to disconnect'
      });

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      let disconnectResult: any;
      await act(async () => {
        disconnectResult = await result.current.disconnectSupabase();
      });

      expect(disconnectResult).toEqual({
        success: false,
        error: 'Failed to disconnect'
      });
    });
  });

  describe('updateConnection', () => {
    it('should successfully update connection', async () => {
      vi.mocked(supabaseConnectionService.updateSupabaseConnection).mockResolvedValue({
        success: true
      });
      
      const mockSupabaseClient = { auth: {}, from: vi.fn() };
      vi.mocked(supabaseConnectionService.createSupabaseClientFromStoredCredentials).mockResolvedValue(mockSupabaseClient as any);

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      const newCredentials = {
        projectUrl: 'https://new.supabase.co',
        anonKey: 'new-key'
      };

      let updateResult: any;
      await act(async () => {
        updateResult = await result.current.updateConnection(newCredentials);
      });

      expect(updateResult).toEqual({ success: true });
      expect(result.current.connectionState).toMatchObject({
        isConnected: true,
        isHealthy: true,
        projectUrl: newCredentials.projectUrl,
        connectionStatus: 'connected'
      });
    });

    it('should handle update failure', async () => {
      vi.mocked(supabaseConnectionService.updateSupabaseConnection).mockResolvedValue({
        success: false,
        error: 'Update failed'
      });

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      let updateResult: any;
      await act(async () => {
        updateResult = await result.current.updateConnection(mockCredentials);
      });

      expect(updateResult).toEqual({
        success: false,
        error: 'Update failed'
      });
      expect(result.current.connectionState.connectionStatus).toBe('error');
    });
  });

  describe('checkConnectionHealth', () => {
    it('should check health of connected project', async () => {
      // First establish a connection
      vi.mocked(supabaseConnectionService.getStoredConnection).mockResolvedValue({
        velocityProjectId: mockProjectId,
        projectUrl: 'https://test.supabase.co',
        encryptedAnonKey: 'encrypted',
        encryptionIv: 'iv',
        lastValidated: new Date(),
        connectionStatus: 'active'
      });
      
      const mockSupabaseClient = { auth: {}, from: vi.fn() };
      vi.mocked(supabaseConnectionService.createSupabaseClientFromStoredCredentials).mockResolvedValue(mockSupabaseClient as any);
      vi.mocked(supabaseConnectionService.testConnectionHealth).mockResolvedValue({
        success: true,
        message: 'Connection healthy'
      });

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      await waitFor(() => {
        expect(result.current.connectionState.isConnected).toBe(true);
      });

      let healthResult: any;
      await act(async () => {
        healthResult = await result.current.checkConnectionHealth();
      });

      expect(healthResult).toEqual({
        success: true,
        message: 'Connection healthy'
      });
      expect(result.current.connectionState.isHealthy).toBe(true);
    });

    it('should return error when not connected', async () => {
      vi.mocked(supabaseConnectionService.getStoredConnection).mockResolvedValue(null);

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      await waitFor(() => {
        expect(result.current.connectionState.isConnected).toBe(false);
      });

      let healthResult: any;
      await act(async () => {
        healthResult = await result.current.checkConnectionHealth();
      });

      expect(healthResult).toEqual({
        success: false,
        message: 'No active connection'
      });
    });
  });

  describe('refreshConnection', () => {
    it('should refresh connection from stored data', async () => {
      vi.mocked(supabaseConnectionService.getStoredConnection).mockResolvedValue(null);

      const { result } = renderHook(() => useSupabaseConnection(mockProjectId));

      await waitFor(() => {
        expect(result.current.connectionState.isConnected).toBe(false);
      });

      // Now mock a stored connection
      vi.mocked(supabaseConnectionService.getStoredConnection).mockResolvedValue({
        velocityProjectId: mockProjectId,
        projectUrl: 'https://test.supabase.co',
        encryptedAnonKey: 'encrypted',
        encryptionIv: 'iv',
        lastValidated: new Date(),
        connectionStatus: 'active'
      });
      
      const mockSupabaseClient = { auth: {}, from: vi.fn() };
      vi.mocked(supabaseConnectionService.createSupabaseClientFromStoredCredentials).mockResolvedValue(mockSupabaseClient as any);
      vi.mocked(supabaseConnectionService.testConnectionHealth).mockResolvedValue({
        success: true,
        message: 'Connection healthy'
      });

      await act(async () => {
        await result.current.refreshConnection();
      });

      expect(result.current.connectionState.isConnected).toBe(true);
    });
  });

  describe('caching', () => {
    it('should use cached state within cache duration', async () => {
      vi.mocked(supabaseConnectionService.getStoredConnection).mockResolvedValue({
        velocityProjectId: mockProjectId,
        projectUrl: 'https://test.supabase.co',
        encryptedAnonKey: 'encrypted',
        encryptionIv: 'iv',
        lastValidated: new Date(),
        connectionStatus: 'active'
      });

      const mockSupabaseClient = { auth: {}, from: vi.fn() };
      vi.mocked(supabaseConnectionService.createSupabaseClientFromStoredCredentials).mockResolvedValue(mockSupabaseClient as any);
      vi.mocked(supabaseConnectionService.testConnectionHealth).mockResolvedValue({
        success: true,
        message: 'Connection healthy'
      });

      // First render
      const { result: result1 } = renderHook(() => useSupabaseConnection(mockProjectId));
      
      await waitFor(() => {
        expect(result1.current.connectionState.isConnected).toBe(true);
      });

      // Second render with same project ID should use cache
      const { result: result2 } = renderHook(() => useSupabaseConnection(mockProjectId));

      // Should immediately have the cached state
      expect(result2.current.connectionState.isConnected).toBe(true);
      
      // Verify getStoredConnection was only called once (for first render)
      expect(supabaseConnectionService.getStoredConnection).toHaveBeenCalledTimes(1);
    });

    it('should refresh cache after duration expires', async () => {
      vi.mocked(supabaseConnectionService.getStoredConnection).mockResolvedValue({
        velocityProjectId: mockProjectId,
        projectUrl: 'https://test.supabase.co',
        encryptedAnonKey: 'encrypted',
        encryptionIv: 'iv',
        lastValidated: new Date(),
        connectionStatus: 'active'
      });

      const mockSupabaseClient = { auth: {}, from: vi.fn() };
      vi.mocked(supabaseConnectionService.createSupabaseClientFromStoredCredentials).mockResolvedValue(mockSupabaseClient as any);
      vi.mocked(supabaseConnectionService.testConnectionHealth).mockResolvedValue({
        success: true,
        message: 'Connection healthy'
      });

      // First render
      const { result: result1, unmount: unmount1 } = renderHook(() => useSupabaseConnection(mockProjectId));
      
      await waitFor(() => {
        expect(result1.current.connectionState.isConnected).toBe(true);
      });
      
      unmount1();

      // Advance time beyond cache duration (5 minutes)
      act(() => {
        vi.advanceTimersByTime(6 * 60 * 1000);
      });

      // Second render after cache expiry should fetch fresh data
      const { result: result2 } = renderHook(() => useSupabaseConnection(mockProjectId));

      await waitFor(() => {
        expect(result2.current.connectionState.isConnected).toBe(true);
      });

      // Should have been called twice (once for each render)
      expect(supabaseConnectionService.getStoredConnection).toHaveBeenCalledTimes(2);
    });
  });
});