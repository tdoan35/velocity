import { useEffect, useRef, useCallback } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { toast } from 'sonner';

export interface FileUpdateEvent {
  event: 'file:update';
  payload: {
    filePath: string;
    content: string;
    timestamp: string;
  };
}

export interface PreviewRealtimeConnection {
  isConnected: boolean;
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  broadcastFileUpdate: (filePath: string, content: string) => void;
  disconnect: () => void;
  connect: () => void;
}

interface UsePreviewRealtimeOptions {
  projectId: string | null;
  onError?: (error: Error) => void;
  onConnectionChange?: (status: 'disconnected' | 'connecting' | 'connected' | 'error') => void;
}

export function usePreviewRealtime({
  projectId,
  onError,
  onConnectionChange,
}: UsePreviewRealtimeOptions): PreviewRealtimeConnection {
  const channelRef = useRef<RealtimeChannel | null>(null);
  const connectionStatusRef = useRef<'disconnected' | 'connecting' | 'connected' | 'error'>('disconnected');
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000; // 1 second

  const setConnectionStatus = useCallback((status: 'disconnected' | 'connecting' | 'connected' | 'error') => {
    connectionStatusRef.current = status;
    onConnectionChange?.(status);
  }, [onConnectionChange]);

  const disconnect = useCallback(() => {
    if (channelRef.current) {
      console.log(`[usePreviewRealtime] Disconnecting from channel for project ${projectId}`);
      channelRef.current.unsubscribe();
      channelRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    reconnectAttemptsRef.current = 0;
    setConnectionStatus('disconnected');
  }, [projectId, setConnectionStatus]);

  const connect = useCallback(() => {
    if (!projectId) {
      console.warn('[usePreviewRealtime] Cannot connect: no project ID provided');
      setConnectionStatus('error');
      return;
    }

    if (channelRef.current) {
      console.log('[usePreviewRealtime] Channel already exists, disconnecting first');
      disconnect();
    }

    console.log(`[usePreviewRealtime] Connecting to realtime channel for project ${projectId}`);
    setConnectionStatus('connecting');

    const channelName = `realtime:project:${projectId}`;
    const channel = supabase.channel(channelName);

    channel
      .on('broadcast', { event: 'file:update' }, (payload) => {
        console.log('[usePreviewRealtime] Received file update event:', payload);
        // This is primarily for debugging - the container will handle actual updates
      })
      .subscribe((status) => {
        console.log(`[usePreviewRealtime] Channel subscription status: ${status}`);
        
        switch (status) {
          case 'SUBSCRIBED':
            console.log(`[usePreviewRealtime] Successfully connected to ${channelName}`);
            setConnectionStatus('connected');
            reconnectAttemptsRef.current = 0; // Reset reconnect attempts on success
            break;
          case 'CHANNEL_ERROR':
          case 'TIMED_OUT':
            console.error(`[usePreviewRealtime] Channel error: ${status}`);
            setConnectionStatus('error');
            scheduleReconnect();
            break;
          case 'CLOSED':
            console.log('[usePreviewRealtime] Channel closed');
            setConnectionStatus('disconnected');
            if (reconnectAttemptsRef.current < maxReconnectAttempts) {
              scheduleReconnect();
            }
            break;
        }
      });

    channelRef.current = channel;
  }, [projectId, disconnect, setConnectionStatus]);

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
      console.error('[usePreviewRealtime] Max reconnection attempts reached');
      const error = new Error('Failed to establish real-time connection after multiple attempts');
      onError?.(error);
      toast.error('Preview connection lost. Please refresh to retry.');
      return;
    }

    reconnectAttemptsRef.current += 1;
    const delay = baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current - 1);
    
    console.log(`[usePreviewRealtime] Scheduling reconnect attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts} in ${delay}ms`);
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    
    reconnectTimeoutRef.current = setTimeout(() => {
      console.log(`[usePreviewRealtime] Attempting reconnect ${reconnectAttemptsRef.current}/${maxReconnectAttempts}`);
      connect();
    }, delay);
  }, [connect, onError]);

  const broadcastFileUpdate = useCallback(async (filePath: string, content: string) => {
    if (!channelRef.current || connectionStatusRef.current !== 'connected') {
      console.warn(`[usePreviewRealtime] Cannot broadcast file update: channel not connected (status: ${connectionStatusRef.current})`);
      return;
    }

    const payload: FileUpdateEvent = {
      event: 'file:update',
      payload: {
        filePath,
        content,
        timestamp: new Date().toISOString(),
      },
    };

    try {
      console.log(`[usePreviewRealtime] Broadcasting file update for ${filePath}`);
      const result = await channelRef.current.send({
        type: 'broadcast',
        event: 'file:update',
        payload: payload.payload,
      });

      if (result !== 'ok') {
        throw new Error(`Broadcast failed with result: ${result}`);
      }

      console.log(`[usePreviewRealtime] Successfully broadcasted file update for ${filePath}`);
    } catch (error) {
      console.error('[usePreviewRealtime] Error broadcasting file update:', error);
      const broadcastError = error instanceof Error ? error : new Error('Unknown broadcast error');
      onError?.(broadcastError);
      
      // Try to reconnect if broadcast fails
      if (connectionStatusRef.current === 'connected') {
        console.log('[usePreviewRealtime] Attempting to reconnect after broadcast failure');
        setConnectionStatus('error');
        scheduleReconnect();
      }
    }
  }, [onError, scheduleReconnect, setConnectionStatus]);

  // Initialize connection when projectId changes
  useEffect(() => {
    if (projectId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [projectId, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnected: connectionStatusRef.current === 'connected',
    connectionStatus: connectionStatusRef.current,
    broadcastFileUpdate,
    disconnect,
    connect,
  };
}