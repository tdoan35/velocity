import { useState, useEffect } from 'react';
import { useProjectEditorStore } from '../../stores/useProjectEditorStore';
import { SnackPreviewPanel } from './SnackPreviewPanel';
import { Button } from '../ui/button';
import { Smartphone, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface FullStackPreviewPanelProps {
  projectId: string;
}

export function FullStackPreviewPanel({ projectId }: FullStackPreviewPanelProps) {
  const {
    frontendFiles,
    buildStatus,
    isSupabaseConnected
  } = useProjectEditorStore();

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

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Preview Content */}
      <div className="flex-1 overflow-hidden">
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
  );
}