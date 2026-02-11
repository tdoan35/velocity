import { Card, CardContent } from '@/components/ui/card'
import { Lightbulb, CheckCircle2 } from 'lucide-react'
import type { ProductOverview } from '@/types/design-phases'

interface CompactProductCardProps {
  productOverview?: ProductOverview
  completed?: boolean
  onClick: () => void
}

export function CompactProductCard({ productOverview, completed, onClick }: CompactProductCardProps) {
  if (!productOverview) {
    return (
      <Card
        className="border-l-4 border-dashed border-l-emerald-500 cursor-pointer hover:shadow-md hover:border-emerald-300 transition-all"
        onClick={onClick}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Lightbulb className="w-4 h-4 text-emerald-500" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Product</span>
          </div>
          <p className="text-sm text-muted-foreground">Define your product vision</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card
      className="border-l-4 border-l-emerald-500 cursor-pointer hover:shadow-md hover:border-emerald-300 transition-all relative"
      onClick={onClick}
    >
      {completed && (
        <CheckCircle2 className="absolute top-2 right-2 w-3.5 h-3.5 text-green-500" />
      )}
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Lightbulb className="w-4 h-4 text-emerald-500" />
          <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Product</span>
        </div>
        <p className="text-sm font-semibold truncate">{productOverview.name}</p>
        <p className="text-xs text-muted-foreground line-clamp-1">{productOverview.description}</p>
        <div className="flex gap-2 mt-2">
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300">
            {productOverview.features?.length ?? 0} features
          </span>
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300">
            {productOverview.problems?.length ?? 0} problems
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
