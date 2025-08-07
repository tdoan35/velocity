// AI SDK Types and Interfaces

export type AgentType = 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  metadata?: {
    agentType?: AgentType;
    tokensUsed?: number;
    model?: string;
  };
}

export interface AIStreamCallbacks {
  onStart?: () => void;
  onToken?: (token: string) => void;
  onFinish?: (message: string) => void;
  onError?: (error: Error) => void;
}

export interface ChatSession {
  id: string;
  projectId: string;
  messages: AIMessage[];
  agentType: AgentType;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatContext {
  projectId?: string;
  currentCode?: string;
  fileContext?: string;
  projectState?: any;
}

export interface ChatRequest {
  message: string;
  sessionId?: string;
  agentType: AgentType;
  context?: ChatContext;
}

export interface ChatResponse {
  message: string;
  sessionId: string;
  metadata?: {
    tokensUsed: number;
    model: string;
    processingTime: number;
  };
}