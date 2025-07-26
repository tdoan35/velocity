import { cn } from '@/lib/utils'

interface ResponsiveGridProps {
  children: React.ReactNode
  className?: string
  cols?: {
    default?: number
    sm?: number
    md?: number
    lg?: number
    xl?: number
    '2xl'?: number
  }
  gap?: number
}

export function ResponsiveGrid({ 
  children, 
  className,
  cols = { default: 1, sm: 2, md: 3, lg: 4 },
  gap = 4
}: ResponsiveGridProps) {
  const colClasses = []
  
  if (cols.default) colClasses.push(`grid-cols-${cols.default}`)
  if (cols.sm) colClasses.push(`sm:grid-cols-${cols.sm}`)
  if (cols.md) colClasses.push(`md:grid-cols-${cols.md}`)
  if (cols.lg) colClasses.push(`lg:grid-cols-${cols.lg}`)
  if (cols.xl) colClasses.push(`xl:grid-cols-${cols.xl}`)
  if (cols['2xl']) colClasses.push(`2xl:grid-cols-${cols['2xl']}`)
  
  return (
    <div 
      className={cn(
        'grid',
        colClasses.join(' '),
        `gap-${gap}`,
        className
      )}
    >
      {children}
    </div>
  )
}