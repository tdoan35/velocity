// Rollback manager for optimistic operations

export type RollbackFunction = () => Promise<void> | void

export class RollbackManager {
  private rollbackFunctions: Map<string, RollbackFunction> = new Map()
  
  register(operationId: string, rollbackFn: RollbackFunction) {
    this.rollbackFunctions.set(operationId, rollbackFn)
  }
  
  async execute(operationId: string): Promise<boolean> {
    const rollbackFn = this.rollbackFunctions.get(operationId)
    if (!rollbackFn) {
      console.warn(`No rollback function found for operation ${operationId}`)
      return false
    }
    
    try {
      await rollbackFn()
      this.rollbackFunctions.delete(operationId)
      return true
    } catch (error) {
      console.error(`Rollback failed for operation ${operationId}:`, error)
      return false
    }
  }
  
  has(operationId: string): boolean {
    return this.rollbackFunctions.has(operationId)
  }
  
  clear(operationId: string) {
    this.rollbackFunctions.delete(operationId)
  }
  
  clearAll() {
    this.rollbackFunctions.clear()
  }
}

// Global rollback manager instance
export const rollbackManager = new RollbackManager()

// Helper function to create rollback context
export function createRollbackContext<T>(
  previousState: T,
  applyRollback: (state: T) => void | Promise<void>
): { previousState: T; rollback: RollbackFunction } {
  return {
    previousState,
    rollback: async () => {
      await applyRollback(previousState)
    }
  }
}