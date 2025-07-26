import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Toaster } from '@/components/ui/toast'
import { PendingOperations, SyncStatusIndicator } from '@/components/ui/pending-operations'
import { LoadingSpinner, SuccessIndicator, ErrorIndicator, InlineLoading } from '@/components/ui/loading-states'
import { useOptimisticFileOperations } from '@/hooks/use-optimistic-file-operations'
import { useOptimisticStore } from '@/stores/useOptimisticStore'
import { useToast } from '@/hooks/use-toast'
import { FileText, Folder, Plus, Edit2, Trash2, WifiOff, Wifi } from 'lucide-react'
import { cn } from '@/lib/utils'

export function OptimisticUIDemo() {
  const [newFileName, setNewFileName] = useState('')
  const [selectedFile, setSelectedFile] = useState<string | null>(null)
  const [editingFile, setEditingFile] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const { isOnline, setOnlineStatus } = useOptimisticStore()
  const { toast } = useToast()
  
  const {
    pendingOperations,
  } = useOptimisticFileOperations()
  
  // Demo files
  const [files, setFiles] = useState([
    { id: 'file-1', name: 'App.tsx', type: 'file' as const },
    { id: 'file-2', name: 'styles.css', type: 'file' as const },
    { id: 'folder-1', name: 'components', type: 'folder' as const },
  ])
  
  const handleCreateFile = async () => {
    if (!newFileName.trim()) return
    
    const tempId = `file-${Date.now()}`
    const newFile = {
      id: tempId,
      name: newFileName,
      type: 'file' as const,
    }
    
    try {
      // Optimistically add the file
      setFiles(prev => [...prev, newFile])
      setNewFileName('')
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      // Simulate occasional failure (5% chance)
      if (Math.random() < 0.05) {
        throw new Error('Failed to create file')
      }
      
      toast({
        title: 'File created',
        description: `${newFileName} has been created successfully`,
        variant: 'success',
      })
    } catch (error) {
      // Rollback on error
      setFiles(prev => prev.filter(f => f.id !== tempId))
      toast({
        title: 'Failed to create file',
        description: 'An error occurred',
        variant: 'destructive',
      })
    }
  }
  
  const handleUpdateFile = async (fileId: string) => {
    if (!editName.trim()) return
    
    const originalFile = files.find(f => f.id === fileId)
    if (!originalFile) return
    
    try {
      // Optimistically update the file
      setFiles(prev => prev.map(file => 
        file.id === fileId ? { ...file, name: editName } : file
      ))
      setEditingFile(null)
      const newName = editName
      setEditName('')
      
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 800))
      
      // Simulate occasional failure (5% chance)
      if (Math.random() < 0.05) {
        throw new Error('Failed to update file')
      }
      
      toast({
        title: 'File renamed',
        description: `Renamed to ${newName}`,
        variant: 'success',
      })
    } catch (error) {
      // Rollback on error
      setFiles(prev => prev.map(file => 
        file.id === fileId ? originalFile : file
      ))
      toast({
        title: 'Failed to rename file',
        description: 'An error occurred',
        variant: 'destructive',
      })
    }
  }
  
  const handleDeleteFile = async (fileId: string) => {
    // Find the file to delete
    const fileToDelete = files.find(f => f.id === fileId)
    if (!fileToDelete) return
    
    try {
      // Optimistically remove the file
      setFiles(prev => prev.filter(file => file.id !== fileId))
      
      // Simulate the delete operation
      await new Promise(resolve => setTimeout(resolve, 600))
      
      // Show success toast
      toast({
        title: 'File deleted',
        description: `${fileToDelete.name} has been deleted successfully`,
        variant: 'success',
      })
    } catch (error) {
      // Rollback on error
      setFiles(prev => [...prev, fileToDelete])
      toast({
        title: 'Failed to delete file',
        description: 'An error occurred',
        variant: 'destructive',
      })
    }
  }
  
  const getPendingOperation = (fileId: string) => {
    return pendingOperations.find(op => op.entityId === fileId)
  }
  
  return (
    <div className="h-screen bg-background p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Optimistic UI Updates Demo</h1>
            <p className="text-muted-foreground mt-2">
              Experience instant UI feedback with automatic rollback on errors
            </p>
          </div>
          <div className="flex items-center gap-4">
            <SyncStatusIndicator />
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOnlineStatus(!isOnline)}
              className={cn(!isOnline && 'border-destructive')}
            >
              {isOnline ? <Wifi className="h-4 w-4 mr-2" /> : <WifiOff className="h-4 w-4 mr-2" />}
              {isOnline ? 'Online' : 'Offline'}
            </Button>
          </div>
        </div>
        
        <div className="grid grid-cols-3 gap-6">
          {/* File Manager */}
          <div className="col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>File Manager</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Create new file */}
                <div className="flex gap-2">
                  <Input
                    placeholder="New file name..."
                    value={newFileName}
                    onChange={(e) => setNewFileName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleCreateFile()}
                  />
                  <Button
                    onClick={handleCreateFile}
                    disabled={!newFileName.trim()}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create File
                  </Button>
                </div>
                
                {/* File list */}
                <div className="space-y-2">
                  {files.map((file) => {
                    const pendingOp = getPendingOperation(file.id)
                    const isDeleting = pendingOp?.type === 'delete'
                    const isUpdating = pendingOp?.type === 'update'
                    
                    return (
                      <div
                        key={file.id}
                        className={cn(
                          'flex items-center gap-3 p-3 rounded-lg border transition-all',
                          selectedFile === file.id && 'border-primary bg-primary/5',
                          isDeleting && 'opacity-50',
                        )}
                      >
                        {file.type === 'folder' ? (
                          <Folder className="h-5 w-5 text-blue-600" />
                        ) : (
                          <FileText className="h-5 w-5 text-muted-foreground" />
                        )}
                        
                        {editingFile === file.id ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleUpdateFile(file.id)
                              if (e.key === 'Escape') {
                                setEditingFile(null)
                                setEditName('')
                              }
                            }}
                            onBlur={() => handleUpdateFile(file.id)}
                            className="flex-1 h-8"
                            autoFocus
                          />
                        ) : (
                          <InlineLoading isLoading={isUpdating} className="flex-1">
                            <button
                              className="text-left flex-1 hover:text-primary transition-colors"
                              onClick={() => setSelectedFile(file.id)}
                            >
                              {file.name}
                            </button>
                          </InlineLoading>
                        )}
                        
                        <div className="flex items-center gap-1">
                          {pendingOp && (
                            <LoadingSpinner size="sm" className="mr-2" />
                          )}
                          {!isDeleting && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setEditingFile(file.id)
                                  setEditName(file.name)
                                }}
                                disabled={!!pendingOp}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => handleDeleteFile(file.id)}
                                disabled={!!pendingOp}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                
                {/* Demo instructions */}
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold text-sm mb-2">Try these actions:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Create, rename, or delete files - changes appear instantly</li>
                    <li>• Toggle offline mode to see operation queueing</li>
                    <li>• Create/update operations have a 5% chance to fail (for demo)</li>
                    <li>• Failed operations can be retried or rolled back</li>
                    <li>• Delete operations always succeed</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Operations Panel */}
          <div className="space-y-4">
            <PendingOperations />
            
            {/* Success/Error states demo */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">UI States</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Loading States:</p>
                  <LoadingSpinner size="sm" />
                  <InlineLoading isLoading={true}>
                    <div className="h-8 flex items-center px-3 bg-muted rounded">
                      Sample content
                    </div>
                  </InlineLoading>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">Success State:</p>
                  <SuccessIndicator message="Operation completed" />
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">Error State:</p>
                  <ErrorIndicator 
                    message="Operation failed" 
                    onRetry={() => console.log('Retry')} 
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
      
      {/* Toast notifications */}
      <Toaster />
    </div>
  )
}