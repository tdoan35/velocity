export interface PreviewSession {
    id: string;
    userId: string;
    projectId: string;
    sessionId?: string;
    containerId?: string;
    containerUrl?: string;
    status: 'creating' | 'active' | 'ended' | 'error';
    errorMessage?: string;
    expiresAt?: Date;
    createdAt: Date;
    endedAt?: Date;
    updatedAt: Date;
}
export interface CreateSessionRequest {
    projectId: string;
    userId: string;
    deviceType?: string;
    options?: Record<string, any>;
}
export interface CreateSessionResponse {
    sessionId: string;
    containerUrl?: string;
    status: 'creating' | 'active';
}
export interface SessionStatusResponse {
    sessionId: string;
    status: 'creating' | 'active' | 'ended' | 'error';
    containerUrl?: string;
    containerId?: string;
    errorMessage?: string;
}
export interface ContainerSession {
    sessionId: string;
    containerId: string;
    containerUrl: string;
    status: 'creating' | 'active' | 'error';
    errorMessage?: string;
}
export interface FlyMachineConfig {
    image: string;
    region: string;
    size: string;
    env?: Record<string, string>;
    services?: Array<{
        ports: Array<{
            port: number;
            handlers: string[];
        }>;
        protocol: string;
        internal_port: number;
    }>;
}
import type { Request } from 'express';
export interface AuthenticatedRequest extends Request {
    user?: {
        id: string;
        email: string;
    };
}
export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
//# sourceMappingURL=index.d.ts.map