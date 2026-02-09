import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ChevronDown, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RoadmapSection } from '@/types/design-phases'

interface RoadmapSectionsCardProps {
  sections: RoadmapSection[]
  onEdit?: () => void
}

export function RoadmapSectionsCard({ sections, onEdit }: RoadmapSectionsCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <Card className="border-gray-200 dark:border-gray-700 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Product Roadmap
          </CardTitle>
          {onEdit && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <div className="p-0">
        <ul className="divide-y divide-gray-200 dark:divide-gray-700">
          {sections.map((section) => {
            const isExpanded = expandedId === section.id
            return (
              <li key={section.id}>
                <button
                  onClick={() => setExpandedId(isExpanded ? null : section.id)}
                  className="w-full px-6 py-4 flex items-center justify-between gap-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <span className="shrink-0 w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 text-xs font-medium flex items-center justify-center">
                      {section.order}
                    </span>
                    <div className="min-w-0">
                      <h3 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                        {section.title}
                      </h3>
                      {!isExpanded && (
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-1">
                          {section.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <ChevronDown
                    className={cn(
                      "w-4 h-4 text-gray-400 dark:text-gray-500 flex-shrink-0 transition-transform duration-200",
                      isExpanded && "rotate-180"
                    )}
                    strokeWidth={1.5}
                  />
                </button>
                <AnimatePresence initial={false}>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2, ease: 'easeInOut' }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-4 pl-16">
                        <p className="text-sm text-gray-600 dark:text-gray-300 whitespace-pre-wrap">
                          {section.description}
                        </p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            )
          })}
        </ul>
      </div>
    </Card>
  )
}
