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
          bgColor: 'bg-gray-500/10',
          textColor: 'text-gray-600 dark:text-gray-400'
        }
      case 'in_progress':
        return {
          label: 'In Progress',
          bgColor: 'bg-blue-500/10',
          textColor: 'text-blue-600 dark:text-blue-400'
        }
      case 'review':
        return {
          label: 'Review',
          bgColor: 'bg-yellow-500/10',
          textColor: 'text-yellow-600 dark:text-yellow-400'
        }
      case 'finalized':
        return {
          label: 'Finalized',
          bgColor: 'bg-green-500/10',
          textColor: 'text-green-600 dark:text-green-400'
        }
      case 'archived':
        return {
          label: 'Archived',
          bgColor: 'bg-gray-500/10',
          textColor: 'text-muted-foreground'
        }
      default:
        return {
          label: 'Unknown',
          bgColor: 'bg-gray-500/10',
          textColor: 'text-muted-foreground'
        }
    }
  }

  const config = getStatusConfig()

  return (
    <div className={cn(`px-2 py-1 rounded-md ${config.bgColor} flex items-center gap-1`, className)}>
      <span className={`text-xs font-medium ${config.textColor}`}>
        {config.label}
      </span>
    </div>
  )
}