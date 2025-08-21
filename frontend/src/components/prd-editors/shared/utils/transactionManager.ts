import { v4 as uuidv4 } from 'uuid'

// Transaction operation types
export type TransactionOperationType = 'update' | 'add' | 'remove' | 'reorder'

// Single operation within a transaction
export interface TransactionOperation {
  type: TransactionOperationType
  sectionId?: string
  data?: any
  previousData?: any  // For rollback
}

// Transaction object
export interface Transaction {
  id: string
  operations: TransactionOperation[]
  timestamp: number
  status: 'pending' | 'committed' | 'rolled_back' | 'failed'
  error?: Error
}

// Transaction log entry
export interface TransactionLogEntry {
  transactionId: string
  timestamp: number
  operations: TransactionOperation[]
  status: Transaction['status']
  error?: string
}

// Version tracking for optimistic concurrency control
export interface VersionInfo {
  globalVersion: number
  sectionVersions: Map<string, number>
  lastModified: number
}

// Conflict resolution strategy
export type ConflictResolutionStrategy = 'client_wins' | 'server_wins' | 'merge' | 'manual'

// Transaction Manager class
export class TransactionManager {
  private transactions: Map<string, Transaction>
  private transactionLog: TransactionLogEntry[]
  private versionInfo: VersionInfo
  private maxLogSize: number
  private conflictStrategy: ConflictResolutionStrategy
  
  constructor(
    initialVersion: number = 1,
    conflictStrategy: ConflictResolutionStrategy = 'client_wins',
    maxLogSize: number = 100
  ) {
    this.transactions = new Map()
    this.transactionLog = []
    this.versionInfo = {
      globalVersion: initialVersion,
      sectionVersions: new Map(),
      lastModified: Date.now()
    }
    this.conflictStrategy = conflictStrategy
    this.maxLogSize = maxLogSize
  }
  
  // Begin a new transaction
  beginTransaction(): string {
    const transactionId = uuidv4()
    const transaction: Transaction = {
      id: transactionId,
      operations: [],
      timestamp: Date.now(),
      status: 'pending'
    }
    this.transactions.set(transactionId, transaction)
    return transactionId
  }
  
  // Add operation to transaction
  addOperation(
    transactionId: string, 
    operation: TransactionOperation
  ): boolean {
    const transaction = this.transactions.get(transactionId)
    if (!transaction || transaction.status !== 'pending') {
      return false
    }
    
    // Store previous data for potential rollback
    if (operation.type === 'update' && operation.sectionId) {
      operation.previousData = this.getSectionVersion(operation.sectionId)
    }
    
    transaction.operations.push(operation)
    return true
  }
  
  // Validate transaction before commit
  private validateTransaction(transaction: Transaction): boolean {
    // Check for conflicting operations within the transaction
    const sectionOps = new Map<string, TransactionOperation[]>()
    
    for (const op of transaction.operations) {
      if (op.sectionId) {
        const existing = sectionOps.get(op.sectionId) || []
        
        // Check for conflicts
        if (existing.some(e => 
          (e.type === 'remove' && op.type !== 'remove') ||
          (e.type !== 'remove' && op.type === 'remove')
        )) {
          return false // Conflicting operations on same section
        }
        
        existing.push(op)
        sectionOps.set(op.sectionId, existing)
      }
    }
    
    return true
  }
  
  // Commit transaction atomically
  async commitTransaction(
    transactionId: string,
    applyFn: (operations: TransactionOperation[]) => Promise<void>
  ): Promise<boolean> {
    const transaction = this.transactions.get(transactionId)
    if (!transaction || transaction.status !== 'pending') {
      return false
    }
    
    // Validate transaction
    if (!this.validateTransaction(transaction)) {
      transaction.status = 'failed'
      transaction.error = new Error('Transaction validation failed')
      this.logTransaction(transaction)
      return false
    }
    
    try {
      // Apply all operations atomically
      await applyFn(transaction.operations)
      
      // Update version info
      this.versionInfo.globalVersion++
      this.versionInfo.lastModified = Date.now()
      
      // Update section versions
      for (const op of transaction.operations) {
        if (op.sectionId) {
          const currentVersion = this.versionInfo.sectionVersions.get(op.sectionId) || 0
          this.versionInfo.sectionVersions.set(op.sectionId, currentVersion + 1)
        }
      }
      
      // Mark transaction as committed
      transaction.status = 'committed'
      this.logTransaction(transaction)
      
      // Clean up
      this.transactions.delete(transactionId)
      
      return true
      
    } catch (error) {
      // Transaction failed, attempt rollback
      transaction.status = 'failed'
      transaction.error = error as Error
      this.logTransaction(transaction)
      
      // Attempt rollback
      await this.rollbackTransaction(transactionId)
      
      return false
    }
  }
  
  // Rollback a transaction
  async rollbackTransaction(
    transactionId: string,
    rollbackFn?: (operations: TransactionOperation[]) => Promise<void>
  ): Promise<boolean> {
    const transaction = this.transactions.get(transactionId)
    if (!transaction) {
      return false
    }
    
    try {
      if (rollbackFn) {
        // Create rollback operations (reverse of original)
        const rollbackOps = transaction.operations.reverse().map(op => {
          switch (op.type) {
            case 'add':
              return { ...op, type: 'remove' as TransactionOperationType }
            case 'remove':
              return { ...op, type: 'add' as TransactionOperationType, data: op.previousData }
            case 'update':
              return { ...op, data: op.previousData }
            default:
              return op
          }
        })
        
        await rollbackFn(rollbackOps)
      }
      
      transaction.status = 'rolled_back'
      this.logTransaction(transaction)
      
      // Clean up
      this.transactions.delete(transactionId)
      
      return true
      
    } catch (error) {
      console.error('Rollback failed:', error)
      return false
    }
  }
  
  // Cancel a pending transaction
  cancelTransaction(transactionId: string): boolean {
    const transaction = this.transactions.get(transactionId)
    if (!transaction || transaction.status !== 'pending') {
      return false
    }
    
    this.transactions.delete(transactionId)
    return true
  }
  
  // Log transaction for audit trail
  private logTransaction(transaction: Transaction): void {
    const logEntry: TransactionLogEntry = {
      transactionId: transaction.id,
      timestamp: transaction.timestamp,
      operations: transaction.operations,
      status: transaction.status,
      error: transaction.error?.message
    }
    
    this.transactionLog.push(logEntry)
    
    // Trim log if it exceeds max size
    if (this.transactionLog.length > this.maxLogSize) {
      this.transactionLog = this.transactionLog.slice(-this.maxLogSize)
    }
  }
  
  // Get version info for a section
  getSectionVersion(sectionId: string): number {
    return this.versionInfo.sectionVersions.get(sectionId) || 0
  }
  
  // Check for version conflicts
  hasVersionConflict(
    sectionId: string, 
    clientVersion: number
  ): boolean {
    const serverVersion = this.getSectionVersion(sectionId)
    return clientVersion < serverVersion
  }
  
  // Resolve version conflict based on strategy
  async resolveConflict(
    sectionId: string,
    clientData: any,
    serverData: any,
    mergeFn?: (client: any, server: any) => any
  ): Promise<any> {
    switch (this.conflictStrategy) {
      case 'client_wins':
        return clientData
        
      case 'server_wins':
        return serverData
        
      case 'merge':
        if (mergeFn) {
          return mergeFn(clientData, serverData)
        }
        // Fallback to server wins if no merge function
        return serverData
        
      case 'manual':
        // Throw error to trigger manual resolution
        throw new Error(`Version conflict for section ${sectionId} requires manual resolution`)
        
      default:
        return serverData
    }
  }
  
  // Get transaction history
  getTransactionLog(
    limit?: number,
    filter?: (entry: TransactionLogEntry) => boolean
  ): TransactionLogEntry[] {
    let log = [...this.transactionLog]
    
    if (filter) {
      log = log.filter(filter)
    }
    
    if (limit) {
      log = log.slice(-limit)
    }
    
    return log
  }
  
  // Get current version info
  getVersionInfo(): VersionInfo {
    return { ...this.versionInfo }
  }
  
  // Clear all transactions and reset version
  reset(initialVersion: number = 1): void {
    this.transactions.clear()
    this.transactionLog = []
    this.versionInfo = {
      globalVersion: initialVersion,
      sectionVersions: new Map(),
      lastModified: Date.now()
    }
  }
}

// Transaction queue for handling concurrent updates
export class TransactionQueue {
  private queue: Array<() => Promise<void>>
  private processing: boolean
  private maxRetries: number
  private retryDelay: number
  
  constructor(maxRetries: number = 3, retryDelay: number = 1000) {
    this.queue = []
    this.processing = false
    this.maxRetries = maxRetries
    this.retryDelay = retryDelay
  }
  
  // Add transaction to queue
  async enqueue(transaction: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const wrappedTransaction = async () => {
        let retries = 0
        while (retries < this.maxRetries) {
          try {
            await transaction()
            resolve()
            return
          } catch (error) {
            retries++
            if (retries >= this.maxRetries) {
              reject(error)
              return
            }
            // Wait before retry
            await new Promise(r => setTimeout(r, this.retryDelay * retries))
          }
        }
      }
      
      this.queue.push(wrappedTransaction)
      this.process()
    })
  }
  
  // Process queue
  private async process(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }
    
    this.processing = true
    
    while (this.queue.length > 0) {
      const transaction = this.queue.shift()
      if (transaction) {
        try {
          await transaction()
        } catch (error) {
          console.error('Transaction failed:', error)
        }
      }
    }
    
    this.processing = false
  }
  
  // Get queue size
  getQueueSize(): number {
    return this.queue.length
  }
  
  // Clear queue
  clear(): void {
    this.queue = []
  }
  
  // Check if queue is processing
  isProcessing(): boolean {
    return this.processing
  }
}