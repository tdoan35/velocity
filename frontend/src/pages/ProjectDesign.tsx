import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAppStore } from '@/stores/useAppStore'
import { projectService } from '@/services/projectService'
import { conversationService, type ConversationMessage } from '@/services/conversationService'
import { aiService } from '@/services/aiService'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { EnhancedTextarea } from '@/components/ui/enhanced-textarea'
import { motion, AnimatePresence } from 'motion/react'
import { 
  Send, 
  Sparkles, 
  Code2, 
  Loader2,
  ArrowLeft,
  User,
  Bot,
  Users,
  Settings,
  MessageSquare,
  History,
  ChevronLeft,
  Plus,
  X
} from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isLoading?: boolean
  metadata?: {
    agentType?: string
  }
}

interface ConversationTab {
  id: string
  title: string
  messages: Message[]
  isLoading: boolean
  activeAgent: 'project_manager' | 'design_assistant' | 'code_generator' | 'config_helper'
  isTemporary?: boolean  // True for tabs that haven't been saved to backend yet
  metadata?: {
    primaryAgent?: string
    agentsUsed?: string[]
    lastAgent?: string
  }
}

export function ProjectDesign() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentProject, setCurrentProject } = useAppStore()
  
  const [currentConversation, setCurrentConversation] = useState<ConversationTab | null>(null)
  const [input, setInput] = useState('')
  const [isProjectLoading, setIsProjectLoading] = useState(true)
  const [activeAgent, setActiveAgent] = useState<'project_manager' | 'design_assistant' | 'code_generator' | 'config_helper'>('project_manager')
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
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Get current conversation data
  const messages = currentConversation?.messages || []
  const isLoading = currentConversation?.isLoading || false
  
  // Helper function to get agent icon and color
  const getAgentInfo = (agentType?: string) => {
    switch (agentType) {
      case 'project_manager':
        return { icon: Users, color: 'emerald', bgColor: 'bg-emerald-500/10', textColor: 'text-emerald-500' }
      case 'design_assistant':
        return { icon: Sparkles, color: 'blue', bgColor: 'bg-blue-500/10', textColor: 'text-blue-500' }
      case 'code_generator':
        return { icon: Code2, color: 'purple', bgColor: 'bg-purple-500/10', textColor: 'text-purple-500' }
      case 'config_helper':
        return { icon: Settings, color: 'orange', bgColor: 'bg-orange-500/10', textColor: 'text-orange-500' }
      default:
        return { icon: Bot, color: 'gray', bgColor: 'bg-gray-500/10', textColor: 'text-gray-500' }
    }
  }
  
  // Create or load conversation
  const createNewConversation = async (title?: string, loadFromId?: string) => {
    if (!projectId) return
    
    try {
      let conversationId = loadFromId
      let conversationTitle = title || 'New Conversation'
      let initialMessages: Message[] = []
      let metadata = {}
      let isTemporary = false
      
      // If loading existing conversation
      if (loadFromId) {
        const { messages: convMessages } = await conversationService.getConversationMessages(loadFromId)
        if (convMessages.length > 0) {
          initialMessages = convMessages.map(msg => ({
            id: msg.id,
            role: msg.role as 'user' | 'assistant',
            content: msg.content,
            timestamp: new Date(msg.created_at),
            metadata: msg.metadata
          }))
        }
      } else {
        // Don't create in database yet - just create a temporary local conversation
        conversationId = `temp-${Date.now()}`
        isTemporary = true
        metadata = {
          primaryAgent: activeAgent,
          agentsUsed: [activeAgent],
          lastAgent: activeAgent
        }
      }
      
      // Set current conversation
      const newConversation: ConversationTab = {
        id: conversationId!,
        title: conversationTitle,
        messages: initialMessages,
        isLoading: false,
        activeAgent: activeAgent,
        isTemporary,
        metadata
      }
      
      setCurrentConversation(newConversation)
    } catch (error) {
      console.error('Error creating conversation:', error)
    }
  }
  
  // Update active agent
  const updateActiveAgent = (agent: 'project_manager' | 'design_assistant' | 'code_generator' | 'config_helper') => {
    setActiveAgent(agent)
    if (currentConversation) {
      setCurrentConversation({
        ...currentConversation,
        activeAgent: agent
      })
    }
  }
  
  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  
  useEffect(() => {
    scrollToBottom()
  }, [messages])
  
  // Load conversation history
  const loadConversationHistory = async () => {
    if (!user?.id) return
    
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
        .order('created_at', { ascending: false })
        .limit(20)
      
      if (error) {
        console.error('Error loading conversation history:', error)
        return
      }
      
      // Get message counts for each conversation
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
  
  // Load conversation history when toggling to history view
  useEffect(() => {
    if (showHistory) {
      loadConversationHistory()
    }
  }, [showHistory, user?.id])
  
  // Load project data and conversation
  useEffect(() => {
    const loadProjectAndConversation = async () => {
      if (!projectId) return
      
      setIsProjectLoading(true)
      try {
        // Load project
        const { project, error } = await projectService.getProject(projectId)
        
        if (error) {
          console.error('Error loading project:', error)
          navigate('/dashboard')
          return
        }
        
        if (project) {
          setCurrentProject(project)
          
          // Check for existing conversation
          const { conversation: existingConv } = await conversationService.getConversationByProjectId(projectId)
          
          let convId: string
          
          if (existingConv) {
            // Load existing conversation as a tab
            await createNewConversation(existingConv.title || project.name, existingConv.id)
          } else {
            // Create new conversation
            await createNewConversation(project.name)
          }
        }
      } catch (error) {
        console.error('Error loading project:', error)
        navigate('/dashboard')
      } finally {
        setIsProjectLoading(false)
      }
    }
    
    loadProjectAndConversation()
  }, [projectId, navigate, setCurrentProject])
  
  // Handle AI response
  const handleAIResponse = async (userMessage: string, conversationId: string) => {
    if (!conversationId || !projectId || !currentConversation) return
    
    // Don't process AI responses for temporary conversations (they should be converted first)
    if (currentConversation.isTemporary) return
    
    // Set loading state
    setCurrentConversation({
      ...currentConversation,
      isLoading: true
    })
    
    // Add a loading message
    const loadingMessage: Message = {
      id: `msg-loading-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true
    }
    
    setCurrentConversation(prev => prev ? {
      ...prev,
      messages: [...prev.messages, loadingMessage]
    } : null)
    
    try {
      // Get conversation history for context
      const conversationHistory = currentConversation.messages
        .filter(msg => !msg.isLoading)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      
      // Call AI service with conversationId and activeAgent
      const stream = await aiService.generateChatResponse(
        userMessage,
        projectId,
        conversationHistory,
        conversationId,
        currentConversation.activeAgent
      )
      
      let aiResponse = ''
      let messageId: string | null = null
      
      // Parse streaming response from conversation edge function
      const reader = stream.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          
          // Decode the chunk and add to buffer
          buffer += decoder.decode(value, { stream: true })
          
          // Split by newlines but keep the last incomplete line in buffer
          const lines = buffer.split('\n')
          buffer = lines.pop() || '' // Keep the last (potentially incomplete) line
          
          for (const line of lines) {
            if (line.trim() && line.startsWith('data: ')) {
              const data = line.slice(6).trim()
              
              if (data === '[DONE]') {
                continue
              }
              
              if (data) {
                try {
                  const chunk = JSON.parse(data)
                  
                  if (chunk.type === 'text' && chunk.content) {
                    aiResponse += chunk.content
                    
                    // Update loading message with streaming content
                    setCurrentConversation(prev => prev ? {
                      ...prev,
                      messages: prev.messages.map(msg =>
                        msg.id === loadingMessage.id
                          ? { ...msg, content: aiResponse }
                          : msg
                      )
                    } : null)
                  }
                } catch (e) {
                  console.error('Error parsing chunk:', e, 'Data:', data)
                }
              }
            }
          }
        }
        
        // Process any remaining data in buffer
        if (buffer.trim() && buffer.startsWith('data: ')) {
          const data = buffer.slice(6).trim()
          if (data && data !== '[DONE]') {
            try {
              const chunk = JSON.parse(data)
              if (chunk.type === 'text' && chunk.content) {
                aiResponse += chunk.content
                setCurrentConversation(prev => prev ? {
                  ...prev,
                  messages: prev.messages.map(msg =>
                    msg.id === loadingMessage.id
                      ? { ...msg, content: aiResponse }
                      : msg
                  )
                } : null)
              }
            } catch (e) {
              console.error('Error parsing final buffer:', e, 'Data:', data)
            }
          }
        }
      } finally {
        reader.releaseLock()
      }
      
      // Save complete AI response to database
      const { message: savedMessage } = await conversationService.addMessage(
        conversationId,
        'assistant',
        aiResponse,
        { agentType: currentConversation.activeAgent }
      )
      
      // Replace loading message with final response
      setCurrentConversation(prev => prev ? {
        ...prev,
        messages: prev.messages.map(msg =>
          msg.id === loadingMessage.id
            ? { 
                ...msg, 
                id: savedMessage?.id || msg.id,
                content: aiResponse, 
                isLoading: false,
                timestamp: savedMessage ? new Date(savedMessage.created_at) : msg.timestamp,
                metadata: { agentType: currentConversation.activeAgent }
              }
            : msg
        ),
        isLoading: false
      } : null)
    } catch (error) {
      console.error('Error getting AI response:', error)
      
      // Show error message instead of removing
      const errorMessage = error instanceof Error ? error.message : 'Failed to get AI response'
      setCurrentConversation(prev => prev ? {
        ...prev,
        messages: prev.messages.map(msg =>
          msg.id === loadingMessage.id
            ? { 
                ...msg, 
                content: `Error: ${errorMessage}. Please try again.`, 
                isLoading: false
              }
            : msg
        ),
        isLoading: false
      } : null)
    }
  }
  
  // Handle sending a message
  const handleSend = async () => {
    if (!input.trim() || isLoading || !currentConversation) return
    
    const messageContent = input.trim()
    let actualConversationId = currentConversation.id
    
    // If this is a temporary conversation, create it in the backend first
    if (currentConversation.isTemporary) {
      const { conversation: newConv, error } = await conversationService.createConversation(
        projectId!,
        currentConversation.title,
        currentConversation.activeAgent
      )
      
      if (error || !newConv) {
        console.error('Error creating conversation:', error)
        return
      }
      
      // Update the conversation with the real ID
      actualConversationId = newConv.id
      setCurrentConversation({
        ...currentConversation,
        id: actualConversationId,
        isTemporary: false,
        metadata: {
          primaryAgent: currentConversation.activeAgent,
          agentsUsed: [currentConversation.activeAgent],
          lastAgent: currentConversation.activeAgent
        }
      })
    }
    
    // Save user message to database
    const { message: savedMessage } = await conversationService.addMessage(
      actualConversationId,
      'user',
      messageContent
    )
    
    const userMessage: Message = {
      id: savedMessage?.id || `msg-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: savedMessage ? new Date(savedMessage.created_at) : new Date()
    }
    
    setCurrentConversation(prev => prev ? {
      ...prev,
      messages: [...prev.messages, userMessage]
    } : null)
    setInput('')
    
    // Get AI response
    await handleAIResponse(messageContent, actualConversationId)
  }
  
  
  if (isProjectLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }
  
  return (
    <div className="flex flex-col h-full mx-2 mb-2 rounded-lg overflow-hidden bg-white/30 dark:bg-gray-900/30 backdrop-blur-lg border border-gray-200/50 dark:border-gray-700/50 shadow-xl">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        {/* Left Panel - Chat Interface */}
        <ResizablePanel defaultSize={65} minSize={40}>
          <div className="h-full p-2">
            <Card className="h-full flex flex-col bg-transparent">
              {/* Card Header */}
              <CardHeader className="p-4 pl-5 border-b bg-transparent">
                <div className="flex items-center gap-2">
                  {(() => {
                    const agentInfo = getAgentInfo(currentConversation?.activeAgent)
                    const AgentIcon = agentInfo.icon
                    return (
                      <div className={`w-8 h-8 rounded-full ${agentInfo.bgColor} flex items-center justify-center flex-shrink-0`}>
                        <AgentIcon className={`w-4 h-4 ${agentInfo.textColor}`} />
                      </div>
                    )
                  })()}
                  <CardTitle className="text-lg">
                    {currentConversation?.title || 'Chat Conversation'}
                  </CardTitle>
                </div>
              </CardHeader>
              
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                {!currentConversation ? (
                  <div className="flex flex-col items-center justify-center h-full">
                    <MessageSquare className="w-12 h-12 text-muted-foreground mb-4" />
                    <p className="text-muted-foreground text-sm mb-4">No active conversations</p>
                    <Button onClick={() => createNewConversation()}>
                      <Plus className="w-4 h-4 mr-2" />
                      Start New Conversation
                    </Button>
                  </div>
                ) : (
                  <AnimatePresence initial={false}>
                    {messages.map((message) => {
                    const assistantAgentInfo = message.role === 'assistant' 
                      ? getAgentInfo(message.metadata?.agentType || activeAgent)
                      : null
                    const AssistantIcon = assistantAgentInfo?.icon || Bot
                    
                    return (
                      <motion.div
                        key={message.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        transition={{ duration: 0.3 }}
                        className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                      >
                        <div className={`max-w-[85%]`}>
                          <Card className={`${message.role === 'user' ? 'bg-blue-50/50 dark:bg-blue-900/10' : 'bg-transparent border-0 shadow-none'}`}>
                            <CardContent className="p-1 px-3">
                              {message.isLoading ? (
                                <div className="flex items-center gap-2">
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                  <span className="text-muted-foreground">Thinking...</span>
                                </div>
                              ) : (
                                <div>
                                  {message.metadata?.agentType && message.role === 'assistant' && (
                                    <div className="text-xs text-muted-foreground mb-1">
                                      {message.metadata.agentType === 'project_manager' ? 'Project Manager' :
                                        message.metadata.agentType === 'design_assistant' ? 'Design Assistant' :
                                        message.metadata.agentType === 'code_generator' ? 'Code Generator' :
                                        message.metadata.agentType === 'config_helper' ? 'Config Helper' : ''}
                                    </div>
                                  )}
                                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        </div>
                      </motion.div>
                    )
                  })}
                  </AnimatePresence>
                )}
                <div ref={messagesEndRef} />
              </div>
              
              {/* Input */}
              <div className="border-t p-4">
                <EnhancedTextarea
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSend}
                  placeholder="Type your message..."
                  disabled={isLoading || !currentConversation}
                  isLoading={isLoading}
                  submitIcon={Send}
                  minHeight="60px"
                  showAttachButton={false}
                  textareaClassName="text-sm"
                />
              </div>
            </Card>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel - Agents List or History */}
        <ResizablePanel defaultSize={35} minSize={25}>
          <div className="h-full p-2">
            <Card className="h-full flex flex-col">
              <CardHeader className="p-4 pl-5 border-b">
                <div className="flex items-center justify-between">
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
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => createNewConversation()}
                      title="New Conversation"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setShowHistory(!showHistory)}
                      title={showHistory ? "Show AI Agents" : "Show Chat History"}
                    >
                      {showHistory ? (
                        <ChevronLeft className="w-4 h-4" />
                      ) : (
                        <History className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
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
                    className={`p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors ${
                      activeAgent === 'design_assistant' ? 'ring-2 ring-blue-500' : ''
                    }`}
                    onClick={() => updateActiveAgent('design_assistant')}
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

                  {/* Code Generator */}
                  <div 
                    className={`p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors ${
                      activeAgent === 'code_generator' ? 'ring-2 ring-purple-500' : ''
                    }`}
                    onClick={() => updateActiveAgent('code_generator')}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-purple-500/10 flex items-center justify-center flex-shrink-0">
                        <Code2 className="w-5 h-5 text-purple-500" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-sm">Code Generator</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Generates React Native code
                        </p>
                      </div>
                      {activeAgent === 'code_generator' && (
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      )}
                    </div>
                  </div>

                  {/* Config Helper */}
                  <div 
                    className={`p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-pointer transition-colors ${
                      activeAgent === 'config_helper' ? 'ring-2 ring-orange-500' : ''
                    }`}
                    onClick={() => updateActiveAgent('config_helper')}
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                        <Settings className="w-5 h-5 text-orange-500" />
                      </div>
                      <div className="flex-1">
                        <h3 className="font-medium text-sm">Config Helper</h3>
                        <p className="text-xs text-muted-foreground mt-1">
                          Assists with app configuration
                        </p>
                      </div>
                      {activeAgent === 'config_helper' && (
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                      )}
                    </div>
                  </div>

                    <div className="mt-6 p-3 rounded-lg bg-muted/50">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Active:</span> {
                          activeAgent === 'project_manager' ? 'Project Manager' :
                          activeAgent === 'design_assistant' ? 'Design Assistant' :
                          activeAgent === 'code_generator' ? 'Code Generator' :
                          'Config Helper'
                        }
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Click on an agent to switch context
                      </p>
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