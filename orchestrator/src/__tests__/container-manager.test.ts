import { ContainerManager } from '../services/container-manager';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

// Mock dependencies
jest.mock('@supabase/supabase-js');
jest.mock('axios');
jest.mock('uuid', () => ({
  v4: jest.fn(() => 'mock-uuid-1234'),
}));

const mockSupabase = {
  from: jest.fn(() => ({
    insert: jest.fn(),
    update: jest.fn(),
    select: jest.fn(),
    eq: jest.fn(),
    single: jest.fn(),
    lt: jest.fn(),
    in: jest.fn(),
  })),
};

const mockAxios = axios as jest.Mocked<typeof axios>;

// Mock environment variables
const originalEnv = process.env;
beforeAll(() => {
  process.env = {
    ...originalEnv,
    SUPABASE_URL: 'https://mock.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-key',
    SUPABASE_ANON_KEY: 'mock-anon-key',
    FLY_API_TOKEN: 'mock-fly-token',
    FLY_APP_NAME: 'test-app',
    PREVIEW_CONTAINER_IMAGE: 'test/container:latest',
  };
});

afterAll(() => {
  process.env = originalEnv;
});

describe('ContainerManager', () => {
  let containerManager: ContainerManager;

  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    containerManager = new ContainerManager();
  });

  describe('createSession', () => {
    it('should create a session successfully', async () => {
      // Mock database operations
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockResolvedValue({ error: null }),
        select: jest.fn(),
        eq: jest.fn(),
        single: jest.fn(),
      });

      // Mock Fly.io API responses
      mockAxios.post
        .mockResolvedValueOnce({
          data: {
            id: 'machine-123',
            name: 'preview-mock-uuid',
            state: 'started',
          },
        });

      mockAxios.get
        .mockResolvedValueOnce({
          data: { state: 'started' },
        });

      const request = {
        projectId: 'project-123',
        userId: 'user-456',
        deviceType: 'mobile',
      };

      const result = await containerManager.createSession(request);

      expect(result).toEqual({
        sessionId: 'mock-uuid-1234',
        containerId: 'preview-mock-uuid',
        containerUrl: 'https://preview-mock-uuid.test-app.fly.dev',
        status: 'active',
      });

      // Verify database operations
      expect(mockSupabase.from).toHaveBeenCalledWith('preview_sessions');
      
      // Verify Fly.io API call
      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.machines.dev/v1/apps/test-app/machines',
        expect.objectContaining({
          name: 'preview-mock-uuid',
          config: expect.objectContaining({
            image: 'test/container:latest',
            region: 'ord',
          }),
        }),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-fly-token',
          }),
        })
      );
    });

    it('should handle database errors', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ 
          error: { message: 'Database connection failed' } 
        }),
      });

      const request = {
        projectId: 'project-123',
        userId: 'user-456',
      };

      await expect(containerManager.createSession(request))
        .rejects.toThrow('Failed to create preview session: Database error: Database connection failed');
    });

    it('should handle Fly.io API errors', async () => {
      mockSupabase.from.mockReturnValue({
        insert: jest.fn().mockResolvedValue({ error: null }),
        update: jest.fn().mockResolvedValue({ error: null }),
      });

      mockAxios.post.mockRejectedValueOnce(new Error('Fly.io API error'));

      const request = {
        projectId: 'project-123',
        userId: 'user-456',
      };

      await expect(containerManager.createSession(request))
        .rejects.toThrow('Failed to create preview session');
    });
  });

  describe('destroySession', () => {
    it('should destroy a session successfully', async () => {
      // Mock session fetch
      const mockSession = {
        id: 'session-123',
        container_id: 'container-456',
        user_id: 'user-789',
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockSession,
              error: null,
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      // Mock Fly.io API responses
      mockAxios.get.mockResolvedValueOnce({
        data: [{
          id: 'machine-123',
          name: 'container-456',
        }],
      });

      mockAxios.post.mockResolvedValueOnce({ data: {} });
      mockAxios.delete.mockResolvedValueOnce({ data: {} });

      await containerManager.destroySession('session-123');

      // Verify Fly.io API calls
      expect(mockAxios.get).toHaveBeenCalledWith(
        'https://api.machines.dev/v1/apps/test-app/machines',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-fly-token',
          }),
        })
      );

      expect(mockAxios.post).toHaveBeenCalledWith(
        'https://api.machines.dev/v1/apps/test-app/machines/machine-123/stop',
        {},
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-fly-token',
          }),
        })
      );

      expect(mockAxios.delete).toHaveBeenCalledWith(
        'https://api.machines.dev/v1/apps/test-app/machines/machine-123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer mock-fly-token',
          }),
        })
      );
    });

    it('should handle session not found', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
      });

      await expect(containerManager.destroySession('nonexistent-session'))
        .rejects.toThrow('Session not found: nonexistent-session');
    });
  });

  describe('getSessionStatus', () => {
    it('should return session status', async () => {
      const mockSession = {
        id: 'session-123',
        user_id: 'user-456',
        project_id: 'project-789',
        session_id: 'session-123',
        container_id: 'container-456',
        container_url: 'https://test.fly.dev',
        status: 'active',
        error_message: null,
        expires_at: '2023-12-31T23:59:59Z',
        created_at: '2023-12-31T00:00:00Z',
        ended_at: null,
        updated_at: '2023-12-31T12:00:00Z',
      };

      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: mockSession,
              error: null,
            }),
          }),
        }),
      });

      const result = await containerManager.getSessionStatus('session-123');

      expect(result).toEqual({
        id: 'session-123',
        userId: 'user-456',
        projectId: 'project-789',
        sessionId: 'session-123',
        containerId: 'container-456',
        containerUrl: 'https://test.fly.dev',
        status: 'active',
        errorMessage: null,
        expiresAt: new Date('2023-12-31T23:59:59Z'),
        createdAt: new Date('2023-12-31T00:00:00Z'),
        endedAt: undefined,
        updatedAt: new Date('2023-12-31T12:00:00Z'),
      });
    });

    it('should return null for non-existent session', async () => {
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: null,
              error: { message: 'Not found' },
            }),
          }),
        }),
      });

      const result = await containerManager.getSessionStatus('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup expired sessions', async () => {
      const expiredSessions = [
        { id: 'session-1', container_id: 'container-1' },
        { id: 'session-2', container_id: 'container-2' },
      ];

      // Mock expired sessions query
      mockSupabase.from.mockReturnValueOnce({
        select: jest.fn().mockReturnValue({
          lt: jest.fn().mockReturnValue({
            in: jest.fn().mockResolvedValue({
              data: expiredSessions,
              error: null,
            }),
          }),
        }),
      });

      // Mock individual session cleanup
      mockSupabase.from.mockReturnValue({
        select: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            single: jest.fn().mockResolvedValue({
              data: expiredSessions[0],
              error: null,
            }),
          }),
        }),
        update: jest.fn().mockReturnValue({
          eq: jest.fn().mockResolvedValue({ error: null }),
        }),
      });

      // Mock Fly.io cleanup
      mockAxios.get.mockResolvedValue({ data: [] });

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await containerManager.cleanupExpiredSessions();

      expect(consoleSpy).toHaveBeenCalledWith('Cleaned up expired session: session-1');

      consoleSpy.mockRestore();
    });
  });
});