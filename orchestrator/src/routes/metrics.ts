import { Router, Request, Response } from 'express';
import { getMetricsAsText, getMetricsAsJson, getRoutingType } from '../monitoring/preview-metrics';

const router = Router();

// Prometheus format endpoint for scraping
router.get('/metrics', async (req: Request, res: Response) => {
  try {
    const metrics = await getMetricsAsText();
    res.set('Content-Type', 'text/plain; version=0.0.4');
    res.send(metrics);
  } catch (error) {
    console.error('[Metrics] Error getting metrics:', error);
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

// JSON format endpoint for debugging
router.get('/metrics.json', async (req: Request, res: Response) => {
  try {
    const metrics = await getMetricsAsJson();
    res.json(metrics);
  } catch (error) {
    console.error('[Metrics] Error getting metrics:', error);
    res.status(500).json({ error: 'Failed to retrieve metrics' });
  }
});

// Health check endpoint with routing info
router.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    routingType: getRoutingType(),
    useSubdomainRouting: process.env.USE_SUBDOMAIN_ROUTING === 'true',
    domain: process.env.USE_SUBDOMAIN_ROUTING === 'true' 
      ? 'preview.velocity-dev.com' 
      : 'velocity-preview-containers.fly.dev',
    timestamp: Date.now(),
    uptime: process.uptime(),
  });
});

export default router;