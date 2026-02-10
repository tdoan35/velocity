// AI SDK Types and Interfaces

export type AgentType = 'project_manager' | 'design_assistant' | 'engineering_assistant' | 'config_helper' | 'builder';

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  createdAt: Date;
  metadata?: {
    agentType?: AgentType;
    tokensUsed?: number;
    model?: string;
    suggestedResponses?: Array<{
      text: string;
      category?: 'continuation' | 'clarification' | 'example';
      section?: string;
    }>;
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

// Builder Agent Types

export type BuilderStatus = 'idle' | 'preparing' | 'generating' | 'complete' | 'error';

export type BuilderModel = 'claude-sonnet-4-5-20250929' | 'claude-opus-4-6';

export interface FileOperation {
  operation: 'create' | 'update' | 'delete';
  filePath: string;
  content?: string;
  reason?: string;
}

export interface BuildProgress {
  status: BuilderStatus;
  currentStep?: string;
  currentFile?: string;
  filesCompleted: number;
  filesTotal: number;
  stepsCompleted: number;
  stepsTotal: number;
  errors: string[];
}

export type BuildStep =
  | 'scaffold'
  | 'types'
  | 'components'
  | 'pages'
  | 'routing'
  | 'data';