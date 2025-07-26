import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'

export interface Toast {
  id: string
  title: string
  description?: string
  variant?: 'default' | 'destructive' | 'success'
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

// Toast management hook

// Global toast state
let toastListeners: Array<(toasts: Toast[]) => void> = []
let toasts: Toast[] = []

const notifyListeners = () => {
  toastListeners.forEach(listener => listener(toasts))
}

export function useToast() {
  const [, forceUpdate] = useState({})

  useEffect(() => {
    const listener = () => forceUpdate({})
    toastListeners.push(listener)
    
    return () => {
      toastListeners = toastListeners.filter(l => l !== listener)
    }
  }, [])

  const toast = (toastData: Omit<Toast, 'id'>) => {
    const id = uuidv4()
    const newToast: Toast = { ...toastData, id }
    
    toasts = [...toasts, newToast]
    notifyListeners()
    
    // Auto-remove toast after duration
    if (toastData.duration !== 0) {
      setTimeout(() => {
        toasts = toasts.filter(t => t.id !== id)
        notifyListeners()
      }, toastData.duration || 5000)
    }
    
    return id
  }

  const dismiss = (id: string) => {
    toasts = toasts.filter(t => t.id !== id)
    notifyListeners()
  }

  const dismissAll = () => {
    toasts = []
    notifyListeners()
  }

  return {
    toast,
    dismiss,
    dismissAll,
    toasts,
  }
}