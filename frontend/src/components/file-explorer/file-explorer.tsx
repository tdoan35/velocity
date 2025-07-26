import { useState, useCallback, useEffect } from 'react'
import { Search, FolderPlus, FilePlus } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { FileTreeNode } from './file-tree-node'
import { FileOperations } from './file-operations'
import { useFileSystemStore } from '@/stores/useFileSystemStore'
import { useEditorStore } from '@/stores/useEditorStore'
import type { FileNode } from '@/types/store'

interface FileExplorerProps {
  onFileSelect?: (file: FileNode) => void
  className?: string
}

export function FileExplorer({ onFileSelect, className }: FileExplorerProps) {
  const { fileTree, createFile, createFolder, updateFile, deleteFile, moveFile } = useFileSystemStore()
  const { openFile } = useEditorStore()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [contextMenuNode, setContextMenuNode] = useState<FileNode | null>(null)

  const fileOperations = FileOperations({
    onCreateFile: (parentId, name) => {
      createFile(parentId || 'root', name, '')
      if (parentId) {
        setExpandedIds(prev => new Set(prev).add(parentId))
      }
    },
    onCreateFolder: (parentId, name) => {
      createFolder(parentId || 'root', name)
      if (parentId) {
        setExpandedIds(prev => new Set(prev).add(parentId))
      }
    },
    onRename: (nodeId, newName) => updateFile(nodeId, { name: newName }),
    onDelete: deleteFile,
  })

  const handleSelect = useCallback((node: FileNode) => {
    setSelectedId(node.id)
    if (node.type === 'file') {
      // Open file in editor
      openFile(node.id, node.path, node.content || '')
      onFileSelect?.(node)
    }
  }, [openFile, onFileSelect])

  const handleToggleExpand = useCallback((nodeId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(nodeId)) {
        next.delete(nodeId)
      } else {
        next.add(nodeId)
      }
      return next
    })
  }, [])

  const handleContextMenu = useCallback((event: React.MouseEvent, node: FileNode) => {
    event.preventDefault()
    setContextMenuNode(node)
    fileOperations.setContextNode(node)
  }, [fileOperations])

  const handleDrop = useCallback((draggedId: string, targetId: string) => {
    moveFile(draggedId, targetId)
  }, [moveFile])

  // Filter nodes based on search query
  const filterNodes = useCallback((node: FileNode): FileNode | null => {
    if (!searchQuery) return node

    const query = searchQuery.toLowerCase()
    const nameMatch = node.name.toLowerCase().includes(query)
    
    if (node.type === 'file') {
      return nameMatch ? node : null
    }

    // For directories, check if any children match
    const filteredChildren = node.children
      ?.map(child => filterNodes(child))
      .filter(Boolean) as FileNode[] | undefined

    if (nameMatch || (filteredChildren && filteredChildren.length > 0)) {
      return {
        ...node,
        children: filteredChildren || [],
      }
    }

    return null
  }, [searchQuery])

  // Auto-expand directories when searching
  useEffect(() => {
    if (searchQuery) {
      const expandAll = (node: FileNode) => {
        if (node.type === 'directory' && node.children) {
          setExpandedIds(prev => new Set(prev).add(node.id))
          node.children.forEach(expandAll)
        }
      }
      if (fileTree) expandAll(fileTree)
    }
  }, [searchQuery, fileTree])

  const filteredTree = fileTree ? filterNodes(fileTree) : null

  return (
    <div className={className}>
      <div className="border-b p-3 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold flex-1">Explorer</h3>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => {
              const fileName = prompt('Enter file name:')
              if (fileName) {
                createFile('root', fileName, '')
              }
            }}
          >
            <FilePlus className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-6 w-6"
            onClick={() => {
              const folderName = prompt('Enter folder name:')
              if (folderName) {
                createFolder('root', folderName)
              }
            }}
          >
            <FolderPlus className="h-4 w-4" />
          </Button>
        </div>
        
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
      </div>

      <div className="overflow-y-auto p-2">
        {filteredTree ? (
          <div
            onContextMenu={(e) => {
              if (e.target === e.currentTarget) {
                e.preventDefault()
                setContextMenuNode(null)
                fileOperations.setContextNode(null)
              }
            }}
          >
            <FileTreeNode
              node={filteredTree}
              level={0}
              selectedId={selectedId}
              expandedIds={expandedIds}
              onSelect={handleSelect}
              onToggleExpand={handleToggleExpand}
              onContextMenu={handleContextMenu}
              onDrop={handleDrop}
            />
          </div>
        ) : (
          <div className="text-center text-sm text-muted-foreground py-8">
            No files found
          </div>
        )}
      </div>

      {/* Context menu wrapper */}
      {contextMenuNode && fileOperations.contextMenu(contextMenuNode)}
      
      {/* Dialogs */}
      {fileOperations.createDialog}
      {fileOperations.renameDialog}
      {fileOperations.deleteDialog}
    </div>
  )
}