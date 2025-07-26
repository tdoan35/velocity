import { useState } from 'react'
import { Plus, FolderPlus, Edit2, Trash2 } from 'lucide-react'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { FileNode } from '@/types/store'

interface FileOperationsProps {
  onCreateFile: (parentId: string | null, name: string) => void
  onCreateFolder: (parentId: string | null, name: string) => void
  onRename: (nodeId: string, newName: string) => void
  onDelete: (nodeId: string) => void
}

export function FileOperations({
  onCreateFile,
  onCreateFolder,
  onRename,
  onDelete,
}: FileOperationsProps) {
  const [isCreating, setIsCreating] = useState<'file' | 'folder' | null>(null)
  const [isRenaming, setIsRenaming] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const [contextNode, setContextNode] = useState<FileNode | null>(null)
  const [deleteConfirmNode, setDeleteConfirmNode] = useState<FileNode | null>(null)

  const handleCreate = (type: 'file' | 'folder') => {
    if (!inputValue.trim()) return
    
    const parentId = contextNode?.type === 'directory' ? contextNode.id : contextNode?.parentId || null
    
    if (type === 'file') {
      onCreateFile(parentId, inputValue.trim())
    } else {
      onCreateFolder(parentId, inputValue.trim())
    }
    
    setIsCreating(null)
    setInputValue('')
  }

  const handleRename = () => {
    if (!inputValue.trim() || !isRenaming) return
    
    onRename(isRenaming, inputValue.trim())
    setIsRenaming(null)
    setInputValue('')
  }

  const handleDelete = () => {
    if (!deleteConfirmNode) return
    
    onDelete(deleteConfirmNode.id)
    setDeleteConfirmNode(null)
  }

  return {
    contextMenu: (node: FileNode) => (
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div className="contents" />
        </ContextMenuTrigger>
        <ContextMenuContent>
          {node.type === 'directory' && (
            <>
              <ContextMenuItem
                onClick={() => {
                  setContextNode(node)
                  setIsCreating('file')
                  setInputValue('')
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                New File
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  setContextNode(node)
                  setIsCreating('folder')
                  setInputValue('')
                }}
              >
                <FolderPlus className="mr-2 h-4 w-4" />
                New Folder
              </ContextMenuItem>
              <ContextMenuSeparator />
            </>
          )}
          <ContextMenuItem
            onClick={() => {
              setIsRenaming(node.id)
              setInputValue(node.name)
            }}
          >
            <Edit2 className="mr-2 h-4 w-4" />
            Rename
          </ContextMenuItem>
          <ContextMenuItem
            onClick={() => setDeleteConfirmNode(node)}
            className="text-destructive"
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    ),

    createDialog: isCreating && (
      <Dialog open={!!isCreating} onOpenChange={() => setIsCreating(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Create New {isCreating === 'file' ? 'File' : 'Folder'}
            </DialogTitle>
            <DialogDescription>
              Enter a name for the new {isCreating === 'file' ? 'file' : 'folder'}
            </DialogDescription>
          </DialogHeader>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={isCreating === 'file' ? 'filename.tsx' : 'folder-name'}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleCreate(isCreating)
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreating(null)}>
              Cancel
            </Button>
            <Button onClick={() => handleCreate(isCreating)}>
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),

    renameDialog: isRenaming && (
      <Dialog open={!!isRenaming} onOpenChange={() => setIsRenaming(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename</DialogTitle>
            <DialogDescription>
              Enter a new name
            </DialogDescription>
          </DialogHeader>
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                handleRename()
              }
            }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRenaming(null)}>
              Cancel
            </Button>
            <Button onClick={handleRename}>
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),

    deleteDialog: deleteConfirmNode && (
      <Dialog open={!!deleteConfirmNode} onOpenChange={() => setDeleteConfirmNode(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteConfirmNode.type === 'file' ? 'File' : 'Folder'}</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{deleteConfirmNode.name}"?
              {deleteConfirmNode.type === 'directory' && ' This will delete all files and folders inside it.'}
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmNode(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    ),

    setContextNode,
  }
}