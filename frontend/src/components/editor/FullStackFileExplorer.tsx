import React, { useState } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, Plus, MoreHorizontal, Database, Server, Code } from 'lucide-react';
import { useProjectEditorStore } from '../../stores/useProjectEditorStore';
import { Button } from '../ui/button';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger, ContextMenuItem } from '../ui/context-menu';
import { toast } from 'sonner';
import type { FileTree } from '../../types/editor';

interface FullStackFileExplorerProps {
  projectId: string;
  showBackend: boolean;
}

interface FileTreeNodeProps {
  name: string;
  path: string;
  isFile: boolean;
  level: number;
  isOpen?: boolean;
  onToggle?: () => void;
  onSelect?: () => void;
  onContextMenu?: (action: string) => void;
  isActive?: boolean;
}

function FileTreeNode({ 
  name, 
  path, 
  isFile, 
  level, 
  isOpen, 
  onToggle, 
  onSelect, 
  onContextMenu,
  isActive 
}: FileTreeNodeProps) {
  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'tsx':
      case 'ts':
      case 'jsx':
      case 'js':
        return <Code className="h-4 w-4 text-blue-500" />;
      case 'sql':
        return <Database className="h-4 w-4 text-green-500" />;
      case 'json':
        return <File className="h-4 w-4 text-yellow-500" />;
      default:
        return <File className="h-4 w-4 text-muted-foreground" />;
    }
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div
          className={`flex items-center py-1 px-2 hover:bg-accent cursor-pointer ${
            isActive ? 'bg-accent' : ''
          }`}
          style={{ paddingLeft: `${level * 12 + 8}px` }}
          onClick={isFile ? onSelect : onToggle}
        >
          {!isFile && (
            <button className="mr-1 p-0.5 hover:bg-accent-foreground/10 rounded">
              {isOpen ? (
                <ChevronDown className="h-3 w-3" />
              ) : (
                <ChevronRight className="h-3 w-3" />
              )}
            </button>
          )}
          
          {isFile ? (
            getFileIcon(name)
          ) : isOpen ? (
            <FolderOpen className="h-4 w-4 text-blue-500 mr-2" />
          ) : (
            <Folder className="h-4 w-4 text-blue-500 mr-2" />
          )}
          
          <span className="text-sm truncate" title={name}>
            {name}
          </span>
        </div>
      </ContextMenuTrigger>
      
      <ContextMenuContent>
        {isFile ? (
          <>
            <ContextMenuItem onClick={() => onContextMenu?.('open')}>
              Open
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onContextMenu?.('rename')}>
              Rename
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onContextMenu?.('delete')}>
              Delete
            </ContextMenuItem>
          </>
        ) : (
          <>
            <ContextMenuItem onClick={() => onContextMenu?.('new-file')}>
              New File
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onContextMenu?.('new-folder')}>
              New Folder
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onContextMenu?.('rename')}>
              Rename
            </ContextMenuItem>
            <ContextMenuItem onClick={() => onContextMenu?.('delete')}>
              Delete
            </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function buildFileTree(files: FileTree, basePath: string = ''): any {
  const tree: any = {};
  
  Object.keys(files).forEach(filePath => {
    if (basePath && !filePath.startsWith(basePath)) return;
    
    const relativePath = basePath ? filePath.substring(basePath.length) : filePath;
    const parts = relativePath.split('/').filter(Boolean);
    
    let current = tree;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      
      if (i === parts.length - 1) {
        // This is a file
        current[part] = {
          type: 'file',
          path: filePath,
          content: files[filePath]
        };
      } else {
        // This is a directory
        if (!current[part]) {
          current[part] = {
            type: 'directory',
            children: {}
          };
        }
        current = current[part].children;
      }
    }
  });
  
  return tree;
}

export function FullStackFileExplorer({ projectId, showBackend }: FullStackFileExplorerProps) {
  const {
    frontendFiles,
    backendFiles,
    activeFile,
    openFile,
    createFile,
    deleteFile
  } = useProjectEditorStore();

  const [expandedDirectories, setExpandedDirectories] = useState<Set<string>>(
    new Set(['frontend', 'backend', 'shared'])
  );

  const toggleDirectory = (path: string) => {
    const newExpanded = new Set(expandedDirectories);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedDirectories(newExpanded);
  };

  const handleContextMenu = async (action: string, path?: string) => {
    switch (action) {
      case 'open':
        if (path) openFile(path);
        break;
      case 'new-file':
        const fileName = prompt('Enter file name:');
        if (fileName && path) {
          try {
            await createFile(`${path}/${fileName}`);
            toast.success('File created successfully');
          } catch (error: any) {
            toast.error('Failed to create file: ' + error.message);
          }
        }
        break;
      case 'delete':
        if (path && confirm('Are you sure you want to delete this file?')) {
          try {
            await deleteFile(path);
            toast.success('File deleted successfully');
          } catch (error: any) {
            toast.error('Failed to delete file: ' + error.message);
          }
        }
        break;
    }
  };

  const renderFileTree = (tree: any, basePath: string = '', level: number = 0): React.ReactNode => {
    return Object.entries(tree).map(([name, node]: [string, any]) => {
      const currentPath = basePath ? `${basePath}/${name}` : name;
      const isExpanded = expandedDirectories.has(currentPath);
      
      if (node.type === 'file') {
        return (
          <FileTreeNode
            key={node.path}
            name={name}
            path={node.path}
            isFile={true}
            level={level}
            onSelect={() => openFile(node.path)}
            onContextMenu={(action) => handleContextMenu(action, node.path)}
            isActive={activeFile === node.path}
          />
        );
      } else {
        return (
          <div key={currentPath}>
            <FileTreeNode
              name={name}
              path={currentPath}
              isFile={false}
              level={level}
              isOpen={isExpanded}
              onToggle={() => toggleDirectory(currentPath)}
              onContextMenu={(action) => handleContextMenu(action, currentPath)}
            />
            {isExpanded && (
              <div>
                {renderFileTree(node.children, currentPath, level + 1)}
              </div>
            )}
          </div>
        );
      }
    });
  };

  const frontendTree = buildFileTree(frontendFiles, 'frontend/');
  const backendTree = showBackend ? buildFileTree(backendFiles, 'backend/') : {};

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="pl-3 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Explorer</h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const fileName = prompt('Enter file name:');
              if (fileName) {
                handleContextMenu('new-file', 'frontend');
              }
            }}
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* File Tree */}
      <div className="flex-1 overflow-auto">
        {/* Frontend Section */}
        <div className="mb-4">
          <FileTreeNode
            name="Frontend"
            path="frontend"
            isFile={false}
            level={0}
            isOpen={expandedDirectories.has('frontend')}
            onToggle={() => toggleDirectory('frontend')}
            onContextMenu={(action) => handleContextMenu(action, 'frontend')}
          />
          {expandedDirectories.has('frontend') && (
            <div>
              {Object.keys(frontendTree).length > 0 ? (
                renderFileTree(frontendTree, 'frontend', 1)
              ) : (
                <div className="px-6 py-2 text-sm text-muted-foreground">
                  No files yet
                </div>
              )}
            </div>
          )}
        </div>

        {/* Backend Section */}
        {showBackend && (
          <div className="mb-4">
            <FileTreeNode
              name="Backend"
              path="backend"
              isFile={false}
              level={0}
              isOpen={expandedDirectories.has('backend')}
              onToggle={() => toggleDirectory('backend')}
              onContextMenu={(action) => handleContextMenu(action, 'backend')}
            />
            {expandedDirectories.has('backend') && (
              <div>
                {Object.keys(backendTree).length > 0 ? (
                  renderFileTree(backendTree, 'backend', 1)
                ) : (
                  <div className="px-6 py-2 text-sm text-muted-foreground">
                    No backend files yet
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Quick Actions */}
        <div className="mt-6 px-3 space-y-2">
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start bg-transparent"
            onClick={() => handleContextMenu('new-file', 'frontend')}
          >
            <Code className="h-4 w-4 mr-2" />
            New Component
          </Button>
          
          {showBackend && (
            <>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start bg-transparent"
                onClick={() => handleContextMenu('new-file', 'backend')}
              >
                <Server className="h-4 w-4 mr-2" />
                New Function
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start bg-transparent"
                onClick={() => handleContextMenu('new-file', 'backend')}
              >
                <Database className="h-4 w-4 mr-2" />
                New Migration
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}