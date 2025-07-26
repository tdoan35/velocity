import { useAppStore, usePreferencesStore, useEditorStore, useFileSystemStore } from '@/stores'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function StoreDemo() {
  // App store
  const { 
    currentProject, 
    isLoading, 
    addNotification, 
    setLoading,
    notifications 
  } = useAppStore()
  
  // Preferences store
  const { 
    editorFontSize, 
    setEditorFontSize,
    theme,
    setTheme 
  } = usePreferencesStore()
  
  // Editor store
  const { 
    tabs, 
    openFile, 
    closeTab 
  } = useEditorStore()
  
  // File system store
  const { 
    fileTree,
    setFileTree 
  } = useFileSystemStore()

  const handleAddNotification = () => {
    addNotification({
      type: 'success',
      title: 'Test Notification',
      message: 'This is a test notification from Zustand!',
      duration: 5000,
    })
  }

  const handleOpenFile = () => {
    openFile(
      'demo-file-1',
      '/src/demo.ts',
      '// Demo file content\nconsole.log("Hello from Zustand!");'
    )
  }

  const handleCreateFileTree = () => {
    setFileTree({
      id: 'root',
      name: 'src',
      path: '/src',
      type: 'directory',
      children: [
        {
          id: 'file-1',
          name: 'index.ts',
          path: '/src/index.ts',
          type: 'file',
          content: 'export default function() {}',
        },
        {
          id: 'file-2',
          name: 'utils.ts',
          path: '/src/utils.ts',
          type: 'file',
          content: 'export const utils = {}',
        },
      ],
    })
  }

  return (
    <div className="p-8 space-y-8">
      <div>
        <h2 className="text-2xl font-bold mb-4">Zustand State Management Demo</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* App Store Demo */}
          <Card>
            <CardHeader>
              <CardTitle>App Store</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Current Project: {currentProject?.name || 'None'}
              </p>
              <p className="text-sm text-muted-foreground">
                Loading: {isLoading ? 'Yes' : 'No'}
              </p>
              <p className="text-sm text-muted-foreground">
                Notifications: {notifications.length}
              </p>
              <div className="flex gap-2">
                <Button 
                  size="sm"
                  onClick={handleAddNotification}
                >
                  Add Notification
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => setLoading(!isLoading)}
                >
                  Toggle Loading
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Preferences Store Demo */}
          <Card>
            <CardHeader>
              <CardTitle>Preferences Store</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Theme: {theme}
              </p>
              <p className="text-sm text-muted-foreground">
                Editor Font Size: {editorFontSize}px
              </p>
              <div className="flex gap-2">
                <Button 
                  size="sm"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                >
                  Toggle Theme
                </Button>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => setEditorFontSize(editorFontSize + 2)}
                >
                  Increase Font
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Editor Store Demo */}
          <Card>
            <CardHeader>
              <CardTitle>Editor Store</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Open Tabs: {tabs.length}
            </p>
            <div className="space-y-2">
              {tabs.map(tab => (
                <div key={tab.id} className="flex items-center justify-between">
                  <span className="text-sm">{tab.filePath}</span>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => closeTab(tab.id)}
                  >
                    ×
                  </Button>
                </div>
              ))}
            </div>
            <Button 
              size="sm"
              onClick={handleOpenFile}
            >
              Open Demo File
            </Button>
            </CardContent>
          </Card>

          {/* File System Store Demo */}
          <Card>
            <CardHeader>
              <CardTitle>File System Store</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                File Tree: {fileTree ? 'Loaded' : 'Empty'}
              </p>
              {fileTree && (
                <div className="text-sm space-y-1">
                  <div>📁 {fileTree.name}</div>
                  {fileTree.children?.map(file => (
                    <div key={file.id} className="pl-4">
                      {file.type === 'file' ? '📄' : '📁'} {file.name}
                    </div>
                  ))}
                </div>
              )}
              <Button 
                size="sm"
                onClick={handleCreateFileTree}
              >
                Load Demo Files
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Notifications Display */}
      <div className="fixed bottom-4 right-4 space-y-2">
        {notifications.map(notification => (
          <Card
            key={notification.id}
            className={`p-4 max-w-sm ${
              notification.type === 'error' ? 'border-red-500' : ''
            }`}
          >
            <h4 className="font-semibold">{notification.title}</h4>
            {notification.message && (
              <p className="text-sm text-muted-foreground">{notification.message}</p>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}