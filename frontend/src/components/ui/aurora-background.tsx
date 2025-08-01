import { cn } from "../../lib/utils";
import React from "react";
import type { ReactNode } from "react";

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) => {
  return (
    <div
      className={cn(
        "relative min-h-screen w-full overflow-hidden",
        className
      )}
      {...props}
    >
      {/* Base gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-white via-gray-50 to-white dark:from-slate-950 dark:via-slate-900 dark:to-black" />
      
      {/* Aurora effect layers */}
      <div className="absolute inset-0">
        {/* Light mode static base layer */}
        <div
          className="absolute inset-0 opacity-100 dark:opacity-0"
          style={{
            background: `
              radial-gradient(ellipse 800px 600px at 20% 0%, rgba(59, 130, 246, 0.25), transparent),
              radial-gradient(ellipse 600px 800px at 80% 100%, rgba(236, 72, 153, 0.15), transparent),
              radial-gradient(ellipse 700px 500px at 100% 0%, rgba(147, 51, 234, 0.20), transparent),
              radial-gradient(ellipse 800px 700px at 0% 100%, rgba(34, 197, 94, 0.12), transparent),
              radial-gradient(ellipse 600px 600px at 50% 50%, rgba(251, 146, 60, 0.15), transparent)
            `,
          }}
        />
        
        {/* Dark mode static base layer */}
        <div
          className="absolute inset-0 opacity-0 dark:opacity-100"
          style={{
            background: `
              radial-gradient(ellipse 800px 600px at 20% 0%, rgba(59, 130, 246, 0.08), transparent),
              radial-gradient(ellipse 600px 800px at 80% 100%, rgba(147, 51, 234, 0.05), transparent),
              radial-gradient(ellipse 700px 500px at 100% 0%, rgba(99, 102, 241, 0.07), transparent),
              radial-gradient(ellipse 800px 700px at 0% 100%, rgba(139, 92, 246, 0.05), transparent)
            `,
          }}
        />
        
        {/* Light mode animated layer 1 */}
        <div
          className="absolute inset-0 opacity-100 dark:opacity-0 animate-aurora"
          style={{
            background: `
              radial-gradient(circle 800px at 20% 80%, rgba(147, 51, 234, 0.20), transparent),
              radial-gradient(circle 800px at 80% 20%, rgba(236, 72, 153, 0.15), transparent),
              radial-gradient(circle 600px at 60% 60%, rgba(59, 130, 246, 0.25), transparent)
            `,
            backgroundSize: '200% 200%',
            backgroundPosition: '0% 0%',
          }}
        />
        
        {/* Dark mode animated layer 1 */}
        <div
          className="absolute inset-0 opacity-0 dark:opacity-100 animate-aurora"
          style={{
            background: `
              radial-gradient(circle 800px at 20% 80%, rgba(99, 102, 241, 0.07), transparent),
              radial-gradient(circle 800px at 80% 20%, rgba(139, 92, 246, 0.05), transparent),
              radial-gradient(circle 600px at 60% 60%, rgba(59, 130, 246, 0.08), transparent)
            `,
            backgroundSize: '200% 200%',
            backgroundPosition: '0% 0%',
          }}
        />
        
        {/* Light mode animated layer 2 */}
        <div
          className="absolute inset-0 opacity-100 dark:opacity-0 animate-aurora-reverse"
          style={{
            background: `
              radial-gradient(circle 600px at 80% 80%, rgba(251, 146, 60, 0.15), transparent),
              radial-gradient(circle 700px at 20% 20%, rgba(34, 197, 94, 0.12), transparent)
            `,
            backgroundSize: '200% 200%',
            backgroundPosition: '100% 100%',
            animationDuration: '7.5s',
          }}
        />
        
        {/* Dark mode animated layer 2 */}
        <div
          className="absolute inset-0 opacity-0 dark:opacity-100 animate-aurora-reverse"
          style={{
            background: `
              radial-gradient(circle 600px at 80% 80%, rgba(147, 51, 234, 0.04), transparent),
              radial-gradient(circle 700px at 20% 20%, rgba(99, 102, 241, 0.06), transparent)
            `,
            backgroundSize: '200% 200%',
            backgroundPosition: '100% 100%',
            animationDuration: '7.5s',
          }}
        />
        
        {/* Blur overlay for glow effect */}
        <div className="absolute inset-0 backdrop-blur-xl opacity-30 dark:backdrop-blur-sm dark:opacity-20" />
      </div>

      {/* Radial gradient overlay */}
      {showRadialGradient && (
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent dark:from-transparent dark:via-black/20 dark:to-transparent" />
      )}

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};