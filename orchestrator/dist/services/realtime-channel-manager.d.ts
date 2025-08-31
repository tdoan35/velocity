/**
 * Real-time Channel Manager for Preview Containers
 *
 * Manages Supabase Realtime channels for communication between
 * frontend editors and preview containers.
 */
interface RegistrationInfo {
    channel_name: string;
    container_id: string;
    access_token: string;
    registered_at: string;
}
interface ChannelStatus {
    activeChannels: number;
    containerChannels: number;
    channels: Array<{
        channelName: string;
        containerId: string;
        connectedAt: Date;
        state: string;
    }>;
}
export declare class RealtimeChannelManager {
    private supabase;
    private activeChannels;
    private containerChannels;
    private reconnectAttempts;
    private readonly maxReconnectAttempts;
    private readonly reconnectDelay;
    constructor(supabaseUrl: string, supabaseServiceKey: string);
    /**
     * Register a preview container with the realtime system
     */
    registerContainer(projectId: string, containerId: string, containerUrl: string): Promise<RegistrationInfo>;
    /**
     * Unregister a preview container
     */
    unregisterContainer(projectId: string, containerId: string): Promise<boolean>;
    /**
     * Connect to a project's realtime channel
     */
    connectToProjectChannel(projectId: string, containerId: string, messageHandler?: (event: string, payload: any) => void): Promise<{
        channelName: string;
        status: string;
    }>;
    /**
     * Disconnect from a channel
     */
    disconnectFromChannel(channelName: string): Promise<boolean>;
    /**
     * Broadcast a message to a channel
     */
    broadcastMessage(channelName: string, event: string, payload: any): Promise<string>;
    /**
     * Schedule reconnection with exponential backoff
     */
    private scheduleReconnect;
    /**
     * Get status of all active channels
     */
    getChannelStatus(): ChannelStatus;
    /**
     * Clean up all connections
     */
    cleanup(): Promise<void>;
}
export default RealtimeChannelManager;
//# sourceMappingURL=realtime-channel-manager.d.ts.map