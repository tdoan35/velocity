import { useCallback } from 'react'
import { useFileSystemStore } from '@/stores/useFileSystemStore'
import { useOptimisticStore } from '@/stores/useOptimisticStore'
import { useOptimisticMutation } from './use-optimistic-mutation'
import { createRollbackContext } from '@/lib/rollback-manager'
import { useToast } from './use-toast'
import type { FileNode } from '@/types/store'

interface FileOperationContext {
  optimisticOperation: {
    type: 'create' | 'update' | 'delete' | 'move' | 'rename'
    entityType: 'file' | 'folder'
    entityId: string
    previousState: any
    optimisticState: any
  }
  rollback: () => void
}

export function useOptimisticFileOperations() {
  const { toast } = useToast()
  const fileSystemStore = useFileSystemStore()
  const optimisticStore = useOptimisticStore()
  
  // Create file optimistically
  const createFile = useOptimisticMutation<FileNode, Error, { parentId: string; name: string; content?: string }, FileOperationContext>({
    mutationFn: async ({ parentId, name, content }) => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Simulate occasional failures for demo (5% chance)
      if (Math.random() < 0.05) {
        throw new Error('Failed to create file')
      }
      
      const parentPath = parentId === 'root' ? '' : `parent-${parentId}`
      return {
        id: `file-${Date.now()}`,
        name,
        path: parentPath ? `${parentPath}/${name}` : name,
        type: 'file' as const,
        content: content || '',
      }
    },
    onMutate: async ({ parentId, name, content }) => {
      // Create optimistic file node
      const optimisticFile: FileNode = {
        id: `temp-${Date.now()}`,
        name,
        path: `temp/${name}`,
        type: 'file' as const,
        content: content || '',
      }
      
      // Get current state for rollback
      const previousTree = fileSystemStore.fileTree
      
      // Apply optimistic update
      fileSystemStore.createFile(parentId, name, content)
      
      // Create rollback context
      const context = createRollbackContext(previousTree, (prevState) => {
        if (prevState) {
          fileSystemStore.setFileTree(prevState)
        }
      })
      
      return {
        optimisticOperation: {
          type: 'create' as const,
          entityType: 'file' as const,
          entityId: optimisticFile.id,
          previousState: previousTree,
          optimisticState: optimisticFile,
        },
        rollback: context.rollback,
      }
    },
    onSuccess: (_data, variables) => {
      toast({
        title: 'File created',
        description: `${variables.name} has been created successfully`,
      })
    },
    onError: (error, _variables) => {
      toast({
        title: 'Failed to create file',
        description: error.message,
        variant: 'destructive',
      })
    },
  })
  
  // Update file optimistically
  const updateFile = useOptimisticMutation<FileNode, Error, { fileId: string; updates: Partial<FileNode> }, FileOperationContext>({
    mutationFn: async ({ fileId, updates }) => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800))
      
      // Simulate occasional failures (5% chance)
      if (Math.random() < 0.05) {
        throw new Error('Failed to update file')
      }
      
      const file = fileSystemStore.findFileById(fileId)
      if (!file) throw new Error('File not found')
      
      return {
        ...file,
        ...updates,
        lastModified: new Date(),
      }
    },
    onMutate: async ({ fileId, updates }) => {
      // Get current file state
      const previousFile = fileSystemStore.findFileById(fileId)
      if (!previousFile) throw new Error('File not found')
      
      // Apply optimistic update
      fileSystemStore.updateFile(fileId, updates)
      
      // Create rollback context
      const context = createRollbackContext(previousFile, (prevState) => {
        fileSystemStore.updateFile(fileId, prevState)
      })
      
      return {
        optimisticOperation: {
          type: 'update' as const,
          entityType: 'file' as const,
          entityId: fileId,
          previousState: previousFile,
          optimisticState: { ...previousFile, ...updates },
        },
        rollback: context.rollback,
      }
    },
    onSuccess: (_data, variables) => {
      const isRename = 'name' in variables.updates
      toast({
        title: isRename ? 'File renamed' : 'File updated',
        description: isRename 
          ? `Renamed to ${variables.updates.name}`
          : 'File has been updated successfully',
      })
    },
  })
  
  // Delete file optimistically
  const deleteFile = useOptimisticMutation<void, Error, { fileId: string }, FileOperationContext>({
    mutationFn: async ({ fileId: _fileId }) => {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 600))
      
      // Success - no random failures for delete
      // In a real app, this would call your backend API
    },
    onMutate: async ({ fileId }) => {
      // Get current state
      const previousTree = fileSystemStore.fileTree
      
      // Check if file exists in store
      // const fileExists = !!fileSystemStore.findFileById(fileId)
      
      // Apply optimistic update (only if file exists in store)
      if (fileSystemStore.findFileById(fileId)) {
        fileSystemStore.deleteFile(fileId)
      }
      
      // Create rollback context
      const context = createRollbackContext(previousTree, (prevState) => {
        if (prevState) {
          fileSystemStore.setFileTree(prevState)
        }
      })
      
      return {
        optimisticOperation: {
          type: 'delete' as const,
          entityType: 'file' as const,
          entityId: fileId,
          previousState: previousTree,
          optimisticState: null,
        },
        rollback: context.rollback,
      }
    },
    onSuccess: () => {
      toast({
        title: 'File deleted',
        description: 'The file has been deleted successfully',
      })
    },
  })
  
  // Retry failed operations
  const retryOperation = useCallback((operationId: string) => {
    const operation = optimisticStore.operations.get(operationId)
    if (!operation) return
    
    // Retry based on operation type
    switch (operation.type) {
      case 'create':
        // Re-execute create operation
        break
      case 'update':
        // Re-execute update operation
        break
      case 'delete':
        // Re-execute delete operation
        break
    }
    
    optimisticStore.retryOperation(operationId)
  }, [optimisticStore])
  
  return {
    createFile,
    updateFile,
    deleteFile,
    retryOperation,
    isOnline: optimisticStore.isOnline,
    isSyncing: optimisticStore.isSyncing,
    pendingOperations: optimisticStore.getPendingOperations(),
    failedOperations: optimisticStore.failedOperations,
  }
}