// @deprecated This component is deprecated in favor of the unified editor architecture.
// Use CodeEditor component with useUnifiedEditorStore instead.
// This component has a known autosave race condition bug that was fixed in the new architecture.
import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { useProjectEditorStore } from '../../stores/useProjectEditorStore';
import { useDebounceValue } from '../../hooks/useDebounce';
import { usePreviewRealtime } from '../../hooks/usePreviewRealtime';
import { usePreviewSession } from '../../hooks/usePreviewSession';
import { X, Save, Play, Wifi, WifiOff, AlertCircle, Smartphone, Monitor, Tablet, Power, PowerOff, RefreshCw } from 'lucide-react';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '../ui/dropdown-menu';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

interface EnhancedEditorContainerProps {
  projectId: string;
  projectType: 'frontend-only' | 'full-stack';
  onFileSave?: (fileName: string, content: string, language: string) => void;
  onFileOpen?: (fileName: string, content: string, language: string) => void;
}

export function EnhancedEditorContainer({ projectId, projectType, onFileSave, onFileOpen }: EnhancedEditorContainerProps) {
  const {
    openTabs,
    activeFile,
    frontendFiles,
    backendFiles,
    sharedFiles,
    closeFile,
    saveFile,
    openFile
  } = useProjectEditorStore();

  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorContent, setEditorContent] = React.useState('');
  const debouncedContent = useDebounceValue(editorContent, 1000);

  // Real-time connection for broadcasting file changes
  const previewRealtime = usePreviewRealtime({
    projectId,
    onError: (error) => {
      console.error('[EnhancedEditorContainer] Real-time error:', error);
      toast.error(`Preview connection error: ${error.message}`);
    },
    onConnectionChange: (status) => {
      console.log(`[EnhancedEditorContainer] Connection status changed to: ${status}`);
      switch (status) {
        case 'connected':
          toast.success('Preview connection established');
          break;
        case 'error':
          toast.error('Preview connection failed');
          break;
        case 'disconnected':
          // Don't show toast for normal disconnections
          break;
      }
    },
  });

  // Preview session management
  const previewSession = usePreviewSession({
    projectId,
    onError: (error) => {
      console.error('[EnhancedEditorContainer] Preview session error:', error);
      toast.error(`Preview session error: ${error.message}`);
    },
    onStatusChange: (status, session) => {
      console.log(`[EnhancedEditorContainer] Preview session status changed to: ${status}`, session);
      switch (status) {
        case 'running':
          toast.success('Preview container is ready');
          break;
        case 'error':
          toast.error('Preview container failed to start');
          break;
        case 'stopping':
          toast.info('Stopping preview container...');
          break;
        case 'idle':
          toast.info('Preview container stopped');
          break;
      }
    },
  });

  // Configure Monaco Editor for different file types
  useEffect(() => {
    // TypeScript/JavaScript configuration
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.Latest,
      allowNonTsExtensions: true,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      noEmit: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.React,
      allowJs: true,
      typeRoots: ['node_modules/@types'],
    });

    // Add React Native types
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `
      declare module 'react-native' {
        export * from 'react-native/index';
      }
      
      declare module '@supabase/supabase-js' {
        export * from '@supabase/supabase-js/index';
      }
      `,
      'react-native.d.ts'
    );
  }, []);

  // Initialize Monaco Editor
  useEffect(() => {
    if (containerRef.current && !editorRef.current) {
      editorRef.current = monaco.editor.create(containerRef.current, {
        value: '',
        language: 'typescript',
        theme: 'vs-dark',
        automaticLayout: true,
        fontSize: 12,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        wordWrap: 'on',
        tabSize: 2,
        insertSpaces: true,
        folding: true,
        renderLineHighlight: 'gutter',
        contextmenu: true,
        quickSuggestions: {
          other: true,
          comments: false,
          strings: true,
        },
      });

      // Handle content changes
      editorRef.current.onDidChangeModelContent(() => {
        if (editorRef.current) {
          const content = editorRef.current.getValue();
          setEditorContent(content);
        }
      });

      // Add keyboard shortcuts
      editorRef.current.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => {
        handleSaveFile();
      });
    }

    return () => {
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, []);

  // Auto-save and broadcast when content changes
  useEffect(() => {
    if (debouncedContent && activeFile && editorRef.current) {
      const currentContent = getCurrentFileContent();
      if (currentContent !== debouncedContent) {
        handleAutoSave();
        
        // Broadcast file change to preview containers
        if (previewRealtime.isConnected) {
          console.log(`[EnhancedEditorContainer] Broadcasting file change for ${activeFile}`);
          previewRealtime.broadcastFileUpdate(activeFile, debouncedContent);
        } else {
          console.warn(`[EnhancedEditorContainer] Cannot broadcast file change: preview not connected`);
        }
      }
    }
  }, [debouncedContent, activeFile, previewRealtime]);

  // Load file content when active file changes
  useEffect(() => {
    if (activeFile && editorRef.current) {
      const fileContent = getCurrentFileContent();
      const language = getLanguageFromPath(activeFile);
      
      editorRef.current.setValue(fileContent);
      monaco.editor.setModelLanguage(editorRef.current.getModel()!, language);
      setEditorContent(fileContent);
      
      // Trigger security monitoring when file is opened
      if (onFileOpen && fileContent) {
        onFileOpen(activeFile, fileContent, getLanguageFromFilename(activeFile));
      }
    }
  }, [activeFile, frontendFiles, backendFiles, sharedFiles, onFileOpen]);

  const getCurrentFileContent = (): string => {
    if (!activeFile) return '';

    if (frontendFiles[activeFile]) {
      return frontendFiles[activeFile].content;
    }
    if (backendFiles[activeFile]) {
      return backendFiles[activeFile].content;
    }
    if (sharedFiles[activeFile]) {
      return sharedFiles[activeFile].content;
    }
    return '';
  };

  const getLanguageFromPath = (filePath: string): string => {
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    switch (extension) {
      case 'ts':
      case 'tsx':
        return 'typescript';
      case 'js':
      case 'jsx':
        return 'javascript';
      case 'json':
        return 'json';
      case 'sql':
        return 'sql';
      case 'css':
        return 'css';
      case 'html':
        return 'html';
      case 'md':
        return 'markdown';
      case 'yml':
      case 'yaml':
        return 'yaml';
      default:
        return 'plaintext';
    }
  };

  const getFileDisplayName = (filePath: string): string => {
    const parts = filePath.split('/');
    return parts[parts.length - 1];
  };

  const getLanguageFromFilename = (filename: string): string => {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    
    const languageMap: Record<string, string> = {
      'ts': 'typescript',
      'tsx': 'typescript',
      'js': 'javascript',
      'jsx': 'javascript',
      'sql': 'sql',
      'json': 'json',
      'md': 'markdown',
      'css': 'css',
      'html': 'html',
      'py': 'python',
      'java': 'java',
      'c': 'c',
      'cpp': 'cpp',
      'cs': 'csharp',
      'php': 'php',
      'rb': 'ruby',
      'go': 'go',
      'rs': 'rust',
      'sh': 'shell',
      'yml': 'yaml',
      'yaml': 'yaml',
      'xml': 'xml',
    };

    return languageMap[extension] || 'plaintext';
  };

  const handleSaveFile = async () => {
    if (!activeFile || !editorRef.current) return;

    try {
      const content = editorRef.current.getValue();
      await saveFile(activeFile, content);
      
      // Immediate broadcast on manual save
      if (previewRealtime.isConnected) {
        console.log(`[EnhancedEditorContainer] Broadcasting manual save for ${activeFile}`);
        previewRealtime.broadcastFileUpdate(activeFile, content);
      }
      
      // Trigger security monitoring on file save
      if (onFileSave) {
        const language = getLanguageFromFilename(activeFile);
        onFileSave(activeFile, content, language);
      }
      
      toast.success('File saved successfully');
    } catch (error: any) {
      toast.error('Failed to save file: ' + error.message);
    }
  };

  const handleAutoSave = async () => {
    if (!activeFile || !editorRef.current) return;

    try {
      const content = editorRef.current.getValue();
      await saveFile(activeFile, content);
    } catch (error: any) {
      console.error('Auto-save failed:', error);
    }
  };

  const handleRunCode = () => {
    if (!activeFile) return;
    
    // For now, just show a toast - in the future this could trigger preview refresh
    toast.info('Code execution triggered - check preview panel');
  };

  // Helper functions for preview session UI
  const getDeviceIcon = (deviceType: string) => {
    switch (deviceType) {
      case 'mobile':
        return <Smartphone className="h-3 w-3" />;
      case 'tablet':
        return <Tablet className="h-3 w-3" />;
      case 'desktop':
        return <Monitor className="h-3 w-3" />;
      default:
        return <Smartphone className="h-3 w-3" />;
    }
  };

  const getStatusColor = (status: typeof previewSession.status) => {
    switch (status) {
      case 'running':
        return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'starting':
        return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      case 'error':
        return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
      case 'stopping':
        return 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300';
      case 'idle':
      default:
        return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  const getStatusText = (status: typeof previewSession.status) => {
    switch (status) {
      case 'running':
        return 'Running';
      case 'starting':
        return 'Starting...';
      case 'error':
        return 'Error';
      case 'stopping':
        return 'Stopping...';
      case 'idle':
      default:
        return 'Stopped';
    }
  };

  const handleStartPreview = async (deviceType: string) => {
    try {
      const session = await previewSession.startSession(deviceType);
      if (session) {
        toast.info(`Starting ${deviceType} preview container...`, {
          description: 'This may take up to 2 minutes for the first launch.',
        });
      }
    } catch (error) {
      // Error is already handled by the hook, but we can add more specific handling here
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error(`Failed to start ${deviceType} preview`, {
        description: errorMessage,
        action: {
          label: 'Retry',
          onClick: () => handleStartPreview(deviceType),
        },
      });
    }
  };

  const handleStopPreview = async () => {
    try {
      await previewSession.stopSession();
      toast.info('Preview container stopped');
    } catch (error) {
      // Error is already handled by the hook
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      toast.error('Failed to stop preview container', {
        description: errorMessage,
        action: {
          label: 'Retry',
          onClick: handleStopPreview,
        },
      });
    }
  };

  if (openTabs.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-card">
        <div className="text-center text-muted-foreground">
          <p className="text-lg mb-2">No files open</p>
          <p className="text-sm">Select a file from the explorer to start editing</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-transparent">
      {/* Tabs */}
      <div className="border-b">
        <div className="flex items-center">
          <div className="flex-1 overflow-x-auto">
            <Tabs value={activeFile || ''} onValueChange={openFile} className="w-full ">
              <TabsList className="h-8 p-0 bg-transparent">
                {openTabs.map((filePath) => (
                  <TabsTrigger
                    key={filePath}
                    value={filePath}
                    className="h-8 px-3 relative group data-[state=active]:bg-accent"
                  >
                    <span className="text-sm truncate max-w-32">
                      {getFileDisplayName(filePath)}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 ml-2 opacity-0 group-hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        closeFile(filePath);
                      }}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          
          {/* Preview Session Controls */}
          <div className="flex items-center gap-2 px-3">
            {/* Preview Session Status Badge */}
            <Badge 
              variant="outline" 
              className={`text-xs ${getStatusColor(previewSession.status)}`}
              title={
                previewSession.status === 'error' && previewSession.errorMessage
                  ? `Error: ${previewSession.errorMessage}`
                  : previewSession.status === 'running' && previewSession.containerUrl
                  ? `Container: ${previewSession.containerUrl}`
                  : getStatusText(previewSession.status)
              }
            >
              {getStatusText(previewSession.status)}
              {previewSession.status === 'error' && (
                <AlertCircle className="h-3 w-3 ml-1" />
              )}
            </Badge>

            {/* Real-time Connection Status */}
            <Button
              variant="ghost"
              size="sm"
              className={`h-6 px-2 ${
                previewRealtime.connectionStatus === 'connected' 
                  ? 'text-green-600 hover:text-green-700' 
                  : previewRealtime.connectionStatus === 'error'
                  ? 'text-red-600 hover:text-red-700'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
              onClick={() => {
                if (previewRealtime.connectionStatus === 'disconnected' || previewRealtime.connectionStatus === 'error') {
                  previewRealtime.connect();
                }
              }}
              title={
                previewRealtime.connectionStatus === 'connected'
                  ? 'Real-time sync active'
                  : previewRealtime.connectionStatus === 'connecting'
                  ? 'Connecting real-time sync...'
                  : previewRealtime.connectionStatus === 'error'
                  ? 'Real-time sync failed (click to retry)'
                  : 'Real-time sync disconnected (click to connect)'
              }
            >
              {previewRealtime.connectionStatus === 'connected' && <Wifi className="h-3 w-3" />}
              {previewRealtime.connectionStatus === 'connecting' && <div className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />}
              {previewRealtime.connectionStatus === 'error' && <AlertCircle className="h-3 w-3" />}
              {previewRealtime.connectionStatus === 'disconnected' && <WifiOff className="h-3 w-3" />}
            </Button>

            {/* Preview Session Action Button */}
            {previewSession.status === 'idle' || previewSession.status === 'error' ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2"
                    disabled={previewSession.isLoading}
                  >
                    {previewSession.isLoading ? (
                      <div className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <Power className="h-3 w-3" />
                    )}
                    <span className="ml-1 text-xs">Start</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-40">
                  <DropdownMenuItem onClick={() => handleStartPreview('mobile')}>
                    {getDeviceIcon('mobile')}
                    <span className="ml-2">Mobile</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleStartPreview('tablet')}>
                    {getDeviceIcon('tablet')}
                    <span className="ml-2">Tablet</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleStartPreview('desktop')}>
                    {getDeviceIcon('desktop')}
                    <span className="ml-2">Desktop</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Button
                variant="outline"
                size="sm"
                className="h-6 px-2"
                onClick={handleStopPreview}
                disabled={previewSession.isLoading}
                title={previewSession.status === 'running' ? 'Stop preview container' : 'Stopping...'}
              >
                {previewSession.isLoading ? (
                  <div className="h-3 w-3 border border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <PowerOff className="h-3 w-3" />
                )}
                <span className="ml-1 text-xs">Stop</span>
              </Button>
            )}

            {/* Refresh Session Status Button */}
            {(previewSession.session || previewSession.status !== 'idle') && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={previewSession.refreshStatus}
                disabled={previewSession.isLoading}
                title="Refresh session status"
              >
                <RefreshCw className={`h-3 w-3 ${previewSession.isLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1">
        <Tabs value={activeFile || ''} className="h-full">
          {openTabs.map((filePath) => (
            <TabsContent key={filePath} value={filePath} className="h-full m-0">
              <div
                ref={containerRef}
                className="h-full w-full"
                style={{ minHeight: '400px' }}
              />
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}