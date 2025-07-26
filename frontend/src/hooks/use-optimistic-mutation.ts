import { useCallback, useRef } from 'react'
import { useOptimisticStore } from '@/stores/useOptimisticStore'
import { useToast } from '@/hooks/use-toast'

interface OptimisticMutationOptions<TData, TError = Error, TVariables = void, TContext = unknown> {
  mutationFn: (variables: TVariables) => Promise<TData>
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext | void
  onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => Promise<void> | void
  onError?: (error: TError, variables: TVariables, context: TContext | undefined) => Promise<void> | void
  onSettled?: (data: TData | undefined, error: TError | null, variables: TVariables, context: TContext | undefined) => Promise<void> | void
  retry?: number | ((failureCount: number, error: TError) => boolean)
}

interface OptimisticMutationResult<TData, TError, TVariables> {
  mutate: (variables: TVariables) => void
  mutateAsync: (variables: TVariables) => Promise<TData>
  isLoading: boolean
  isError: boolean
  isSuccess: boolean
  error: TError | null
  data: TData | undefined
  reset: () => void
}

export function useOptimisticMutation<TData = unknown, TError = Error, TVariables = void, TContext = unknown>(
  options: OptimisticMutationOptions<TData, TError, TVariables, TContext>
): OptimisticMutationResult<TData, TError, TVariables> {
  const { toast } = useToast()
  const { addOperation, updateOperationStatus, rollbackOperation } = useOptimisticStore()
  
  const stateRef = useRef({
    isLoading: false,
    isError: false,
    isSuccess: false,
    error: null as TError | null,
    data: undefined as TData | undefined,
  })
  
  const reset = useCallback(() => {
    stateRef.current = {
      isLoading: false,
      isError: false,
      isSuccess: false,
      error: null,
      data: undefined,
    }
  }, [])
  
  const mutateAsync = useCallback(async (variables: TVariables): Promise<TData> => {
    let context: TContext | undefined
    let operationId: string | undefined
    
    try {
      // Set loading state
      stateRef.current.isLoading = true
      stateRef.current.isError = false
      stateRef.current.error = null
      
      // Call onMutate for optimistic update
      if (options.onMutate) {
        const result = await options.onMutate(variables)
        if (result !== undefined) {
          context = result
        }
      }
      
      // Add operation to optimistic store if context includes operation details
      if (context && typeof context === 'object' && 'optimisticOperation' in context) {
        const { optimisticOperation } = context as any
        operationId = addOperation({
          ...optimisticOperation,
          maxRetries: typeof options.retry === 'number' ? options.retry : 3,
        })
      }
      
      // Execute the actual mutation
      const data = await options.mutationFn(variables)
      
      // Update state
      stateRef.current.isLoading = false
      stateRef.current.isSuccess = true
      stateRef.current.data = data
      
      // Update operation status
      if (operationId) {
        updateOperationStatus(operationId, 'success')
      }
      
      // Call onSuccess
      if (options.onSuccess) {
        await options.onSuccess(data, variables, context)
      }
      
      // Call onSettled
      if (options.onSettled) {
        await options.onSettled(data, null, variables, context)
      }
      
      return data
    } catch (error) {
      // Update state
      stateRef.current.isLoading = false
      stateRef.current.isError = true
      stateRef.current.error = error as TError
      
      // Update operation status
      if (operationId) {
        updateOperationStatus(operationId, 'failed', (error as Error).message)
      }
      
      // Show error toast
      toast({
        title: 'Operation failed',
        description: (error as Error).message || 'An error occurred',
        variant: 'destructive',
      })
      
      // Call onError
      if (options.onError) {
        await options.onError(error as TError, variables, context)
      }
      
      // Rollback if needed
      if (operationId && context && typeof context === 'object' && 'rollback' in context) {
        const { rollback } = context as any
        if (typeof rollback === 'function') {
          await rollback()
          rollbackOperation(operationId)
        }
      }
      
      // Call onSettled
      if (options.onSettled) {
        await options.onSettled(undefined, error as TError, variables, context)
      }
      
      throw error
    }
  }, [addOperation, updateOperationStatus, rollbackOperation, toast, options])
  
  const mutate = useCallback((variables: TVariables) => {
    mutateAsync(variables).catch(() => {
      // Error is already handled in mutateAsync
    })
  }, [mutateAsync])
  
  return {
    mutate,
    mutateAsync,
    isLoading: stateRef.current.isLoading,
    isError: stateRef.current.isError,
    isSuccess: stateRef.current.isSuccess,
    error: stateRef.current.error,
    data: stateRef.current.data,
    reset,
  }
}