import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { useProjectEditorStore } from '../../stores/useProjectEditorStore';
import { useDebounceValue } from '../../hooks/useDebounce';
import { X, Save, Play } from 'lucide-react';
import { Button } from '../ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
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

  // Auto-save when content changes
  useEffect(() => {
    if (debouncedContent && activeFile && editorRef.current) {
      const currentContent = getCurrentFileContent();
      if (currentContent !== debouncedContent) {
        handleAutoSave();
      }
    }
  }, [debouncedContent, activeFile]);

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