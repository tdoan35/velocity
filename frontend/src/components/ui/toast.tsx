import { X, CheckCircle2, XCircle, Info } from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { Button } from './button'
import { cn } from '@/lib/utils'
import { AnimatePresence, motion } from 'framer-motion'

export function Toaster() {
  const { toasts, dismiss } = useToast()

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </AnimatePresence>
    </div>
  )
}

interface ToastProps {
  toast: {
    id: string
    title: string
    description?: string
    variant?: 'default' | 'destructive' | 'success'
    action?: {
      label: string
      onClick: () => void
    }
  }
  onDismiss: () => void
}

function Toast({ toast, onDismiss }: ToastProps) {
  const icons = {
    default: <Info className="h-5 w-5" />,
    destructive: <XCircle className="h-5 w-5" />,
    success: <CheckCircle2 className="h-5 w-5" />,
  }

  const icon = icons[toast.variant || 'default']

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 20, scale: 0.95 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'pointer-events-auto flex items-start gap-3 w-full max-w-sm p-4 pr-6 rounded-lg shadow-lg border bg-background',
        {
          'border-destructive/50 bg-destructive/10': toast.variant === 'destructive',
          'border-green-500/50 bg-green-500/10': toast.variant === 'success',
        }
      )}
    >
      <div
        className={cn('flex-shrink-0', {
          'text-destructive': toast.variant === 'destructive',
          'text-green-600': toast.variant === 'success',
          'text-primary': toast.variant === 'default',
        })}
      >
        {icon}
      </div>
      
      <div className="flex-1 grid gap-1">
        <div className="text-sm font-semibold">{toast.title}</div>
        {toast.description && (
          <div className="text-sm text-muted-foreground">{toast.description}</div>
        )}
        {toast.action && (
          <Button
            variant="link"
            size="sm"
            className="justify-start h-auto p-0 text-xs"
            onClick={toast.action.onClick}
          >
            {toast.action.label}
          </Button>
        )}
      </div>
      
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 flex-shrink-0 -mr-2 -mt-1"
        onClick={onDismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </motion.div>
  )
}

// Simple toast function for quick use
export function showToast({
  title,
  description,
  variant = 'default',
  duration = 5000,
}: {
  title: string
  description?: string
  variant?: 'default' | 'destructive' | 'success'
  duration?: number
}) {
  const { toast } = useToast()
  return toast({ title, description, variant, duration })
}