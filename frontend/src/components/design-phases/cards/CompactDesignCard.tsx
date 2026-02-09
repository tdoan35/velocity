import { Card, CardContent } from '@/components/ui/card'
import { Palette, CheckCircle2 } from 'lucide-react'
import type { DesignSystem, ShellSpec } from '@/types/design-phases'

interface CompactDesignCardProps {
  designSystem?: DesignSystem
  shellSpec?: ShellSpec
  completed?: boolean
  onClick: () => void
}

export function CompactDesignCard({ designSystem, shellSpec, completed, onClick }: CompactDesignCardProps) {
  if (!designSystem && !shellSpec) {
    return (
      <Card
        className="border-l-4 border-dashed border-l-purple-500 cursor-pointer hover:shadow-md hover:border-purple-300 transition-all"
        onClick={onClick}
      >
        <CardContent className="p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Palette className="w-4 h-4 text-purple-500" />
            <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Design</span>
          </div>
          <p className="text-sm text-muted-foreground">Define your design system</p>
        </CardContent>
      </Card>
    )
  }

  const colorKeys = ['primary', 'secondary', 'neutral', 'accent'] as const

  return (
    <Card
      className="border-l-4 border-l-purple-500 cursor-pointer hover:shadow-md hover:border-purple-300 transition-all relative"
      onClick={onClick}
    >
      {completed && (
        <CheckCircle2 className="absolute top-2 right-2 w-3.5 h-3.5 text-green-500" />
      )}
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Palette className="w-4 h-4 text-purple-500" />
          <span className="text-xs font-medium text-purple-600 dark:text-purple-400">Design</span>
        </div>
        {designSystem && (
          <>
            <div className="flex items-center gap-1.5 mb-1.5">
              {colorKeys.map((key) => {
                const color = designSystem.colors?.[key]
                if (!color) return null
                return (
                  <div
                    key={key}
                    className="w-4 h-4 rounded-full border border-gray-200 dark:border-gray-600"
                    style={{ backgroundColor: color.value }}
                    title={`${key}: ${color.value}`}
                  />
                )
              })}
            </div>
            {designSystem.typography && (
              <p className="text-xs text-muted-foreground truncate">
                {designSystem.typography.heading?.family} / {designSystem.typography.body?.family}
              </p>
            )}
          </>
        )}
        {shellSpec && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 font-medium mt-1">
            {shellSpec.layoutPattern}
          </span>
        )}
      </CardContent>
    </Card>
  )
}
