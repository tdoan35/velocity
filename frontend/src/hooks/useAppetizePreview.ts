import { useState, useEffect, useCallback, useRef } from 'react';
import { useToast } from '@/components/ui/use-toast';
import { useEditorStore } from '@/stores/useEditorStore';
import { useAppStore } from '@/stores/useAppStore';
import { useHotReload } from './useHotReload';
import { supabase } from '@/lib/supabase';
import { sessionPoolService } from '@/services/sessionPoolService';

// Mock devices for demo mode
const MOCK_DEVICES: AppetizeDevice[] = [
  { id: 'iphone15pro', name: 'iPhone 15 Pro', osVersion: '17.0', deviceType: 'iphone', orientation: 'portrait', width: 393, height: 852 },
  { id: 'iphone14', name: 'iPhone 14', osVersion: '16.0', deviceType: 'iphone', orientation: 'portrait', width: 390, height: 844 },
  { id: 'ipadpro11', name: 'iPad Pro 11"', osVersion: '17.0', deviceType: 'ipad', orientation: 'portrait', width: 834, height: 1194 },
  { id: 'pixel8pro', name: 'Pixel 8 Pro', osVersion: '14', deviceType: 'android', orientation: 'portrait', width: 412, height: 892 },
  { id: 'galaxys23', name: 'Samsung Galaxy S23', osVersion: '13', deviceType: 'android', orientation: 'portrait', width: 360, height: 780 },
];

interface AppetizeDevice {
  id: string;
  name: string;
  osVersion: string;
  deviceType: 'iphone' | 'ipad' | 'android';
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
}

interface PreviewSession {
  sessionId: string;
  publicKey: string;
  pool: string;
  url: string;
  device: AppetizeDevice;
  status: 'loading' | 'ready' | 'error' | 'reconnecting';
  error?: string;
}

interface UseAppetizePreviewOptions {
  autoStart?: boolean;
  defaultDevice?: string;
  onSessionReady?: (session: PreviewSession) => void;
  onError?: (error: Error) => void;
}

export function useAppetizePreview(options: UseAppetizePreviewOptions = {}) {
  const { autoStart = true, defaultDevice = 'iphone15', onSessionReady, onError } = options;
  
  const [devices, setDevices] = useState<AppetizeDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>(defaultDevice);
  const [session, setSession] = useState<PreviewSession | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [metrics, setMetrics] = useState({
    hotReloads: 0,
    sessionDuration: 0,
    lastReloadTime: null as Date | null,
  });

  const { toast } = useToast();
  const { currentProject } = useAppStore();
  const { tabs } = useEditorStore();
  const currentProjectId = currentProject?.id;
  
  const sessionStartTime = useRef<Date | null>(null);
  
  // Use the hot reload hook for WebSocket management
  const {
    isConnected: hotReloadConnected,
    isReloading,
    connectedDevices,
    reloadCount,
    lastReloadTime,
    manualReload,
    disconnect: disconnectHotReload
  } = useHotReload({
    enabled: !!session && session.status === 'ready',
    autoReconnect: true,
    debounceMs: 500
  });

  // Fetch available devices
  useEffect(() => {
    fetchDevices();
  }, []);

  // Auto-start session when project is ready
  useEffect(() => {
    if (autoStart && currentProjectId && devices.length > 0 && !session) {
      startPreviewSession();
    }
  }, [autoStart, currentProjectId, devices.length]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (session) {
        endPreviewSession();
      }
      disconnectHotReload();
    };
  }, [session, disconnectHotReload]);

  const fetchDevices = async () => {
    try {
      // Check if we're in demo mode (no API keys configured)
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const isDemoMode = !supabaseUrl || supabaseUrl === 'your_supabase_project_url';
      
      if (isDemoMode) {
        // Return mock devices for demo
        setDevices(MOCK_DEVICES);
        return;
      }
      
      const response = await fetch(`${supabaseUrl}/functions/v1/appetize-api/devices`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
        },
      });

      if (!response.ok) throw new Error('Failed to fetch devices');

      const data = await response.json();
      setDevices(data.devices);
    } catch (error) {
      console.error('Error fetching devices:', error);
      toast({
        title: 'Error',
        description: 'Failed to load device list',
        variant: 'destructive',
      });
    }
  };

  const startPreviewSession = async () => {
    if (!currentProjectId || isLoading) return;

    setIsLoading(true);
    sessionStartTime.current = new Date();

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const isDemoMode = !supabaseUrl || supabaseUrl === 'your_supabase_project_url';
      
      if (isDemoMode) {
        // Demo mode - show mock preview
        const device = devices.find(d => d.id === selectedDevice)!;
        const mockSession: PreviewSession = {
          sessionId: 'demo-session-' + Date.now(),
          publicKey: 'demo-public-key',
          pool: 'demo-pool',
          url: '#demo-preview',
          device,
          status: 'ready',
        };
        
        setSession(mockSession);
        
        toast({
          title: 'Demo Mode',
          description: 'Preview is in demo mode. Configure API keys for live preview.',
        });
        
        if (onSessionReady) {
          onSessionReady(mockSession);
        }
        
        return;
      }
      
      // First, build the app bundle
      const bundleUrl = await buildAppBundle();

      // Check user quota first
      const hasQuota = await sessionPoolService.checkQuotaAvailable();
      if (!hasQuota) {
        throw new Error('Monthly preview quota exceeded. Upgrade to Pro for more minutes.');
      }

      // Allocate a session from the pool
      const device = devices.find(d => d.id === selectedDevice)!;
      const platform = device.deviceType === 'android' ? 'android' : 'ios';
      
      const sessionData = await sessionPoolService.allocateSession(
        currentProjectId,
        selectedDevice,
        platform,
        'high'
      );

      const newSession: PreviewSession = {
        sessionId: sessionData.sessionId,
        publicKey: sessionData.publicKey,
        pool: platform,
        url: sessionData.sessionUrl,
        device,
        status: 'loading',
      };

      setSession(newSession);

      // Load the app into the session
      await loadAppIntoSession(sessionData.sessionId, bundleUrl);

      // Update session status
      setSession(prev => prev ? { ...prev, status: 'ready' } : null);
      
      // Store session info in database for hot reload coordination
      await supabase
        .from('preview_sessions')
        .update({ 
          status: 'active',
          bundle_url: bundleUrl,
          last_activity_at: new Date().toISOString()
        })
        .eq('public_id', sessionData.sessionId);

      if (onSessionReady) {
        onSessionReady(newSession);
      }

      toast({
        title: 'Preview Ready',
        description: `${device.name} preview session started`,
      });

    } catch (error) {
      console.error('Error starting preview session:', error);
      setSession(prev => prev ? { ...prev, status: 'error', error: error instanceof Error ? error.message : 'Unknown error'} : null);
      
      if (onError) {
        onError(error instanceof Error ? error : new Error('Unknown error'));
      }

      toast({
        title: 'Preview Error',
        description: error instanceof Error ? error.message : 'Failed to start preview session',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const buildAppBundle = async (): Promise<string> => {
    // In a real implementation, this would trigger a build process
    // For now, we'll simulate it
    await new Promise(resolve => setTimeout(resolve, 2000));
    return `https://appetize.io/app-bundle/${currentProjectId}`;
  };

  const loadAppIntoSession = async (sessionId: string, bundleUrl: string) => {
    // In a real implementation, this would load the app into Appetize
    // For now, we'll simulate it
    await new Promise(resolve => setTimeout(resolve, 1000));
  };

  // Handle hot reload trigger from external system
  const handleHotReload = useCallback(async () => {
    if (!session || session.status !== 'ready') return;

    try {
      // The hot reload hook will handle the build and broadcast
      // We just need to tell Appetize to reload with the new bundle
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hot-reload-sync`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          projectId: currentProjectId,
          sessionId: session.sessionId,
          type: 'reload_request',
          payload: {
            timestamp: Date.now()
          }
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to trigger hot reload');
      }

      setMetrics(prev => ({
        ...prev,
        hotReloads: prev.hotReloads + 1,
        lastReloadTime: new Date(),
      }));

    } catch (error) {
      console.error('Hot reload error:', error);
      handlePreviewError(error);
    }
  }, [session, currentProjectId]);

  const handlePreviewError = (error: any) => {
    console.error('Preview error:', error);
    setSession(prev => prev ? { ...prev, status: 'error', error: error.message } : null);
    
    toast({
      title: 'Preview Error',
      description: error.message || 'An error occurred in the preview',
      variant: 'destructive',
    });
  };

  const endPreviewSession = async () => {
    if (!session) return;

    try {
      // Calculate session duration
      const duration = sessionStartTime.current 
        ? Math.floor((Date.now() - sessionStartTime.current.getTime()) / 1000)
        : 0;

      // Save metrics
      await fetch('/api/preview-sessions/metrics', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('supabase.auth.token')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sessionId: session.sessionId,
          projectId: currentProjectId,
          duration,
          deviceType: session.device.deviceType,
          hotReloadsCount: metrics.hotReloads,
        }),
      });

      // Release the session back to pool
      await sessionPoolService.releaseSession(session.sessionId);

      setSession(null);
      setMetrics({
        hotReloads: 0,
        sessionDuration: 0,
        lastReloadTime: null,
      });

    } catch (error) {
      console.error('Error ending preview session:', error);
    }
  };

  const switchDevice = async (deviceId: string) => {
    if (session) {
      await endPreviewSession();
    }
    setSelectedDevice(deviceId);
    if (autoStart) {
      await startPreviewSession();
    }
  };

  const rotateDevice = () => {
    if (!session) return;

    const newOrientation = session.device.orientation === 'portrait' ? 'landscape' : 'portrait';
    
    // Update device orientation
    setSession(prev => prev ? {
      ...prev,
      device: { ...prev.device, orientation: newOrientation },
    } : null);

    // Trigger reload with new orientation
    handleHotReload();
  };

  return {
    // State
    devices,
    selectedDevice,
    session,
    isLoading,
    metrics: {
      ...metrics,
      hotReloads: reloadCount,
      lastReloadTime: lastReloadTime,
    },

    // Hot reload state
    hotReload: {
      isConnected: hotReloadConnected,
      isReloading,
      connectedDevices,
      onManualReload: manualReload,
    },

    // Actions
    startPreviewSession,
    endPreviewSession,
    switchDevice,
    rotateDevice,
    triggerHotReload: handleHotReload,
  };
}