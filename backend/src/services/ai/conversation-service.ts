import { createClient } from '@supabase/supabase-js';
import { EmbeddingService } from './embedding-service';
import { z } from 'zod';

// Message role types
export type MessageRole = 'user' | 'assistant' | 'system';

// Conversation status
export type ConversationStatus = 'active' | 'archived' | 'deleted';

// Message interface
export interface ConversationMessage {
  id: string;
  role: MessageRole;
  content: string;
  tokensUsed?: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

// Conversation interface
export interface Conversation {
  id: string;
  projectId: string;
  userId: string;
  threadId: string;
  status: ConversationStatus;
  messageCount: number;
  lastMessageAt: Date;
  createdAt: Date;
  metadata?: Record<string, any>;
}

// Context window configuration
const ContextConfigSchema = z.object({
  maxMessages: z.number().default(20),
  maxTokens: z.number().default(8000),
  includeSystemMessages: z.boolean().default(true),
  summarizeAfter: z.number().default(50), // Summarize after N messages
});

type ContextConfig = z.infer<typeof ContextConfigSchema>;

export class ConversationService {
  private supabase: ReturnType<typeof createClient>;
  private embeddingService: EmbeddingService;
  private contextConfig: ContextConfig;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    embeddingService: EmbeddingService,
    contextConfig?: Partial<ContextConfig>
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.embeddingService = embeddingService;
    this.contextConfig = ContextConfigSchema.parse(contextConfig || {});
  }

  /**
   * Create a new conversation thread
   */
  async createConversation(
    projectId: string,
    userId: string,
    metadata?: Record<string, any>
  ): Promise<Conversation> {
    const { data, error } = await this.supabase
      .from('ai_conversations')
      .insert({
        project_id: projectId,
        user_id: userId,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating conversation:', error);
      throw new Error('Failed to create conversation');
    }

    return {
      id: data.id,
      projectId: data.project_id,
      userId: data.user_id,
      threadId: data.thread_id,
      status: data.status,
      messageCount: data.message_count,
      lastMessageAt: new Date(data.last_message_at),
      createdAt: new Date(data.created_at),
      metadata: data.metadata,
    };
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(
    conversationId: string,
    role: MessageRole,
    content: string,
    tokensUsed?: number,
    metadata?: Record<string, any>
  ): Promise<ConversationMessage> {
    // Generate embedding for the message
    const embedding = await this.embeddingService.generateEmbedding(content);

    // Insert message
    const { data: message, error: messageError } = await this.supabase
      .from('ai_conversation_messages')
      .insert({
        conversation_id: conversationId,
        role,
        content,
        embedding,
        tokens_used: tokensUsed,
        metadata: metadata || {},
      })
      .select()
      .single();

    if (messageError) {
      console.error('Error adding message:', messageError);
      throw new Error('Failed to add message');
    }

    // Update conversation stats
    const { error: updateError } = await this.supabase
      .from('ai_conversations')
      .update({
        message_count: this.supabase.sql`message_count + 1`,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId);

    if (updateError) {
      console.error('Error updating conversation:', updateError);
    }

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      tokensUsed: message.tokens_used,
      metadata: message.metadata,
      createdAt: new Date(message.created_at),
    };
  }

  /**
   * Get conversation history with context window
   */
  async getConversationContext(
    conversationId: string,
    options?: Partial<ContextConfig>
  ): Promise<ConversationMessage[]> {
    const config = { ...this.contextConfig, ...options };

    // Fetch recent messages
    let query = this.supabase
      .from('ai_conversation_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(config.maxMessages);

    if (!config.includeSystemMessages) {
      query = query.neq('role', 'system');
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching conversation context:', error);
      throw new Error('Failed to fetch conversation context');
    }

    // Reverse to get chronological order
    const messages = data.reverse();

    // Apply token limit if needed
    return this.applyTokenLimit(messages, config.maxTokens);
  }

  /**
   * Get all conversations for a user/project
   */
  async getConversations(
    userId: string,
    projectId?: string,
    status?: ConversationStatus
  ): Promise<Conversation[]> {
    let query = this.supabase
      .from('ai_conversations')
      .select('*')
      .eq('user_id', userId)
      .order('last_message_at', { ascending: false });

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching conversations:', error);
      throw new Error('Failed to fetch conversations');
    }

    return data.map(conv => ({
      id: conv.id,
      projectId: conv.project_id,
      userId: conv.user_id,
      threadId: conv.thread_id,
      status: conv.status,
      messageCount: conv.message_count,
      lastMessageAt: new Date(conv.last_message_at),
      createdAt: new Date(conv.created_at),
      metadata: conv.metadata,
    }));
  }

  /**
   * Find similar conversations based on content
   */
  async findSimilarConversations(
    queryText: string,
    projectId: string,
    maxResults: number = 5
  ): Promise<Array<{
    conversationId: string;
    messageId: string;
    content: string;
    similarity: number;
  }>> {
    const embedding = await this.embeddingService.generateEmbedding(queryText);

    // Search for similar messages in conversations
    const { data, error } = await this.supabase.rpc('find_similar_messages', {
      query_embedding: embedding,
      p_project_id: projectId,
      max_results: maxResults,
    });

    if (error) {
      console.error('Error finding similar conversations:', error);
      return [];
    }

    return data.map((row: any) => ({
      conversationId: row.conversation_id,
      messageId: row.message_id,
      content: row.content,
      similarity: row.similarity,
    }));
  }

  /**
   * Summarize a long conversation
   */
  async summarizeConversation(
    conversationId: string,
    options?: {
      maxSummaryLength?: number;
      focusOn?: string[];
    }
  ): Promise<string> {
    // Get all messages
    const { data: messages, error } = await this.supabase
      .from('ai_conversation_messages')
      .select('role, content, created_at')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true });

    if (error || !messages || messages.length === 0) {
      return 'No messages to summarize';
    }

    // Build conversation text
    const conversationText = messages
      .map(msg => `${msg.role}: ${msg.content}`)
      .join('\n\n');

    // For now, return a simple summary
    // In production, this would call an AI service to generate a proper summary
    const summary = `Conversation Summary (${messages.length} messages):\n` +
      `- Started: ${new Date(messages[0].created_at).toLocaleString()}\n` +
      `- Last message: ${new Date(messages[messages.length - 1].created_at).toLocaleString()}\n` +
      `- Topics discussed: ${this.extractTopics(conversationText).join(', ')}`;

    return summary;
  }

  /**
   * Archive old conversations
   */
  async archiveOldConversations(
    daysOld: number = 30,
    projectId?: string
  ): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    let query = this.supabase
      .from('ai_conversations')
      .update({ status: 'archived' })
      .eq('status', 'active')
      .lt('last_message_at', cutoffDate.toISOString());

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    const { data, error } = await query.select('id');

    if (error) {
      console.error('Error archiving conversations:', error);
      return 0;
    }

    return data?.length || 0;
  }

  /**
   * Delete a conversation and all its messages
   */
  async deleteConversation(conversationId: string): Promise<void> {
    // Messages will be cascade deleted due to foreign key constraint
    const { error } = await this.supabase
      .from('ai_conversations')
      .update({ status: 'deleted' })
      .eq('id', conversationId);

    if (error) {
      console.error('Error deleting conversation:', error);
      throw new Error('Failed to delete conversation');
    }
  }

  /**
   * Build conversation prompt with context
   */
  async buildConversationPrompt(
    conversationId: string,
    newMessage: string,
    systemPrompt?: string
  ): Promise<Array<{ role: string; content: string }>> {
    // Get conversation context
    const messages = await this.getConversationContext(conversationId);

    // Build prompt array
    const prompt: Array<{ role: string; content: string }> = [];

    // Add system prompt if provided
    if (systemPrompt) {
      prompt.push({ role: 'system', content: systemPrompt });
    }

    // Add conversation history
    messages.forEach(msg => {
      prompt.push({ role: msg.role, content: msg.content });
    });

    // Add new user message
    prompt.push({ role: 'user', content: newMessage });

    return prompt;
  }

  /**
   * Apply token limit to messages
   */
  private applyTokenLimit(
    messages: any[],
    maxTokens: number
  ): ConversationMessage[] {
    // Simple approximation: 1 token ≈ 4 characters
    const CHARS_PER_TOKEN = 4;
    let totalChars = 0;
    const limitedMessages: ConversationMessage[] = [];

    // Start from most recent and work backwards
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      const msgChars = msg.content.length;

      if (totalChars + msgChars > maxTokens * CHARS_PER_TOKEN) {
        break;
      }

      totalChars += msgChars;
      limitedMessages.unshift({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        tokensUsed: msg.tokens_used,
        metadata: msg.metadata,
        createdAt: new Date(msg.created_at),
      });
    }

    return limitedMessages;
  }

  /**
   * Extract topics from conversation text (simplified)
   */
  private extractTopics(text: string): string[] {
    // Simple keyword extraction
    const keywords = [
      'component', 'api', 'navigation', 'state', 'style',
      'error', 'bug', 'feature', 'performance', 'design'
    ];

    const foundTopics = keywords.filter(keyword =>
      text.toLowerCase().includes(keyword)
    );

    return foundTopics.length > 0 ? foundTopics : ['general discussion'];
  }

  /**
   * Get conversation statistics
   */
  async getConversationStats(
    userId: string,
    projectId?: string,
    timeRange: '1d' | '7d' | '30d' = '7d'
  ): Promise<{
    totalConversations: number;
    totalMessages: number;
    averageMessagesPerConversation: number;
    mostActiveHours: Array<{ hour: number; count: number }>;
  }> {
    const timeRangeMap = {
      '1d': '1 day',
      '7d': '7 days',
      '30d': '30 days',
    };

    const interval = timeRangeMap[timeRange];

    // Get conversation count
    let convQuery = this.supabase
      .from('ai_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', `now() - interval '${interval}'`);

    if (projectId) {
      convQuery = convQuery.eq('project_id', projectId);
    }

    const { count: totalConversations } = await convQuery;

    // Get message stats
    const { data: stats } = await this.supabase.rpc('get_conversation_stats', {
      p_user_id: userId,
      p_project_id: projectId,
      p_interval: interval,
    });

    return {
      totalConversations: totalConversations || 0,
      totalMessages: stats?.total_messages || 0,
      averageMessagesPerConversation: stats?.avg_messages || 0,
      mostActiveHours: stats?.active_hours || [],
    };
  }
}