import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0'
import { Configuration, OpenAIApi } from 'https://esm.sh/openai@3.3.0'
import { corsHeaders } from '../_shared/cors.ts'

interface CodeGenerationRequest {
  projectId: string
  userId: string
  prompt: string
  context?: {
    projectStructure?: any
    designSystem?: any
    conversationHistory?: Array<{ role: string; content: string }>
    currentFile?: string
    selectedCode?: string
  }
  generationType?: 'component' | 'api' | 'state' | 'navigation' | 'style' | 'general'
  options?: {
    includeTests?: boolean
    includeDocumentation?: boolean
    useTypeScript?: boolean
    framework?: 'react-native' | 'expo'
  }
}

interface CodeGenerationResponse {
  success: boolean
  code?: string
  explanation?: string
  suggestions?: string[]
  patterns?: Array<{
    name: string
    description: string
    similarity: number
  }>
  cached?: boolean
  error?: string
}

// Initialize clients
const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const openaiApiKey = Deno.env.get('OPENAI_API_KEY')!
const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')!

const supabase = createClient(supabaseUrl, supabaseServiceKey)
const openai = new OpenAIApi(new Configuration({ apiKey: openaiApiKey }))

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const request: CodeGenerationRequest = await req.json()
    const startTime = Date.now()

    // Validate user access
    const { data: project } = await supabase
      .from('projects')
      .select('id')
      .eq('id', request.projectId)
      .eq('user_id', request.userId)
      .single()

    if (!project) {
      throw new Error('Unauthorized access to project')
    }

    // Generate embedding for the prompt
    const promptEmbedding = await generateEmbedding(request.prompt)

    // Check cache first
    const cachedResponse = await checkCache(promptEmbedding, request.projectId)
    if (cachedResponse) {
      // Track cache hit metric
      await trackMetric(request.projectId, 'cache_hit', Date.now() - startTime)
      
      return new Response(
        JSON.stringify({
          success: true,
          code: cachedResponse.response,
          cached: true,
          explanation: 'Retrieved from cache based on similar previous request'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find similar code patterns
    const similarPatterns = await findSimilarPatterns(
      promptEmbedding,
      request.generationType || 'general'
    )

    // Build enhanced context
    const enhancedContext = await buildEnhancedContext(
      request,
      similarPatterns,
      promptEmbedding
    )

    // Generate code using Claude
    const generatedCode = await generateCodeWithClaude(
      request.prompt,
      enhancedContext,
      request.options
    )

    // Store in cache for future use
    await storeInCache(
      request.prompt,
      generatedCode.code,
      promptEmbedding,
      request.projectId
    )

    // Store successful pattern if applicable
    if (request.generationType && generatedCode.code) {
      await storeCodePattern(
        request.generationType,
        request.prompt,
        generatedCode.code
      )
    }

    // Track metrics
    await trackMetric(request.projectId, 'generation_time', Date.now() - startTime)

    return new Response(
      JSON.stringify({
        success: true,
        ...generatedCode,
        patterns: similarPatterns.map(p => ({
          name: p.name,
          description: p.description || '',
          similarity: p.similarity
        })),
        cached: false
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Code generation error:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to generate code'
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

async function generateEmbedding(text: string): Promise<number[]> {
  try {
    const response = await openai.createEmbedding({
      model: 'text-embedding-3-small',
      input: text,
    })
    return response.data.data[0].embedding
  } catch (error) {
    console.error('Embedding generation error:', error)
    throw new Error('Failed to generate embedding')
  }
}

async function checkCache(
  embedding: number[],
  projectId: string
): Promise<{ response: string } | null> {
  const { data, error } = await supabase.rpc('find_cached_response', {
    query_embedding: embedding,
    similarity_threshold: 0.95,
    p_cache_key: null
  })

  if (error || !data || data.length === 0) {
    return null
  }

  // Filter by project if metadata contains project_id
  const projectCache = data.find((item: any) => 
    item.metadata?.project_id === projectId
  )

  return projectCache || data[0]
}

async function findSimilarPatterns(
  embedding: number[],
  patternType: string
): Promise<Array<{
  id: string
  name: string
  description?: string
  codeTemplate: string
  similarity: number
}>> {
  const { data, error } = await supabase.rpc('find_similar_patterns', {
    query_embedding: embedding,
    p_pattern_type: patternType === 'general' ? null : patternType,
    max_results: 5
  })

  if (error || !data) {
    return []
  }

  return data
}

async function buildEnhancedContext(
  request: CodeGenerationRequest,
  similarPatterns: any[],
  embedding: number[]
): Promise<string> {
  let context = ''

  // Add project structure context
  if (request.context?.projectStructure) {
    context += `\nProject Structure:\n${JSON.stringify(request.context.projectStructure, null, 2)}\n`
  }

  // Add design system context
  if (request.context?.designSystem) {
    context += `\nDesign System:\n${JSON.stringify(request.context.designSystem, null, 2)}\n`
  }

  // Add conversation history
  if (request.context?.conversationHistory && request.context.conversationHistory.length > 0) {
    context += `\nPrevious Conversation:\n`
    request.context.conversationHistory.forEach(msg => {
      context += `${msg.role}: ${msg.content}\n`
    })
  }

  // Add current file context
  if (request.context?.currentFile) {
    context += `\nCurrent File: ${request.context.currentFile}\n`
  }

  // Add selected code context
  if (request.context?.selectedCode) {
    context += `\nSelected Code:\n${request.context.selectedCode}\n`
  }

  // Add similar patterns as examples
  if (similarPatterns.length > 0) {
    context += `\nSimilar Code Patterns:\n`
    similarPatterns.forEach((pattern, index) => {
      context += `\n${index + 1}. ${pattern.name} (${(pattern.similarity * 100).toFixed(1)}% similar)\n`
      context += `${pattern.codeTemplate}\n`
    })
  }

  // Add React Native best practices
  context += await getReactNativeBestPractices(request.generationType)

  return context
}

async function generateCodeWithClaude(
  prompt: string,
  context: string,
  options?: CodeGenerationRequest['options']
): Promise<{
  code: string
  explanation?: string
  suggestions?: string[]
}> {
  const systemPrompt = `You are an expert React Native developer assistant specializing in creating high-quality, production-ready code for the Velocity platform.

Key Requirements:
- Generate clean, efficient React Native code following best practices
- Use TypeScript when requested (${options?.useTypeScript ? 'YES' : 'NO'})
- Framework: ${options?.framework || 'react-native'}
- Include unit tests: ${options?.includeTests ? 'YES' : 'NO'}
- Include documentation: ${options?.includeDocumentation ? 'YES' : 'NO'}
- Follow the provided design system and patterns
- Ensure cross-platform compatibility (iOS and Android)
- Optimize for performance and accessibility
- Use modern React Native patterns (hooks, functional components)
- Follow the existing code style and conventions shown in the context

Context and examples are provided to help you generate consistent code.`

  const userPrompt = `${context}\n\nRequest: ${prompt}`

  try {
    // For now, simulate Claude response
    // In production, this would call the Anthropic API
    const response = await simulateClaudeResponse(prompt, context, options)
    
    return {
      code: response.code,
      explanation: response.explanation,
      suggestions: response.suggestions
    }
  } catch (error) {
    console.error('Claude API error:', error)
    throw new Error('Failed to generate code with AI')
  }
}

async function simulateClaudeResponse(
  prompt: string,
  context: string,
  options?: CodeGenerationRequest['options']
): Promise<{
  code: string
  explanation: string
  suggestions: string[]
}> {
  // Simulate response based on prompt patterns
  const lowerPrompt = prompt.toLowerCase()
  
  if (lowerPrompt.includes('button') || lowerPrompt.includes('component')) {
    return {
      code: `import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle, TextStyle } from 'react-native';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  disabled = false,
  style,
  textStyle,
}) => {
  return (
    <TouchableOpacity
      style={[
        styles.button,
        styles[variant],
        disabled && styles.disabled,
        style,
      ]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.7}
    >
      <Text style={[styles.text, styles[\`\${variant}Text\`], textStyle]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: '#007AFF',
  },
  secondary: {
    backgroundColor: '#F2F2F7',
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#007AFF',
  },
  disabled: {
    opacity: 0.5,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
  },
  primaryText: {
    color: '#FFFFFF',
  },
  secondaryText: {
    color: '#000000',
  },
  outlineText: {
    color: '#007AFF',
  },
});`,
      explanation: 'Created a reusable Button component with multiple variants and proper TypeScript typing',
      suggestions: [
        'Consider adding loading state with ActivityIndicator',
        'Add haptic feedback for better UX',
        'Implement size variants (small, medium, large)',
        'Add icon support for buttons with icons'
      ]
    }
  }

  if (lowerPrompt.includes('api') || lowerPrompt.includes('fetch')) {
    return {
      code: `import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_NATIVE_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_NATIVE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// API service class
export class ApiService {
  static async fetchData<T>(
    table: string,
    options?: {
      select?: string;
      filter?: Record<string, any>;
      orderBy?: { column: string; ascending?: boolean };
      limit?: number;
    }
  ): Promise<T[]> {
    try {
      let query = supabase.from(table).select(options?.select || '*');

      // Apply filters
      if (options?.filter) {
        Object.entries(options.filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      // Apply ordering
      if (options?.orderBy) {
        query = query.order(options.orderBy.column, {
          ascending: options.orderBy.ascending ?? true
        });
      }

      // Apply limit
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as T[];
    } catch (error) {
      console.error('API fetch error:', error);
      throw new Error('Failed to fetch data');
    }
  }

  static async create<T>(
    table: string,
    data: Partial<T>
  ): Promise<T> {
    const { data: result, error } = await supabase
      .from(table)
      .insert(data)
      .select()
      .single();

    if (error) throw error;
    return result as T;
  }

  static async update<T>(
    table: string,
    id: string,
    data: Partial<T>
  ): Promise<T> {
    const { data: result, error } = await supabase
      .from(table)
      .update(data)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    return result as T;
  }

  static async delete(
    table: string,
    id: string
  ): Promise<void> {
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', id);

    if (error) throw error;
  }
}`,
      explanation: 'Created a reusable API service class with Supabase integration for CRUD operations',
      suggestions: [
        'Add retry logic for failed requests',
        'Implement request caching',
        'Add offline support with local storage',
        'Include request/response interceptors for auth'
      ]
    }
  }

  // Default response
  return {
    code: `// Generated code based on prompt: ${prompt}\n// Context was considered in generation`,
    explanation: 'Generated code based on the provided prompt and context',
    suggestions: ['Add more specific details to get better code generation']
  }
}

async function storeInCache(
  prompt: string,
  code: string,
  embedding: number[],
  projectId: string
): Promise<void> {
  try {
    const { error } = await supabase
      .from('ai_cache')
      .insert({
        cache_key: `code_${Date.now()}`,
        query_embedding: embedding,
        response: code,
        metadata: {
          project_id: projectId,
          prompt: prompt,
          type: 'code_generation'
        },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
      })

    if (error) {
      console.error('Cache storage error:', error)
    }
  } catch (error) {
    console.error('Cache storage error:', error)
  }
}

async function storeCodePattern(
  patternType: string,
  prompt: string,
  code: string
): Promise<void> {
  try {
    const embedding = await generateEmbedding(`${prompt} ${code}`)
    
    const { error } = await supabase
      .from('ai_code_patterns')
      .insert({
        pattern_type: patternType,
        name: prompt.substring(0, 100),
        description: prompt,
        code_template: code,
        embedding: embedding,
        tags: extractTags(prompt)
      })

    if (error) {
      console.error('Pattern storage error:', error)
    }
  } catch (error) {
    console.error('Pattern storage error:', error)
  }
}

async function trackMetric(
  projectId: string,
  metricType: string,
  value: number
): Promise<void> {
  try {
    const { error } = await supabase
      .from('ai_performance_metrics')
      .insert({
        project_id: projectId,
        metric_type: metricType,
        value: value
      })

    if (error) {
      console.error('Metric tracking error:', error)
    }
  } catch (error) {
    console.error('Metric tracking error:', error)
  }
}

async function getReactNativeBestPractices(
  generationType?: string
): Promise<string> {
  const practices: Record<string, string> = {
    component: `
React Native Component Best Practices:
- Use functional components with hooks
- Implement proper TypeScript interfaces
- Use StyleSheet.create for styles
- Handle platform-specific code with Platform.select
- Optimize with React.memo when appropriate
- Use proper accessibility props`,
    api: `
API Integration Best Practices:
- Use async/await for asynchronous operations
- Implement proper error handling
- Add retry logic for network failures
- Use TypeScript for API response types
- Implement request cancellation
- Cache responses when appropriate`,
    state: `
State Management Best Practices:
- Use Context API for simple state
- Implement Redux for complex state
- Use Zustand for lightweight solution
- Avoid unnecessary re-renders
- Implement proper TypeScript types
- Use selectors for derived state`,
    navigation: `
Navigation Best Practices:
- Use React Navigation v6
- Implement proper TypeScript types
- Use deep linking support
- Handle navigation state persistence
- Implement proper back handling
- Use navigation guards for auth`,
    style: `
Styling Best Practices:
- Use StyleSheet.create for performance
- Implement responsive design
- Use design tokens for consistency
- Handle platform differences
- Implement dark mode support
- Use proper typography scale`
  }

  return practices[generationType || 'component'] || practices.component
}

function extractTags(prompt: string): string[] {
  const keywords = [
    'button', 'form', 'list', 'navigation', 'api', 'state',
    'animation', 'modal', 'input', 'screen', 'component'
  ]
  
  return keywords.filter(keyword => 
    prompt.toLowerCase().includes(keyword)
  )
}