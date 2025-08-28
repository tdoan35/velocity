import { useState, useEffect } from 'react';

interface PreviewReadinessOptions {
  projectId: string;
  previewFiles: Record<string, any>;
  isStoreReady: boolean;
  minFileCount?: number;
}

export function usePreviewReadiness({ 
  projectId, 
  previewFiles, 
  isStoreReady,
  minFileCount = 1 
}: PreviewReadinessOptions) {
  const [isReady, setIsReady] = useState(false);
  const [readinessDetails, setReadinessDetails] = useState<{
    hasProjectId: boolean;
    hasFiles: boolean;
    hasValidContent: boolean;
    isStoreReady: boolean;
    fileCount: number;
  }>({
    hasProjectId: false,
    hasFiles: false,
    hasValidContent: false,
    isStoreReady: false,
    fileCount: 0
  });

  useEffect(() => {
    const checkReadiness = () => {
      const hasProjectId = !!projectId && projectId.length > 0;
      const fileCount = Object.keys(previewFiles).length;
      const hasFiles = fileCount >= minFileCount;
      
      // Check if files have valid content
      const hasValidContent = Object.values(previewFiles).every(
        (file: any) => file && file.content && file.content.length > 0
      );
      
      const details = {
        hasProjectId,
        hasFiles,
        hasValidContent,
        isStoreReady,
        fileCount
      };
      
      const ready = hasProjectId && hasFiles && hasValidContent && isStoreReady;
      
      console.log('[PreviewReadiness] Readiness check:', {
        ...details,
        ready,
        projectId: projectId?.substring(0, 8) + '...' || 'none'
      });
      
      setReadinessDetails(details);
      setIsReady(ready);
    };
    
    // Debounce the check to avoid rapid state changes
    const timeout = setTimeout(checkReadiness, 100);
    return () => clearTimeout(timeout);
  }, [projectId, previewFiles, isStoreReady, minFileCount]);

  return { 
    isReady, 
    readinessDetails,
    // Helper methods for debugging
    debugInfo: {
      projectId: projectId?.substring(0, 8) + '...' || 'none',
      fileCount: Object.keys(previewFiles).length,
      fileNames: Object.keys(previewFiles).slice(0, 3),
      isStoreReady
    }
  };
}