// Re-export all stores
export { useAppStore } from './useAppStore'
export { useEditorStore } from './useEditorStore'
export { useFileSystemStore } from './useFileSystemStore'
export { usePreferencesStore, usePreferences } from './usePreferencesStore'
export { useAuthStore } from './useAuthStore'

// Re-export types
export type { 
  Project, 
  FileNode, 
  EditorTab, 
  UserPreferences, 
  AIChat, 
  AIMessage, 
  CodeBlock,
  AppNotification 
} from '@/types/store'

// Store utilities
import { useAppStore } from './useAppStore'
import { useEditorStore } from './useEditorStore'
import { useFileSystemStore } from './useFileSystemStore'
import { usePreferencesStore } from './usePreferencesStore'
import { useAuthStore } from './useAuthStore'

// Helper to reset all stores (useful for testing or logout)
export const resetAllStores = () => {
  useAppStore.setState({
    currentProject: null,
    projects: [],
    isLoading: false,
    isSidebarOpen: true,
    notifications: [],
  })
  
  useEditorStore.setState({
    tabs: [],
    activeTabId: null,
    isLoading: false,
    lastSavedContent: {},
  })
  
  useFileSystemStore.setState({
    fileTree: null,
    selectedFile: null,
    expandedFolders: new Set<string>(),
    renamingFileId: null,
    movingFileId: null,
  })
  
  usePreferencesStore.getState().resetToDefaults()
}

// Development helpers
if (import.meta.env.DEV) {
  // Expose stores to window for debugging
  (window as any).__stores = {
    app: useAppStore,
    editor: useEditorStore,
    fileSystem: useFileSystemStore,
    preferences: usePreferencesStore,
    auth: useAuthStore,
  }
  
  console.log('🔧 Zustand stores exposed to window.__stores for debugging')
}

// Subscribe to store changes for auto-save functionality
export const initializeStoreSubscriptions = () => {
  // Auto-save when editor content changes
  const unsubscribeEditor = useEditorStore.subscribe((state) => {
    const preferences = usePreferencesStore.getState()
    if (!preferences.autoSave) return
    
    // Debounced auto-save logic would go here
    state.tabs.forEach(tab => {
      if (tab.isDirty) {
        // Trigger auto-save after delay
        console.log(`Auto-save scheduled for ${tab.filePath}`)
      }
    })
  })
  
  // Sync theme preference with document
  const unsubscribeTheme = usePreferencesStore.subscribe((state) => {
    const theme = state.theme
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')
    
    if (theme === 'system') {
      const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      root.classList.add(systemTheme)
    } else {
      root.classList.add(theme)
    }
  })
  
  // Return cleanup function
  return () => {
    unsubscribeEditor()
    unsubscribeTheme()
  }
}