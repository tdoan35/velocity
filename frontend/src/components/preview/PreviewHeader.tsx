import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Smartphone, 
  Share2, 
  RefreshCw,
  Info,
  Play,
  Code
} from 'lucide-react';

interface PreviewHeaderProps {
  // Mode configuration
  mode: 'live' | 'demo';
  
  // Status dot configuration
  status: 'connecting' | 'error' | 'connected' | 'preparing' | 'idle' | 'retrying';
  
  // Action handlers
  onMobilePreview?: () => void;
  onSessionInfo?: () => void;
  onSharePreview?: () => void;
  onRefresh: () => void;
  onBuild?: () => void;
  onDemoMode?: () => void;
  
  // Build-related props (for FullStackPreviewPanel)
  showBuildButton?: boolean;
  showDemoButton?: boolean;
  isBuilding?: boolean;
  buildButtonText?: string;
  
  // State flags
  isRefreshing?: boolean;
  isStuck?: boolean;
  sessionDisabled?: boolean;
  
}

export function PreviewHeader({
  mode,
  status,
  onMobilePreview,
  onSessionInfo,
  onSharePreview,
  onRefresh,
  onBuild,
  onDemoMode,
  showBuildButton = false,
  showDemoButton = false,
  isBuilding = false,
  buildButtonText = 'Build',
  isRefreshing = false,
  isStuck = false,
  sessionDisabled = false
}: PreviewHeaderProps) {
  
  // Render status dot based on status
  const renderStatusDot = () => {
    const dotClass = "w-2 h-2 rounded-full";
    
    switch (status) {
      case 'connecting':
        return <div className={`${dotClass} bg-yellow-500 animate-pulse`} title="Connecting..." />;
      case 'retrying':
        return <div className={`${dotClass} bg-orange-500`} title="Connection Issue" />;
      case 'error':
        return <div className={`${dotClass} bg-red-500`} title="Error" />;
      case 'connected':
        return <div className={`${dotClass} bg-green-500`} title="Connected" />;
      case 'preparing':
        return <div className={`${dotClass} bg-blue-500 animate-pulse`} title="Initializing Preview" />;
      default:
        return <div className={`${dotClass} bg-gray-400`} title="Idle" />;
    }
  };

  return (
    <div className="px-4 py-1 border-b">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Smartphone className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium text-sm">
              {mode === 'live' ? 'Live Mode' : 'Demo Mode'}
            </span>
          </div>
          
          {renderStatusDot()}
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
          
          {onMobilePreview && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onMobilePreview}
              disabled={sessionDisabled}
              title="Mobile preview"
              className="h-7 px-2 bg-transparent"
            >
              <Smartphone className="w-3 h-3" />
            </Button>
          )}
          
          {onSessionInfo && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onSessionInfo}
              disabled={sessionDisabled}
              title="Session info"
              className="h-7 px-2 bg-transparent"
            >
              <Info className="w-3 h-3" />
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

          {showBuildButton && onBuild && (
            <Button
              variant="default"
              size="sm"
              onClick={onBuild}
              disabled={isBuilding}
              className="text-xs h-7 px-2"
            >
              {isBuilding ? (
                <>
                  <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                  Building...
                </>
              ) : (
                <>
                  <Play className="h-3 w-3 mr-1" />
                  {buildButtonText}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}