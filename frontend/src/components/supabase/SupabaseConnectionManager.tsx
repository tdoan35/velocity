import React, { useState } from 'react';
import { SupabaseConnectForm } from './SupabaseConnectForm';
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator';
import { ConnectionTestButton } from './ConnectionTestButton';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Alert, AlertDescription } from '../ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { useProjectContext } from '../../contexts/ProjectContext';
import { useToast } from '../../hooks/use-toast';
import { 
  Database, 
  Settings, 
  Trash2, 
  Edit, 
  Shield,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Info
} from 'lucide-react';

interface SupabaseConnectionManagerProps {
  projectId: string;
  className?: string;
  showStatus?: boolean;
  allowDisconnect?: boolean;
  allowUpdate?: boolean;
}

export function SupabaseConnectionManager({
  projectId,
  className,
  showStatus = true,
  allowDisconnect = true,
  allowUpdate = true
}: SupabaseConnectionManagerProps) {
  const {
    supabaseConnection,
    connectSupabase,
    disconnectSupabase,
    updateSupabaseConnection,
    testSupabaseConnection,
    refreshSupabaseConnection,
    isBuildReady
  } = useProjectContext();

  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const { toast } = useToast();

  // Handle disconnect
  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    
    try {
      const result = await disconnectSupabase();
      
      if (result.success) {
        toast({
          title: 'Disconnected Successfully',
          description: 'Your Supabase project has been disconnected',
          duration: 5000
        });
        setShowDisconnectDialog(false);
      } else {
        toast({
          title: 'Disconnection Failed',
          description: result.error || 'Failed to disconnect Supabase project',
          variant: 'destructive',
          duration: 5000
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
        duration: 5000
      });
    } finally {
      setIsDisconnecting(false);
    }
  };

  // If not connected, show the connect form
  if (!supabaseConnection.isConnected) {
    return (
      <div className={className}>
        <SupabaseConnectForm
          projectId={projectId}
          isConnected={false}
          isConnecting={supabaseConnection.isConnecting}
          onConnect={connectSupabase}
        />
        
        {/* Build Ready Status */}
        {!isBuildReady && (
          <Alert className="mt-4">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Connect your Supabase project to enable the Build functionality
            </AlertDescription>
          </Alert>
        )}
      </div>
    );
  }

  // Connected state - show status and management options
  return (
    <div className={`space-y-4 ${className}`}>
      {/* Connection Status */}
      {showStatus && (
        <ConnectionStatusIndicator
          connectionStatus={supabaseConnection.connectionStatus}
          isHealthy={supabaseConnection.isHealthy}
          projectUrl={supabaseConnection.projectUrl}
          lastValidated={supabaseConnection.lastValidated}
          error={supabaseConnection.error}
          variant="detailed"
        />
      )}

      {/* Management Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Settings className="h-4 w-4" />
            Connection Management
          </CardTitle>
          <CardDescription>
            Manage your Supabase project connection
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Test Connection Button */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Test Connection</p>
              <p className="text-xs text-muted-foreground">
                Verify your Supabase connection is working
              </p>
            </div>
            <ConnectionTestButton
              onTest={testSupabaseConnection}
              isConnected={supabaseConnection.isConnected}
              size="sm"
            />
          </div>

          {/* Refresh Connection */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Refresh Connection</p>
              <p className="text-xs text-muted-foreground">
                Re-initialize connection from stored credentials
              </p>
            </div>
            <Button
              onClick={refreshSupabaseConnection}
              variant="outline"
              size="sm"
              disabled={supabaseConnection.isConnecting}
            >
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          {/* Update Credentials */}
          {allowUpdate && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Update Credentials</p>
                <p className="text-xs text-muted-foreground">
                  Change your project URL or anon key
                </p>
              </div>
              <Button
                onClick={() => setShowUpdateDialog(true)}
                variant="outline"
                size="sm"
              >
                <Edit className="h-4 w-4 mr-2" />
                Update
              </Button>
            </div>
          )}

          {/* Disconnect */}
          {allowDisconnect && (
            <div className="flex items-center justify-between pt-3 border-t">
              <div>
                <p className="text-sm font-medium text-destructive">
                  Disconnect Project
                </p>
                <p className="text-xs text-muted-foreground">
                  Remove the connection to your Supabase project
                </p>
              </div>
              <Button
                onClick={() => setShowDisconnectDialog(true)}
                variant="destructive"
                size="sm"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Disconnect
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Security Notice */}
      <Alert>
        <Shield className="h-4 w-4" />
        <AlertDescription className="text-sm">
          Your credentials are encrypted and stored securely. You maintain full control 
          over your Supabase project and can disconnect at any time.
        </AlertDescription>
      </Alert>

      {/* Build Ready Status */}
      {isBuildReady && (
        <Alert className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
          <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertDescription className="text-green-800 dark:text-green-200">
            Your project is ready to build! The Build button is now enabled.
          </AlertDescription>
        </Alert>
      )}

      {/* Update Dialog */}
      <Dialog open={showUpdateDialog} onOpenChange={setShowUpdateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Supabase Connection</DialogTitle>
            <DialogDescription>
              Update your Supabase project credentials. Your existing connection will be replaced.
            </DialogDescription>
          </DialogHeader>
          <SupabaseConnectForm
            projectId={projectId}
            isConnected={true}
            isConnecting={supabaseConnection.isConnecting}
            onConnect={connectSupabase}
            onUpdate={updateSupabaseConnection}
            projectUrl={supabaseConnection.projectUrl}
          />
        </DialogContent>
      </Dialog>

      {/* Disconnect Dialog */}
      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect Supabase Project</DialogTitle>
            <DialogDescription>
              Are you sure you want to disconnect your Supabase project?
            </DialogDescription>
          </DialogHeader>
          
          <Alert className="bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900">
            <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
            <AlertDescription className="text-yellow-800 dark:text-yellow-200">
              This will remove the connection to your Supabase project. Your project data 
              remains safe in your Supabase account, but you'll need to reconnect to use 
              backend features.
            </AlertDescription>
          </Alert>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDisconnectDialog(false)}
              disabled={isDisconnecting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDisconnect}
              disabled={isDisconnecting}
            >
              {isDisconnecting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Disconnecting...
                </>
              ) : (
                <>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Disconnect
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}