import React, { useEffect, useRef, useState } from 'react';
import { Card } from '../ui/card';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Smartphone, 
  Tablet, 
  Monitor, 
  RotateCw, 
  AlertCircle,
  Loader2,
  Maximize2,
  Minimize2,
  Download,
  Share2
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface SnackWebPlayerProps {
  webPlayerUrl: string | null;
  sessionId: string;
  className?: string;
  onError?: (error: Error) => void;
  onLoad?: () => void;
  onDeviceChange?: (device: DevicePreset) => void;
}

export interface DevicePreset {
  name: string;
  width: number;
  height: number;
  icon: React.ReactNode;
  userAgent?: string;
}

const DEVICE_PRESETS: DevicePreset[] = [
  {
    name: 'iPhone 14',
    width: 390,
    height: 844,
    icon: <Smartphone className="w-4 h-4" />,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
  },
  {
    name: 'iPhone SE',
    width: 375,
    height: 667,
    icon: <Smartphone className="w-4 h-4" />,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
  },
  {
    name: 'iPad',
    width: 820,
    height: 1180,
    icon: <Tablet className="w-4 h-4" />,
    userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X) AppleWebKit/605.1.15'
  },
  {
    name: 'Web',
    width: 1024,
    height: 768,
    icon: <Monitor className="w-4 h-4" />,
    userAgent: navigator.userAgent
  }
];

export function SnackWebPlayer({
  webPlayerUrl,
  sessionId,
  className,
  onError,
  onLoad,
  onDeviceChange
}: SnackWebPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [selectedDevice, setSelectedDevice] = useState<DevicePreset>(DEVICE_PRESETS[0]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isRotated, setIsRotated] = useState(false);

  // Handle device selection
  const handleDeviceChange = (device: DevicePreset) => {
    setSelectedDevice(device);
    setIsRotated(false);
    onDeviceChange?.(device);
  };

  // Handle rotation
  const handleRotate = () => {
    setIsRotated(!isRotated);
  };

  // Handle fullscreen
  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Handle iframe load
  const handleIframeLoad = () => {
    setIsLoading(false);
    setError(null);
    onLoad?.();

    // Set up message passing with iframe
    if (iframeRef.current?.contentWindow) {
      // Send initial configuration
      iframeRef.current.contentWindow.postMessage({
        type: 'SNACK_RUNTIME_INIT',
        platform: selectedDevice.name === 'Web' ? 'web' : 'ios',
        deviceName: selectedDevice.name,
      }, '*');
    }
  };

  // Handle iframe error
  const handleIframeError = () => {
    const err = new Error('Failed to load preview');
    setError(err);
    setIsLoading(false);
    onError?.(err);
  };

  // Handle messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) {
        return;
      }

      switch (event.data.type) {
        case 'SNACK_RUNTIME_ERROR':
          console.error('[SnackWebPlayer] Runtime error:', event.data.error);
          break;
        case 'SNACK_RUNTIME_LOG':
          console.log('[SnackWebPlayer] Log:', event.data.log);
          break;
        case 'SNACK_RUNTIME_READY':
          console.log('[SnackWebPlayer] Runtime ready');
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  // Handle fullscreen changes
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  if (!webPlayerUrl) {
    return (
      <Card className={cn("flex items-center justify-center p-8", className)}>
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">
            No preview URL available. Please create a session first.
          </p>
        </div>
      </Card>
    );
  }

  const deviceWidth = isRotated ? selectedDevice.height : selectedDevice.width;
  const deviceHeight = isRotated ? selectedDevice.width : selectedDevice.height;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Toolbar */}
      <div className="flex items-center justify-between p-2 border-b bg-background">
        <div className="flex items-center gap-2">
          {/* Device selector */}
          <div className="flex items-center gap-1">
            {DEVICE_PRESETS.map((device) => (
              <Button
                key={device.name}
                variant={selectedDevice.name === device.name ? "default" : "ghost"}
                size="sm"
                onClick={() => handleDeviceChange(device)}
                className="gap-2"
              >
                {device.icon}
                <span className="hidden sm:inline">{device.name}</span>
              </Button>
            ))}
          </div>

          {/* Rotate button */}
          {selectedDevice.name !== 'Web' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRotate}
              title="Rotate device"
            >
              <RotateCw className={cn("w-4 h-4", isRotated && "rotate-90")} />
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Loading indicator */}
          {isLoading && (
            <Badge variant="secondary" className="gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              Loading...
            </Badge>
          )}

          {/* Error indicator */}
          {error && (
            <Badge variant="destructive" className="gap-2">
              <AlertCircle className="w-3 h-3" />
              Error
            </Badge>
          )}

          {/* Device dimensions */}
          <Badge variant="outline" className="font-mono">
            {deviceWidth} × {deviceHeight}
          </Badge>

          {/* Fullscreen button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFullscreen}
            title={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </Button>
        </div>
      </div>

      {/* Preview container */}
      <div 
        ref={containerRef}
        className={cn(
          "flex-1 flex items-center justify-center p-4 bg-muted/20 overflow-auto",
          isFullscreen && "fixed inset-0 z-50 bg-background p-8"
        )}
      >
        <div 
          className={cn(
            "relative bg-white rounded-lg shadow-xl overflow-hidden",
            "transition-all duration-300 ease-in-out"
          )}
          style={{
            width: `${deviceWidth}px`,
            height: `${deviceHeight}px`,
          }}
        >
          {/* Device frame */}
          {selectedDevice.name !== 'Web' && (
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute inset-0 rounded-[2.5rem] ring-8 ring-black/10" />
              {/* Notch for iPhone */}
              {selectedDevice.name.includes('iPhone') && !selectedDevice.name.includes('SE') && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-7 bg-black rounded-b-2xl" />
              )}
            </div>
          )}

          {/* Iframe */}
          <iframe
            ref={iframeRef}
            src={webPlayerUrl}
            className={cn(
              "w-full h-full border-0",
              selectedDevice.name !== 'Web' && "rounded-[2rem]"
            )}
            onLoad={handleIframeLoad}
            onError={handleIframeError}
            allow="accelerometer; camera; encrypted-media; geolocation; gyroscope; magnetometer; microphone; midi; payment; usb"
            sandbox="allow-forms allow-modals allow-popups allow-presentation allow-same-origin allow-scripts"
          />

          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Loading preview...</p>
              </div>
            </div>
          )}

          {/* Error overlay */}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
              <div className="text-center p-4">
                <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-sm font-medium">Failed to load preview</p>
                <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => iframeRef.current?.contentWindow?.location.reload()}
                  className="mt-4"
                >
                  <RotateCw className="w-3 h-3 mr-2" />
                  Retry
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}