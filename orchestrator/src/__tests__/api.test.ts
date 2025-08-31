import request from 'supertest';
import { app } from '../index';
import { createClient } from '@supabase/supabase-js';
import { ContainerManager } from '../services/container-manager';

// Mock dependencies
jest.mock('@supabase/supabase-js');
jest.mock('../services/container-manager');

const mockSupabase = {
  auth: {
    getUser: jest.fn(),
  },
};

const mockContainerManager = {
  createSession: jest.fn(),
  destroySession: jest.fn(),
  getSessionStatus: jest.fn(),
  cleanupExpiredSessions: jest.fn(),
};

describe('API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (createClient as jest.Mock).mockReturnValue(mockSupabase);
    (ContainerManager as jest.Mock).mockImplementation(() => mockContainerManager);
  });

  describe('Authentication', () => {
    it('should reject requests without authorization header', async () => {
      const response = await request(app)
        .post('/api/sessions/start')
        .send({ projectId: 'test-project' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'Missing or invalid authorization header',
      });
    });

    it('should reject requests with invalid token', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      });

      const response = await request(app)
        .post('/api/sessions/start')
        .set('Authorization', 'Bearer invalid-token')
        .send({ projectId: 'test-project' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({
        success: false,
        error: 'Invalid or expired token',
      });
    });

    it('should accept requests with valid token', async () => {
      const mockUser = {
        id: 'user-123',
        email: 'test@example.com',
      };

      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: mockUser },
        error: null,
      });

      mockContainerManager.createSession.mockResolvedValue({
        sessionId: 'session-123',
        containerUrl: 'https://test.fly.dev',
        status: 'active',
      });

      const response = await request(app)
        .post('/api/sessions/start')
        .set('Authorization', 'Bearer valid-token')
        .send({ projectId: 'test-project' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /api/sessions/start', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });
    });

    it('should create a new session successfully', async () => {
      const mockSession = {
        sessionId: 'session-123',
        containerUrl: 'https://test.fly.dev',
        status: 'active' as const,
      };

      mockContainerManager.createSession.mockResolvedValue(mockSession);

      const response = await request(app)
        .post('/api/sessions/start')
        .set('Authorization', 'Bearer valid-token')
        .send({
          projectId: 'project-123',
          deviceType: 'mobile',
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: mockSession,
      });

      expect(mockContainerManager.createSession).toHaveBeenCalledWith({
        projectId: 'project-123',
        userId: 'user-123',
        deviceType: 'mobile',
        options: undefined,
      });
    });

    it('should return 400 for missing projectId', async () => {
      const response = await request(app)
        .post('/api/sessions/start')
        .set('Authorization', 'Bearer valid-token')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Missing required field: projectId',
      });
    });

    it('should handle container creation errors', async () => {
      mockContainerManager.createSession.mockRejectedValue(
        new Error('Container provisioning failed')
      );

      const response = await request(app)
        .post('/api/sessions/start')
        .set('Authorization', 'Bearer valid-token')
        .send({ projectId: 'project-123' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        error: 'Container provisioning failed',
      });
    });
  });

  describe('POST /api/sessions/stop', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });
    });

    it('should stop a session successfully', async () => {
      mockContainerManager.getSessionStatus.mockResolvedValue({
        id: 'session-123',
        userId: 'user-123',
        status: 'active',
      });

      mockContainerManager.destroySession.mockResolvedValue(undefined);

      const response = await request(app)
        .post('/api/sessions/stop')
        .set('Authorization', 'Bearer valid-token')
        .send({ sessionId: 'session-123' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        message: 'Session stopped successfully',
      });

      expect(mockContainerManager.destroySession).toHaveBeenCalledWith('session-123');
    });

    it('should return 404 for non-existent session', async () => {
      mockContainerManager.getSessionStatus.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/sessions/stop')
        .set('Authorization', 'Bearer valid-token')
        .send({ sessionId: 'nonexistent' });

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'Session not found',
      });
    });

    it('should return 403 for unauthorized session access', async () => {
      mockContainerManager.getSessionStatus.mockResolvedValue({
        id: 'session-123',
        userId: 'other-user',
        status: 'active',
      });

      const response = await request(app)
        .post('/api/sessions/stop')
        .set('Authorization', 'Bearer valid-token')
        .send({ sessionId: 'session-123' });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        success: false,
        error: 'Unauthorized to stop this session',
      });
    });
  });

  describe('GET /api/sessions/:sessionId/status', () => {
    beforeEach(() => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });
    });

    it('should return session status', async () => {
      const mockSession = {
        id: 'session-123',
        userId: 'user-123',
        status: 'active',
        containerUrl: 'https://test.fly.dev',
        containerId: 'container-123',
        errorMessage: null,
      };

      mockContainerManager.getSessionStatus.mockResolvedValue(mockSession);

      const response = await request(app)
        .get('/api/sessions/session-123/status')
        .set('Authorization', 'Bearer valid-token');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          sessionId: 'session-123',
          status: 'active',
          containerUrl: 'https://test.fly.dev',
          containerId: 'container-123',
          errorMessage: null,
        },
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting', async () => {
      mockSupabase.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-123', email: 'test@example.com' } },
        error: null,
      });

      // Make multiple requests quickly to test rate limiting
      // Note: This test might be flaky due to timing, consider using a more controlled approach
      const promises = Array.from({ length: 105 }, () =>
        request(app)
          .get('/api/health')
          .set('Authorization', 'Bearer valid-token')
      );

      const responses = await Promise.all(promises);

      // Some responses should be rate limited (429)
      const rateLimitedResponses = responses.filter(res => res.status === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);

      if (rateLimitedResponses.length > 0) {
        expect(rateLimitedResponses[0].body).toEqual({
          success: false,
          error: 'Rate limit exceeded',
          retryAfter: expect.any(Number),
        });
      }
    }, 10000); // Increase timeout for this test
  });

  describe('Health Check', () => {
    it('should return health status without authentication', async () => {
      const response = await request(app).get('/api/health');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        data: {
          status: 'healthy',
          timestamp: expect.any(String),
          version: expect.any(String),
        },
      });
    });
  });

  describe('404 Handler', () => {
    it('should return 404 for non-existent endpoints', async () => {
      const response = await request(app).get('/api/nonexistent');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        error: 'Endpoint not found',
        path: '/api/nonexistent',
      });
    });
  });
});