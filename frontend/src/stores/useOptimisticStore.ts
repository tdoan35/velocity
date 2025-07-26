import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

export interface OptimisticOperation {
  id: string
  type: 'create' | 'update' | 'delete' | 'move' | 'rename'
  entityType: 'file' | 'folder' | 'tab' | 'project'
  entityId: string
  previousState: any
  optimisticState: any
  status: 'pending' | 'success' | 'failed' | 'rolledback'
  timestamp: number
  retryCount: number
  maxRetries: number
  errorMessage?: string
}

export interface OptimisticStore {
  operations: Map<string, OptimisticOperation>
  failedOperations: OptimisticOperation[]
  isOnline: boolean
  isSyncing: boolean
  
  // Actions
  addOperation: (operation: Omit<OptimisticOperation, 'id' | 'timestamp' | 'status' | 'retryCount'>) => string
  updateOperationStatus: (operationId: string, status: OptimisticOperation['status'], errorMessage?: string) => void
  rollbackOperation: (operationId: string) => void
  retryOperation: (operationId: string) => void
  clearFailedOperations: () => void
  setOnlineStatus: (isOnline: boolean) => void
  setSyncingStatus: (isSyncing: boolean) => void
  
  // Utilities
  getOperationsByEntity: (entityType: string, entityId: string) => OptimisticOperation[]
  getPendingOperations: () => OptimisticOperation[]
  canRetryOperation: (operationId: string) => boolean
}

export const useOptimisticStore = create<OptimisticStore>()(
  devtools(
      subscribeWithSelector((set, get) => ({
        operations: new Map(),
        failedOperations: [],
        isOnline: navigator.onLine,
        isSyncing: false,
        
        addOperation: (operation) => {
          const id = uuidv4()
          const newOperation: OptimisticOperation = {
            ...operation,
            id,
            timestamp: Date.now(),
            status: 'pending',
            retryCount: 0,
          }
          
          set(state => ({
            operations: new Map(state.operations).set(id, newOperation)
          }))
          
          return id
        },
        
        updateOperationStatus: (operationId, status, errorMessage) => {
          set(state => {
            const operations = new Map(state.operations)
            const operation = operations.get(operationId)
            
            if (!operation) return state
            
            const updatedOperation = { ...operation, status, errorMessage }
            operations.set(operationId, updatedOperation)
            
            // Move to failed operations if failed
            const failedOperations = status === 'failed' 
              ? [...state.failedOperations, updatedOperation]
              : state.failedOperations
            
            // Remove from operations if success or rolledback
            if (status === 'success' || status === 'rolledback') {
              operations.delete(operationId)
            }
            
            return { operations, failedOperations }
          })
        },
        
        rollbackOperation: (operationId) => {
          const operation = get().operations.get(operationId)
          if (!operation) return
          
          // Here you would implement the actual rollback logic
          // For now, just update the status
          get().updateOperationStatus(operationId, 'rolledback')
        },
        
        retryOperation: (operationId) => {
          set(state => {
            const operation = state.failedOperations.find(op => op.id === operationId)
            if (!operation || !get().canRetryOperation(operationId)) return state
            
            const updatedOperation = {
              ...operation,
              status: 'pending' as const,
              retryCount: operation.retryCount + 1,
              errorMessage: undefined,
            }
            
            const operations = new Map(state.operations).set(operationId, updatedOperation)
            const failedOperations = state.failedOperations.filter(op => op.id !== operationId)
            
            return { operations, failedOperations }
          })
        },
        
        clearFailedOperations: () => {
          set({ failedOperations: [] })
        },
        
        setOnlineStatus: (isOnline) => {
          set({ isOnline })
          
          // Auto-retry pending operations when coming back online
          if (isOnline) {
            // const pendingOps = get().getPendingOperations()
            // TODO: Implement retry logic here
          }
        },
        
        setSyncingStatus: (isSyncing) => {
          set({ isSyncing })
        },
        
        getOperationsByEntity: (entityType, entityId) => {
          const operations = Array.from(get().operations.values())
          return operations.filter(op => 
            op.entityType === entityType && op.entityId === entityId
          )
        },
        
        getPendingOperations: () => {
          const operations = Array.from(get().operations.values())
          return operations.filter(op => op.status === 'pending')
        },
        
        canRetryOperation: (operationId) => {
          const operation = get().failedOperations.find(op => op.id === operationId)
          return operation ? operation.retryCount < operation.maxRetries : false
        },
      })
    ),
    {
      name: 'optimistic-store',
    }
  )
)

// Listen for online/offline events
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useOptimisticStore.getState().setOnlineStatus(true)
  })
  
  window.addEventListener('offline', () => {
    useOptimisticStore.getState().setOnlineStatus(false)
  })
}