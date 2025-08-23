/**
 * Enhanced Supabase Connection Manager
 * Supports both direct credentials and OAuth2 connections
 * Replaces the original SupabaseConnectionManager with dual-method support
 */

import React, { useState } from 'react'
import { SupabaseConnectForm } from './SupabaseConnectForm'
import { ConnectionStatusIndicator } from './ConnectionStatusIndicator'
import { ConnectionTestButton } from './ConnectionTestButton'
import { ConnectionMethodSelector, type ConnectionMethod } from './ConnectionMethodSelector'
import { OAuth2ConnectionManager } from './OAuth2ConnectionManager'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Alert, AlertDescription } from '../ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { useProjectContext } from '../../contexts/ProjectContext'
import { useToast } from '../../hooks/use-toast'
import { checkOAuth2Availability } from '@/api/supabase/oauth'
import {
  Database,
  Settings,
  Trash2,
  Edit,
  Shield,
  AlertTriangle,
  Loader2,
  CheckCircle2,
  Info,
  Link2,
  ArrowLeft
} from 'lucide-react'

interface EnhancedSupabaseConnectionManagerProps {
  projectId: string
  className?: string
  showStatus?: boolean
  allowDisconnect?: boolean
  allowUpdate?: boolean
  forceMethod?: ConnectionMethod // Optional prop to force a specific method
}

export function EnhancedSupabaseConnectionManager({
  projectId,
  className,
  showStatus = true,
  allowDisconnect = true,
  allowUpdate = true,
  forceMethod
}: EnhancedSupabaseConnectionManagerProps) {
  const {
    supabaseConnection,
    connectSupabase,
    disconnectSupabase,
    updateSupabaseConnection,
    testSupabaseConnection,
    refreshSupabaseConnection,
    isBuildReady
  } = useProjectContext()

  const [selectedMethod, setSelectedMethod] = useState<ConnectionMethod | null>(forceMethod || null)
  const [showMethodSelector, setShowMethodSelector] = useState(!forceMethod && !supabaseConnection.isConnected)
  const [showUpdateDialog, setShowUpdateDialog] = useState(false)
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)
  const [isDisconnecting, setIsDisconnecting] = useState(false)
  
  const { toast } = useToast()

  // Check OAuth2 availability
  const oauth2Check = checkOAuth2Availability()
  const isOAuth2Available = oauth2Check.available

  // Handle method selection
  const handleMethodSelection = (method: ConnectionMethod) => {
    setSelectedMethod(method)
    setShowMethodSelector(false)
  }

  // Handle back to method selection
  const handleBackToMethodSelection = () => {
    if (!forceMethod) {
      setSelectedMethod(null)
      setShowMethodSelector(true)
    }
  }

  // Handle OAuth2 connection success
  const handleOAuth2ConnectionSuccess = () => {
    toast({
      title: 'Connected Successfully',
      description: 'Your Supabase project has been connected via OAuth2',
      duration: 5000
    })
    // Refresh the project context to reflect the new connection
    refreshSupabaseConnection()
  }

  // Handle OAuth2 connection error
  const handleOAuth2ConnectionError = (error: string) => {
    toast({
      title: 'Connection Failed',
      description: error,
      variant: 'destructive',
      duration: 5000
    })
  }

  // Handle disconnect
  const handleDisconnect = async () => {
    setIsDisconnecting(true)
    
    try {
      const result = await disconnectSupabase()
      
      if (result.success) {
        toast({
          title: 'Disconnected Successfully',
          description: 'Your Supabase project has been disconnected',
          duration: 5000
        })
        setShowDisconnectDialog(false)
        
        // Reset to method selection if not forced
        if (!forceMethod) {
          setSelectedMethod(null)
          setShowMethodSelector(true)
        }
      } else {
        toast({
          title: 'Disconnection Failed',
          description: result.error || 'Failed to disconnect Supabase project',
          variant: 'destructive',
          duration: 5000
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'An unexpected error occurred',
        variant: 'destructive',
        duration: 5000
      })
    } finally {
      setIsDisconnecting(false)
    }
  }

  // Get connection method info for display
  const getConnectionMethodInfo = () => {
    if (supabaseConnection.isConnected) {
      // Try to determine connection method from connection data
      // This would need to be enhanced based on how we store connection method info
      return {
        method: 'direct' as ConnectionMethod, // Default assumption for existing connections
        icon: Database,
        label: 'Direct Connection'
      }
    }
    
    if (selectedMethod === 'oauth') {
      return {
        method: 'oauth' as ConnectionMethod,
        icon: Link2,
        label: 'OAuth2 Connection'
      }
    }
    
    return {
      method: 'direct' as ConnectionMethod,
      icon: Database,
      label: 'Direct Connection'
    }
  }

  // If not connected and showing method selector
  if (!supabaseConnection.isConnected && showMethodSelector) {
    return (
      <div className={className}>
        <ConnectionMethodSelector
          selectedMethod={selectedMethod}
          onMethodChange={handleMethodSelection}
          isOAuth2Available={isOAuth2Available}
        />
      </div>
    )
  }

  // If not connected and method is selected, show appropriate connection flow
  if (!supabaseConnection.isConnected && selectedMethod) {
    if (selectedMethod === 'oauth') {
      return (
        <div className={className}>
          {!forceMethod && (
            <div className="mb-4">
              <Button variant="outline" onClick={handleBackToMethodSelection}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Change Method
              </Button>
            </div>
          )}
          
          <OAuth2ConnectionManager
            velocityProjectId={projectId}
            onConnectionSuccess={handleOAuth2ConnectionSuccess}
            onConnectionError={handleOAuth2ConnectionError}
          />
        </div>
      )
    } else {
      return (
        <div className={className}>
          {!forceMethod && (
            <div className="mb-4">
              <Button variant="outline" onClick={handleBackToMethodSelection}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Change Method
              </Button>
            </div>
          )}
          
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
      )
    }
  }

  // Connected state - show status and management options
  const connectionInfo = getConnectionMethodInfo()
  const ConnectionIcon = connectionInfo.icon

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Connection Status */}
      {showStatus && (
        <div className="space-y-2">
          {/* Connection Method Badge */}
          <div className="flex items-center gap-2 mb-2">
            <div className="w-6 h-6 rounded-full bg-green-500/10 flex items-center justify-center">
              <ConnectionIcon className="w-3 h-3 text-green-500" />
            </div>
            <span className="text-sm font-medium text-green-600">
              {connectionInfo.label}
            </span>
          </div>
          
          <ConnectionStatusIndicator
            connectionStatus={supabaseConnection.connectionStatus}
            isHealthy={supabaseConnection.isHealthy}
            projectUrl={supabaseConnection.projectUrl}
            lastValidated={supabaseConnection.lastValidated}
            error={supabaseConnection.error}
            variant="detailed"
          />
        </div>
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

          {/* Update Credentials - Only for direct connections */}
          {allowUpdate && connectionInfo.method === 'direct' && (
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

          {/* OAuth2 Connection Info */}
          {connectionInfo.method === 'oauth' && (
            <div className="p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
              <div className="flex items-start gap-2">
                <Link2 className="w-4 h-4 text-purple-600 dark:text-purple-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-purple-800 dark:text-purple-200">
                    OAuth2 Connection
                  </p>
                  <p className="text-xs text-purple-600 dark:text-purple-300">
                    This connection is managed through Supabase OAuth2. 
                    To modify permissions or disconnect, use the options below.
                  </p>
                </div>
              </div>
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
          {connectionInfo.method === 'oauth' ? (
            <>
              Your OAuth2 connection is secure and managed through Supabase's authorization system. 
              You maintain full control over your projects and can revoke access at any time.
            </>
          ) : (
            <>
              Your credentials are encrypted and stored securely. You maintain full control 
              over your Supabase project and can disconnect at any time.
            </>
          )}
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

      {/* Update Dialog - Only for direct connections */}
      {connectionInfo.method === 'direct' && (
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
      )}

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
  )
}