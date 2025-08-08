import { useState } from 'react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '../ui/popover'
import { Button } from '../ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs'
import { ScrollArea } from '../ui/scroll-area'
import { Input } from '../ui/input'
import {
  HelpCircle,
  Book,
  Video,
  MessageCircle,
  Search,
  ChevronRight,
  ExternalLink,
  Zap,
  AlertCircle,
  CheckCircle
} from 'lucide-react'

interface HelpTopic {
  id: string
  title: string
  description: string
  category: 'basics' | 'advanced' | 'troubleshooting' | 'tips'
  content: React.ReactNode
  relatedTopics?: string[]
  videoUrl?: string
  learnMoreUrl?: string
}

interface PreviewHelpProps {
  context?: 'general' | 'device' | 'controls' | 'error' | 'performance'
  errorCode?: string
  className?: string
}

const helpTopics: HelpTopic[] = [
  {
    id: 'getting-started',
    title: 'Getting Started',
    description: 'Learn the basics of using mobile preview',
    category: 'basics',
    content: (
      <div className="space-y-3">
        <p>Welcome to Velocity's mobile preview! Here's how to get started:</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Click the "Mobile Preview" button to launch</li>
          <li>Select your desired device from the dropdown</li>
          <li>Interact with your app using clicks and gestures</li>
          <li>Make code changes to see instant updates</li>
        </ol>
        <div className="bg-blue-50 p-3 rounded-md">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Use keyboard shortcuts for faster navigation!
          </p>
        </div>
      </div>
    ),
    relatedTopics: ['keyboard-shortcuts', 'device-selection'],
    videoUrl: '/tutorials/getting-started-preview.mp4',
    learnMoreUrl: '/docs/preview-system/user-guides/getting-started'
  },
  {
    id: 'keyboard-shortcuts',
    title: 'Keyboard Shortcuts',
    description: 'Speed up your workflow with shortcuts',
    category: 'tips',
    content: (
      <div className="space-y-3">
        <p>Master these shortcuts for efficient preview control:</p>
        <div className="space-y-2">
          <div className="flex justify-between">
            <code className="bg-gray-100 px-2 py-1 rounded">Ctrl/Cmd + R</code>
            <span>Refresh preview</span>
          </div>
          <div className="flex justify-between">
            <code className="bg-gray-100 px-2 py-1 rounded">Ctrl/Cmd + D</code>
            <span>Toggle device frame</span>
          </div>
          <div className="flex justify-between">
            <code className="bg-gray-100 px-2 py-1 rounded">Ctrl/Cmd + O</code>
            <span>Rotate device</span>
          </div>
          <div className="flex justify-between">
            <code className="bg-gray-100 px-2 py-1 rounded">Ctrl/Cmd + Shift + D</code>
            <span>Device selector</span>
          </div>
        </div>
      </div>
    ),
    relatedTopics: ['getting-started', 'advanced-controls']
  },
  {
    id: 'device-selection',
    title: 'Choosing Devices',
    description: 'Select the right device for testing',
    category: 'basics',
    content: (
      <div className="space-y-3">
        <p>Velocity offers a wide range of iOS and Android devices:</p>
        <div className="space-y-3">
          <div>
            <h4 className="font-semibold">iOS Devices</h4>
            <ul className="list-disc pl-5 text-sm">
              <li>iPhone 15 Pro, 14, 13, SE</li>
              <li>iPad Pro, Air, Mini</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold">Android Devices</h4>
            <ul className="list-disc pl-5 text-sm">
              <li>Pixel 8 Pro, 7, 6</li>
              <li>Samsung Galaxy S23, S22</li>
            </ul>
          </div>
        </div>
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Device availability may vary based on your plan
          </AlertDescription>
        </Alert>
      </div>
    ),
    relatedTopics: ['performance-tips', 'device-specific-testing']
  },
  {
    id: 'hot-reload',
    title: 'Hot Reload',
    description: 'See changes instantly without rebuilding',
    category: 'advanced',
    content: (
      <div className="space-y-3">
        <p>Hot reload updates your app instantly as you code:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Save your file to trigger hot reload</li>
          <li>Component state is preserved</li>
          <li>Styling changes apply immediately</li>
          <li>Add new components without restart</li>
        </ul>
        <div className="bg-yellow-50 p-3 rounded-md">
          <p className="text-sm text-yellow-800">
            <strong>Note:</strong> Some changes require a full refresh:
          </p>
          <ul className="list-disc pl-5 text-sm text-yellow-700 mt-1">
            <li>Native module changes</li>
            <li>Asset additions/removals</li>
            <li>Configuration updates</li>
          </ul>
        </div>
      </div>
    ),
    relatedTopics: ['troubleshooting-hot-reload', 'performance-tips']
  },
  {
    id: 'troubleshooting-hot-reload',
    title: 'Hot Reload Issues',
    description: 'Fix common hot reload problems',
    category: 'troubleshooting',
    content: (
      <div className="space-y-3">
        <p>If hot reload isn't working:</p>
        <ol className="list-decimal pl-5 space-y-2">
          <li>Check for syntax errors in your code</li>
          <li>Ensure WebSocket connection is active (green indicator)</li>
          <li>Try manual refresh (Ctrl/Cmd + R)</li>
          <li>Clear build cache if needed</li>
        </ol>
        <div className="bg-red-50 p-3 rounded-md">
          <p className="text-sm text-red-800">
            <strong>Common causes:</strong>
          </p>
          <ul className="list-disc pl-5 text-sm text-red-700 mt-1">
            <li>Circular dependencies</li>
            <li>Syntax errors preventing compilation</li>
            <li>Network connectivity issues</li>
          </ul>
        </div>
      </div>
    ),
    relatedTopics: ['hot-reload', 'error-recovery']
  },
  {
    id: 'performance-tips',
    title: 'Performance Optimization',
    description: 'Make your preview run faster',
    category: 'tips',
    content: (
      <div className="space-y-3">
        <p>Optimize preview performance with these tips:</p>
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Zap className="h-4 w-4 text-yellow-500 mt-0.5" />
            <div>
              <strong>Enable Performance Mode</strong>
              <p className="text-sm text-gray-600">Reduces quality for faster updates</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Zap className="h-4 w-4 text-yellow-500 mt-0.5" />
            <div>
              <strong>Close Unused Tabs</strong>
              <p className="text-sm text-gray-600">Free up browser memory</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Zap className="h-4 w-4 text-yellow-500 mt-0.5" />
            <div>
              <strong>Use Appropriate Devices</strong>
              <p className="text-sm text-gray-600">Newer devices may be slower</p>
            </div>
          </div>
        </div>
      </div>
    ),
    relatedTopics: ['device-selection', 'advanced-controls']
  },
  {
    id: 'error-recovery',
    title: 'Error Recovery',
    description: 'What to do when things go wrong',
    category: 'troubleshooting',
    content: (
      <div className="space-y-3">
        <p>Velocity includes automatic error recovery:</p>
        <ul className="list-disc pl-5 space-y-2">
          <li>Self-healing for common issues</li>
          <li>Automatic retry with backoff</li>
          <li>Fallback device selection</li>
          <li>Session recreation on failure</li>
        </ul>
        <div className="bg-green-50 p-3 rounded-md">
          <p className="text-sm text-green-800">
            <strong>Recovery in progress:</strong> You'll see a progress bar during automatic recovery attempts.
          </p>
        </div>
      </div>
    ),
    relatedTopics: ['troubleshooting-hot-reload', 'getting-help']
  },
  {
    id: 'getting-help',
    title: 'Getting Help',
    description: 'Where to find support',
    category: 'basics',
    content: (
      <div className="space-y-3">
        <p>Need more help? We've got you covered:</p>
        <div className="space-y-3">
          <a href="/docs" className="flex items-center gap-2 text-blue-600 hover:underline">
            <Book className="h-4 w-4" />
            Documentation
          </a>
          <a href="/tutorials" className="flex items-center gap-2 text-blue-600 hover:underline">
            <Video className="h-4 w-4" />
            Video Tutorials
          </a>
          <a href="https://discord.gg/velocity" className="flex items-center gap-2 text-blue-600 hover:underline">
            <MessageCircle className="h-4 w-4" />
            Discord Community
          </a>
          <a href="mailto:support@velocity.dev" className="flex items-center gap-2 text-blue-600 hover:underline">
            <HelpCircle className="h-4 w-4" />
            Email Support
          </a>
        </div>
      </div>
    ),
    relatedTopics: ['getting-started']
  }
]

export function PreviewHelp({ context = 'general', errorCode, className }: PreviewHelpProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTopic, setSelectedTopic] = useState<HelpTopic | null>(null)
  const [isOpen, setIsOpen] = useState(false)

  // Get context-specific topics
  const getRelevantTopics = () => {
    switch (context) {
      case 'device':
        return ['device-selection', 'performance-tips']
      case 'controls':
        return ['keyboard-shortcuts', 'advanced-controls']
      case 'error':
        return ['error-recovery', 'troubleshooting-hot-reload', 'getting-help']
      case 'performance':
        return ['performance-tips', 'hot-reload']
      default:
        return ['getting-started', 'keyboard-shortcuts', 'device-selection']
    }
  }

  const filteredTopics = helpTopics.filter(topic => {
    if (searchQuery) {
      return topic.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
             topic.description.toLowerCase().includes(searchQuery.toLowerCase())
    }
    return true
  })

  const relevantTopicIds = getRelevantTopics()
  const relevantTopics = helpTopics.filter(t => relevantTopicIds.includes(t.id))

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={className}
          aria-label="Help"
        >
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="end">
        <Card className="border-0 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Preview Help</CardTitle>
            <CardDescription>
              Quick help and tips for using mobile preview
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="px-4 pb-3">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search help topics..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>

            {!selectedTopic ? (
              <Tabs defaultValue="relevant" className="w-full">
                <TabsList className="grid w-full grid-cols-3 rounded-none">
                  <TabsTrigger value="relevant">Relevant</TabsTrigger>
                  <TabsTrigger value="all">All Topics</TabsTrigger>
                  <TabsTrigger value="videos">Videos</TabsTrigger>
                </TabsList>
                
                <TabsContent value="relevant" className="mt-0">
                  <ScrollArea className="h-[300px]">
                    <div className="p-4 space-y-2">
                      {relevantTopics.map(topic => (
                        <button
                          key={topic.id}
                          onClick={() => setSelectedTopic(topic)}
                          className="w-full text-left p-3 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium">{topic.title}</h4>
                              <p className="text-sm text-gray-600">{topic.description}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="all" className="mt-0">
                  <ScrollArea className="h-[300px]">
                    <div className="p-4 space-y-2">
                      {filteredTopics.map(topic => (
                        <button
                          key={topic.id}
                          onClick={() => setSelectedTopic(topic)}
                          className="w-full text-left p-3 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h4 className="font-medium">{topic.title}</h4>
                              <p className="text-sm text-gray-600">{topic.description}</p>
                            </div>
                            <ChevronRight className="h-4 w-4 text-gray-400" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="videos" className="mt-0">
                  <ScrollArea className="h-[300px]">
                    <div className="p-4 space-y-2">
                      {helpTopics.filter(t => t.videoUrl).map(topic => (
                        <a
                          key={topic.id}
                          href={topic.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between p-3 rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Video className="h-4 w-4 text-gray-400" />
                            <div>
                              <h4 className="font-medium">{topic.title}</h4>
                              <p className="text-sm text-gray-600">Video tutorial</p>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-gray-400" />
                        </a>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            ) : (
              <div className="p-4">
                <button
                  onClick={() => setSelectedTopic(null)}
                  className="text-sm text-blue-600 hover:underline mb-4"
                >
                  ← Back to topics
                </button>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold text-lg">{selectedTopic.title}</h3>
                    <p className="text-sm text-gray-600">{selectedTopic.description}</p>
                  </div>
                  
                  <div className="prose prose-sm max-w-none">
                    {selectedTopic.content}
                  </div>

                  {selectedTopic.learnMoreUrl && (
                    <a
                      href={selectedTopic.learnMoreUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-blue-600 hover:underline"
                    >
                      Learn more
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  )}

                  {selectedTopic.relatedTopics && (
                    <div className="pt-4 border-t">
                      <h4 className="text-sm font-medium mb-2">Related Topics</h4>
                      <div className="space-y-1">
                        {selectedTopic.relatedTopics.map(topicId => {
                          const related = helpTopics.find(t => t.id === topicId)
                          if (!related) return null
                          return (
                            <button
                              key={topicId}
                              onClick={() => setSelectedTopic(related)}
                              className="text-sm text-blue-600 hover:underline"
                            >
                              {related.title}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="border-t p-4">
              <div className="flex items-center justify-between text-sm">
                <a
                  href="/docs/preview-system"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Full documentation
                </a>
                <a
                  href="https://discord.gg/velocity"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  Get help on Discord
                </a>
              </div>
            </div>
          </CardContent>
        </Card>
      </PopoverContent>
    </Popover>
  )
}

// Alert component (if not already imported)
function Alert({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border p-4 ${className}`}>
      {children}
    </div>
  )
}

function AlertDescription({ children }: { children: React.ReactNode }) {
  return <div className="text-sm [&_p]:leading-relaxed">{children}</div>
}