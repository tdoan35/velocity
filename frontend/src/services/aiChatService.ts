import { streamText, convertToCoreMessages, Message } from 'ai';
import { getModelForAgent, chatConfig } from '../lib/ai-config';
import { supabase } from '../lib/supabase';
import type { AgentType, ChatContext } from '../types/ai';

// Agent-specific system prompts
const agentSystemPrompts: Record<AgentType, string> = {
  project: `You are a project management AI assistant specialized in helping users plan and structure React Native mobile applications. 
Focus on:
- Breaking down app requirements into clear milestones
- Suggesting appropriate project structure and organization
- Recommending best practices for React Native development
- Helping with time estimates and resource planning`,

  ui: `You are a UI/UX design AI assistant specialized in React Native mobile app design.
Focus on:
- Creating beautiful and intuitive mobile interfaces
- Suggesting appropriate React Native UI components and libraries
- Providing design system recommendations
- Ensuring accessibility and responsive design
- Recommending color schemes, typography, and spacing`,

  code: `You are a code generation AI assistant specialized in React Native development.
Focus on:
- Writing clean, efficient React Native code
- Using TypeScript for type safety
- Implementing best practices and design patterns
- Integrating with popular React Native libraries
- Ensuring cross-platform compatibility`,

  config: `You are a configuration AI assistant specialized in React Native app setup and deployment.
Focus on:
- Configuring build settings for iOS and Android
- Setting up environment variables and API keys
- Implementing app signing and certificates
- Configuring deployment pipelines
- Optimizing app performance and bundle size`
};

export class AIChatService {
  private static instance: AIChatService;

  private constructor() {}

  static getInstance(): AIChatService {
    if (!AIChatService.instance) {
      AIChatService.instance = new AIChatService();
    }
    return AIChatService.instance;
  }

  async streamChat({
    messages,
    agentType,
    context,
    onStart,
    onToken,
    onFinish,
    onError,
  }: {
    messages: Message[];
    agentType: AgentType;
    context?: ChatContext;
    onStart?: () => void;
    onToken?: (token: string) => void;
    onFinish?: (text: string, usage: any) => void;
    onError?: (error: Error) => void;
  }) {
    try {
      // Get the model for the specific agent
      const model = getModelForAgent(agentType);

      // Build the system message with context
      const systemMessage = this.buildSystemMessage(agentType, context);

      // Prepare messages with system prompt
      const coreMessages = convertToCoreMessages([
        { role: 'system', content: systemMessage } as Message,
        ...messages
      ]);

      // Call onStart callback
      onStart?.();

      // Stream the response
      const result = await streamText({
        model,
        messages: coreMessages,
        maxTokens: chatConfig.maxTokens,
        temperature: chatConfig.temperature,
        topP: chatConfig.topP,
        onFinish: async ({ text, usage }) => {
          // Call the onFinish callback with usage data
          onFinish?.(text, usage);
        },
      });

      // Handle the stream
      for await (const textPart of result.textStream) {
        onToken?.(textPart);
      }

      return result;
    } catch (error) {
      console.error('Error in streamChat:', error);
      onError?.(error as Error);
      throw error;
    }
  }

  private buildSystemMessage(agentType: AgentType, context?: ChatContext): string {
    let systemMessage = agentSystemPrompts[agentType];

    if (context) {
      systemMessage += '\n\nContext:\n';
      
      if (context.projectId) {
        systemMessage += `Project ID: ${context.projectId}\n`;
      }
      
      if (context.currentCode) {
        systemMessage += `\nCurrent Code:\n\`\`\`\n${context.currentCode}\n\`\`\`\n`;
      }
      
      if (context.fileContext) {
        systemMessage += `\nFile Context: ${context.fileContext}\n`;
      }
      
      if (context.projectState) {
        systemMessage += `\nProject State: ${JSON.stringify(context.projectState, null, 2)}\n`;
      }
    }

    return systemMessage;
  }

  async saveMessageToSupabase(
    conversationId: string,
    role: 'user' | 'assistant',
    content: string,
    metadata?: any
  ) {
    try {
      const { data, error } = await supabase
        .from('conversation_messages')
        .insert({
          conversation_id: conversationId,
          role,
          content,
          metadata: metadata || {},
          token_count: metadata?.tokensUsed || null
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error saving message to Supabase:', error);
      throw error;
    }
  }

  async updateConversationMetadata(
    conversationId: string,
    agentType: AgentType,
    tokensUsed: number
  ) {
    try {
      // First fetch current conversation
      const { data: conversation, error: fetchError } = await supabase
        .from('conversations')
        .select('metadata')
        .eq('id', conversationId)
        .single();

      if (fetchError) throw fetchError;

      const currentMetadata = conversation?.metadata || {};
      const agentsUsed = currentMetadata.agentsUsed || [];
      
      // Update agents used list
      if (!agentsUsed.includes(agentType)) {
        agentsUsed.push(agentType);
      }

      // Update metadata
      const { error: updateError } = await supabase
        .from('conversations')
        .update({
          metadata: {
            ...currentMetadata,
            lastAgent: agentType,
            agentsUsed,
            totalTokens: (currentMetadata.totalTokens || 0) + tokensUsed,
            lastUpdated: new Date().toISOString()
          },
          updated_at: new Date().toISOString()
        })
        .eq('id', conversationId);

      if (updateError) throw updateError;
    } catch (error) {
      console.error('Error updating conversation metadata:', error);
      throw error;
    }
  }
}