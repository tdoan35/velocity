/**
 * Real-time Channel Manager for Preview Containers
 * 
 * Manages Supabase Realtime channels for communication between
 * frontend editors and preview containers.
 */

import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';

interface ChannelInfo {
  channel: RealtimeChannel;
  containerId: string;
  messageHandler?: (event: string, payload: any) => void;
  connectedAt: Date;
}

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

export class RealtimeChannelManager {
  private supabase: SupabaseClient;
  private activeChannels: Map<string, ChannelInfo> = new Map();
  private containerChannels: Map<string, string> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private readonly maxReconnectAttempts: number = 5;
  private readonly reconnectDelay: number = 1000; // Base delay in ms

  constructor(supabaseUrl: string, supabaseServiceKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
  }

  /**
   * Register a preview container with the realtime system
   */
  async registerContainer(projectId: string, containerId: string, containerUrl: string): Promise<RegistrationInfo> {
    try {
      console.log(`[RealtimeChannelManager] Registering container ${containerId} for project ${projectId}`);

      // Call database function to register container
      const { data, error } = await this.supabase.rpc('register_preview_container', {
        project_uuid: projectId,
        container_id_param: containerId,
        container_url_param: containerUrl
      });

      if (error) {
        throw new Error(`Failed to register container: ${error.message}`);
      }

      // Store the channel mapping
      const channelName = data.channel_name;
      this.containerChannels.set(containerId, channelName);

      console.log(`✅ Container ${containerId} registered with channel ${channelName}`);
      return data;
    } catch (error) {
      console.error(`❌ Error registering container ${containerId}:`, error);
      throw error;
    }
  }

  /**
   * Unregister a preview container
   */
  async unregisterContainer(projectId: string, containerId: string): Promise<boolean> {
    try {
      console.log(`[RealtimeChannelManager] Unregistering container ${containerId} for project ${projectId}`);

      // Disconnect from channel if active
      const channelName = this.containerChannels.get(containerId);
      if (channelName && this.activeChannels.has(channelName)) {
        await this.disconnectFromChannel(channelName);
      }

      // Call database function to unregister
      const { data, error } = await this.supabase.rpc('unregister_preview_container', {
        project_uuid: projectId,
        container_id_param: containerId
      });

      if (error) {
        console.warn(`Warning unregistering container ${containerId}: ${error.message}`);
      }

      // Clean up mappings
      this.containerChannels.delete(containerId);
      
      console.log(`✅ Container ${containerId} unregistered`);
      return true;
    } catch (error) {
      console.error(`❌ Error unregistering container ${containerId}:`, error);
      return false;
    }
  }

  /**
   * Connect to a project's realtime channel
   */
  async connectToProjectChannel(projectId: string, containerId: string, messageHandler?: (event: string, payload: any) => void): Promise<{channelName: string; status: string}> {
    const channelName = `realtime:project:${projectId}`;
    
    try {
      console.log(`[RealtimeChannelManager] Connecting to channel ${channelName} for container ${containerId}`);

      // Check if already connected
      if (this.activeChannels.has(channelName)) {
        console.log(`Channel ${channelName} already active`);
        return { channelName, status: 'already_connected' };
      }

      // Create channel with container authentication
      const channel = this.supabase.channel(channelName, {
        config: {
          presence: {
            key: `container:${containerId}`
          }
        }
      });

      // Set up message handlers
      channel
        .on('broadcast', { event: 'file:update' }, (payload) => {
          console.log(`[RealtimeChannelManager] Received file update on ${channelName}:`, payload);
          if (messageHandler) {
            messageHandler('file:update', payload);
          }
        })
        .on('broadcast', { event: 'session:update' }, (payload) => {
          console.log(`[RealtimeChannelManager] Received session update on ${channelName}:`, payload);
          if (messageHandler) {
            messageHandler('session:update', payload);
          }
        })
        .subscribe((status) => {
          console.log(`[RealtimeChannelManager] Channel ${channelName} status: ${status}`);
          
          switch (status) {
            case 'SUBSCRIBED':
              console.log(`✅ Successfully subscribed to ${channelName}`);
              this.reconnectAttempts.delete(channelName);
              break;
            case 'CHANNEL_ERROR':
            case 'TIMED_OUT':
              console.error(`❌ Channel ${channelName} error: ${status}`);
              this.scheduleReconnect(channelName, containerId, messageHandler);
              break;
            case 'CLOSED':
              console.log(`Channel ${channelName} closed`);
              this.activeChannels.delete(channelName);
              break;
          }
        });

      // Store active channel
      this.activeChannels.set(channelName, {
        channel,
        containerId,
        messageHandler,
        connectedAt: new Date()
      });

      return { channelName, status: 'connecting' };
    } catch (error) {
      console.error(`❌ Error connecting to channel ${channelName}:`, error);
      throw error;
    }
  }

  /**
   * Disconnect from a channel
   */
  async disconnectFromChannel(channelName: string): Promise<boolean> {
    try {
      const channelInfo = this.activeChannels.get(channelName);
      if (!channelInfo) {
        return true; // Already disconnected
      }

      console.log(`[RealtimeChannelManager] Disconnecting from channel ${channelName}`);
      
      await channelInfo.channel.unsubscribe();
      this.activeChannels.delete(channelName);
      
      console.log(`✅ Disconnected from channel ${channelName}`);
      return true;
    } catch (error) {
      console.error(`❌ Error disconnecting from channel ${channelName}:`, error);
      return false;
    }
  }

  /**
   * Broadcast a message to a channel
   */
  async broadcastMessage(channelName: string, event: string, payload: any): Promise<string> {
    try {
      const channelInfo = this.activeChannels.get(channelName);
      if (!channelInfo) {
        throw new Error(`Channel ${channelName} not active`);
      }

      console.log(`[RealtimeChannelManager] Broadcasting ${event} to ${channelName}`);
      
      const result = await channelInfo.channel.send({
        type: 'broadcast',
        event,
        payload
      });

      if (result !== 'ok') {
        throw new Error(`Broadcast failed: ${result}`);
      }

      return result;
    } catch (error) {
      console.error(`❌ Error broadcasting to channel ${channelName}:`, error);
      throw error;
    }
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect(channelName: string, containerId: string, messageHandler?: (event: string, payload: any) => void): void {
    const currentAttempts = this.reconnectAttempts.get(channelName) || 0;
    
    if (currentAttempts >= this.maxReconnectAttempts) {
      console.error(`❌ Max reconnection attempts reached for ${channelName}`);
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, currentAttempts);
    this.reconnectAttempts.set(channelName, currentAttempts + 1);

    console.log(`🔄 Scheduling reconnect for ${channelName} in ${delay}ms (attempt ${currentAttempts + 1}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      try {
        // Clean up old connection
        await this.disconnectFromChannel(channelName);
        
        // Extract project ID from channel name
        const projectId = channelName.split(':')[2];
        
        // Attempt reconnection
        await this.connectToProjectChannel(projectId, containerId, messageHandler);
      } catch (error) {
        console.error(`❌ Reconnection failed for ${channelName}:`, error);
        this.scheduleReconnect(channelName, containerId, messageHandler);
      }
    }, delay);
  }

  /**
   * Get status of all active channels
   */
  getChannelStatus(): ChannelStatus {
    const status: ChannelStatus = {
      activeChannels: this.activeChannels.size,
      containerChannels: this.containerChannels.size,
      channels: []
    };

    for (const [channelName, info] of this.activeChannels.entries()) {
      status.channels.push({
        channelName,
        containerId: info.containerId,
        connectedAt: info.connectedAt,
        state: info.channel.state
      });
    }

    return status;
  }

  /**
   * Clean up all connections
   */
  async cleanup() {
    console.log('[RealtimeChannelManager] Cleaning up all connections...');
    
    const disconnectPromises = [];
    for (const channelName of this.activeChannels.keys()) {
      disconnectPromises.push(this.disconnectFromChannel(channelName));
    }

    await Promise.allSettled(disconnectPromises);
    
    this.activeChannels.clear();
    this.containerChannels.clear();
    this.reconnectAttempts.clear();
    
    console.log('✅ Realtime channel manager cleanup complete');
  }
}

export default RealtimeChannelManager;