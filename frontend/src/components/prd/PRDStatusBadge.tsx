import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface PRDStatusBadgeProps {
  status: 'draft' | 'in_progress' | 'review' | 'finalized' | 'archived'
  className?: string
}

export function PRDStatusBadge({ status, className }: PRDStatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'draft':
        return {
          label: 'Draft',
          variant: 'secondary' as const,
          className: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
        }
      case 'in_progress':
        return {
          label: 'In Progress',
          variant: 'default' as const,
          className: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
        }
      case 'review':
        return {
          label: 'Review',
          variant: 'default' as const,
          className: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
        }
      case 'finalized':
        return {
          label: 'Finalized',
          variant: 'default' as const,
          className: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
        }
      case 'archived':
        return {
          label: 'Archived',
          variant: 'outline' as const,
          className: 'text-muted-foreground'
        }
      default:
        return {
          label: 'Unknown',
          variant: 'outline' as const,
          className: ''
        }
    }
  }

  const config = getStatusConfig()

  return (
    <Badge
      variant={config.variant}
      className={cn(config.className, className)}
    >
      {config.label}
    </Badge>
  )
}