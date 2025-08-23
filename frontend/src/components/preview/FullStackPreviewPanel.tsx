import { useState, useEffect } from 'react';
import { useProjectEditorStore } from '../../stores/useProjectEditorStore';
import { SnackPreviewPanel } from './SnackPreviewPanel';
import { APITestingPanel } from './APITestingPanel';
import { DatabaseBrowser } from './DatabaseBrowser';
import { LogsConsole } from './LogsConsole';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Smartphone, Globe, Database, Terminal, Code, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface FullStackPreviewPanelProps {
  projectId: string;
  showAPITesting: boolean;
}

export function FullStackPreviewPanel({ projectId, showAPITesting }: FullStackPreviewPanelProps) {
  const {
    frontendFiles,
    backendFiles,
    deploymentUrl,
    buildStatus,
    isSupabaseConnected
  } = useProjectEditorStore();

  const [activeTab, setActiveTab] = useState<'preview' | 'api' | 'database' | 'logs'>('preview');
  const [previewMode, setPreviewMode] = useState<'web' | 'mobile'>('web');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [sessionId, setSessionId] = useState<string>('');

  // Generate session ID from project and files
  useEffect(() => {
    if (projectId && hasFiles) {
      // Create a simple session ID based on project ID and file count
      const fileCount = Object.keys(frontendFiles).length;
      const generatedSessionId = `${projectId}-${fileCount}-${Date.now()}`;
      setSessionId(generatedSessionId);
    }
  }, [projectId, frontendFiles]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    
    // Simulate refresh delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setIsRefreshing(false);
    toast.success('Preview refreshed');
  };

  const hasFiles = Object.keys(frontendFiles).length > 0;
  const hasBackendFiles = Object.keys(backendFiles).length > 0;

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="p-3 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Preview</h3>
          <div className="flex items-center space-x-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="flex-1 flex flex-col">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="preview" className="flex items-center space-x-2">
            <Smartphone className="h-4 w-4" />
            <span>Preview</span>
          </TabsTrigger>
          
          <TabsTrigger 
            value="api" 
            disabled={!showAPITesting}
            className="flex items-center space-x-2"
          >
            <Code className="h-4 w-4" />
            <span>API</span>
          </TabsTrigger>
          
          <TabsTrigger 
            value="database" 
            disabled={!showAPITesting}
            className="flex items-center space-x-2"
          >
            <Database className="h-4 w-4" />
            <span>Database</span>
          </TabsTrigger>
          
          <TabsTrigger value="logs" className="flex items-center space-x-2">
            <Terminal className="h-4 w-4" />
            <span>Logs</span>
          </TabsTrigger>
        </TabsList>

        {/* Tab Content */}
        <div className="flex-1 overflow-hidden">
          <TabsContent value="preview" className="h-full m-0 p-0">
            <div className="h-full flex flex-col">

              {/* Preview Content */}
              <div className="flex-1">
                {hasFiles && sessionId ? (
                  <SnackPreviewPanel
                    sessionId={sessionId}
                    projectId={projectId}
                    files={frontendFiles}
                    className="h-full"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center text-muted-foreground">
                      <Smartphone className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p className="text-lg mb-2">No preview available</p>
                      <p className="text-sm">Generate project files to see preview</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="api" className="h-full m-0 p-0">
            {showAPITesting && hasBackendFiles ? (
              <APITestingPanel
                projectId={projectId}
                supabaseConnected={isSupabaseConnected}
                className="h-full"
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Code className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">API Testing Unavailable</p>
                  <p className="text-sm">
                    {!showAPITesting 
                      ? 'Connect Supabase to enable API testing'
                      : 'Generate backend files to test APIs'
                    }
                  </p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="database" className="h-full m-0 p-0">
            {showAPITesting ? (
              <DatabaseBrowser
                projectId={projectId}
                supabaseConnected={isSupabaseConnected}
                className="h-full"
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg mb-2">Database Browser Unavailable</p>
                  <p className="text-sm">Connect Supabase to browse database</p>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="logs" className="h-full m-0 p-0">
            <LogsConsole
              projectId={projectId}
              includeBackend={showAPITesting}
              className="h-full"
            />
          </TabsContent>
        </div>
      </Tabs>

      {/* Status Bar */}
      <div className="border-t px-3 py-2 text-xs text-muted-foreground bg-muted/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <span>Status: {buildStatus}</span>
            {isSupabaseConnected && (
              <span className="text-green-600">Supabase Connected</span>
            )}
          </div>
          <div className="flex items-center space-x-4">
            {deploymentUrl && (
              <span className="text-blue-600">Deployed</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}