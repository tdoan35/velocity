import React, { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/useAuthStore'
import { useAppStore } from '@/stores/useAppStore'
import { projectService } from '@/services/projectService'
import { conversationService, type ConversationMessage } from '@/services/conversationService'
import { aiService } from '@/services/aiService'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent } from '@/components/ui/card'
import { motion, AnimatePresence } from 'motion/react'
import { 
  Send, 
  Sparkles, 
  Code2, 
  Loader2,
  ArrowLeft,
  User,
  Bot
} from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  isLoading?: boolean
}

export function ProjectDesign() {
  const { id: projectId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const { currentProject, setCurrentProject } = useAppStore()
  
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isProjectLoading, setIsProjectLoading] = useState(true)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  // Scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }
  
  useEffect(() => {
    scrollToBottom()
  }, [messages])
  
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
            // Load existing conversation and messages
            convId = existingConv.id
            setConversationId(convId)
            
            const { messages: convMessages } = await conversationService.getConversationMessages(convId)
            
            if (convMessages.length > 0) {
              setMessages(convMessages.map(msg => ({
                id: msg.id,
                role: msg.role as 'user' | 'assistant',
                content: msg.content,
                timestamp: new Date(msg.created_at)
              })))
            }
          } else {
            // Create new conversation
            const { conversation: newConv, error: convError } = await conversationService.createConversation(
              projectId,
              project.name
            )
            
            if (convError || !newConv) {
              console.error('Error creating conversation:', convError)
              return
            }
            
            convId = newConv.id
            setConversationId(convId)
            
            // Add initial prompt as first message
            if (project.app_config?.initialPrompt) {
              const initialMessage = {
                id: `msg-${Date.now()}`,
                role: 'user' as const,
                content: project.app_config.initialPrompt,
                timestamp: new Date()
              }
              
              setMessages([initialMessage])
              
              // Save to database
              await conversationService.addMessage(
                convId,
                'user',
                project.app_config.initialPrompt
              )
              
              // Trigger initial AI response
              handleAIResponse(project.app_config.initialPrompt, convId)
            }
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
  const handleAIResponse = async (userMessage: string, convId?: string) => {
    setIsLoading(true)
    
    const currentConvId = convId || conversationId
    if (!currentConvId) {
      console.error('No conversation ID available')
      setIsLoading(false)
      return
    }
    
    // Add a loading message
    const loadingMessage: Message = {
      id: `msg-loading-${Date.now()}`,
      role: 'assistant',
      content: '',
      timestamp: new Date(),
      isLoading: true
    }
    
    setMessages(prev => [...prev, loadingMessage])
    
    try {
      // Get conversation history for context
      const conversationHistory = messages
        .filter(msg => !msg.isLoading)
        .map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      
      // Call AI service
      const stream = await aiService.generateChatResponse(
        userMessage,
        projectId!,
        conversationHistory
      )
      
      let aiResponse = ''
      let messageId: string | null = null
      
      // Parse streaming response
      await aiService.parseStreamResponse(stream, (chunk) => {
        if (chunk.type === 'code' && (chunk.content || chunk.delta)) {
          aiResponse += chunk.content || chunk.delta || ''
          
          // Update loading message with streaming content
          setMessages(prev => prev.map(msg => 
            msg.id === loadingMessage.id 
              ? { ...msg, content: aiResponse }
              : msg
          ))
        } else if (chunk.type === 'error') {
          console.error('AI error:', chunk.message)
        }
      })
      
      // Save complete AI response to database
      const { message: savedMessage } = await conversationService.addMessage(
        currentConvId,
        'assistant',
        aiResponse
      )
      
      // Replace loading message with final response
      setMessages(prev => prev.map(msg => 
        msg.id === loadingMessage.id 
          ? { 
              ...msg, 
              id: savedMessage?.id || msg.id,
              content: aiResponse, 
              isLoading: false,
              timestamp: savedMessage ? new Date(savedMessage.created_at) : msg.timestamp
            }
          : msg
      ))
    } catch (error) {
      console.error('Error getting AI response:', error)
      
      // Show error message instead of removing
      const errorMessage = error instanceof Error ? error.message : 'Failed to get AI response'
      setMessages(prev => prev.map(msg => 
        msg.id === loadingMessage.id 
          ? { 
              ...msg, 
              content: `Error: ${errorMessage}. Please try again.`, 
              isLoading: false
            }
          : msg
      ))
    } finally {
      setIsLoading(false)
    }
  }
  
  // Handle sending a message
  const handleSend = async () => {
    if (!input.trim() || isLoading || !conversationId) return
    
    const messageContent = input.trim()
    
    // Save user message to database
    const { message: savedMessage } = await conversationService.addMessage(
      conversationId,
      'user',
      messageContent
    )
    
    const userMessage: Message = {
      id: savedMessage?.id || `msg-${Date.now()}`,
      role: 'user',
      content: messageContent,
      timestamp: savedMessage ? new Date(savedMessage.created_at) : new Date()
    }
    
    setMessages(prev => [...prev, userMessage])
    setInput('')
    
    // Get AI response
    await handleAIResponse(messageContent)
  }
  
  // Handle Enter key
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }
  
  if (isProjectLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }
  
  return (
    <div className="flex flex-col h-full pt-16">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  message.role === 'user' ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'
                }`}>
                  {message.role === 'user' ? (
                    <User className="w-4 h-4 text-white" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>
                <Card className={`${message.role === 'user' ? 'bg-blue-50 dark:bg-blue-900/20' : ''}`}>
                  <CardContent className="p-4">
                    {message.isLoading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span className="text-muted-foreground">Thinking...</span>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        <div ref={messagesEndRef} />
      </div>
      
      {/* Input */}
      <div className="border-t p-6">
        <div className="flex gap-4">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your message..."
            className="min-h-[80px] resize-none"
            disabled={isLoading}
          />
          <Button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="px-6"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>
    </div>
  )
}