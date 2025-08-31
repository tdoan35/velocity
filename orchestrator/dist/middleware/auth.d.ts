import { Request, Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../types';
/**
 * Authentication middleware that validates Supabase JWT tokens
 */
export declare function authenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void>;
/**
 * Rate limiting middleware
 * Limits requests per IP address (should use user ID in production)
 */
export declare function rateLimiter(req: Request, res: Response, next: NextFunction): void;
/**
 * Admin authentication middleware (for cleanup and admin endpoints)
 */
export declare function authenticateAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction): void;
/**
 * Error handling middleware for authentication errors
 */
export declare function handleAuthError(error: Error, req: Request, res: Response, next: NextFunction): void;
//# sourceMappingURL=auth.d.ts.map