import { Card, CardContent } from '@/components/ui/card'
import { FileText, CheckCircle2 } from 'lucide-react'
import type { DesignSection } from '@/types/design-phases'

interface CompactSectionsCardProps {
  sections: DesignSection[]
  completed?: boolean
  onClick: () => void
}

export function CompactSectionsCard({ sections, completed, onClick }: CompactSectionsCardProps) {
  if (!sections || sections.length === 0) {
    return (
      <Card
        className="border-l-4 border-dashed border-l-orange-500 cursor-pointer hover:shadow-md hover:border-orange-300 transition-all"
        onClick={onClick}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <FileText className="w-4 h-4 text-orange-500" />
            <span className="text-xs font-medium text-orange-600 dark:text-orange-400">Sections</span>
          </div>
          <p className="text-sm text-muted-foreground">Define your sections</p>
        </CardContent>
      </Card>
    )
  }

  const maxVisible = 3
  const visibleNames = sections.slice(0, maxVisible).map(s => s.title)
  const overflow = sections.length - maxVisible

  const completedCount = sections.filter(s => s.spec && s.sample_data).length
  const inProgress = sections.filter(s => s.spec && !s.sample_data).length
  const pending = sections.length - completedCount - inProgress

  return (
    <Card
      className="border-l-4 border-l-orange-500 cursor-pointer hover:shadow-md hover:border-orange-300 transition-all relative"
      onClick={onClick}
    >
      {completed && (
        <CheckCircle2 className="absolute top-2 right-2 w-3.5 h-3.5 text-green-500" />
      )}
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <FileText className="w-4 h-4 text-orange-500" />
          <span className="text-xs font-medium text-orange-600 dark:text-orange-400">Sections</span>
        </div>
        <p className="text-xs text-muted-foreground truncate">
          {visibleNames.join(', ')}{overflow > 0 ? `, +${overflow} more` : ''}
        </p>
        <div className="flex items-center gap-1 mt-1.5 mb-1.5">
          {sections.map((s, i) => {
            const isCompleted = s.spec && s.sample_data
            const isInProgress = s.spec && !s.sample_data
            return (
              <div
                key={i}
                className={`w-2 h-2 rounded-full ${
                  isCompleted
                    ? 'bg-green-500'
                    : isInProgress
                      ? 'bg-yellow-500'
                      : 'bg-gray-300 dark:bg-gray-600'
                }`}
                title={s.title}
              />
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          {completedCount}/{sections.length} sections complete
        </p>
      </CardContent>
    </Card>
  )
}
