"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
// Load environment variables FIRST
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const routes_1 = require("./api/routes");
const auth_1 = require("./middleware/auth");
const app = (0, express_1.default)();
exports.app = app;
const PORT = process.env.PORT || 8080;
// Security middleware
app.use((0, helmet_1.default)({
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
app.use((0, cors_1.default)({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [
        'http://localhost:3000',
        'http://localhost:5173',
        'https://*.vercel.app',
    ],
    credentials: true,
    optionsSuccessStatus: 200,
}));
// Parsing middleware
app.use(express_1.default.json({ limit: '10mb' }));
app.use(express_1.default.urlencoded({ extended: true, limit: '10mb' }));
// Logging middleware
app.use((0, morgan_1.default)('combined', {
    skip: (req, res) => {
        // Skip logging for health checks in production
        return process.env.NODE_ENV === 'production' && req.url === '/api/health';
    }
}));
// Trust proxy for accurate client IP addresses (important for rate limiting)
app.set('trust proxy', 1);
// API routes
app.use('/api', routes_1.apiRoutes);
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
app.use(auth_1.handleAuthError);
// Global error handler
app.use((error, req, res, next) => {
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
    process.exit(0);
});
process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully...');
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
});
//# sourceMappingURL=index.js.map