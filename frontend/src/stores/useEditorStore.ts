import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { EditorTab } from '@/types/store'

interface EditorState {
  // Tabs
  tabs: EditorTab[]
  activeTabId: string | null
  
  // Editor state
  isLoading: boolean
  lastSavedContent: Record<string, string> // fileId -> content
  
  // Actions
  openFile: (fileId: string, filePath: string, content: string) => void
  closeTab: (tabId: string) => void
  setActiveTab: (tabId: string) => void
  updateTabContent: (tabId: string, content: string) => void
  updateTabCursor: (tabId: string, line: number, column: number) => void
  saveTab: (tabId: string) => void
  
  // Tab utilities
  getTabByFileId: (fileId: string) => EditorTab | undefined
  isFileDirty: (fileId: string) => boolean
  hasUnsavedChanges: () => boolean
  
  // Bulk operations
  closeAllTabs: () => void
  closeOtherTabs: (tabId: string) => void
  saveAllTabs: () => void
}

export const useEditorStore = create<EditorState>()(
  devtools(
    (set, get) => ({
      // Initial state
      tabs: [],
      activeTabId: null,
      isLoading: false,
      lastSavedContent: {},
      
      // File operations
      openFile: (fileId, filePath, content) => {
        const existingTab = get().tabs.find(tab => tab.fileId === fileId)
        
        if (existingTab) {
          // If file is already open, just activate it
          set({ activeTabId: existingTab.id })
        } else {
          // Create new tab
          const newTab: EditorTab = {
            id: `tab-${Date.now()}`,
            fileId,
            filePath,
            content,
            isDirty: false,
          }
          
          set(state => ({
            tabs: [...state.tabs, newTab],
            activeTabId: newTab.id,
            lastSavedContent: {
              ...state.lastSavedContent,
              [fileId]: content,
            },
          }))
        }
      },
      
      closeTab: (tabId) => {
        set(state => {
          const tabIndex = state.tabs.findIndex(tab => tab.id === tabId)
          const newTabs = state.tabs.filter(tab => tab.id !== tabId)
          
          // Determine new active tab
          let newActiveTabId = state.activeTabId
          if (state.activeTabId === tabId) {
            if (newTabs.length === 0) {
              newActiveTabId = null
            } else if (tabIndex > 0) {
              newActiveTabId = newTabs[tabIndex - 1].id
            } else {
              newActiveTabId = newTabs[0].id
            }
          }
          
          return {
            tabs: newTabs,
            activeTabId: newActiveTabId,
          }
        })
      },
      
      setActiveTab: (tabId) => set({ activeTabId: tabId }),
      
      updateTabContent: (tabId, content) => {
        set(state => ({
          tabs: state.tabs.map(tab => {
            if (tab.id === tabId) {
              const isDirty = content !== state.lastSavedContent[tab.fileId]
              return { ...tab, content, isDirty }
            }
            return tab
          }),
        }))
      },
      
      updateTabCursor: (tabId, line, column) => {
        set(state => ({
          tabs: state.tabs.map(tab =>
            tab.id === tabId
              ? { ...tab, cursor: { line, column } }
              : tab
          ),
        }))
      },
      
      saveTab: (tabId) => {
        const tab = get().tabs.find(t => t.id === tabId)
        if (!tab) return
        
        set(state => ({
          tabs: state.tabs.map(t =>
            t.id === tabId ? { ...t, isDirty: false } : t
          ),
          lastSavedContent: {
            ...state.lastSavedContent,
            [tab.fileId]: tab.content,
          },
        }))
      },
      
      // Utilities
      getTabByFileId: (fileId) => {
        return get().tabs.find(tab => tab.fileId === fileId)
      },
      
      isFileDirty: (fileId) => {
        const tab = get().tabs.find(t => t.fileId === fileId)
        return tab?.isDirty || false
      },
      
      hasUnsavedChanges: () => {
        return get().tabs.some(tab => tab.isDirty)
      },
      
      // Bulk operations
      closeAllTabs: () => {
        set({ tabs: [], activeTabId: null })
      },
      
      closeOtherTabs: (tabId) => {
        set(state => {
          const keepTab = state.tabs.find(tab => tab.id === tabId)
          return {
            tabs: keepTab ? [keepTab] : [],
            activeTabId: tabId,
          }
        })
      },
      
      saveAllTabs: () => {
        set(state => {
          const savedContent = { ...state.lastSavedContent }
          state.tabs.forEach(tab => {
            savedContent[tab.fileId] = tab.content
          })
          
          return {
            tabs: state.tabs.map(tab => ({ ...tab, isDirty: false })),
            lastSavedContent: savedContent,
          }
        })
      },
    }),
    {
      name: 'editor-store',
    }
  )
)