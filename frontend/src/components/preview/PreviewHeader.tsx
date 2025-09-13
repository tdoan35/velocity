import { Button } from '../ui/button';
import { 
  Smartphone, 
  Share2, 
  RefreshCw,
  Play,
  Code,
  Square,
  Monitor,
  Tablet,
  ExternalLink
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

interface PreviewHeaderProps {
  // Mode configuration
  mode: 'live' | 'demo';
  
  // Status dot configuration
  status: 'connecting' | 'error' | 'connected' | 'preparing' | 'idle' | 'retrying';
  
  // Device selection
  selectedDevice?: 'mobile' | 'tablet' | 'desktop';
  onDeviceChange?: (device: 'mobile' | 'tablet' | 'desktop') => void;
  
  // Preview state
  isPreviewRunning?: boolean;
  onStartPreview?: () => void;
  onStopPreview?: () => void;
  
  // Action handlers
  onOpenInNewWindow?: () => void;
  onSharePreview?: () => void;
  onRefresh: () => void;
  onDemoMode?: () => void;
  
  // Demo mode button
  showDemoButton?: boolean;
  
  // State flags
  isRefreshing?: boolean;
  isStuck?: boolean;
  sessionDisabled?: boolean;
  
}

export function PreviewHeader({
  mode,
  selectedDevice = 'mobile',
  onDeviceChange,
  isPreviewRunning = false,
  onStartPreview,
  onStopPreview,
  onOpenInNewWindow,
  onSharePreview,
  onRefresh,
  onDemoMode,
  showDemoButton = false,
  isRefreshing = false,
  isStuck = false,
  sessionDisabled = false
}: PreviewHeaderProps) {
  const getDeviceIcon = () => {
    switch (selectedDevice) {
      case 'tablet':
        return <Tablet className="h-4 w-4" />;
      case 'desktop':
        return <Monitor className="h-4 w-4" />;
      default:
        return <Smartphone className="h-4 w-4" />;
    }
  };

  return (
    <div className="px-4 py-1 border-b border-gray-300 dark:border-gray-700/50">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {onDeviceChange ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 bg-transparent"
                  >
                    {getDeviceIcon()}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuItem onClick={() => onDeviceChange('mobile')}>
                    <Smartphone className="h-4 w-4 mr-2" />
                    Mobile
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDeviceChange('tablet')}>
                    <Tablet className="h-4 w-4 mr-2" />
                    Tablet
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDeviceChange('desktop')}>
                    <Monitor className="h-4 w-4 mr-2" />
                    Desktop
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              getDeviceIcon()
            )}
            <span className="font-medium text-sm">
              {mode === 'live' ? 'Live Mode' : 'Demo Mode'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isStuck && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRefresh}
              title="Retry connection"
              className="h-7 px-2 bg-transparent"
            >
              <RefreshCw className="w-3 h-3 mr-2" />
              Retry
            </Button>
          )}
          
          {onOpenInNewWindow && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onOpenInNewWindow}
              disabled={sessionDisabled}
              title="Open in new window"
              className="h-7 px-2 bg-transparent"
            >
              <ExternalLink className="w-3 h-3" />
            </Button>
          )}
          
          {onSharePreview && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSharePreview}
              disabled={sessionDisabled}
              title="Share preview"
              className="h-7 px-2 bg-transparent"
            >
              <Share2 className="w-3 h-3" />
            </Button>
          )}
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={isRefreshing}
            title="Restart preview"
            className="h-7 px-2 bg-transparent"
          >
            <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
          </Button>

          {showDemoButton && onDemoMode && (
            <Button
              variant="outline"
              size="sm"
              onClick={onDemoMode}
              className="text-xs h-7 px-2 bg-transparent"
            >
              <Code className="h-3 w-3 mr-1" />
              Demo Mode
            </Button>
          )}

          {(onStartPreview || onStopPreview) && (
            <Button
              variant="default"
              size="sm"
              onClick={isPreviewRunning ? onStopPreview : onStartPreview}
              disabled={!onStartPreview && !onStopPreview}
              className="text-xs h-7 px-2"
            >
              {isPreviewRunning ? (
                <>
                  <Square className="h-3 w-3 mr-1" />
                  Stop
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 mr-1" />
                  Start
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}