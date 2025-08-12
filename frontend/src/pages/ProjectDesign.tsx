import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAppStore } from '@/stores/useAppStore'
import { projectService } from '@/services/projectService'
import { conversationService } from '@/services/conversationService'
import { prdService } from '@/services/prdService'
import { EnhancedChatInterface } from '@/components/chat/enhanced-chat-interface'
import { NotionPRDEditorEnhanced } from '@/components/prd/NotionPRDEditor.enhanced'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { motion, AnimatePresence } from 'motion/react'
import { cn } from '@/lib/utils'
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
  MessageSquare,
  MoreVertical,
  Edit,
  Trash2,
  Check,
  FileText
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
// AlertDialog component not yet implemented
// import {
//   AlertDialog,
//   AlertDialogAction,
//   AlertDialogCancel,
//   AlertDialogContent,
//   AlertDialogDescription,
//   AlertDialogFooter,
//   AlertDialogHeader,
//   AlertDialogTitle,
// } from '@/components/ui/alert-dialog'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

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
  const [initialPromptSubmitted, setInitialPromptSubmitted] = useState(false)
  const [isFirstVisit, setIsFirstVisit] = useState(false)
  const initialPromptRef = useRef<string | null>(null)
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deletingConversationId, setDeletingConversationId] = useState<string | null>(null)
  const [isSavingTitle, setIsSavingTitle] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const [showPRD, setShowPRD] = useState(false)
  const [hasPRD, setHasPRD] = useState(false)
  // Helper function to get agent info
  const getAgentInfo = (agentType?: string) => {
    switch (agentType) {
      case 'project_manager':
        return { icon: Users, color: 'emerald', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-500', label: 'Project Manager' }
      case 'design_assistant':
        return { icon: Sparkles, color: 'blue', bgColor: 'bg-blue-500/10', textColor: 'text-blue-500', label: 'Design Assistant' }
      case 'engineering_assistant':
        return { icon: Code2, color: 'purple', bgColor: 'bg-purple-500/10', textColor: 'text-purple-500', label: 'Engineering Assistant' }
      case 'config_helper':
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
      
      // Only close history panel when creating a truly new conversation (not loading from history)
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
  
  // Handle conversation rename
  const handleConversationRename = async (conversationId: string, newTitle: string) => {
    if (!newTitle.trim()) {
      setEditingConversationId(null)
      return
    }

    setIsSavingTitle(true)
    try {
      const { conversation, error } = await conversationService.updateConversationTitle(conversationId, newTitle.trim())
      
      if (!error && conversation) {
        // Update in conversation history
        setConversationHistory(prev => 
          prev.map(conv => 
            conv.id === conversationId 
              ? { ...conv, title: newTitle.trim() } 
              : conv
          )
        )
        
        // Update current conversation if it's the one being renamed
        if (currentConversation?.id === conversationId) {
          setCurrentConversation(prev => prev ? { ...prev, title: newTitle.trim() } : null)
        }
        
        toast({
          title: 'Success',
          description: 'Conversation renamed successfully',
        })
      } else {
        toast({
          title: 'Error',
          description: 'Failed to rename conversation',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error renaming conversation:', error)
      toast({
        title: 'Error',
        description: 'Failed to rename conversation',
        variant: 'destructive',
      })
    } finally {
      setIsSavingTitle(false)
      setEditingConversationId(null)
    }
  }

  // Handle conversation delete
  const handleConversationDelete = async (conversationId: string) => {
    try {
      const { error } = await conversationService.deleteConversation(conversationId)
      
      if (!error) {
        // Remove from conversation history
        setConversationHistory(prev => prev.filter(conv => conv.id !== conversationId))
        
        // If the deleted conversation is the current one, clear it
        if (currentConversation?.id === conversationId) {
          setCurrentConversation(null)
        }
        
        toast({
          title: 'Success',
          description: 'Conversation deleted successfully',
        })
      } else {
        toast({
          title: 'Error',
          description: 'Failed to delete conversation',
          variant: 'destructive',
        })
      }
    } catch (error) {
      console.error('Error deleting conversation:', error)
      toast({
        title: 'Error',
        description: 'Failed to delete conversation',
        variant: 'destructive',
      })
    } finally {
      setDeletingConversationId(null)
    }
  }

  // Start editing a conversation title
  const startEditingTitle = (conversationId: string, currentTitle: string) => {
    setEditingConversationId(conversationId)
    setEditingTitle(currentTitle)
    // Focus input after popover opens
    setTimeout(() => {
      if (titleInputRef.current) {
        titleInputRef.current.focus()
        const length = titleInputRef.current.value.length
        titleInputRef.current.setSelectionRange(length, length)
      }
    }, 100)
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
      
      // Check if PRD exists for this project
      const { prd } = await prdService.getPRDByProject(projectId)
      setHasPRD(!!prd)
      
      // Extract initial prompt from app_config
      const initialPrompt = loadedProject.app_config?.initialPrompt
      if (initialPrompt) {
        initialPromptRef.current = initialPrompt
      }
      
      // Set the current project in the app store
      setCurrentProject({
        id: loadedProject.id,
        name: loadedProject.name || loadedProject.title || 'Untitled Project',
        description: loadedProject.description || '',
        createdAt: new Date(loadedProject.created_at || Date.now()),
        updatedAt: new Date(loadedProject.updated_at || Date.now()),
        template: loadedProject.template_type || loadedProject.template || 'react-native',
        status: loadedProject.status || 'ready'
      })
      
      // Check for existing conversation
      const { conversation: existingConv } = await conversationService.getConversationByProjectId(projectId)
      
      if (existingConv) {
        // Load existing conversation
        await createNewConversation(existingConv.title || loadedProject.title, existingConv.id)
        
        // Check if the conversation has any messages
        const { messages } = await conversationService.getConversationMessages(existingConv.id)
        if (messages.length === 0 && initialPrompt && !initialPromptSubmitted) {
          // Existing conversation but no messages - this is essentially a first visit
          setIsFirstVisit(true)
        }
      } else {
        // No existing conversation - this is definitely a first visit
        await createNewConversation(loadedProject.title || loadedProject.name)
        if (initialPrompt && !initialPromptSubmitted) {
          setIsFirstVisit(true)
        }
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
        {/* Left Panel - Enhanced Chat Interface or PRD Editor */}
        <ResizablePanel defaultSize={65} minSize={40}>
          <div className="h-full p-2">
            <Card className="h-full flex flex-col bg-transparent border-gray-300 relative overflow-hidden">
              <AnimatePresence mode="wait">
                {showPRD ? (
                  <motion.div
                    key="prd-editor"
                    className="flex-1 flex flex-col absolute inset-0"
                    initial={{ opacity: 0, x: 100, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -100, scale: 0.95 }}
                    transition={{ 
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1] 
                    }}
                  >
                    <NotionPRDEditorEnhanced
                      projectId={projectId || ''}
                      className="flex-1"
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    key="chat-interface"
                    className="flex-1 flex flex-col absolute inset-0"
                    initial={{ opacity: 0, x: -100, scale: 0.95 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 100, scale: 0.95 }}
                    transition={{ 
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1]
                    }}
                  >
                    <EnhancedChatInterface
                  projectId={projectId || ''}
                  conversationId={currentConversation?.id}
                  onApplyCode={handleApplyCode}
                  className="flex-1"
                  activeAgent={currentConversation?.activeAgent || activeAgent}
                  onAgentChange={updateActiveAgent}
                  conversationTitle={currentConversation?.title}
                  onNewConversation={() => createNewConversation(undefined, undefined, true)}
                  onToggleHistory={() => setShowHistory(!showHistory)}
                  isHistoryOpen={showHistory}
                  initialMessage={isFirstVisit && initialPromptRef.current ? initialPromptRef.current : undefined}
                  projectContext={project ? {
                    id: project.id,
                    name: project.name || project.title || 'Untitled Project',
                    description: project.description,
                    template: project.template_type || project.template,
                    initialPrompt: initialPromptRef.current || undefined
                  } : undefined}
                  onInitialMessageSent={() => {
                    setIsFirstVisit(false)
                    setInitialPromptSubmitted(true)
                  }}
                  onConversationCreated={(newConversationId) => {
                    // Update the current conversation with the real ID
                    if (currentConversation?.isTemporary) {
                      setCurrentConversation({
                        ...currentConversation,
                        id: newConversationId,
                        isTemporary: false,
                      })
                      // Reload conversation history
                      loadConversationHistory()
                    } else if (!currentConversation) {
                      // Create a new conversation state when none exists
                      setCurrentConversation({
                        id: newConversationId,
                        title: 'New Conversation',
                        isLoading: false,
                        activeAgent: activeAgent,
                        isTemporary: false,
                        metadata: {
                          primaryAgent: activeAgent,
                          agentsUsed: [activeAgent],
                          lastAgent: activeAgent
                        }
                      })
                      loadConversationHistory()
                    }
                  }}
                  onTitleGenerated={(generatedTitle) => {
                    // Update the conversation title with the AI-generated title
                    if (currentConversation) {
                      setCurrentConversation(prev => prev ? {
                        ...prev,
                        title: generatedTitle
                      } : null)
                      // Also update in conversation history if it exists
                      setConversationHistory(prev => 
                        prev.map(conv => 
                          conv.id === currentConversation.id 
                            ? { ...conv, title: generatedTitle } 
                            : conv
                        )
                      )
                    }
                  }}
                  onConversationTitleUpdated={(updatedTitle) => {
                    // Update the conversation title when manually renamed
                    if (currentConversation) {
                      setCurrentConversation(prev => prev ? {
                        ...prev,
                        title: updatedTitle
                      } : null)
                      // Also update in conversation history if it exists
                      setConversationHistory(prev => 
                        prev.map(conv => 
                          conv.id === currentConversation.id 
                            ? { ...conv, title: updatedTitle } 
                            : conv
                        )
                      )
                    }
                  }}
                    />
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </div>
        </ResizablePanel>

          <ResizableHandle withHandle />

          {/* Right Panel - Agents List or History */}
          <ResizablePanel defaultSize={35} minSize={25}>
            <div className="h-full p-2">
              <Card className="h-full flex flex-col bg-transparent border-gray-300 dark:border-gray-700/50">
                <CardHeader className="p-4 pl-5 border-b border-gray-300">
                  <AnimatePresence mode="wait">
                    <motion.div 
                      key={showHistory ? 'history' : 'agents'}
                      className="flex items-center gap-2"
                      initial={{ opacity: 0, x: showHistory ? 10 : -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: showHistory ? -10 : 10 }}
                      transition={{ duration: 0.2, ease: "easeInOut" }}
                    >
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
                    </motion.div>
                  </AnimatePresence>
                </CardHeader>
                <CardContent className="p-4 flex-1 overflow-y-auto">
                  <AnimatePresence mode="wait">
                    {showHistory ? (
                      // Conversation History View
                      <motion.div 
                        key="history-content"
                        className="space-y-2"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                      >
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
                          
                          const isCurrentConversation = currentConversation?.id === conv.id;
                          
                          return (
                            <div
                              key={conv.id}
                              className={cn(
                                "group relative p-3 rounded-lg border transition-all",
                                isCurrentConversation 
                                  ? "bg-card border-primary/50 ring-1 ring-primary/30 shadow-sm" 
                                  : "bg-card hover:bg-accent/50 border-gray-200 dark:border-gray-700"
                              )}
                            >
                              {/* Dropdown menu - positioned at top-right corner */}
                              <div className="absolute top-2 right-2 z-10">
                                <DropdownMenu>
                                  <DropdownMenuTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      <MoreVertical className="h-3.5 w-3.5" />
                                    </Button>
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end" className="w-40">
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        startEditingTitle(conv.id, conv.title)
                                      }}
                                    >
                                      <Edit className="w-3.5 h-3.5 mr-2" />
                                      Rename
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setDeletingConversationId(conv.id)
                                      }}
                                      className="text-destructive focus:text-destructive"
                                    >
                                      <Trash2 className="w-3.5 h-3.5 mr-2" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </div>
                              
                              <div 
                                className="flex items-start gap-3 cursor-pointer"
                                onClick={async () => {
                                  // Load this conversation without closing history
                                  await createNewConversation(conv.title, conv.id)
                                  // Keep history panel open when selecting a conversation
                                }}
                              >
                                <div className={`w-8 h-8 rounded-full ${agentInfo.bgColor} flex items-center justify-center flex-shrink-0`}>
                                  <AgentIcon className={`w-4 h-4 ${agentInfo.textColor}`} />
                                </div>
                                <div className="flex-1 min-w-0 ">
                                  <div className="flex items-center gap-2">
                                    {editingConversationId === conv.id ? (
                                      <Popover open={editingConversationId === conv.id} onOpenChange={(open) => !open && setEditingConversationId(null)}>
                                        <PopoverTrigger asChild>
                                          <div className="flex-1" />
                                        </PopoverTrigger>
                                        <PopoverContent className="w-56 px-3 pt-1" align="start" side="bottom">
                                          <div className="space-y-1">
                                            <Label htmlFor={`conv-title-${conv.id}`} className="text-xs text-muted-foreground">Conversation title</Label>
                                            <div className="flex gap-1.5 items-center">
                                              <Input
                                                id={`conv-title-${conv.id}`}
                                                ref={titleInputRef}
                                                value={editingTitle}
                                                onChange={(e) => setEditingTitle(e.target.value)}
                                                onKeyDown={(e) => {
                                                  e.stopPropagation()
                                                  if (e.key === 'Enter') {
                                                    handleConversationRename(conv.id, editingTitle)
                                                  } else if (e.key === 'Escape') {
                                                    setEditingConversationId(null)
                                                  }
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                placeholder="Enter conversation title"
                                                className="flex-1 bg-background h-8 text-sm"
                                                disabled={isSavingTitle}
                                                autoFocus
                                              />
                                              <Button
                                                size="icon"
                                                variant="ghost"
                                                onClick={(e) => {
                                                  e.stopPropagation()
                                                  handleConversationRename(conv.id, editingTitle)
                                                }}
                                                disabled={isSavingTitle || !editingTitle.trim() || editingTitle === conv.title}
                                                className="h-8 w-8"
                                              >
                                                <Check className="h-4 w-4" />
                                              </Button>
                                            </div>
                                          </div>
                                        </PopoverContent>
                                      </Popover>
                                    ) : (
                                      <h3 className="font-medium text-sm truncate flex-1">{conv.title}</h3>
                                    )}
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
                                    <span className="text-xs text-muted-foreground">
                                      {conv.message_count} messages
                                    </span>
                                    <p className="text-xs text-muted-foreground">
                                      {new Date(conv.created_at).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                      </motion.div>
                    ) : (
                      // AI Agents View
                      <motion.div 
                        key="agents-content"
                        className="space-y-3"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.25, ease: "easeInOut" }}
                      >
                        {/* Project Manager */}
                      <motion.div 
                        className="space-y-2"
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1, duration: 0.2 }}
                      >
                        <div 
                          className={`p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-card hover:bg-accent/50 cursor-pointer transition-colors ${
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
                      </motion.div>

                      {/* Design Assistant */}
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.2 }}
                      >
                        <div 
                          className={`p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 cursor-not-allowed transition-colors relative ${
                            activeAgent === 'design_assistant' ? 'ring-2 ring-blue-500' : ''
                          }`}
                        >
                          <div className="absolute inset-0 bg-gray-100/20 dark:bg-gray-900/20 rounded-lg" />
                          <div className="flex items-start gap-3 relative opacity-60">
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
                      </motion.div>

                      {/* Engineering Assistant */}
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.2 }}
                      >
                        <div 
                          className={`p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 cursor-not-allowed transition-colors relative ${
                            activeAgent === 'engineering_assistant' ? 'ring-2 ring-purple-500' : ''
                          }`}
                        >
                          <div className="absolute inset-0 bg-gray-100/20 dark:bg-gray-900/20 rounded-lg" />
                          <div className="flex items-start gap-3 relative opacity-60">
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
                      </motion.div>

                      {/* Config Helper */}
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.25, duration: 0.2 }}
                      >
                        <div 
                          className={`p-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30 cursor-not-allowed transition-colors relative ${
                            activeAgent === 'config_helper' ? 'ring-2 ring-orange-500' : ''
                          }`}
                        >
                          <div className="absolute inset-0 bg-gray-100/20 dark:bg-gray-900/20 rounded-lg" />
                          <div className="flex items-start gap-3 relative opacity-60">
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
                      </motion.div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </CardContent>
                {/* Card Footer with View PRD Button */}
                {!showHistory && activeAgent === 'project_manager' && (
                  <CardFooter className="p-4 border-t border-gray-300">
                    <Button
                      variant={showPRD ? "default" : "outline"}
                      size="sm"
                      className="w-full"
                      onClick={() => setShowPRD(!showPRD)}
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      {showPRD ? 'Show Chat' : 'View PRD'}
                      {hasPRD && !showPRD && (
                        <div className="ml-auto w-2 h-2 rounded-full bg-green-500" />
                      )}
                    </Button>
                  </CardFooter>
                )}
              </Card>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
        
        {/* Delete Confirmation Dialog */}
        <Dialog open={!!deletingConversationId} onOpenChange={(open) => !open && setDeletingConversationId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Conversation</DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this conversation? This action cannot be undone and will permanently delete all messages in this conversation.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setDeletingConversationId(null)}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (deletingConversationId) {
                    handleConversationDelete(deletingConversationId)
                  }
                }}
              >
                Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
    </div>
  )
}
