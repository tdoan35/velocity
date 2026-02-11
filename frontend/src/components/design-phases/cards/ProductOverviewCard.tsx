import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowRight, ChevronDown, Pencil } from 'lucide-react'
import type { ProductOverview } from '@/types/design-phases'

interface ProductOverviewCardProps {
  overview: ProductOverview
  onEdit?: () => void
}

export function ProductOverviewCard({ overview, onEdit }: ProductOverviewCardProps) {
  const [problemsOpen, setProblemsOpen] = useState(false)
  const [featuresOpen, setFeaturesOpen] = useState(false)

  return (
    <Card className="border-gray-200 dark:border-gray-700 shadow-sm">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Product Vision: {overview.name}
          </CardTitle>
          {onEdit && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Pencil className="w-4 h-4" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {overview.description && (
          <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
            {overview.description}
          </p>
        )}

        {/* Problems & Solutions */}
        {overview.problems?.length > 0 && (
          <div>
            <button
              onClick={() => setProblemsOpen(!problemsOpen)}
              className="flex items-center justify-between w-full py-2 cursor-pointer"
            >
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Problems & Solutions
                <span className="ml-2 text-gray-400 dark:text-gray-500 normal-case tracking-normal">
                  ({overview.problems.length})
                </span>
              </span>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${
                  problemsOpen ? 'rotate-180' : ''
                }`}
                strokeWidth={1.5}
              />
            </button>
            <AnimatePresence initial={false}>
              {problemsOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <ul className="space-y-3 pt-2">
                    {overview.problems.map((problem, index) => (
                      <li key={index} className="flex items-start gap-3">
                        <ArrowRight className="w-4 h-4 text-gray-900 dark:text-gray-100 mt-1 shrink-0" strokeWidth={2} />
                        <div>
                          <span className="font-medium text-gray-800 dark:text-gray-200">
                            {problem.problem}
                          </span>
                          <span className="text-gray-500 dark:text-gray-400 mx-2">&mdash;</span>
                          <span className="text-gray-600 dark:text-gray-400">
                            {problem.solution}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Key Features */}
        {overview.features?.length > 0 && (
          <div>
            <button
              onClick={() => setFeaturesOpen(!featuresOpen)}
              className="flex items-center justify-between w-full py-2 cursor-pointer"
            >
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                Key Features
                <span className="ml-2 text-gray-400 dark:text-gray-500 normal-case tracking-normal">
                  ({overview.features.length})
                </span>
              </span>
              <ChevronDown
                className={`w-4 h-4 text-gray-400 dark:text-gray-500 transition-transform duration-200 ${
                  featuresOpen ? 'rotate-180' : ''
                }`}
                strokeWidth={1.5}
              />
            </button>
            <AnimatePresence initial={false}>
              {featuresOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2, ease: 'easeInOut' }}
                  className="overflow-hidden"
                >
                  <ul className="space-y-2 pt-2 ml-1">
                    {overview.features.map((feature, index) => (
                      <li key={index} className="flex items-start gap-4">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-900 dark:bg-gray-100 mt-2 shrink-0" />
                        <div>
                          <span className="text-gray-700 dark:text-gray-300">{feature.title}</span>
                          {feature.description && (
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                              {feature.description}
                            </p>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
