import type { StateCreator, StoreMutatorIdentifier } from 'zustand'

type Logger = <
  T,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = []
>(
  f: StateCreator<T, Mps, Mcs>,
  name?: string
) => StateCreator<T, Mps, Mcs>

type LoggerImpl = <T>(
  f: StateCreator<T, [], []>,
  name?: string
) => StateCreator<T, [], []>

const loggerImpl: LoggerImpl = (f, name) => (set, get, store) => {
  const loggedSet: typeof set = (...args: any[]) => {
    const prevState = get()
    // @ts-expect-error - Zustand types are complex
    set(...args)
    const nextState = get()
    
    if (import.meta.env.DEV) {
      console.group(`[${name || 'Store'}] State Update @ ${new Date().toLocaleTimeString()}`)
      console.log('Previous State:', prevState)
      console.log('Next State:', nextState)
      console.log('Changes:', getDiff(prevState, nextState))
      console.groupEnd()
    }
  }
  
  return f(loggedSet, get, store)
}

export const logger = loggerImpl as unknown as Logger

// Helper function to get the diff between two objects
function getDiff(prev: any, next: any): Record<string, { from: any; to: any }> {
  const diff: Record<string, { from: any; to: any }> = {}
  
  // Check for changed or added properties
  for (const key in next) {
    if (prev[key] !== next[key]) {
      diff[key] = {
        from: prev[key],
        to: next[key],
      }
    }
  }
  
  // Check for removed properties
  for (const key in prev) {
    if (!(key in next)) {
      diff[key] = {
        from: prev[key],
        to: undefined,
      }
    }
  }
  
  return diff
}

// Performance monitoring middleware
export const performanceLogger = <T>(
  config: StateCreator<T>,
  name = 'Store'
): StateCreator<T> => (set, get, api) => {
  const trackedSet: typeof set = (...args: any[]) => {
    const start = performance.now()
    // @ts-expect-error - Zustand types are complex
    set(...args)
    const end = performance.now()
    
    if (import.meta.env.DEV && end - start > 16) { // Log if update takes more than 16ms
      console.warn(
        `[${name}] Slow state update detected: ${(end - start).toFixed(2)}ms`
      )
    }
  }
  
  return config(trackedSet, get, api)
}