"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateUser = authenticateUser;
exports.rateLimiter = rateLimiter;
exports.authenticateAdmin = authenticateAdmin;
exports.handleAuthError = handleAuthError;
const supabase_js_1 = require("@supabase/supabase-js");
// Rate limiting store (in-memory, should use Redis in production)
const rateLimitStore = new Map();
// Initialize Supabase client
const supabase = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
/**
 * Authentication middleware that validates Supabase JWT tokens
 */
async function authenticateUser(req, res, next) {
    try {
        const authHeader = (req.headers.authorization || req.headers.Authorization);
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({
                success: false,
                error: 'Missing or invalid authorization header'
            });
            return;
        }
        const token = authHeader.substring(7); // Remove 'Bearer ' prefix
        // Verify the JWT token with Supabase
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
            res.status(401).json({
                success: false,
                error: 'Invalid or expired token'
            });
            return;
        }
        // Add user info to request
        req.user = {
            id: user.id,
            email: user.email || '',
        };
        next();
    }
    catch (error) {
        console.error('Authentication error:', error);
        res.status(500).json({
            success: false,
            error: 'Authentication service error'
        });
    }
}
/**
 * Rate limiting middleware
 * Limits requests per IP address (should use user ID in production)
 */
function rateLimiter(req, res, next) {
    const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 15 * 60 * 1000; // 15 minutes
    const maxRequests = 100; // Maximum requests per window
    // Clean up expired entries
    for (const [ip, data] of rateLimitStore.entries()) {
        if (now > data.resetTime) {
            rateLimitStore.delete(ip);
        }
    }
    // Get or create rate limit data for this IP
    let rateLimitData = rateLimitStore.get(clientIP);
    if (!rateLimitData || now > rateLimitData.resetTime) {
        rateLimitData = {
            count: 0,
            resetTime: now + windowMs,
        };
        rateLimitStore.set(clientIP, rateLimitData);
    }
    // Check if limit exceeded
    if (rateLimitData.count >= maxRequests) {
        res.status(429).json({
            success: false,
            error: 'Rate limit exceeded',
            retryAfter: Math.ceil((rateLimitData.resetTime - now) / 1000),
        });
        return;
    }
    // Increment counter
    rateLimitData.count++;
    rateLimitStore.set(clientIP, rateLimitData);
    // Add rate limit headers
    res.set({
        'X-RateLimit-Limit': maxRequests.toString(),
        'X-RateLimit-Remaining': (maxRequests - rateLimitData.count).toString(),
        'X-RateLimit-Reset': new Date(rateLimitData.resetTime).toISOString(),
    });
    next();
}
/**
 * Admin authentication middleware (for cleanup and admin endpoints)
 */
function authenticateAdmin(req, res, next) {
    const adminToken = req.headers['x-admin-token'];
    const expectedToken = process.env.ADMIN_TOKEN;
    if (!adminToken || !expectedToken || adminToken !== expectedToken) {
        res.status(403).json({
            success: false,
            error: 'Admin access required'
        });
        return;
    }
    next();
}
/**
 * Error handling middleware for authentication errors
 */
function handleAuthError(error, req, res, next) {
    console.error('Authentication middleware error:', error);
    res.status(500).json({
        success: false,
        error: 'Internal authentication error'
    });
}
//# sourceMappingURL=auth.js.map