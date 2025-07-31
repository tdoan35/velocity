import { createClient } from '@supabase/supabase-js';
import { ConversationService } from './conversation-service';
import { EmbeddingService } from './embedding-service';
import { z } from 'zod';
import * as path from 'path';

// Context configuration schema
const ContextConfigSchema = z.object({
  maxTokens: z.number().default(8000),
  maxFiles: z.number().default(10),
  maxConversationMessages: z.number().default(20),
  includeProjectStructure: z.boolean().default(true),
  includeDesignSystem: z.boolean().default(true),
  includeBestPractices: z.boolean().default(true),
  includeUserPreferences: z.boolean().default(true),
  priorityWeights: z.object({
    currentFile: z.number().default(1.0),
    relatedFiles: z.number().default(0.8),
    conversation: z.number().default(0.7),
    patterns: z.number().default(0.6),
    structure: z.number().default(0.5),
  }).default({}),
});

type ContextConfig = z.infer<typeof ContextConfigSchema>;

// Context item interface
export interface ContextItem {
  type: 'file' | 'conversation' | 'pattern' | 'structure' | 'design' | 'preference';
  content: string;
  priority: number;
  metadata?: Record<string, any>;
}

// Assembled context interface
export interface AssembledContext {
  items: ContextItem[];
  totalTokens: number;
  summary: string;
  relevantFiles: string[];
  suggestedPatterns: string[];
}

// React Native best practices database
const REACT_NATIVE_BEST_PRACTICES = {
  components: {
    functional: 'Use functional components with hooks instead of class components',
    memo: 'Use React.memo for performance optimization when props are stable',
    pureComponent: 'Avoid unnecessary re-renders by implementing proper shouldComponentUpdate logic',
    accessibility: 'Always include accessibility props (accessibilityLabel, accessibilityHint, accessibilityRole)',
  },
  performance: {
    flatList: 'Use FlatList instead of ScrollView for long lists',
    images: 'Use Image.prefetch() for critical images and lazy loading for others',
    animations: 'Use native driver for animations when possible',
    virtualizedList: 'Implement getItemLayout for fixed-height items in lists',
  },
  styling: {
    stylesheet: 'Use StyleSheet.create() instead of inline styles for performance',
    platform: 'Use Platform.select() or Platform.OS for platform-specific styles',
    responsive: 'Use Dimensions API or responsive units for adaptive layouts',
    themes: 'Implement theme context for consistent styling and dark mode support',
  },
  navigation: {
    types: 'Use TypeScript types for navigation params and routes',
    deepLinking: 'Implement deep linking configuration for all screens',
    guards: 'Use navigation guards for authentication and authorization',
    state: 'Persist navigation state for better UX on app restart',
  },
  state: {
    context: 'Use Context API for cross-component state that changes infrequently',
    redux: 'Use Redux or Zustand for complex application state',
    local: 'Keep component-specific state local with useState',
    async: 'Use proper loading and error states for async operations',
  },
  networking: {
    offline: 'Implement offline support with proper cache strategies',
    retry: 'Add exponential backoff for failed network requests',
    cancel: 'Implement request cancellation for navigating away',
    auth: 'Use interceptors for authentication token management',
  },
};

export class ContextAssemblyService {
  private supabase: ReturnType<typeof createClient>;
  private conversationService: ConversationService;
  private embeddingService: EmbeddingService;
  private config: ContextConfig;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    conversationService: ConversationService,
    embeddingService: EmbeddingService,
    config?: Partial<ContextConfig>
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.conversationService = conversationService;
    this.embeddingService = embeddingService;
    this.config = ContextConfigSchema.parse(config || {});
  }

  /**
   * Assemble context for AI code generation
   */
  async assembleContext(
    projectId: string,
    userId: string,
    prompt: string,
    options?: {
      currentFile?: string;
      selectedCode?: string;
      conversationId?: string;
      includeFiles?: string[];
      excludeFiles?: string[];
    }
  ): Promise<AssembledContext> {
    const contextItems: ContextItem[] = [];
    const relevantFiles: string[] = [];
    const suggestedPatterns: string[] = [];

    // Generate embedding for the prompt
    const promptEmbedding = await this.embeddingService.generateEmbedding(prompt);

    // 1. Add current file context if provided
    if (options?.currentFile) {
      const fileContent = await this.getFileContent(projectId, options.currentFile);
      if (fileContent) {
        contextItems.push({
          type: 'file',
          content: `Current File (${options.currentFile}):\n${fileContent}`,
          priority: this.config.priorityWeights.currentFile,
          metadata: { file: options.currentFile },
        });
        relevantFiles.push(options.currentFile);
      }
    }

    // 2. Add selected code context
    if (options?.selectedCode) {
      contextItems.push({
        type: 'file',
        content: `Selected Code:\n${options.selectedCode}`,
        priority: this.config.priorityWeights.currentFile,
        metadata: { selected: true },
      });
    }

    // 3. Find and add related files based on similarity
    const relatedFiles = await this.findRelatedFiles(
      projectId,
      promptEmbedding,
      options?.includeFiles,
      options?.excludeFiles
    );
    
    for (const file of relatedFiles.slice(0, this.config.maxFiles)) {
      const content = await this.getFileContent(projectId, file.path);
      if (content) {
        contextItems.push({
          type: 'file',
          content: `Related File (${file.path}):\n${content}`,
          priority: this.config.priorityWeights.relatedFiles * file.similarity,
          metadata: { file: file.path, similarity: file.similarity },
        });
        relevantFiles.push(file.path);
      }
    }

    // 4. Add conversation history if available
    if (options?.conversationId) {
      const messages = await this.conversationService.getConversationContext(
        options.conversationId,
        { maxMessages: this.config.maxConversationMessages }
      );

      if (messages.length > 0) {
        const conversationText = messages
          .map(m => `${m.role}: ${m.content}`)
          .join('\n');
        
        contextItems.push({
          type: 'conversation',
          content: `Previous Conversation:\n${conversationText}`,
          priority: this.config.priorityWeights.conversation,
          metadata: { messageCount: messages.length },
        });
      }
    }

    // 5. Add project structure
    if (this.config.includeProjectStructure) {
      const structure = await this.getProjectStructure(projectId);
      if (structure) {
        contextItems.push({
          type: 'structure',
          content: `Project Structure:\n${structure}`,
          priority: this.config.priorityWeights.structure,
          metadata: { type: 'structure' },
        });
      }
    }

    // 6. Add design system if available
    if (this.config.includeDesignSystem) {
      const designSystem = await this.getDesignSystem(projectId);
      if (designSystem) {
        contextItems.push({
          type: 'design',
          content: `Design System:\n${designSystem}`,
          priority: this.config.priorityWeights.patterns,
          metadata: { type: 'design' },
        });
      }
    }

    // 7. Add relevant best practices
    if (this.config.includeBestPractices) {
      const practices = this.selectRelevantBestPractices(prompt);
      if (practices.length > 0) {
        contextItems.push({
          type: 'pattern',
          content: `React Native Best Practices:\n${practices.join('\n')}`,
          priority: this.config.priorityWeights.patterns,
          metadata: { type: 'best_practices' },
        });
        suggestedPatterns.push(...practices);
      }
    }

    // 8. Add user preferences
    if (this.config.includeUserPreferences) {
      const preferences = await this.getUserPreferences(userId, projectId);
      if (preferences) {
        contextItems.push({
          type: 'preference',
          content: `User Preferences:\n${preferences}`,
          priority: 0.5,
          metadata: { type: 'preferences' },
        });
      }
    }

    // 9. Find similar code patterns
    const patterns = await this.embeddingService.findSimilarPatterns(prompt);
    patterns.forEach(pattern => {
      contextItems.push({
        type: 'pattern',
        content: `Code Pattern (${pattern.name}):\n${pattern.codeTemplate}`,
        priority: this.config.priorityWeights.patterns * pattern.similarity,
        metadata: { patternId: pattern.id, similarity: pattern.similarity },
      });
      suggestedPatterns.push(pattern.name);
    });

    // Sort by priority and apply token limit
    const assembledContext = this.prioritizeAndTruncate(contextItems);

    return {
      items: assembledContext.items,
      totalTokens: assembledContext.totalTokens,
      summary: this.generateContextSummary(assembledContext.items),
      relevantFiles,
      suggestedPatterns: [...new Set(suggestedPatterns)], // Remove duplicates
    };
  }

  /**
   * Find files related to the prompt
   */
  private async findRelatedFiles(
    projectId: string,
    promptEmbedding: number[],
    includeFiles?: string[],
    excludeFiles?: string[]
  ): Promise<Array<{ path: string; similarity: number }>> {
    // Search for similar file embeddings
    const similarFiles = await this.embeddingService.findSimilar(
      promptEmbedding,
      {
        projectId,
        contentType: 'code_snippet',
        maxResults: 20,
      }
    );

    // Filter and map results
    let files = similarFiles
      .filter(f => f.metadata?.filePath)
      .map(f => ({
        path: f.metadata!.filePath as string,
        similarity: f.similarity,
      }));

    // Apply include/exclude filters
    if (includeFiles && includeFiles.length > 0) {
      files = files.filter(f => includeFiles.includes(f.path));
    }

    if (excludeFiles && excludeFiles.length > 0) {
      files = files.filter(f => !excludeFiles.includes(f.path));
    }

    // Sort by similarity
    return files.sort((a, b) => b.similarity - a.similarity);
  }

  /**
   * Get file content from project
   */
  private async getFileContent(
    projectId: string,
    filePath: string
  ): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('project_files')
        .select('content')
        .eq('project_id', projectId)
        .eq('path', filePath)
        .single();

      if (error || !data) {
        return null;
      }

      return data.content;
    } catch (error) {
      console.error('Error fetching file content:', error);
      return null;
    }
  }

  /**
   * Get project structure
   */
  private async getProjectStructure(projectId: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('project_files')
        .select('path, type')
        .eq('project_id', projectId)
        .order('path');

      if (error || !data) {
        return null;
      }

      // Build tree structure
      const tree = this.buildFileTree(data);
      return this.formatFileTree(tree);
    } catch (error) {
      console.error('Error fetching project structure:', error);
      return null;
    }
  }

  /**
   * Get design system for project
   */
  private async getDesignSystem(projectId: string): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('ai_design_system')
        .select('component_type, component_name, design_tokens')
        .eq('project_id', projectId)
        .limit(10);

      if (error || !data || data.length === 0) {
        return null;
      }

      let designSystemText = '';
      data.forEach(component => {
        designSystemText += `\n${component.component_type}: ${component.component_name}\n`;
        designSystemText += `Tokens: ${JSON.stringify(component.design_tokens, null, 2)}\n`;
      });

      return designSystemText;
    } catch (error) {
      console.error('Error fetching design system:', error);
      return null;
    }
  }

  /**
   * Get user preferences
   */
  private async getUserPreferences(
    userId: string,
    projectId: string
  ): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('user_preferences')
        .select('preferences')
        .eq('user_id', userId)
        .eq('project_id', projectId)
        .single();

      if (error || !data) {
        return null;
      }

      return JSON.stringify(data.preferences, null, 2);
    } catch (error) {
      console.error('Error fetching user preferences:', error);
      return null;
    }
  }

  /**
   * Select relevant best practices based on prompt
   */
  private selectRelevantBestPractices(prompt: string): string[] {
    const practices: string[] = [];
    const lowerPrompt = prompt.toLowerCase();

    // Check for component-related keywords
    if (lowerPrompt.includes('component') || lowerPrompt.includes('render')) {
      practices.push(...Object.values(REACT_NATIVE_BEST_PRACTICES.components));
    }

    // Check for performance keywords
    if (lowerPrompt.includes('performance') || lowerPrompt.includes('optimize')) {
      practices.push(...Object.values(REACT_NATIVE_BEST_PRACTICES.performance));
    }

    // Check for styling keywords
    if (lowerPrompt.includes('style') || lowerPrompt.includes('css') || lowerPrompt.includes('theme')) {
      practices.push(...Object.values(REACT_NATIVE_BEST_PRACTICES.styling));
    }

    // Check for navigation keywords
    if (lowerPrompt.includes('navigation') || lowerPrompt.includes('route') || lowerPrompt.includes('screen')) {
      practices.push(...Object.values(REACT_NATIVE_BEST_PRACTICES.navigation));
    }

    // Check for state management keywords
    if (lowerPrompt.includes('state') || lowerPrompt.includes('redux') || lowerPrompt.includes('context')) {
      practices.push(...Object.values(REACT_NATIVE_BEST_PRACTICES.state));
    }

    // Check for networking keywords
    if (lowerPrompt.includes('api') || lowerPrompt.includes('fetch') || lowerPrompt.includes('network')) {
      practices.push(...Object.values(REACT_NATIVE_BEST_PRACTICES.networking));
    }

    // Return top 5 most relevant practices
    return practices.slice(0, 5);
  }

  /**
   * Prioritize and truncate context items to fit token limit
   */
  private prioritizeAndTruncate(
    items: ContextItem[]
  ): { items: ContextItem[]; totalTokens: number } {
    // Sort by priority (highest first)
    const sortedItems = [...items].sort((a, b) => b.priority - a.priority);

    const selectedItems: ContextItem[] = [];
    let totalTokens = 0;

    for (const item of sortedItems) {
      // Estimate tokens (rough approximation: 1 token ≈ 4 characters)
      const itemTokens = Math.ceil(item.content.length / 4);

      if (totalTokens + itemTokens <= this.config.maxTokens) {
        selectedItems.push(item);
        totalTokens += itemTokens;
      } else {
        // Try to fit a truncated version
        const remainingTokens = this.config.maxTokens - totalTokens;
        if (remainingTokens > 100) {
          const truncatedContent = item.content.substring(
            0,
            remainingTokens * 4
          ) + '\n... (truncated)';
          
          selectedItems.push({
            ...item,
            content: truncatedContent,
          });
          totalTokens = this.config.maxTokens;
        }
        break;
      }
    }

    return { items: selectedItems, totalTokens };
  }

  /**
   * Generate a summary of the assembled context
   */
  private generateContextSummary(items: ContextItem[]): string {
    const counts: Record<string, number> = {};
    items.forEach(item => {
      counts[item.type] = (counts[item.type] || 0) + 1;
    });

    const summaryParts: string[] = [];
    
    if (counts.file > 0) {
      summaryParts.push(`${counts.file} file(s)`);
    }
    if (counts.conversation > 0) {
      summaryParts.push('conversation history');
    }
    if (counts.pattern > 0) {
      summaryParts.push(`${counts.pattern} code pattern(s)`);
    }
    if (counts.structure > 0) {
      summaryParts.push('project structure');
    }
    if (counts.design > 0) {
      summaryParts.push('design system');
    }
    if (counts.preference > 0) {
      summaryParts.push('user preferences');
    }

    return `Context includes: ${summaryParts.join(', ')}`;
  }

  /**
   * Build file tree from flat file list
   */
  private buildFileTree(files: Array<{ path: string; type: string }>): any {
    const tree: any = {};

    files.forEach(file => {
      const parts = file.path.split('/');
      let current = tree;

      parts.forEach((part, index) => {
        if (index === parts.length - 1) {
          // Leaf node (file)
          current[part] = { type: file.type };
        } else {
          // Directory
          if (!current[part]) {
            current[part] = {};
          }
          current = current[part];
        }
      });
    });

    return tree;
  }

  /**
   * Format file tree as string
   */
  private formatFileTree(tree: any, prefix: string = ''): string {
    let result = '';
    const entries = Object.entries(tree);

    entries.forEach(([name, value], index) => {
      const isLast = index === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const extension = isLast ? '    ' : '│   ';

      if ((value as any).type) {
        // File
        result += `${prefix}${connector}${name}\n`;
      } else {
        // Directory
        result += `${prefix}${connector}${name}/\n`;
        result += this.formatFileTree(value, prefix + extension);
      }
    });

    return result;
  }

  /**
   * Update context with user feedback
   */
  async updateContextWithFeedback(
    projectId: string,
    contextId: string,
    feedback: 'helpful' | 'not_helpful',
    details?: string
  ): Promise<void> {
    // Store feedback for improving context assembly
    const { error } = await this.supabase
      .from('ai_context_feedback')
      .insert({
        project_id: projectId,
        context_id: contextId,
        feedback,
        details,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('Error storing context feedback:', error);
    }
  }
}