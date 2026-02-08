import { Check, ArrowRight } from 'lucide-react'
import type { ReactNode } from 'react'

export type StepStatus = 'completed' | 'current' | 'upcoming'

interface StepIndicatorProps {
  step: number
  status: StepStatus
  children: ReactNode
  isLast?: boolean
}

export function StepIndicator({ step, status, children, isLast = false }: StepIndicatorProps) {
  return (
    <div className="relative">
      {/* Vertical connecting line */}
      {!isLast && (
        <div
          className="absolute left-[11px] top-[28px] w-[2px] h-[calc(100%+16px)] border-l-2 border-gray-200 dark:border-gray-700"
          aria-hidden="true"
        />
      )}

      {/* Step badge */}
      <div className="absolute -left-[1px] top-0 z-10">
        <StepBadge step={step} status={status} />
      </div>

      {/* Content area */}
      <div className="pl-10">
        {children}
      </div>
    </div>
  )
}

function StepBadge({ step, status }: { step: number; status: StepStatus }) {
  const base = 'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-200'

  if (status === 'completed') {
    return (
      <div className={`${base} bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400`}>
        <Check className="w-3 h-3" strokeWidth={2.5} />
      </div>
    )
  }

  if (status === 'current') {
    return (
      <div className={`${base} bg-gray-900 dark:bg-gray-100 text-gray-100 dark:text-gray-900 shadow-sm`}>
        <ArrowRight className="w-3 h-3" strokeWidth={2.5} />
      </div>
    )
  }

  // upcoming
  return (
    <div className={`${base} bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400`}>
      {step}
    </div>
  )
}
