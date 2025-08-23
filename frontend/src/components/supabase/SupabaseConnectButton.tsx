import React from 'react';
import { Button } from '../ui/button';
import { 
  Database,
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2,
  Link2Off,
  MessageSquare
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface SupabaseConnectButtonProps {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  isHealthy: boolean;
  onClick: () => void;
  className?: string;
  size?: 'sm' | 'default' | 'lg';
  variant?: 'default' | 'outline' | 'secondary' | 'ghost' | 'link' | 'destructive';
  disabled?: boolean;
  isShowingSupabaseManager?: boolean;
}

export function SupabaseConnectButton({
  connectionStatus,
  isHealthy,
  onClick,
  className,
  size = 'sm',
  variant = 'outline',
  disabled = false,
  isShowingSupabaseManager = false
}: SupabaseConnectButtonProps) {
  // Get status indicator
  const getStatusIndicator = () => {
    switch (connectionStatus) {
      case 'connected':
        return isHealthy ? (
          <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
        ) : (
          <AlertCircle className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
        );
      case 'connecting':
        return <Loader2 className="h-3 w-3 animate-spin text-blue-600 dark:text-blue-400" />;
      case 'error':
        return <XCircle className="h-3 w-3 text-destructive" />;
      case 'disconnected':
      default:
        return <Link2Off className="h-3 w-3 text-muted-foreground" />;
    }
  };

  // Get button text and icon based on current view
  const getButtonContent = () => {
    if (isShowingSupabaseManager) {
      // When showing Supabase manager, button should say "Back to Chat"
      return {
        icon: <MessageSquare className="h-4 w-4 flex-shrink-0" />,
        text: 'Back to Chat'
      };
    }
    
    // When showing chat, button text depends on connection status
    const text = (() => {
      switch (connectionStatus) {
        case 'connected':
          return isHealthy ? 'Connected' : 'Connected';
        case 'connecting':
          return 'Connecting...';
        case 'error':
          return 'Connect';
        case 'disconnected':
        default:
          return 'Connect';
      }
    })();
    
    return {
      icon: <Database className="h-4 w-4 flex-shrink-0" />,
      text
    };
  };

  const buttonContent = getButtonContent();
  
  return (
    <Button
      variant={isShowingSupabaseManager ? "default" : variant}
      size={size}
      onClick={onClick}
      disabled={disabled || (connectionStatus === 'connecting' && !isShowingSupabaseManager)}
      className={cn(
        "flex items-center gap-2 justify-between min-w-0",
        className
      )}
    >
      {/* Left side: Icon and Text */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        {buttonContent.icon}
        <span className="truncate">
          {buttonContent.text}
        </span>
      </div>
      
      {/* Right side: Status Indicator (only show when not showing Supabase manager) */}
      {!isShowingSupabaseManager && (
        <div className="flex-shrink-0 ml-1">
          {getStatusIndicator()}
        </div>
      )}
    </Button>
  );
}