import { supabase } from '../lib/supabase'
import type { AuthError, User } from '@supabase/supabase-js'

export interface AuthResponse {
  user: User | null
  error: AuthError | null
}

export interface SignUpData {
  email: string
  password: string
  firstName?: string
  lastName?: string
}

export interface LoginData {
  email: string
  password: string
}

export const authService = {
  async signUp({ email, password, firstName, lastName }: SignUpData): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            first_name: firstName,
            last_name: lastName,
          },
        },
      })

      if (error) {
        return { user: null, error }
      }

      // The database trigger will automatically create the user profile
      // We just need to wait a moment for it to complete
      if (data.user) {
        // Give the trigger time to create the profile
        await new Promise(resolve => setTimeout(resolve, 1000))
        
        // Optionally update the profile with additional info if provided
        if (firstName || lastName) {
          try {
            const { error: updateError } = await supabase
              .from('user_profiles')
              .update({
                first_name: firstName,
                last_name: lastName,
              })
              .eq('id', data.user.id)
              
            if (updateError) {
              console.warn('Could not update user profile with name:', updateError)
              // This is not critical, don't fail the signup
            }
          } catch (error) {
            console.warn('Profile update error:', error)
          }
        }
      }

      return { user: data.user, error: null }
    } catch (error) {
      return {
        user: null,
        error: error as AuthError,
      }
    }
  },

  async login({ email, password }: LoginData): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        return { user: null, error }
      }

      return { user: data.user, error: null }
    } catch (error) {
      return {
        user: null,
        error: error as AuthError,
      }
    }
  },

  async loginWithGoogle(): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        return { user: null, error }
      }

      return { user: null, error: null }
    } catch (error) {
      return {
        user: null,
        error: error as AuthError,
      }
    }
  },

  async loginWithGitHub(): Promise<AuthResponse> {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      })

      if (error) {
        return { user: null, error }
      }

      return { user: null, error: null }
    } catch (error) {
      return {
        user: null,
        error: error as AuthError,
      }
    }
  },

  async logout(): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.signOut()
      return { error }
    } catch (error) {
      return { error: error as AuthError }
    }
  },

  async getCurrentUser(): Promise<User | null> {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      return user
    } catch (error) {
      console.error('Error getting current user:', error)
      return null
    }
  },

  async resetPassword(email: string): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      })
      return { error }
    } catch (error) {
      return { error: error as AuthError }
    }
  },

  onAuthStateChange(callback: (user: User | null) => void) {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      callback(session?.user ?? null)
    })
    return subscription
  },
}