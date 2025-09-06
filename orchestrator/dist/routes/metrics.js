"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const preview_metrics_1 = require("../monitoring/preview-metrics");
const router = (0, express_1.Router)();
// Prometheus format endpoint for scraping
router.get('/metrics', async (req, res) => {
    try {
        const metrics = await (0, preview_metrics_1.getMetricsAsText)();
        res.set('Content-Type', 'text/plain; version=0.0.4');
        res.send(metrics);
    }
    catch (error) {
        console.error('[Metrics] Error getting metrics:', error);
        res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
});
// JSON format endpoint for debugging
router.get('/metrics.json', async (req, res) => {
    try {
        const metrics = await (0, preview_metrics_1.getMetricsAsJson)();
        res.json(metrics);
    }
    catch (error) {
        console.error('[Metrics] Error getting metrics:', error);
        res.status(500).json({ error: 'Failed to retrieve metrics' });
    }
});
// Health check endpoint with routing info
router.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        routingType: (0, preview_metrics_1.getRoutingType)(),
        useSubdomainRouting: process.env.USE_SUBDOMAIN_ROUTING === 'true',
        domain: process.env.USE_SUBDOMAIN_ROUTING === 'true'
            ? 'preview.velocity-dev.com'
            : 'velocity-preview-containers.fly.dev',
        timestamp: Date.now(),
        uptime: process.uptime(),
    });
});
exports.default = router;
//# sourceMappingURL=metrics.js.map