// Connection pooling for optimized database queries
import { createClient } from '@supabase/supabase-js'
import { createLogger } from './logger.ts'

interface PoolOptions {
  minConnections?: number
  maxConnections?: number
  idleTimeout?: number // ms
  acquireTimeout?: number // ms
  validateOnBorrow?: boolean
}

interface PoolStats {
  active: number
  idle: number
  waiting: number
  total: number
  created: number
  destroyed: number
}

class Connection {
  id: string
  client: any
  createdAt: number
  lastUsedAt: number
  useCount: number
  inUse: boolean

  constructor(url: string, key: string) {
    this.id = crypto.randomUUID()
    this.client = createClient(url, key)
    this.createdAt = Date.now()
    this.lastUsedAt = Date.now()
    this.useCount = 0
    this.inUse = false
  }

  async validate(): Promise<boolean> {
    try {
      // Simple validation query
      const { error } = await this.client.from('_health_check').select('1').limit(1)
      return !error
    } catch {
      return false
    }
  }

  acquire(): void {
    this.inUse = true
    this.useCount++
    this.lastUsedAt = Date.now()
  }

  release(): void {
    this.inUse = false
    this.lastUsedAt = Date.now()
  }
}

export class ConnectionPool {
  private pool: Connection[] = []
  private waitingQueue: Array<{
    resolve: (conn: Connection) => void
    reject: (error: Error) => void
    timeout: number
  }> = []
  private logger: any
  private options: Required<PoolOptions>
  private stats = {
    created: 0,
    destroyed: 0
  }
  private maintenanceInterval: number

  constructor(
    private url: string,
    private key: string,
    options: PoolOptions = {}
  ) {
    this.logger = createLogger({ context: 'ConnectionPool' })
    this.options = {
      minConnections: options.minConnections || 2,
      maxConnections: options.maxConnections || 10,
      idleTimeout: options.idleTimeout || 300000, // 5 minutes
      acquireTimeout: options.acquireTimeout || 30000, // 30 seconds
      validateOnBorrow: options.validateOnBorrow !== false
    }

    // Initialize minimum connections
    this.initializePool()
    
    // Start maintenance tasks
    this.maintenanceInterval = setInterval(() => this.maintain(), 60000) // Every minute
  }

  async acquire(): Promise<Connection> {
    const startTime = Date.now()

    // Try to find an idle connection
    let connection = this.pool.find(conn => !conn.inUse)

    if (connection) {
      // Validate if enabled
      if (this.options.validateOnBorrow) {
        const isValid = await connection.validate()
        if (!isValid) {
          await this.destroy(connection)
          connection = null
        }
      }
    }

    // Create new connection if needed and possible
    if (!connection && this.pool.length < this.options.maxConnections) {
      connection = await this.create()
    }

    // If still no connection, wait in queue
    if (!connection) {
      connection = await this.waitForConnection()
    }

    connection.acquire()

    await this.logger.debug('Connection acquired', {
      connectionId: connection.id,
      acquireTime: Date.now() - startTime,
      poolSize: this.pool.length
    })

    return connection
  }

  release(connection: Connection): void {
    connection.release()

    // Process waiting queue
    if (this.waitingQueue.length > 0) {
      const waiter = this.waitingQueue.shift()
      if (waiter) {
        clearTimeout(waiter.timeout)
        waiter.resolve(connection)
        connection.acquire()
        return
      }
    }

    this.logger.debug('Connection released', {
      connectionId: connection.id,
      useCount: connection.useCount
    })
  }

  async destroy(connection: Connection): Promise<void> {
    const index = this.pool.indexOf(connection)
    if (index > -1) {
      this.pool.splice(index, 1)
    }

    this.stats.destroyed++

    await this.logger.debug('Connection destroyed', {
      connectionId: connection.id,
      reason: 'explicit'
    })
  }

  async close(): Promise<void> {
    clearInterval(this.maintenanceInterval)

    // Reject all waiting requests
    this.waitingQueue.forEach(waiter => {
      clearTimeout(waiter.timeout)
      waiter.reject(new Error('Pool is closing'))
    })
    this.waitingQueue = []

    // Clear all connections
    this.pool = []

    await this.logger.info('Connection pool closed')
  }

  getStats(): PoolStats {
    const active = this.pool.filter(conn => conn.inUse).length
    const idle = this.pool.filter(conn => !conn.inUse).length

    return {
      active,
      idle,
      waiting: this.waitingQueue.length,
      total: this.pool.length,
      created: this.stats.created,
      destroyed: this.stats.destroyed
    }
  }

  // Get a client for direct use (bypasses pooling)
  getDirectClient(): any {
    return createClient(this.url, this.key)
  }

  // Execute a query using a pooled connection
  async execute<T>(
    operation: (client: any) => Promise<T>
  ): Promise<T> {
    const connection = await this.acquire()
    
    try {
      return await operation(connection.client)
    } finally {
      this.release(connection)
    }
  }

  // Execute multiple queries in a transaction-like manner
  async transaction<T>(
    operations: Array<(client: any) => Promise<any>>
  ): Promise<T[]> {
    const connection = await this.acquire()
    const results: T[] = []

    try {
      for (const operation of operations) {
        const result = await operation(connection.client)
        results.push(result)
      }
      return results
    } catch (error) {
      // In a real transaction, we would rollback here
      throw error
    } finally {
      this.release(connection)
    }
  }

  // Private methods

  private async initializePool(): Promise<void> {
    const promises = []
    for (let i = 0; i < this.options.minConnections; i++) {
      promises.push(this.create())
    }
    
    await Promise.all(promises)
    
    await this.logger.info('Connection pool initialized', {
      minConnections: this.options.minConnections,
      maxConnections: this.options.maxConnections
    })
  }

  private async create(): Promise<Connection> {
    const connection = new Connection(this.url, this.key)
    this.pool.push(connection)
    this.stats.created++

    await this.logger.debug('Connection created', {
      connectionId: connection.id,
      poolSize: this.pool.length
    })

    return connection
  }

  private async waitForConnection(): Promise<Connection> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = this.waitingQueue.findIndex(w => w.resolve === resolve)
        if (index > -1) {
          this.waitingQueue.splice(index, 1)
        }
        reject(new Error('Connection acquire timeout'))
      }, this.options.acquireTimeout)

      this.waitingQueue.push({ resolve, reject, timeout })
    })
  }

  private async maintain(): Promise<void> {
    const now = Date.now()
    const toDestroy: Connection[] = []

    // Check for idle connections to destroy
    for (const connection of this.pool) {
      if (!connection.inUse && 
          this.pool.length > this.options.minConnections &&
          now - connection.lastUsedAt > this.options.idleTimeout) {
        toDestroy.push(connection)
      }
    }

    // Destroy idle connections
    for (const connection of toDestroy) {
      await this.destroy(connection)
    }

    // Create new connections if below minimum
    while (this.pool.length < this.options.minConnections) {
      await this.create()
    }

    // Log stats periodically
    if (Math.random() < 0.1) { // 10% chance
      const stats = this.getStats()
      await this.logger.info('Pool statistics', stats)
    }
  }
}

// Create a singleton pool manager
class PoolManager {
  private pools: Map<string, ConnectionPool> = new Map()

  getPool(name: string = 'default'): ConnectionPool {
    let pool = this.pools.get(name)
    
    if (!pool) {
      pool = new ConnectionPool(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        {
          minConnections: 2,
          maxConnections: 10,
          idleTimeout: 300000,
          acquireTimeout: 30000,
          validateOnBorrow: true
        }
      )
      this.pools.set(name, pool)
    }
    
    return pool
  }

  async closeAll(): Promise<void> {
    const promises = Array.from(this.pools.values()).map(pool => pool.close())
    await Promise.all(promises)
    this.pools.clear()
  }
}

export const poolManager = new PoolManager()
export const defaultPool = poolManager.getPool()