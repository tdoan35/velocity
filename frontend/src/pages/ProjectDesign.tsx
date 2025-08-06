import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAppStore } from '@/stores/useAppStore'
import { projectService } from '@/services/projectService'
import { conversationService, type ConversationMessage } from '@/services/conversationService'
import { EnhancedChatInterface } from '@/components/chat/enhanced-chat-interface'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { motion, AnimatePresence } from 'motion/react'
import { 
  ArrowLeft, 
  Loader2,
  Users,
  Settings,
  Sparkles,
  Code2,
  History,
  Plus,
  ChevronLeft,
  MessageSquare
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'

interface ConversationTab {
  id: string
  title: string
  isLoading: boolean
  activeAgent: 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper'
  isTemporary?: boolean
  metadata?: {
    primaryAgent?: string
    agentsUsed?: string[]
    lastAgent?: string
  }
}

export function ProjectDesign() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user, isAuthenticated, isLoading: authLoading } = useAuthStore()
  const { setCurrentProject } = useAppStore()
  const { toast } = useToast()
  const [project, setProject] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [currentConversation, setCurrentConversation] = useState<ConversationTab | null>(null)
  const [activeAgent, setActiveAgent] = useState<'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper'>('project_manager')
  const [showHistory, setShowHistory] = useState(false)
  const [conversationHistory, setConversationHistory] = useState<Array<{ 
    id: string; 
    title: string; 
    created_at: string; 
    message_count: number;
    metadata?: {
      primaryAgent?: string;
      agentsUsed?: string[];
      lastAgent?: string;
    }
  }>>([])
  
  // Helper function to get agent info
  const getAgentInfo = (agentType?: string) => {
    switch (agentType) {
      case 'project_manager':
      case 'project':
        return { icon: Users, color: 'emerald', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-500', label: 'Project Manager' }
      case 'design_assistant':
      case 'ui':
        return { icon: Sparkles, color: 'blue', bgColor: 'bg-blue-500/10', textColor: 'text-blue-500', label: 'Design Assistant' }
      case 'engineering_assistant':
      case 'engineering':
        return { icon: Code2, color: 'purple', bgColor: 'bg-purple-500/10', textColor: 'text-purple-500', label: 'Engineering Assistant' }
      case 'config_helper':
      case 'config':
        return { icon: Settings, color: 'orange', bgColor: 'bg-orange-500/10', textColor: 'text-orange-500', label: 'Config Helper' }
      default:
        return { icon: MessageSquare, color: 'gray', bgColor: 'bg-gray-500/10', textColor: 'text-gray-500', label: 'AI Assistant' }
    }
  }

  // Create or load conversation
  const createNewConversation = async (title?: string, loadFromId?: string, forceNew: boolean = false) => {
    if (!projectId) return
    
    try {
      let conversationId = loadFromId
      let conversationTitle = title || 'New Conversation'
      let metadata = {}
      let isTemporary = false
      
      if (!loadFromId || forceNew) {
        // Create temporary local conversation
        conversationId = `temp-${Date.now()}`
        conversationTitle = forceNew ? 'New Conversation' : conversationTitle
        isTemporary = true
        metadata = {
          primaryAgent: activeAgent,
          agentsUsed: [activeAgent],
          lastAgent: activeAgent
        }
      }
      
      const newConversation: ConversationTab = {
        id: conversationId!,
        title: conversationTitle,
        isLoading: false,
        activeAgent: activeAgent,
        isTemporary,
        metadata
      }
      
      setCurrentConversation(newConversation)
      
      // Close history panel when creating a new conversation
      if (forceNew && showHistory) {
        setShowHistory(false)
      }
    } catch (error) {
      console.error('Error creating conversation:', error)
    }
  }
  
  // Update active agent
  const updateActiveAgent = (agent: 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper') => {
    setActiveAgent(agent)
    if (currentConversation) {
      setCurrentConversation({
        ...currentConversation,
        activeAgent: agent
      })
    }
  }
  
  // Load conversation history
  const loadConversationHistory = async () => {
    if (!user?.id || !projectId) return
    
    try {
      const { data: conversations, error } = await supabase
        .from('conversations')
        .select(`
          id,
          title,
          created_at,
          metadata
        `)
        .eq('user_id', user.id)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(20)
      
      if (error) {
        console.error('Error loading conversation history:', error)
        return
      }
      
      const formattedConversations = await Promise.all(
        conversations?.map(async (conv) => {
          const { count } = await supabase
            .from('conversation_messages')
            .select('*', { count: 'exact', head: true })
            .eq('conversation_id', conv.id)
          
          return {
            id: conv.id,
            title: conv.title || 'Untitled Conversation',
            created_at: conv.created_at,
            message_count: count || 0,
            metadata: conv.metadata
          }
        }) || []
      )
      
      setConversationHistory(formattedConversations)
    } catch (error) {
      console.error('Error loading conversation history:', error)
    }
  }
  
  // Load history when toggling
  useEffect(() => {
    if (showHistory) {
      loadConversationHistory()
    }
  }, [showHistory, user?.id, projectId])
  
  useEffect(() => {
    console.log('ProjectDesign mount:', { user, isAuthenticated, authLoading, projectId })
    
    // Wait for auth to load before checking
    if (authLoading) {
      return
    }

    if (!isAuthenticated || !user) {
      console.log('Not authenticated, redirecting to dashboard')
      navigate('/dashboard')
      return
    }

    if (!projectId) {
      console.log('No project ID, redirecting to dashboard')
      navigate('/dashboard')
      return
    }

    loadProject()
    
    // Clear current project when component unmounts
    return () => {
      setCurrentProject(null)
    }
  }, [user, isAuthenticated, authLoading, projectId, navigate])

  const loadProject = async () => {
    if (!projectId) return

    try {
      setIsLoading(true)
      const { project: loadedProject, error } = await projectService.getProject(projectId)
      
      if (error || !loadedProject) {
        toast({
          title: 'Error',
          description: 'Failed to load project',
          variant: 'destructive',
        })
        navigate('/dashboard')
        return
      }

      setProject(loadedProject)
      
      // Set the current project in the app store
      setCurrentProject({
        id: loadedProject.id,
        name: loadedProject.title || loadedProject.name || 'Untitled Project',
        description: loadedProject.description || '',
        createdAt: new Date(loadedProject.created_at || Date.now()),
        updatedAt: new Date(loadedProject.updated_at || Date.now()),
        template: loadedProject.template || 'react-native',
        status: loadedProject.status || 'ready'
      })
      
      // Check for existing conversation
      const { conversation: existingConv } = await conversationService.getConversationByProjectId(projectId)
      
      if (existingConv) {
        await createNewConversation(existingConv.title || loadedProject.title, existingConv.id)
      } else {
        await createNewConversation(loadedProject.title)
      }
    } catch (error) {
      console.error('Error loading project:', error)
      toast({
        title: 'Error',
        description: 'Failed to load project',
        variant: 'destructive',
      })
      navigate('/dashboard')
    } finally {
      setIsLoading(false)
    }
  }

  const handleApplyCode = (code: string) => {
    // This function would apply generated code to the project
    console.log('Applying code:', code)
    toast({
      title: 'Code Applied',
      description: 'The generated code has been added to your project',
    })
  }

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-muted-foreground mb-4">Project not found</p>
          <Button onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    )
  }


  return (
    <div className="flex flex-col h-full mx-2 mb-2 rounded-lg overflow-hidden bg-white/30 dark:bg-gray-900/30 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 shadow-xl">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left Panel - Enhanced Chat Interface */}
        <ResizablePanel defaultSize={65} minSize={40}>
          <div className="h-full p-2">
            <Card className="h-full flex flex-col bg-transparent">
                {currentConversation ? (
                  <EnhancedChatInterface
                    key={currentConversation.id}
                    projectId={projectId || ''}
                    conversationId={currentConversation.id}
                    onApplyCode={handleApplyCode}
                    className="flex-1"
                    activeAgent={currentConversation.activeAgent}
                    onAgentChange={updateActiveAgent}
                    conversationTitle={currentConversation.title}
                    onNewConversation={() => createNewConversation(undefined, undefined, true)}
                    onToggleHistory={() => setShowHistory(!showHistory)}
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center h-full">
                    <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-sm mb-4">No active conversations</p>
                    <Button onClick={() => createNewConversation(undefined, undefined, true)}>
                      <Plus className="w-4 h-4 mr-2" />
                      Start New Conversation
                    </Button>
                  </div>
                )}
              </Card>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel - Agents List or History */}
          <ResizablePanel defaultSize={35} minSize={25}>
            <div className="h-full p-2">
              <Card className="h-full flex flex-col">
                <CardHeader className="p-4 pl-5 border-b">
                  <div className="flex items-center gap-2">
                    {showHistory ? (
                      <>
                        <History className="w-5 h-5" />
                        <CardTitle className="text-lg">Chat History</CardTitle>
                      </>
                    ) : (
                      <>
                        <Users className="w-5 h-5" />
                        <CardTitle className="text-lg">AI Agents</CardTitle>
                      </>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-4 flex-1 overflow-y-auto">
                  {showHistory ? (
                    // Conversation History View
                    <div className="space-y-2">
                      {conversationHistory.length === 0 ? (
                        <div className="text-center py-8">
                          <History className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
                          <p className="text-sm text-muted-foreground">No conversation history yet</p>
                        </div>
                      ) : (
                        conversationHistory.map((conv) => {
                          const agentInfo = getAgentInfo(conv.metadata?.primaryAgent || conv.metadata?.lastAgent)
                          const AgentIcon = agentInfo.icon
                          const hasMultipleAgents = (conv.metadata?.agentsUsed?.length || 0) > 1
                          
                          return (
                            <div
                              key={conv.id}
                              className="p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors"
                              onClick={async () => {
                                // Load this conversation
                                await createNewConversation(conv.title, conv.id)
                                setShowHistory(false)
                              }}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-8 h-8 rounded-full ${agentInfo.bgColor} flex items-center justify-center flex-shrink-0`}>
                                  <AgentIcon className={`w-4 h-4 ${agentInfo.textColor}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h3 className="font-medium text-sm truncate flex-1">{conv.title}</h3>
                                    {hasMultipleAgents && (
                                      <div className="flex -space-x-2">
                                        {conv.metadata?.agentsUsed?.slice(0, 3).map((agent, idx) => {
                                          const info = getAgentInfo(agent)
                                          const Icon = info.icon
                                          return (
                                            <div
                                              key={idx}
                                              className={`w-5 h-5 rounded-full ${info.bgColor} flex items-center justify-center border-2 border-background`}
                                              title={agent}
                                            >
                                              <Icon className={`w-3 h-3 ${info.textColor}`} />
                                            </div>
                                          )
                                        })}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex items-center justify-between mt-1">
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(conv.created_at).toLocaleDateString()}
                                    </p>
                                    <span className="text-xs text-muted-foreground">
                                      {conv.message_count} messages
                                    </span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  ) : (
                    // AI Agents View
                    <div className="space-y-3">
                      {/* Project Manager */}
                      <div 
                        className={`p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors ${
                          activeAgent === 'project_manager' ? 'ring-2 ring-emerald-500' : ''
                        }`}
                        onClick={() => updateActiveAgent('project_manager')}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                            <Users className="w-5 h-5 text-emerald-500" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium text-sm">Project Manager</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              Manages project planning and coordination
                            </p>
                          </div>
                          {activeAgent === 'project_manager' && (
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          )}
                        </div>
                      </div>

                      {/* Design Assistant */}
                      <div 
                        className={`p-3 rounded-lg border bg-card opacity-50 cursor-not-allowed transition-colors ${
                          activeAgent === 'design_assistant' ? 'ring-2 ring-blue-500' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-5 h-5 text-blue-500" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium text-sm">Design Assistant</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              Helps with UI/UX design and app layout
                            </p>
                          </div>
                          {activeAgent === 'design_assistant' && (
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          )}
                        </div>
                      </div>

                      {/* Engineering Assistant */}
                      <div 
                        className={`p-3 rounded-lg border bg-card opacity-50 cursor-not-allowed transition-colors ${
                          activeAgent === 'engineering_assistant' ? 'ring-2 ring-purple-500' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                            <Code2 className="w-5 h-5 text-purple-500" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium text-sm">Engineering Assistant</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              Generates React Native code for your app
                            </p>
                          </div>
                          {activeAgent === 'engineering_assistant' && (
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          )}
                        </div>
                      </div>

                      {/* Config Helper */}
                      <div 
                        className={`p-3 rounded-lg border bg-card opacity-50 cursor-not-allowed transition-colors ${
                          activeAgent === 'config_helper' ? 'ring-2 ring-orange-500' : ''
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                            <Settings className="w-5 h-5 text-orange-500" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-medium text-sm">Config Helper</h3>
                            <p className="text-xs text-muted-foreground mt-1">
                              Assists with app configuration and deployment
                            </p>
                          </div>
                          {activeAgent === 'config_helper' && (
                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
    </div>
  )
}