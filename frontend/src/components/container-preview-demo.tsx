import React, { useState } from 'react';
import { ContainerPreviewPanel } from './preview/ContainerPreviewPanel';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Switch } from './ui/switch';
import { 
  Container,
  Settings,
  Info,
  RefreshCw,
  ExternalLink,
  Monitor,
  Smartphone,
  Tablet
} from 'lucide-react';
import type { PreviewStatus } from '../hooks/usePreviewSession';

export function ContainerPreviewDemo() {
  const [projectId, setProjectId] = useState('demo-project-123');
  const [currentStatus, setCurrentStatus] = useState<PreviewStatus>('idle');
  const [hasSession, setHasSession] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  const handleStatusChange = (status: PreviewStatus) => {
    setCurrentStatus(status);
  };

  const handleSessionChange = (hasSession: boolean) => {
    setHasSession(hasSession);
  };

  const getStatusColor = (status: PreviewStatus) => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'starting':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'stopping':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getStatusText = (status: PreviewStatus) => {
    switch (status) {
      case 'running':
        return 'Container Running';
      case 'starting':
        return 'Starting Container...';
      case 'error':
        return 'Container Error';
      case 'stopping':
        return 'Stopping Container...';
      default:
        return 'Container Stopped';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Container className="h-6 w-6 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold">Container Preview Demo</h1>
                <p className="text-sm text-muted-foreground">
                  Test the container-based preview system with real-time iframe integration
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-4">
              {/* Status Badge */}
              <Badge className={getStatusColor(currentStatus)}>
                {getStatusText(currentStatus)}
              </Badge>
              
              {/* Session Indicator */}
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className={`h-2 w-2 rounded-full ${hasSession ? 'bg-green-500' : 'bg-gray-400'}`} />
                {hasSession ? 'Session Active' : 'No Session'}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-6 h-[calc(100vh-8rem)]">
          {/* Control Panel */}
          <div className="xl:col-span-1">
            <Card className="h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Demo Controls
                    </CardTitle>
                    <CardDescription>
                      Configure the preview demo settings
                    </CardDescription>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowConfig(!showConfig)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>
              </CardHeader>

              <CardContent className="space-y-6">
                {/* Project ID Configuration */}
                <div className="space-y-2">
                  <Label htmlFor="project-id">Project ID</Label>
                  <Input
                    id="project-id"
                    value={projectId}
                    onChange={(e) => setProjectId(e.target.value)}
                    placeholder="Enter project ID..."
                  />
                  <p className="text-xs text-muted-foreground">
                    The project ID used for the preview session
                  </p>
                </div>

                {/* Status Information */}
                <div className="space-y-3">
                  <Label>Current Status</Label>
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Preview Status</span>
                      <Badge variant="outline" className={getStatusColor(currentStatus)}>
                        {currentStatus}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Session Active</span>
                      <div className={`h-2 w-2 rounded-full ${hasSession ? 'bg-green-500' : 'bg-gray-400'}`} />
                    </div>
                  </div>
                </div>

                {/* Device Information */}
                <div className="space-y-3">
                  <Label>Supported Devices</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2 bg-muted rounded-lg text-center">
                      <Smartphone className="h-4 w-4 mx-auto mb-1" />
                      <span className="text-xs">Mobile</span>
                    </div>
                    <div className="p-2 bg-muted rounded-lg text-center">
                      <Tablet className="h-4 w-4 mx-auto mb-1" />
                      <span className="text-xs">Tablet</span>
                    </div>
                    <div className="p-2 bg-muted rounded-lg text-center">
                      <Monitor className="h-4 w-4 mx-auto mb-1" />
                      <span className="text-xs">Desktop</span>
                    </div>
                  </div>
                </div>

                {/* Feature List */}
                <div className="space-y-3">
                  <Label>Features</Label>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 bg-green-500 rounded-full" />
                      <span>Real-time session management</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 bg-green-500 rounded-full" />
                      <span>Responsive iframe sizing</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 bg-green-500 rounded-full" />
                      <span>Security headers & sandbox</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 bg-green-500 rounded-full" />
                      <span>Loading states & error handling</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 bg-green-500 rounded-full" />
                      <span>Device selection & rotation</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-1.5 bg-green-500 rounded-full" />
                      <span>External link & refresh</span>
                    </div>
                  </div>
                </div>

                {/* Usage Information */}
                <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <div className="flex items-start gap-2">
                    <Info className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium text-blue-900 dark:text-blue-100 mb-1">
                        Demo Notes
                      </p>
                      <ul className="text-blue-700 dark:text-blue-300 space-y-1 text-xs">
                        <li>• Requires orchestrator service to be running</li>
                        <li>• Container URLs will be real Fly.io machine URLs</li>
                        <li>• Sessions have automatic cleanup on component unmount</li>
                        <li>• Error states include retry mechanisms</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Preview Panel */}
          <div className="xl:col-span-3">
            <Card className="h-full">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle>Container Preview Panel</CardTitle>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Project:</span>
                    <Badge variant="outline" className="font-mono text-xs">
                      {projectId}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="p-0 h-[calc(100%-4rem)]">
                <ContainerPreviewPanel
                  projectId={projectId}
                  className="h-full rounded-b-lg"
                  onStatusChange={handleStatusChange}
                  onSessionChange={handleSessionChange}
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}