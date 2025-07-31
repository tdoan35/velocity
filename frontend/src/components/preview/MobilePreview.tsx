import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAppetizePreview } from '@/hooks/useAppetizePreview';
import { 
  Smartphone, 
  Tablet, 
  RotateCw, 
  RefreshCw, 
  Share2, 
  Download,
  Maximize2,
  Minimize2,
  Wifi,
  WifiOff,
  Loader2,
  AlertCircle,
  Clock,
  Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { PreviewHelp } from './PreviewHelp';

interface MobilePreviewProps {
  className?: string;
  onShare?: () => void;
}

export function MobilePreview({ className, onShare }: MobilePreviewProps) {
  const {
    devices,
    selectedDevice,
    session,
    isLoading,
    metrics,
    startPreviewSession,
    endPreviewSession,
    switchDevice,
    rotateDevice,
    triggerHotReload,
  } = useAppetizePreview();

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected'>('connected');

  // Group devices by type
  const deviceGroups = devices.reduce((acc, device) => {
    const type = device.deviceType === 'android' ? 'android' : 
                 device.deviceType === 'ipad' ? 'ipad' : 'iphone';
    if (!acc[type]) acc[type] = [];
    acc[type].push(device);
    return acc;
  }, {} as Record<string, typeof devices>);

  const currentDevice = devices.find(d => d.id === selectedDevice);

  // Handle fullscreen
  const toggleFullscreen = () => {
    if (!iframeRef.current) return;

    if (!isFullscreen) {
      iframeRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    setIsFullscreen(!isFullscreen);
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className={cn("flex flex-col h-full", className)}>
      {/* Header Controls */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          {/* Device Selector */}
          <Select value={selectedDevice} onValueChange={switchDevice}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Select device" />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(deviceGroups).map(([type, devices]) => (
                <div key={type}>
                  <div className="px-2 py-1 text-sm font-semibold text-muted-foreground">
                    {type === 'iphone' ? 'iPhone' : 
                     type === 'ipad' ? 'iPad' : 'Android'}
                  </div>
                  {devices.map(device => (
                    <SelectItem key={device.id} value={device.id}>
                      <div className="flex items-center gap-2">
                        {device.deviceType === 'android' ? 
                          <Smartphone className="w-4 h-4" /> : 
                          device.deviceType === 'ipad' ? 
                          <Tablet className="w-4 h-4" /> : 
                          <Smartphone className="w-4 h-4" />
                        }
                        {device.name}
                      </div>
                    </SelectItem>
                  ))}
                </div>
              ))}
            </SelectContent>
          </Select>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={rotateDevice}
              disabled={!session || session.status !== 'ready'}
              title="Rotate device"
            >
              <RotateCw className="w-4 h-4" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={triggerHotReload}
              disabled={!session || session.status !== 'ready'}
              title="Force reload"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={toggleFullscreen}
              disabled={!session || session.status !== 'ready'}
              title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            >
              {isFullscreen ? 
                <Minimize2 className="w-4 h-4" /> : 
                <Maximize2 className="w-4 h-4" />
              }
            </Button>

            <PreviewHelp 
              context={session?.status === 'error' ? 'error' : 'controls'}
              errorCode={session?.status === 'error' ? session.error : undefined}
            />

            {onShare && (
              <Button
                variant="outline"
                size="icon"
                onClick={onShare}
                disabled={!session || session.status !== 'ready'}
                title="Share preview"
              >
                <Share2 className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Status Indicators */}
        <div className="flex items-center gap-4">
          {/* Connection Status */}
          <div className="flex items-center gap-2 text-sm">
            {connectionStatus === 'connected' ? (
              <>
                <Wifi className="w-4 h-4 text-green-500" />
                <span className="text-muted-foreground">Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-500" />
                <span className="text-muted-foreground">Disconnected</span>
              </>
            )}
          </div>

          {/* Metrics */}
          {session && metrics.sessionDuration > 0 && (
            <>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                {formatDuration(Math.floor(metrics.sessionDuration / 1000))}
              </div>
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Zap className="w-4 h-4" />
                {metrics.hotReloads} reloads
              </div>
            </>
          )}

          {/* Session Control */}
          {!session ? (
            <Button
              onClick={startPreviewSession}
              disabled={isLoading}
              size="sm"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Starting...
                </>
              ) : (
                'Start Preview'
              )}
            </Button>
          ) : (
            <Button
              onClick={endPreviewSession}
              variant="outline"
              size="sm"
            >
              End Session
            </Button>
          )}
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex-1 relative bg-background">
        {!session ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Smartphone className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Preview Session</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start a preview session to see your app in action
              </p>
              <Button onClick={startPreviewSession} disabled={isLoading}>
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  'Start Preview'
                )}
              </Button>
            </div>
          </div>
        ) : session.status === 'loading' ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Loader2 className="w-16 h-16 mx-auto mb-4 animate-spin text-primary" />
              <h3 className="text-lg font-semibold mb-2">Loading Preview</h3>
              <p className="text-sm text-muted-foreground">
                Setting up your {currentDevice?.name} preview...
              </p>
            </div>
          </div>
        ) : session.status === 'error' ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <AlertCircle className="w-16 h-16 mx-auto mb-4 text-destructive" />
              <h3 className="text-lg font-semibold mb-2">Preview Error</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {session.error || 'Failed to load preview'}
              </p>
              <Button onClick={startPreviewSession} variant="outline">
                Try Again
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full p-8">
            <div 
              className="relative"
              style={{
                width: currentDevice?.orientation === 'landscape' ? 
                  `${currentDevice.height * 0.75}px` : 
                  `${currentDevice && currentDevice.width * 0.75}px`,
                height: currentDevice?.orientation === 'landscape' ? 
                  `${currentDevice.width * 0.75}px` : 
                  `${currentDevice && currentDevice.height * 0.75}px`,
              }}
            >
              {/* Device Frame */}
              <div className="absolute inset-0 rounded-[2.5rem] bg-gray-900 shadow-2xl">
                {/* Screen */}
                <div className="absolute inset-[3px] rounded-[2.3rem] overflow-hidden bg-black">
                  {session.url === '#demo-preview' ? (
                    // Demo mode preview
                    <div className="w-full h-full bg-white flex items-center justify-center p-8">
                      <div className="text-center">
                        <Smartphone className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                        <h3 className="text-lg font-semibold text-gray-900 mb-2">Demo Preview</h3>
                        <p className="text-sm text-gray-600 mb-4">
                          This is a demo preview showing the device frame.
                        </p>
                        <p className="text-xs text-gray-500">
                          Configure API keys to see live app preview
                        </p>
                      </div>
                    </div>
                  ) : (
                    <iframe
                      ref={iframeRef}
                      src={session.url}
                      className="w-full h-full"
                      title="Mobile Preview"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    />
                  )}
                </div>
                
                {/* Notch (for iPhones) */}
                {currentDevice?.deviceType === 'iphone' && (
                  <div className="absolute top-[3px] left-1/2 transform -translate-x-1/2 w-[150px] h-[25px] bg-gray-900 rounded-b-[1rem]" />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Status Bar */}
      {session && session.status === 'ready' && (
        <div className="flex items-center justify-between px-4 py-2 border-t text-sm">
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">
              {currentDevice?.name} • {currentDevice?.osVersion}
            </span>
            {metrics.lastReloadTime && (
              <span className="text-muted-foreground">
                Last reload: {metrics.lastReloadTime.toLocaleTimeString()}
              </span>
            )}
          </div>
          
          {session.pool && (
            <div className="flex items-center gap-2">
              <Zap className="w-3 h-3 text-yellow-500" />
              <span className="text-xs text-muted-foreground">
                Instant preview (from pool)
              </span>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}