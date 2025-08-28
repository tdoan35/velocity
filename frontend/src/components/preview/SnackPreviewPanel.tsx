import { useEffect, useState } from 'react';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';
import { 
  Smartphone, 
  Share2, 
  RefreshCw,
  AlertCircle,
  Info,
  Package
} from 'lucide-react';
import { useSnackSession } from '../../hooks/useSnackSession';
import { SnackWebPlayer } from './SnackWebPlayer';
import { PreviewHeader } from './PreviewHeader';
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
  // For parent header integration
  onStatusChange?: (status: 'connecting' | 'error' | 'connected' | 'preparing' | 'idle' | 'retrying') => void;
  onStuckChange?: (isStuck: boolean) => void;
  onSessionChange?: (hasSession: boolean) => void;
  onSessionDetailsChange?: (session: any) => void;
  onQrCodeChange?: (qrCodeUrl: string) => void;
  // Override internal modal handlers when header handles them
  externalMobilePreview?: boolean;
  externalSessionInfo?: boolean;
  externalSharePreview?: boolean;
}

export function SnackPreviewPanel({
  sessionId,
  userId,
  projectId,
  files,
  className,
  onSessionReady,
  onStatusChange,
  onStuckChange,
  onSessionChange,
  onSessionDetailsChange,
  onQrCodeChange,
  externalMobilePreview = false,
  externalSessionInfo = false,
  externalSharePreview = false
}: SnackPreviewPanelProps) {
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isMobilePreviewOpen, setIsMobilePreviewOpen] = useState(false);
  const [isSessionInfoOpen, setIsSessionInfoOpen] = useState(false);
  const [isStuck, setIsStuck] = useState(false);
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
    destroySession,
    setWebPreviewRef
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

  // Notify parent of status changes
  useEffect(() => {
    if (onStatusChange) {
      onStatusChange(getPreviewStatus());
    }
  }, [isLoading, isStuck, error, session, webPreviewUrl, onStatusChange]);

  useEffect(() => {
    if (onStuckChange) {
      onStuckChange(isStuck);
    }
  }, [isStuck, onStuckChange]);

  useEffect(() => {
    if (onSessionChange) {
      onSessionChange(!!session);
    }
  }, [session, onSessionChange]);

  useEffect(() => {
    if (onSessionDetailsChange) {
      onSessionDetailsChange(session);
    }
  }, [session, onSessionDetailsChange]);

  useEffect(() => {
    if (onQrCodeChange) {
      onQrCodeChange(qrCodeUrl || '');
    }
  }, [qrCodeUrl, onQrCodeChange]);

  // Timeout mechanism to detect stuck sessions
  useEffect(() => {
    if (isLoading && !session) {
      const timeout = setTimeout(() => {
        setIsStuck(true);
        console.warn('[SnackPreviewPanel] Session appears to be stuck - no session created after 15 seconds');
      }, 15000);

      return () => clearTimeout(timeout);
    } else {
      setIsStuck(false);
    }
  }, [isLoading, session]);

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


  // Handle refresh - force new session creation
  const handleRefresh = async () => {
    setIsStuck(false);
    await destroySession();
    await createSession(); // This will create a new session
  };

  // Simple fallback URL for demo purposes
  const getFallbackPreviewUrl = () => {
    // Create a simple Snack with basic code for demo
    const code = encodeURIComponent(`import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

export default function App() {
  const [count, setCount] = React.useState(0);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Welcome to Velocity!</Text>
      <Text style={styles.subtitle}>Live React Native Preview</Text>
      
      <TouchableOpacity 
        style={styles.button} 
        onPress={() => setCount(count + 1)}
      >
        <Text style={styles.buttonText}>Count: {count}</Text>
      </TouchableOpacity>
      
      <Text style={styles.info}>
        Tap the button to see state updates in real-time
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
    padding: 20,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: '#666',
    marginBottom: 40,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 40,
    paddingVertical: 15,
    borderRadius: 25,
  },
  buttonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600',
  },
  info: {
    marginTop: 30,
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
  },
});`);
    
    return `https://snack.expo.dev/embedded/@snack/sdk.52-${Date.now()}?code=${code}&platform=web`;
  };

  // Map session state to unified status
  const getPreviewStatus = (): 'connecting' | 'error' | 'connected' | 'preparing' | 'idle' | 'retrying' => {
    if (isLoading && !session) return 'connecting';
    if (isStuck) return 'retrying';
    if (error) return 'error';
    if (session && webPreviewUrl) return 'connected';
    if (session && !webPreviewUrl) return 'preparing';
    return 'idle';
  };

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Web preview container - with relative positioning for contained modals */}
      <div className="flex-1 relative">
        <SnackWebPlayer
          snack={snack}
          webPreviewRef={webPreviewRef}
          webPreviewUrl={isStuck ? getFallbackPreviewUrl() : webPreviewUrl}
          sessionId={sessionId}
          className="h-full"
          setWebPreviewRef={setWebPreviewRef}
          onError={(error) => {
            toast({
              title: 'Preview error',
              description: error.message,
              variant: 'destructive',
            });
          }}
        />

        {/* Mobile Preview Modal - positioned within container */}
        {isMobilePreviewOpen && !externalMobilePreview && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
            <Card className="w-full max-w-md mx-4 p-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold">Mobile Preview</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsMobilePreviewOpen(false)}
                >
                  ✕
                </Button>
              </div>
              
              <div className="flex flex-col items-center justify-center">
                {qrCodeUrl ? (
                  <div className="text-center">
                    <h5 className="text-base font-medium mb-2">
                      Scan with Expo Go
                    </h5>
                    <p className="text-sm text-muted-foreground mb-6">
                      Scan this QR code with the Expo Go app on your iOS or Android device
                    </p>
                    
                    <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
                      <QRCode value={qrCodeUrl} size={180} />
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
                        <Badge variant="outline" className="font-mono text-xs">
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
              </div>
            </Card>
          </div>
        )}

        {/* Session Info Modal - positioned within container */}
        {isSessionInfoOpen && !externalSessionInfo && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center z-10">
            <Card className="w-full max-w-lg mx-4 p-6 max-h-[80%] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-lg font-semibold">Session Information</h4>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsSessionInfoOpen(false)}
                >
                  ✕
                </Button>
              </div>
              
              <div className="space-y-4 overflow-auto">
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
          </div>
        )}
      </div>

      {/* Share dialog */}
      {isShareDialogOpen && session && !externalSharePreview && (
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