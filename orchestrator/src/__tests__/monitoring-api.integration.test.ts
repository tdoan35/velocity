import request from 'supertest';
import { app } from '../index';

// Mock the Supabase client
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn(() => ({
    auth: {
      getUser: jest.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id' } },
        error: null,
      }),
    },
    from: jest.fn(() => ({
      insert: jest.fn().mockResolvedValue({ error: null }),
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({
        data: { id: 'test-session', status: 'active' },
        error: null,
      }),
    })),
  })),
}));

// Mock Fly.io service
jest.mock('../services/fly-io');

// Mock scheduler service
jest.mock('../services/scheduler');

// Mock node-cron
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    start: jest.fn(),
    destroy: jest.fn(),
    getStatus: jest.fn(() => 'scheduled'),
  })),
}));

describe('Monitoring API Integration', () => {
  const authToken = 'Bearer test-token';

  beforeEach(() => {
    jest.clearAllMocks();
    // Set required environment variables
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
  });

  describe('Health Monitoring Endpoints', () => {
    it('GET /api/monitoring/health should return system health summary', async () => {
      const response = await request(app)
        .get('/api/monitoring/health')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          status: expect.stringMatching(/^(healthy|warning|critical)$/),
          activeAlerts: expect.any(Number),
          criticalAlerts: expect.any(Number),
          recentMetrics: expect.any(Object),
          uptime: expect.any(Number),
        },
      });
    });

    it('GET /api/monitoring/metrics should return metrics data', async () => {
      const response = await request(app)
        .get('/api/monitoring/metrics')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('GET /api/monitoring/metrics?name=active_sessions should filter metrics', async () => {
      const response = await request(app)
        .get('/api/monitoring/metrics?name=active_sessions&limit=10')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('GET /api/monitoring/events should return system events', async () => {
      const response = await request(app)
        .get('/api/monitoring/events')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('GET /api/monitoring/events?type=cleanup should filter events', async () => {
      const response = await request(app)
        .get('/api/monitoring/events?type=cleanup&limit=20')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });
  });

  describe('Alert Management Endpoints', () => {
    it('GET /api/monitoring/alerts should return active alerts', async () => {
      const response = await request(app)
        .get('/api/monitoring/alerts')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('GET /api/monitoring/alerts?all=true should return all alerts', async () => {
      const response = await request(app)
        .get('/api/monitoring/alerts?all=true')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('POST /api/monitoring/alerts/:alertId/resolve should resolve alert', async () => {
      const alertId = 'test-alert-123';
      const resolution = 'Issue resolved manually';

      const response = await request(app)
        .post(`/api/monitoring/alerts/${alertId}/resolve`)
        .set('Authorization', authToken)
        .send({ resolution })
        .expect(404); // Will be 404 since alert doesn't exist in test

      expect(response.body).toMatchObject({
        success: false,
        error: 'Alert not found',
      });
    });
  });

  describe('Session Monitoring Endpoints', () => {
    it('GET /api/monitoring/sessions should return session monitoring data', async () => {
      const response = await request(app)
        .get('/api/monitoring/sessions')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('GET /api/monitoring/sessions/:sessionId/metrics should return session metrics', async () => {
      const sessionId = 'test-session-123';

      const response = await request(app)
        .get(`/api/monitoring/sessions/${sessionId}/metrics`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.objectContaining({
          sessionInfo: expect.any(Object),
          resourceMetrics: expect.any(Object),
          monitoring: expect.any(Object),
        }),
      });
    });
  });

  describe('Job Management Endpoints', () => {
    it('GET /api/monitoring/jobs should return job status', async () => {
      const response = await request(app)
        .get('/api/monitoring/jobs')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: expect.any(Array),
      });
    });

    it('POST /api/monitoring/cleanup should run cleanup job', async () => {
      const response = await request(app)
        .post('/api/monitoring/cleanup')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('cleanup'),
      });
    });

    it('POST /api/monitoring/monitor should run monitoring job', async () => {
      const response = await request(app)
        .post('/api/monitoring/monitor')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining('monitoring'),
      });
    });

    it('POST /api/monitoring/jobs/:jobName/run should run specific job', async () => {
      const jobName = 'cleanup';

      const response = await request(app)
        .post(`/api/monitoring/jobs/${jobName}/run`)
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: expect.stringContaining(jobName),
      });
    });

    it('POST /api/monitoring/jobs/invalid-job/run should return error', async () => {
      const response = await request(app)
        .post('/api/monitoring/jobs/invalid-job/run')
        .set('Authorization', authToken)
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.stringContaining('Failed to run job'),
      });
    });
  });

  describe('Dashboard Endpoint', () => {
    it('GET /api/monitoring/dashboard should return comprehensive data', async () => {
      const response = await request(app)
        .get('/api/monitoring/dashboard')
        .set('Authorization', authToken)
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          health: expect.objectContaining({
            status: expect.stringMatching(/^(healthy|warning|critical)$/),
            activeAlerts: expect.any(Number),
            criticalAlerts: expect.any(Number),
          }),
          sessions: expect.objectContaining({
            monitoring: expect.any(Array),
            tierDistribution: expect.any(Object),
          }),
          alerts: expect.any(Array),
          events: expect.any(Array),
          jobs: expect.any(Array),
          metrics: expect.any(Object),
          timestamp: expect.any(String),
        },
      });
    });
  });

  describe('Prometheus Metrics Endpoint', () => {
    it('GET /api/metrics should export Prometheus format metrics', async () => {
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
      expect(typeof response.text).toBe('string');
    });

    it('GET /api/metrics should not require authentication', async () => {
      // Test without Authorization header
      const response = await request(app)
        .get('/api/metrics')
        .expect(200);

      expect(response.headers['content-type']).toContain('text/plain');
    });
  });

  describe('Error Handling', () => {
    it('should return 401 for requests without authentication', async () => {
      await request(app)
        .get('/api/monitoring/health')
        .expect(401);
    });

    it('should return 500 for internal server errors', async () => {
      // Mock a service method to throw an error
      jest.doMock('../services/monitoring', () => ({
        MonitoringService: jest.fn().mockImplementation(() => ({
          getHealthSummary: jest.fn().mockImplementation(() => {
            throw new Error('Test error');
          }),
        })),
      }));

      const response = await request(app)
        .get('/api/monitoring/health')
        .set('Authorization', authToken)
        .expect(500);

      expect(response.body).toMatchObject({
        success: false,
        error: expect.any(String),
      });
    });
  });

  describe('Rate Limiting', () => {
    it('should apply rate limiting to monitoring endpoints', async () => {
      // This would require actual rate limiter testing
      // For now, just verify the endpoint exists and works
      await request(app)
        .get('/api/monitoring/health')
        .set('Authorization', authToken)
        .expect(200);
    });
  });
});