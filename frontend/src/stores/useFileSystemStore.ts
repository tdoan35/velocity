import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { FileNode } from '@/types/store'

interface FileSystemState {
  // File tree
  fileTree: FileNode | null
  selectedFile: FileNode | null
  expandedFolders: Set<string>
  
  // File operations
  renamingFileId: string | null
  movingFileId: string | null
  
  // Actions
  setFileTree: (tree: FileNode) => void
  selectFile: (file: FileNode | null) => void
  toggleFolder: (folderId: string) => void
  expandFolder: (folderId: string) => void
  collapseFolder: (folderId: string) => void
  
  // File CRUD operations
  createFile: (parentId: string, name: string, content?: string) => void
  createFolder: (parentId: string, name: string) => void
  updateFile: (fileId: string, updates: Partial<FileNode>) => void
  deleteFile: (fileId: string) => void
  moveFile: (fileId: string, newParentId: string) => void
  
  // File operation states
  setRenamingFile: (fileId: string | null) => void
  setMovingFile: (fileId: string | null) => void
  
  // Utilities
  findFileById: (fileId: string) => FileNode | null
  getFilePath: (fileId: string) => string
}

export const useFileSystemStore = create<FileSystemState>()(
  devtools(
    (set, get) => ({
      // Initial state
      fileTree: null,
      selectedFile: null,
      expandedFolders: new Set<string>(),
      renamingFileId: null,
      movingFileId: null,
      
      // Basic actions
      setFileTree: (tree) => set({ fileTree: tree }),
      
      selectFile: (file) => set({ selectedFile: file }),
      
      toggleFolder: (folderId) =>
        set((state) => {
          const expanded = new Set(state.expandedFolders)
          if (expanded.has(folderId)) {
            expanded.delete(folderId)
          } else {
            expanded.add(folderId)
          }
          return { expandedFolders: expanded }
        }),
      
      expandFolder: (folderId) =>
        set((state) => {
          const expanded = new Set(state.expandedFolders)
          expanded.add(folderId)
          return { expandedFolders: expanded }
        }),
      
      collapseFolder: (folderId) =>
        set((state) => {
          const expanded = new Set(state.expandedFolders)
          expanded.delete(folderId)
          return { expandedFolders: expanded }
        }),
      
      // File CRUD operations
      createFile: (parentId, name, content = '') => {
        const newFile: FileNode = {
          id: `file-${Date.now()}`,
          name,
          path: '', // Will be calculated based on parent
          type: 'file',
          content,
          parentId,
        }
        
        set((state) => {
          if (!state.fileTree) return state
          
          const updateNode = (node: FileNode): FileNode => {
            if (node.id === parentId && node.type === 'directory') {
              return {
                ...node,
                children: [...(node.children || []), newFile],
              }
            }
            if (node.children) {
              return {
                ...node,
                children: node.children.map(updateNode),
              }
            }
            return node
          }
          
          return { fileTree: updateNode(state.fileTree) }
        })
      },
      
      createFolder: (parentId, name) => {
        const newFolder: FileNode = {
          id: `folder-${Date.now()}`,
          name,
          path: '', // Will be calculated based on parent
          type: 'directory',
          children: [],
          parentId,
        }
        
        set((state) => {
          if (!state.fileTree) return state
          
          const updateNode = (node: FileNode): FileNode => {
            if (node.id === parentId && node.type === 'directory') {
              return {
                ...node,
                children: [...(node.children || []), newFolder],
              }
            }
            if (node.children) {
              return {
                ...node,
                children: node.children.map(updateNode),
              }
            }
            return node
          }
          
          return { fileTree: updateNode(state.fileTree) }
        })
      },
      
      updateFile: (fileId, updates) => {
        set((state) => {
          if (!state.fileTree) return state
          
          const updateNode = (node: FileNode): FileNode => {
            if (node.id === fileId) {
              return { ...node, ...updates }
            }
            if (node.children) {
              return {
                ...node,
                children: node.children.map(updateNode),
              }
            }
            return node
          }
          
          return { fileTree: updateNode(state.fileTree) }
        })
      },
      
      deleteFile: (fileId) => {
        set((state) => {
          if (!state.fileTree) return state
          
          const deleteNode = (node: FileNode): FileNode | null => {
            if (node.id === fileId) {
              return null
            }
            if (node.children) {
              const filteredChildren = node.children
                .map(deleteNode)
                .filter((child): child is FileNode => child !== null)
              return {
                ...node,
                children: filteredChildren,
              }
            }
            return node
          }
          
          const newTree = deleteNode(state.fileTree)
          return {
            fileTree: newTree,
            selectedFile: state.selectedFile?.id === fileId ? null : state.selectedFile,
          }
        })
      },
      
      moveFile: (_fileId, _newParentId) => {
        // Implementation would involve removing from old parent and adding to new parent
        // Omitted for brevity
      },
      
      // Operation states
      setRenamingFile: (fileId) => set({ renamingFileId: fileId }),
      setMovingFile: (fileId) => set({ movingFileId: fileId }),
      
      // Utilities
      findFileById: (fileId) => {
        const { fileTree } = get()
        if (!fileTree) return null
        
        const findNode = (node: FileNode): FileNode | null => {
          if (node.id === fileId) return node
          if (node.children) {
            for (const child of node.children) {
              const found = findNode(child)
              if (found) return found
            }
          }
          return null
        }
        
        return findNode(fileTree)
      },
      
      getFilePath: (fileId) => {
        const { fileTree } = get()
        if (!fileTree) return ''
        
        const buildPath = (node: FileNode, targetId: string, path: string[] = []): string[] | null => {
          if (node.id === targetId) {
            return [...path, node.name]
          }
          if (node.children) {
            for (const child of node.children) {
              const result = buildPath(child, targetId, [...path, node.name])
              if (result) return result
            }
          }
          return null
        }
        
        const pathArray = buildPath(fileTree, fileId, [])
        return pathArray ? pathArray.join('/') : ''
      },
    }),
    {
      name: 'file-system-store',
    }
  )
)