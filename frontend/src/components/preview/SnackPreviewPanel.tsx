import { useEffect, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { 
  Monitor, 
  Smartphone, 
  Download, 
  Share2, 
  RefreshCw,
  Save,
  AlertCircle,
  CheckCircle,
  Code2,
  Package
} from 'lucide-react';
import { useSnackSession } from '../../hooks/useSnackSession';
import { SnackWebPlayer } from './SnackWebPlayer';
import { QRCode } from '../QRCode';
import { SharePreviewDialog } from './SharePreviewDialog';
import { cn } from '../../lib/utils';
import { useToast } from '../../hooks/use-toast';

interface SnackPreviewPanelProps {
  sessionId: string;
  userId?: string;
  projectId?: string;
  files?: Record<string, { content: string; type: string; lastModified: Date; path: string }>;
  className?: string;
  onSessionReady?: (session: any) => void;
}

export function SnackPreviewPanel({
  sessionId,
  userId,
  projectId,
  files,
  className,
  onSessionReady
}: SnackPreviewPanelProps) {
  const [activeTab, setActiveTab] = useState('web');
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const { toast } = useToast();

  // Convert frontend files to Snack format
  const convertFilesToSnackFormat = (files?: Record<string, { content: string; type: string; lastModified: Date; path: string }>) => {
    if (!files || Object.keys(files).length === 0) {
      // Return default files if no files provided
      return {
        'App.js': {
          type: 'CODE' as const,
          contents: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Welcome to Velocity!</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  text: {
    fontSize: 20,
    fontWeight: 'bold',
  },
});`
        }
      };
    }

    // Convert project files to Snack format
    const snackFiles: Record<string, { type: 'CODE'; contents: string }> = {};
    
    Object.entries(files).forEach(([path, file]) => {
      // Remove 'frontend/' prefix and convert to appropriate filename
      let snackPath = path.replace(/^frontend\//, '');
      
      // Convert .tsx to .js for Snack compatibility
      if (snackPath.endsWith('.tsx')) {
        snackPath = snackPath.replace('.tsx', '.js');
      } else if (snackPath.endsWith('.ts')) {
        snackPath = snackPath.replace('.ts', '.js');
      }
      
      // Skip non-code files like package.json for now
      if (snackPath === 'package.json') {
        return;
      }
      
      snackFiles[snackPath] = {
        type: 'CODE' as const,
        contents: file.content
      };
    });

    return snackFiles;
  };

  // Convert files to Snack format first
  const snackFiles = convertFilesToSnackFormat(files);
  console.log('[SnackPreviewPanel] Converted files for Snack:', snackFiles);

  const {
    session,
    isLoading,
    error,
    snack,
    webPreviewUrl,
    webPreviewRef,
    qrCodeUrl,
    createSession,
    saveSnapshot,
    getDownloadUrl,
    destroySession
  } = useSnackSession({
    sessionId,
    userId,
    projectId,
    autoCreate: true,
    initialOptions: {
      name: 'Velocity Preview',
      description: 'Live preview of your React Native app',
      sdkVersion: '52.0.0',
      files: snackFiles,
    }
  });

  // Notify parent when session is ready
  useEffect(() => {
    if (session && onSessionReady) {
      onSessionReady(session);
    }
  }, [session, onSessionReady]);

  // Update files when they change
  useEffect(() => {
    if (session && files && Object.keys(files).length > 0) {
      const convertedFiles = convertFilesToSnackFormat(files);
      console.log('[SnackPreviewPanel] Files changed, updating Snack:', convertedFiles);
      
      // Update files in the existing session
      if (session.snack && typeof session.snack.updateFiles === 'function') {
        try {
          const updateResult = session.snack.updateFiles(convertedFiles);
          // Check if the result is a promise before calling catch
          if (updateResult !== undefined && updateResult !== null && typeof updateResult === 'object') {
            const maybePromise = updateResult as any;
            if ('catch' in maybePromise && typeof maybePromise.catch === 'function') {
              maybePromise.catch((error: Error) => {
                console.error('[SnackPreviewPanel] Failed to update files:', error);
              });
            }
          }
        } catch (error) {
          console.error('[SnackPreviewPanel] Failed to update files:', error);
        }
      }
    }
  }, [files, session]);

  // Handle download
  const handleDownload = async () => {
    try {
      const url = await getDownloadUrl();
      if (url) {
        window.open(url, '_blank');
        toast({
          title: 'Download started',
          description: 'Your project is being downloaded.',
        });
      }
    } catch (error) {
      toast({
        title: 'Download failed',
        description: 'Failed to generate download link.',
        variant: 'destructive',
      });
    }
  };

  // Handle refresh
  const handleRefresh = async () => {
    await destroySession();
    await createSession();
  };

  // Status indicator
  const renderStatus = () => {
    if (isLoading) {
      return (
        <Badge variant="secondary" className="gap-1">
          <RefreshCw className="w-3 h-3 animate-spin" />
          Initializing...
        </Badge>
      );
    }

    if (error) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="w-3 h-3" />
          Error
        </Badge>
      );
    }

    if (session) {
      return (
        <Badge variant="default" className="gap-1">
          <CheckCircle className="w-3 h-3" />
          Connected
        </Badge>
      );
    }

    return null;
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-3">
          <h3 className="font-semibold">Live Preview</h3>
          {renderStatus()}
        </div>
        
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={saveSnapshot}
            disabled={!session}
            title="Save snapshot"
          >
            <Save className="w-4 h-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDownload}
            disabled={!session}
            title="Download project"
          >
            <Download className="w-4 h-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsShareDialogOpen(true)}
            disabled={!session}
            title="Share preview"
          >
            <Share2 className="w-4 h-4" />
          </Button>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={handleRefresh}
            title="Restart preview"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Preview tabs */}
      <Tabs 
        value={activeTab} 
        onValueChange={setActiveTab}
        className="flex-1 flex flex-col"
      >
        <TabsList className="mx-4 mt-4">
          <TabsTrigger value="web" className="gap-2">
            <Monitor className="w-4 h-4" />
            Web Preview
          </TabsTrigger>
          <TabsTrigger value="mobile" className="gap-2">
            <Smartphone className="w-4 h-4" />
            Mobile Preview
          </TabsTrigger>
          <TabsTrigger value="info" className="gap-2">
            <Code2 className="w-4 h-4" />
            Session Info
          </TabsTrigger>
        </TabsList>

        {/* Web preview */}
        <TabsContent value="web" className="flex-1 p-4">
          <SnackWebPlayer
            snack={snack}
            webPreviewRef={webPreviewRef}
            webPreviewUrl={webPreviewUrl}
            sessionId={sessionId}
            className="h-full"
            onError={(error) => {
              toast({
                title: 'Preview error',
                description: error.message,
                variant: 'destructive',
              });
            }}
          />
        </TabsContent>

        {/* Mobile preview */}
        <TabsContent value="mobile" className="flex-1 p-4">
          <Card className="h-full flex flex-col items-center justify-center p-8">
            {qrCodeUrl ? (
              <div className="text-center max-w-md">
                <h4 className="text-lg font-semibold mb-2">
                  Scan with Expo Go
                </h4>
                <p className="text-sm text-muted-foreground mb-6">
                  Scan this QR code with the Expo Go app on your iOS or Android device
                </p>
                
                <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
                  <QRCode value={qrCodeUrl} size={200} />
                </div>
                
                <div className="flex flex-col gap-3">
                  <a
                    href="https://expo.dev/client"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary hover:underline"
                  >
                    Don't have Expo Go? Download it here →
                  </a>
                  
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Badge variant="outline" className="font-mono">
                      {qrCodeUrl}
                    </Badge>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">
                  No QR code available. Please wait for the session to initialize.
                </p>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Session info */}
        <TabsContent value="info" className="flex-1 p-4">
          <Card className="h-full p-6 overflow-auto">
            <h4 className="text-lg font-semibold mb-4">Session Information</h4>
            
            <div className="space-y-4">
              <div>
                <h5 className="text-sm font-medium text-muted-foreground mb-1">
                  Session ID
                </h5>
                <code className="text-xs bg-muted px-2 py-1 rounded">
                  {sessionId}
                </code>
              </div>

              {session && (
                <>
                  <div>
                    <h5 className="text-sm font-medium text-muted-foreground mb-1">
                      Channel
                    </h5>
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {(session.snack as any).getChannel?.() || session.id}
                    </code>
                  </div>

                  <div>
                    <h5 className="text-sm font-medium text-muted-foreground mb-1">
                      SDK Version
                    </h5>
                    <Badge variant="outline">
                      {(session.snack as any).getSdkVersion?.() || '52.0.0'}
                    </Badge>
                  </div>

                  <div>
                    <h5 className="text-sm font-medium text-muted-foreground mb-1">
                      Dependencies
                    </h5>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {Object.entries((session.snack as any).getDependencies?.() || {}).map(([name, version]) => (
                        <Badge key={name} variant="secondary" className="gap-1">
                          <Package className="w-3 h-3" />
                          {name}@{String(version)}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <div>
                    <h5 className="text-sm font-medium text-muted-foreground mb-1">
                      Last Activity
                    </h5>
                    <p className="text-sm">
                      {session.lastActivity.toLocaleString()}
                    </p>
                  </div>
                </>
              )}

              {error && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4">
                  <h5 className="text-sm font-medium text-destructive mb-1">
                    Error Details
                  </h5>
                  <p className="text-xs text-destructive/80">
                    {error.message}
                  </p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Share dialog */}
      {isShareDialogOpen && session && (
        <SharePreviewDialog
          open={isShareDialogOpen}
          onOpenChange={setIsShareDialogOpen}
          projectId={projectId || sessionId}
          projectName={(session.snack as any).getName?.() || 'Preview'}
        />
      )}
    </div>
  );
}

// Export types for external use
export type { SnackPreviewPanelProps };