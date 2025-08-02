import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { User } from '@supabase/supabase-js'
import { authService } from '../services/auth'

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  error: string | null
  
  // Actions
  setUser: (user: User | null) => void
  setLoading: (isLoading: boolean) => void
  setError: (error: string | null) => void
  checkAuth: () => Promise<void>
  logout: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>()(
  devtools(
    persist(
      (set, get) => ({
        user: null,
        isLoading: true,
        isAuthenticated: false,
        error: null,

        setUser: (user) => {
          set({
            user,
            isAuthenticated: !!user,
            error: null,
          })
        },

        setLoading: (isLoading) => {
          set({ isLoading })
        },

        setError: (error) => {
          set({ error })
        },

        clearError: () => {
          set({ error: null })
        },

        checkAuth: async () => {
          set({ isLoading: true })
          try {
            const user = await authService.getCurrentUser()
            set({
              user,
              isAuthenticated: !!user,
              isLoading: false,
              error: null,
            })
          } catch (error) {
            set({
              user: null,
              isAuthenticated: false,
              isLoading: false,
              error: 'Failed to check authentication status',
            })
          }
        },

        logout: async () => {
          set({ isLoading: true })
          try {
            const { error } = await authService.logout()
            if (error) {
              set({ error: error.message, isLoading: false })
            } else {
              set({
                user: null,
                isAuthenticated: false,
                isLoading: false,
                error: null,
              })
            }
          } catch (error) {
            set({
              error: 'Failed to logout',
              isLoading: false,
            })
          }
        },
      }),
      {
        name: 'auth-storage',
        partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
      }
    ),
    {
      name: 'auth-store',
    }
  )
)