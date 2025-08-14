import React, { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { useDragStore } from '@/stores/dragStateStore'
import { dragLogger } from '@/utils/dragLogger'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * Error boundary specifically for drag and drop operations
 * Ensures drag state is cleaned up if an error occurs during drag
 */
class DragErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log the error
    dragLogger.error('React error boundary caught error during drag operation', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorBoundary: 'DragErrorBoundary'
    })

    // Reset drag state if we're in the middle of a drag operation
    const dragState = useDragStore.getState()
    if (dragState.type !== 'none') {
      console.warn('🧹 Cleaning up drag state due to error boundary')
      dragState.resetDragState()
    }
  }

  render() {
    if (this.state.hasError) {
      // Render fallback UI
      return this.props.fallback || (
        <div className="p-4 border border-red-200 bg-red-50 rounded-md">
          <h3 className="text-red-800 font-medium">Something went wrong</h3>
          <p className="text-red-600 text-sm mt-1">
            An error occurred during the drag operation. The page has been reset.
          </p>
          <button 
            className="mt-2 px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700"
            onClick={() => this.setState({ hasError: false, error: undefined })}
          >
            Try Again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * HOC wrapper for easier use
 */
export function withDragErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: ReactNode
) {
  return function WrappedComponent(props: P) {
    return (
      <DragErrorBoundary fallback={fallback}>
        <Component {...props} />
      </DragErrorBoundary>
    )
  }
}

export default DragErrorBoundary