import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import type { AppNotification } from '@/types/store'

interface AppState {
  // UI State
  isLoading: boolean
  isSidebarOpen: boolean
  
  // Notifications (these are still managed here for general app notifications)
  notifications: AppNotification[]
  
  // Actions
  setLoading: (isLoading: boolean) => void
  toggleSidebar: () => void
  
  addNotification: (notification: Omit<AppNotification, 'id' | 'timestamp'>) => void
  removeNotification: (id: string) => void
  clearNotifications: () => void
}

export const useAppStore = create<AppState>()(
  devtools(
    subscribeWithSelector((set) => ({
      // Initial state
      isLoading: false,
      isSidebarOpen: true,
      notifications: [],
      
      // UI actions
      setLoading: (isLoading) => set({ isLoading }),
      
      toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
      
      // Notification actions
      addNotification: (notification) =>
        set((state) => ({
          notifications: [
            ...state.notifications,
            {
              ...notification,
              id: `notification-${Date.now()}`,
              timestamp: new Date(),
            },
          ],
        })),
      
      removeNotification: (id) =>
        set((state) => ({
          notifications: state.notifications.filter((n) => n.id !== id),
        })),
      
      clearNotifications: () => set({ notifications: [] }),
    })),
    {
      name: 'app-store',
    }
  )
)