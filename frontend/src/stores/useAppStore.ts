import { create } from 'zustand'
import { devtools, subscribeWithSelector } from 'zustand/middleware'
import type { Project, AppNotification } from '@/types/store'

interface AppState {
  // Projects
  currentProject: Project | null
  projects: Project[]
  
  // UI State
  isLoading: boolean
  isSidebarOpen: boolean
  
  // Notifications
  notifications: AppNotification[]
  
  // Actions
  setCurrentProject: (project: Project | null) => void
  setProjects: (projects: Project[]) => void
  addProject: (project: Project) => void
  updateProject: (id: string, updates: Partial<Project>) => void
  deleteProject: (id: string) => void
  
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
      currentProject: null,
      projects: [],
      isLoading: false,
      isSidebarOpen: true,
      notifications: [],
      
      // Project actions
      setCurrentProject: (project) => set({ currentProject: project }),
      
      setProjects: (projects) => set({ projects }),
      
      addProject: (project) => 
        set((state) => ({ projects: [...state.projects, project] })),
      
      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
          ),
          currentProject:
            state.currentProject?.id === id
              ? { ...state.currentProject, ...updates, updatedAt: new Date() }
              : state.currentProject,
        })),
      
      deleteProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProject:
            state.currentProject?.id === id ? null : state.currentProject,
        })),
      
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