import { Badge } from '../ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { 
  CheckCircle2, 
  XCircle, 
  AlertCircle, 
  Loader2, 
  Database,
  Link,
  Link2Off,
  Clock,
  Globe
} from 'lucide-react';
import { format } from 'date-fns';

interface ConnectionStatusIndicatorProps {
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'error';
  isHealthy: boolean;
  projectUrl: string | null;
  lastValidated: Date | null;
  error?: string | null;
  className?: string;
  variant?: 'compact' | 'detailed';
}

export function ConnectionStatusIndicator({
  connectionStatus,
  isHealthy,
  projectUrl,
  lastValidated,
  error,
  className,
  variant = 'compact'
}: ConnectionStatusIndicatorProps) {
  // Get status icon
  const getStatusIcon = () => {
    switch (connectionStatus) {
      case 'connected':
        return isHealthy ? (
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
        ) : (
          <AlertCircle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
        );
      case 'connecting':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'disconnected':
      default:
        return <Link2Off className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Get status text
  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected':
        return isHealthy ? 'Connected' : 'Connected (Unhealthy)';
      case 'connecting':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      case 'disconnected':
      default:
        return 'Not Connected';
    }
  };

  // Get status badge variant
  const getBadgeVariant = (): 'default' | 'secondary' | 'destructive' | 'outline' => {
    switch (connectionStatus) {
      case 'connected':
        return isHealthy ? 'default' : 'secondary';
      case 'error':
        return 'destructive';
      case 'disconnected':
      case 'connecting':
      default:
        return 'outline';
    }
  };

  // Extract project reference from URL
  const getProjectRef = (url: string | null): string => {
    if (!url) return 'N/A';
    try {
      const urlObj = new URL(url);
      const subdomain = urlObj.hostname.split('.')[0];
      return subdomain;
    } catch {
      return 'Invalid URL';
    }
  };

  // Compact variant
  if (variant === 'compact') {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        {getStatusIcon()}
        <Badge variant={getBadgeVariant()} className="font-medium">
          {getStatusText()}
        </Badge>
        {connectionStatus === 'connected' && projectUrl && (
          <span className="text-sm text-muted-foreground">
            {getProjectRef(projectUrl)}
          </span>
        )}
      </div>
    );
  }

  // Detailed variant
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Database className="h-4 w-4" />
          Supabase Connection Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Connection Status */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">Status</span>
          <div className="flex items-center gap-2">
            {getStatusIcon()}
            <Badge variant={getBadgeVariant()}>{getStatusText()}</Badge>
          </div>
        </div>

        {/* Project URL */}
        {projectUrl && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Globe className="h-3 w-3" />
              Project
            </span>
            <a
              href={projectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-mono text-primary hover:underline flex items-center gap-1"
            >
              {getProjectRef(projectUrl)}
              <Link className="h-3 w-3" />
            </a>
          </div>
        )}

        {/* Health Status */}
        {connectionStatus === 'connected' && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Health</span>
            <div className="flex items-center gap-1">
              {isHealthy ? (
                <>
                  <CheckCircle2 className="h-3 w-3 text-green-600 dark:text-green-400" />
                  <span className="text-sm text-green-600 dark:text-green-400">Healthy</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3 w-3 text-yellow-600 dark:text-yellow-400" />
                  <span className="text-sm text-yellow-600 dark:text-yellow-400">Unhealthy</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Last Validated */}
        {lastValidated && connectionStatus === 'connected' && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Last Checked
            </span>
            <span className="text-sm text-muted-foreground">
              {format(lastValidated, 'MMM d, h:mm a')}
            </span>
          </div>
        )}

        {/* Error Message */}
        {error && connectionStatus === 'error' && (
          <div className="pt-2 border-t">
            <div className="flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-destructive mt-0.5" />
              <p className="text-sm text-destructive">{error}</p>
            </div>
          </div>
        )}

        {/* Disconnected Message */}
        {connectionStatus === 'disconnected' && (
          <div className="pt-2 border-t">
            <p className="text-sm text-muted-foreground">
              Connect your Supabase project to enable backend functionality
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}