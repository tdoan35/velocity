import React from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProjectProvider, useProjectContext } from '../ProjectContext';
import * as useSupabaseConnectionModule from '../../hooks/useSupabaseConnection';

// Mock the useSupabaseConnection hook
vi.mock('../../hooks/useSupabaseConnection', () => ({
  useSupabaseConnection: vi.fn()
}));

describe('ProjectContext', () => {
  const mockProjectId = 'test-project-123';
  const mockCredentials = {
    projectUrl: 'https://test.supabase.co',
    anonKey: 'test-anon-key'
  };

  const mockConnectionState = {
    isConnected: false,
    isConnecting: false,
    isHealthy: false,
    projectUrl: null,
    lastValidated: null,
    connectionStatus: 'disconnected' as const,
    error: null,
    supabaseClient: null
  };

  const mockSupabaseHook = {
    connectionState: mockConnectionState,
    connectSupabase: vi.fn(),
    disconnectSupabase: vi.fn(),
    updateConnection: vi.fn(),
    checkConnectionHealth: vi.fn(),
    refreshConnection: vi.fn()
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useSupabaseConnectionModule.useSupabaseConnection).mockReturnValue(mockSupabaseHook);
  });

  describe('initialization', () => {
    it('should throw error when used outside of provider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      expect(() => {
        renderHook(() => useProjectContext());
      }).toThrow('useProjectContext must be used within a ProjectProvider');
      
      consoleError.mockRestore();
    });

    it('should provide default values when no project is selected', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      expect(result.current.currentProject).toBeNull();
      expect(result.current.supabaseConnection).toEqual({
        isConnected: false,
        isConnecting: false,
        isHealthy: false,
        projectUrl: null,
        lastValidated: null,
        connectionStatus: 'disconnected',
        error: null
      });
      expect(result.current.isBuildReady).toBe(false);
    });

    it('should initialize with project when projectId is provided', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider projectId={mockProjectId}>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.currentProject).not.toBeNull();
      });

      expect(result.current.currentProject).toMatchObject({
        id: mockProjectId,
        name: 'My Project',
        status: 'active'
      });
      expect(useSupabaseConnectionModule.useSupabaseConnection).toHaveBeenCalledWith(mockProjectId);
    });
  });

  describe('Supabase connection integration', () => {
    it('should expose connection state from useSupabaseConnection hook', () => {
      const connectedState = {
        ...mockConnectionState,
        isConnected: true,
        isHealthy: true,
        projectUrl: 'https://test.supabase.co',
        connectionStatus: 'connected' as const
      };

      vi.mocked(useSupabaseConnectionModule.useSupabaseConnection).mockReturnValue({
        ...mockSupabaseHook,
        connectionState: connectedState
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider projectId={mockProjectId}>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      expect(result.current.supabaseConnection).toEqual({
        isConnected: true,
        isConnecting: false,
        isHealthy: true,
        projectUrl: 'https://test.supabase.co',
        lastValidated: null,
        connectionStatus: 'connected',
        error: null
      });
    });

    it('should set isBuildReady when project exists and Supabase is connected', async () => {
      const connectedState = {
        ...mockConnectionState,
        isConnected: true,
        isHealthy: true,
        connectionStatus: 'connected' as const
      };

      vi.mocked(useSupabaseConnectionModule.useSupabaseConnection).mockReturnValue({
        ...mockSupabaseHook,
        connectionState: connectedState
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider projectId={mockProjectId}>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.currentProject).not.toBeNull();
      });

      expect(result.current.isBuildReady).toBe(true);
    });

    it('should not set isBuildReady when Supabase is not healthy', async () => {
      const unhealthyState = {
        ...mockConnectionState,
        isConnected: true,
        isHealthy: false,
        connectionStatus: 'error' as const,
        error: 'Connection unhealthy'
      };

      vi.mocked(useSupabaseConnectionModule.useSupabaseConnection).mockReturnValue({
        ...mockSupabaseHook,
        connectionState: unhealthyState
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider projectId={mockProjectId}>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.currentProject).not.toBeNull();
      });

      expect(result.current.isBuildReady).toBe(false);
    });
  });

  describe('connection actions', () => {
    it('should call connectSupabase from hook', async () => {
      mockSupabaseHook.connectSupabase.mockResolvedValue({
        success: true,
        message: 'Connected'
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider projectId={mockProjectId}>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      const connectResult = await result.current.connectSupabase(mockCredentials);

      expect(mockSupabaseHook.connectSupabase).toHaveBeenCalledWith(mockCredentials);
      expect(connectResult).toEqual({
        success: true,
        message: 'Connected'
      });
    });

    it('should return error when connecting without project', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      const connectResult = await result.current.connectSupabase(mockCredentials);

      expect(connectResult).toEqual({
        success: false,
        message: 'No project selected'
      });
      expect(mockSupabaseHook.connectSupabase).not.toHaveBeenCalled();
    });

    it('should call disconnectSupabase from hook', async () => {
      mockSupabaseHook.disconnectSupabase.mockResolvedValue({
        success: true
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider projectId={mockProjectId}>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      const disconnectResult = await result.current.disconnectSupabase();

      expect(mockSupabaseHook.disconnectSupabase).toHaveBeenCalled();
      expect(disconnectResult).toEqual({ success: true });
    });

    it('should call updateSupabaseConnection from hook', async () => {
      mockSupabaseHook.updateConnection.mockResolvedValue({
        success: true
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider projectId={mockProjectId}>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      const updateResult = await result.current.updateSupabaseConnection(mockCredentials);

      expect(mockSupabaseHook.updateConnection).toHaveBeenCalledWith(mockCredentials);
      expect(updateResult).toEqual({ success: true });
    });

    it('should call testSupabaseConnection from hook', async () => {
      mockSupabaseHook.checkConnectionHealth.mockResolvedValue({
        success: true,
        message: 'Healthy'
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider projectId={mockProjectId}>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      const testResult = await result.current.testSupabaseConnection();

      expect(mockSupabaseHook.checkConnectionHealth).toHaveBeenCalled();
      expect(testResult).toEqual({
        success: true,
        message: 'Healthy'
      });
    });

    it('should call refreshSupabaseConnection from hook', async () => {
      mockSupabaseHook.refreshConnection.mockResolvedValue();

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider projectId={mockProjectId}>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      await result.current.refreshSupabaseConnection();

      expect(mockSupabaseHook.refreshConnection).toHaveBeenCalled();
    });

    it('should not call refresh when no project is selected', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      await result.current.refreshSupabaseConnection();

      expect(mockSupabaseHook.refreshConnection).not.toHaveBeenCalled();
    });
  });

  describe('setCurrentProject', () => {
    it('should update current project', () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      const newProject = {
        id: 'new-project',
        name: 'New Project',
        createdAt: new Date(),
        updatedAt: new Date(),
        status: 'active' as const
      };

      act(() => {
        result.current.setCurrentProject(newProject);
      });

      expect(result.current.currentProject).toEqual(newProject);
    });

    it('should clear current project when set to null', async () => {
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ProjectProvider projectId={mockProjectId}>{children}</ProjectProvider>
      );

      const { result } = renderHook(() => useProjectContext(), { wrapper });

      await waitFor(() => {
        expect(result.current.currentProject).not.toBeNull();
      });

      act(() => {
        result.current.setCurrentProject(null);
      });

      expect(result.current.currentProject).toBeNull();
    });
  });
});