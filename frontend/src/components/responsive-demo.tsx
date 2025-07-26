import { useState } from 'react'
import { AppLayout } from '@/components/layout/app-layout'
import { ResponsiveGrid } from '@/components/layout/responsive-grid'
import { CollapsiblePanel } from '@/components/layout/collapsible-panel'
import { MobileNavigation } from '@/components/layout/mobile-navigation'
import { ResponsiveMonacoWrapper } from '@/components/layout/responsive-monaco-wrapper'
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FolderTree, Code2, Layout, Smartphone, Monitor, Tablet } from 'lucide-react'

export function ResponsiveDemo() {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [, setFileExplorerCollapsed] = useState(false)

  const sidebar = (
    <div className="h-full p-4">
      <h3 className="mb-4 text-lg font-semibold">Sidebar Navigation</h3>
      <nav className="space-y-2">
        <Button variant="ghost" className="w-full justify-start">
          <Layout className="mr-2 h-4 w-4" />
          Dashboard
        </Button>
        <Button variant="ghost" className="w-full justify-start">
          <Code2 className="mr-2 h-4 w-4" />
          Editor
        </Button>
        <Button variant="ghost" className="w-full justify-start">
          <FolderTree className="mr-2 h-4 w-4" />
          File Explorer
        </Button>
      </nav>
    </div>
  )

  const header = (
    <div className="flex flex-1 items-center justify-between">
      <h1 className="text-xl font-bold">Velocity Responsive Layout</h1>
      <div className="flex items-center gap-2">
        <div className="hidden text-sm text-muted-foreground sm:flex sm:items-center sm:gap-4">
          <span className="flex items-center gap-1">
            <Smartphone className="h-4 w-4" />
            Mobile
          </span>
          <span className="flex items-center gap-1">
            <Tablet className="h-4 w-4" />
            Tablet
          </span>
          <span className="flex items-center gap-1">
            <Monitor className="h-4 w-4" />
            Desktop
          </span>
        </div>
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activeTab) {
      case 'dashboard':
        return (
          <div className="space-y-6 p-4 sm:p-6 lg:p-8">
            <div>
              <h2 className="mb-4 text-2xl font-bold">Responsive Grid System</h2>
              <ResponsiveGrid 
                cols={{ default: 1, sm: 2, md: 3, lg: 4 }}
                gap={4}
              >
                {[...Array(8)].map((_, i) => (
                  <Card key={i}>
                    <CardHeader>
                      <CardTitle>Card {i + 1}</CardTitle>
                      <CardDescription>Responsive grid item</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">
                        This card adapts to different screen sizes using our responsive grid system.
                      </p>
                    </CardContent>
                  </Card>
                ))}
              </ResponsiveGrid>
            </div>

            <div>
              <h2 className="mb-4 text-2xl font-bold">Progressive Disclosure</h2>
              <Card>
                <CardHeader>
                  <CardTitle>Basic Settings</CardTitle>
                  <CardDescription>Essential configuration options</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Project Name</label>
                    <Input placeholder="Enter project name" className="mt-1" />
                  </div>
                  <div>
                    <label className="text-sm font-medium">Description</label>
                    <Input placeholder="Enter description" className="mt-1" />
                  </div>
                  <details className="mt-4">
                    <summary className="cursor-pointer text-sm font-medium text-primary">
                      Advanced Settings
                    </summary>
                    <div className="mt-4 space-y-4 pl-4">
                      <div>
                        <label className="text-sm font-medium">API Key</label>
                        <Input type="password" placeholder="Enter API key" className="mt-1" />
                      </div>
                      <div>
                        <label className="text-sm font-medium">Build Command</label>
                        <Input placeholder="npm run build" className="mt-1" />
                      </div>
                    </div>
                  </details>
                </CardContent>
              </Card>
            </div>
          </div>
        )

      case 'editor':
        return (
          <div className="flex h-full">
            <CollapsiblePanel
              side="left"
              expandedWidth="w-48 lg:w-64"
              collapsedWidth="w-12"
              className="border-r"
              onCollapsedChange={setFileExplorerCollapsed}
            >
              <div className="p-4">
                <h3 className="mb-4 text-sm font-semibold">File Explorer</h3>
                <div className="space-y-1 text-sm">
                  <div className="py-1 hover:bg-accent hover:text-accent-foreground rounded px-2">📁 src</div>
                  <div className="ml-4 py-1 hover:bg-accent hover:text-accent-foreground rounded px-2">📄 App.tsx</div>
                  <div className="ml-4 py-1 hover:bg-accent hover:text-accent-foreground rounded px-2">📄 index.tsx</div>
                  <div className="py-1 hover:bg-accent hover:text-accent-foreground rounded px-2">📁 components</div>
                  <div className="ml-4 py-1 hover:bg-accent hover:text-accent-foreground rounded px-2">📄 Button.tsx</div>
                </div>
              </div>
            </CollapsiblePanel>

            <div className="flex-1 p-4">
              <h2 className="mb-4 text-xl font-bold">Responsive Editor</h2>
              <ResponsiveMonacoWrapper minHeight="400px" className="bg-muted/30">
                <div className="p-4">
                  <pre className="text-sm">
{`// Placeholder for Monaco Editor
// The actual editor would be rendered here
// with responsive dimensions

import React from 'react'

export function App() {
  return (
    <div className="container">
      <h1>Hello Velocity!</h1>
      <p>Building mobile apps with AI</p>
    </div>
  )
}`}
                  </pre>
                </div>
              </ResponsiveMonacoWrapper>
            </div>
          </div>
        )

      default:
        return (
          <div className="flex h-full items-center justify-center p-4">
            <Card className="w-full max-w-md">
              <CardHeader>
                <CardTitle>{activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}</CardTitle>
                <CardDescription>This section is under construction</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Content for {activeTab} will be implemented here.
                </p>
              </CardContent>
            </Card>
          </div>
        )
    }
  }

  return (
    <>
      <AppLayout
        sidebar={sidebar}
        header={header}
      >
        <div className="h-full pb-16 md:pb-0">
          {renderContent()}
        </div>
      </AppLayout>
      
      <MobileNavigation 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
      />
    </>
  )
}