import { useEffect, useRef } from 'react'

interface TouchGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  onSwipeUp?: () => void
  onSwipeDown?: () => void
  onTap?: () => void
  onDoubleTap?: () => void
  minSwipeDistance?: number
  maxTapDuration?: number
  doubleTapDelay?: number
}

export function useTouchGestures<T extends HTMLElement = HTMLDivElement>(
  options: TouchGestureOptions = {}
) {
  const {
    onSwipeLeft,
    onSwipeRight,
    onSwipeUp,
    onSwipeDown,
    onTap,
    onDoubleTap,
    minSwipeDistance = 50,
    maxTapDuration = 200,
    doubleTapDelay = 300
  } = options

  const ref = useRef<T>(null)
  const touchStart = useRef<{ x: number; y: number; time: number } | null>(null)
  const lastTap = useRef<number>(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      touchStart.current = {
        x: touch.clientX,
        y: touch.clientY,
        time: Date.now()
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - touchStart.current.x
      const deltaY = touch.clientY - touchStart.current.y
      const deltaTime = Date.now() - touchStart.current.time

      // Check for tap
      if (Math.abs(deltaX) < 10 && Math.abs(deltaY) < 10 && deltaTime < maxTapDuration) {
        const now = Date.now()
        const timeSinceLastTap = now - lastTap.current

        if (timeSinceLastTap < doubleTapDelay && onDoubleTap) {
          onDoubleTap()
          lastTap.current = 0
        } else {
          if (onTap) {
            onTap()
          }
          lastTap.current = now
        }
        return
      }

      // Check for swipe
      if (Math.abs(deltaX) > Math.abs(deltaY)) {
        // Horizontal swipe
        if (Math.abs(deltaX) > minSwipeDistance) {
          if (deltaX > 0 && onSwipeRight) {
            onSwipeRight()
          } else if (deltaX < 0 && onSwipeLeft) {
            onSwipeLeft()
          }
        }
      } else {
        // Vertical swipe
        if (Math.abs(deltaY) > minSwipeDistance) {
          if (deltaY > 0 && onSwipeDown) {
            onSwipeDown()
          } else if (deltaY < 0 && onSwipeUp) {
            onSwipeUp()
          }
        }
      }

      touchStart.current = null
    }

    element.addEventListener('touchstart', handleTouchStart)
    element.addEventListener('touchend', handleTouchEnd)

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onSwipeLeft, onSwipeRight, onSwipeUp, onSwipeDown, onTap, onDoubleTap, minSwipeDistance, maxTapDuration, doubleTapDelay])

  return ref
}