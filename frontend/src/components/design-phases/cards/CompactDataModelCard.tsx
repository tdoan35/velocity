import { Card, CardContent } from '@/components/ui/card'
import { Database, CheckCircle2 } from 'lucide-react'
import type { DataModel } from '@/types/design-phases'

interface CompactDataModelCardProps {
  dataModel?: DataModel
  completed?: boolean
  onClick: () => void
}

export function CompactDataModelCard({ dataModel, completed, onClick }: CompactDataModelCardProps) {
  if (!dataModel) {
    return (
      <Card
        className="border-l-4 border-dashed border-l-blue-500 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all"
        onClick={onClick}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Database className="w-4 h-4 text-blue-500" />
            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Data Model</span>
          </div>
          <p className="text-sm text-muted-foreground">Define your data model</p>
        </CardContent>
      </Card>
    )
  }

  const maxVisible = 4
  const entities = dataModel.entities
  const visibleEntities = entities.slice(0, maxVisible)
  const overflow = entities.length - maxVisible

  return (
    <Card
      className="border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md hover:border-blue-300 transition-all relative"
      onClick={onClick}
    >
      {completed && (
        <CheckCircle2 className="absolute top-2 right-2 w-3.5 h-3.5 text-green-500" />
      )}
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Database className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Data Model</span>
        </div>
        <div className="flex flex-wrap gap-1 mb-2">
          {visibleEntities.map((entity) => (
            <span
              key={entity.name}
              className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 font-medium"
            >
              {entity.name}
            </span>
          ))}
          {overflow > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs text-muted-foreground">
              +{overflow} more
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {entities.length} entities &middot; {dataModel.relationships.length} relationships
        </p>
      </CardContent>
    </Card>
  )
}
