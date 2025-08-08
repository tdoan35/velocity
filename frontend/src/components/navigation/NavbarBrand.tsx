
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

interface NavbarBrandProps {
  className?: string
}

export function NavbarBrand({ className }: NavbarBrandProps) {
  return (
    <Link 
      to="/" 
      className={cn(
        "flex items-center gap-2 font-semibold text-lg [text-shadow:_0_1px_2px_rgb(0_0_0_/_20%)]",
        className
      )}
    >
      <span className="text-xl drop-shadow-sm">✨</span>
      <span className="text-foreground">Velocity</span>
    </Link>
  )
}