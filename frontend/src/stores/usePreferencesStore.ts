import { create } from 'zustand'
import { devtools, persist } from 'zustand/middleware'
import type { UserPreferences } from '@/types/store'

interface PreferencesState extends UserPreferences {
  // Actions
  setTheme: (theme: UserPreferences['theme']) => void
  setEditorFontSize: (size: number) => void
  setEditorTheme: (theme: string) => void
  setAutoSave: (enabled: boolean) => void
  setAutoSaveDelay: (delay: number) => void
  setShowLineNumbers: (show: boolean) => void
  setWordWrap: (enabled: boolean) => void
  setTabSize: (size: number) => void
  resetToDefaults: () => void
}

const defaultPreferences: UserPreferences = {
  theme: 'dark',
  editorFontSize: 14,
  editorTheme: 'vs-dark',
  autoSave: true,
  autoSaveDelay: 1000,
  showLineNumbers: true,
  wordWrap: false,
  tabSize: 2,
}

export const usePreferencesStore = create<PreferencesState>()(
  devtools(
    persist(
      (set) => ({
        // Initial state from defaults
        ...defaultPreferences,
        
        // Theme actions
        setTheme: (theme) => set({ theme }),
        
        // Editor preferences
        setEditorFontSize: (editorFontSize) => set({ editorFontSize }),
        setEditorTheme: (editorTheme) => set({ editorTheme }),
        setShowLineNumbers: (showLineNumbers) => set({ showLineNumbers }),
        setWordWrap: (wordWrap) => set({ wordWrap }),
        setTabSize: (tabSize) => set({ tabSize }),
        
        // Auto-save preferences
        setAutoSave: (autoSave) => set({ autoSave }),
        setAutoSaveDelay: (autoSaveDelay) => set({ autoSaveDelay }),
        
        // Reset action
        resetToDefaults: () => set(defaultPreferences),
      }),
      {
        name: 'velocity-preferences',
        partialize: (state) => {
          // Only persist the preference values, not the actions
          const { 
            setTheme,
            setEditorFontSize,
            setEditorTheme,
            setAutoSave,
            setAutoSaveDelay,
            setShowLineNumbers,
            setWordWrap,
            setTabSize,
            resetToDefaults,
            ...preferences 
          } = state
          return preferences
        },
      }
    ),
    {
      name: 'preferences-store',
    }
  )
)

// Export a hook to use preferences with proper TypeScript typing
export const usePreferences = () => {
  const preferences = usePreferencesStore()
  return {
    theme: preferences.theme,
    editorFontSize: preferences.editorFontSize,
    editorTheme: preferences.editorTheme,
    autoSave: preferences.autoSave,
    autoSaveDelay: preferences.autoSaveDelay,
    showLineNumbers: preferences.showLineNumbers,
    wordWrap: preferences.wordWrap,
    tabSize: preferences.tabSize,
  } as UserPreferences
}