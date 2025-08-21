import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

interface DropIndicatorProps {
  visible: boolean;
  position: 'top' | 'bottom';
  className?: string;
}

export const DropIndicator: React.FC<DropIndicatorProps> = ({
  visible,
  position,
  className = '',
}) => {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={{ opacity: 1, scaleX: 1 }}
          exit={{ opacity: 0, scaleX: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className={cn(
            'absolute left-0 right-0 z-50 pointer-events-none',
            position === 'top' ? '-top-0.5' : '-bottom-0.5',
            className
          )}
        >
          <div 
            className="h-1 relative overflow-hidden"
            style={{
              background: 'linear-gradient(90deg, transparent 0%, #3b82f6 20%, #3b82f6 80%, transparent 100%)',
              boxShadow: '0 0 12px rgba(59, 130, 246, 0.6)',
            }}
          >
            {/* Animated pulse effect */}
            <motion.div
              className="absolute inset-0"
              animate={{
                x: ['0%', '100%'],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: 'linear',
              }}
              style={{
                background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.5) 50%, transparent 100%)',
                width: '50%',
              }}
            />
          </div>
          
          {/* Center dot indicator */}
          <motion.div
            className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2"
            animate={{
              scale: [1, 1.2, 1],
            }}
            transition={{
              duration: 1,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <div
              className="w-2 h-2 bg-blue-500 rounded-full"
              style={{
                boxShadow: '0 0 0 4px rgba(59, 130, 246, 0.2), 0 0 12px rgba(59, 130, 246, 0.4)',
              }}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default React.memo(DropIndicator);