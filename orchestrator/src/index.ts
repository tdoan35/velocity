// Load environment variables FIRST
import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { apiRoutes } from './api/routes';
import { handleAuthError } from './middleware/auth';
import { SchedulerService } from './services/scheduler';
import { setSchedulerService } from './api/monitoring-controller';
import metricsRoutes from './routes/metrics';

const app = express();
const PORT = process.env.PORT || 8080;

// Initialize scheduler service
const schedulerService = new SchedulerService();
setSchedulerService(schedulerService);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || [
    'http://localhost:3000',
    'http://localhost:5173',
    'https://*.vercel.app',
  ],
  credentials: true,
  optionsSuccessStatus: 200,
}));

// Parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
app.use(morgan('combined', {
  skip: (req, res) => {
    // Skip logging for health checks in production
    return process.env.NODE_ENV === 'production' && req.url === '/api/health';
  }
}));

// Trust proxy for accurate client IP addresses (important for rate limiting)
app.set('trust proxy', 1);

// API routes
app.use('/api', apiRoutes);

// Metrics routes (not behind /api for Prometheus convention)
app.use(metricsRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Velocity Orchestrator Service',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl,
  });
});

// Error handling middleware
app.use(handleAuthError);

// Global error handler
app.use((error: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && {
      details: error.message,
      stack: error.stack,
    }),
  });
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  schedulerService.stopJobs();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  schedulerService.stopJobs();
  process.exit(0);
});

// Unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Velocity Orchestrator Service running on port ${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔐 Authentication: ${process.env.SUPABASE_URL ? 'Enabled' : 'Disabled'}`);
  console.log(`🛩️  Fly.io Integration: ${process.env.FLY_API_TOKEN ? 'Enabled' : 'Disabled'}`);
  
  // Start scheduled jobs
  schedulerService.startJobs();
  console.log(`⏰ Scheduled jobs started for cleanup and monitoring`);
});

export { app };