// Supabase Edge Function for intelligent context assembly
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { logger } from '../_shared/logger.ts'

interface ContextRequest {
  projectId: string
  prompt: string
  options?: {
    maxTokens?: number
    includeHistory?: boolean
    includePatterns?: boolean
    fileTypes?: string[]
  }
}

interface ContextResponse {
  context: {
    projectStructure: ProjectFile[]
    relevantFiles: FileContext[]
    patterns: PatternMatch[]
    userHistory: HistoryItem[]
    metadata: ContextMetadata
  }
  score: number
  tokenCount: number
}

interface ProjectFile {
  path: string
  type: 'file' | 'directory'
  size?: number
  relevanceScore?: number
}

interface FileContext {
  path: string
  content: string
  language: string
  imports: string[]
  exports: string[]
  components?: string[]
  relevanceScore: number
}

interface PatternMatch {
  pattern: string
  type: 'navigation' | 'state' | 'component' | 'api' | 'styling'
  confidence: number
  examples: string[]
}

interface HistoryItem {
  prompt: string
  response: string
  timestamp: string
  relevance: number
}

interface ContextMetadata {
  totalFiles: number
  selectedFiles: number
  compressionRatio: number
  patternCount: number
}

// React Native pattern definitions
const REACT_NATIVE_PATTERNS = {
  navigation: {
    keywords: ['navigation', 'navigate', 'route', 'screen', 'tab', 'drawer', 'stack'],
    imports: ['@react-navigation', 'react-navigation'],
    components: ['NavigationContainer', 'Stack.Navigator', 'Tab.Navigator', 'Drawer.Navigator'],
    examples: [
      'navigation.navigate("ScreenName")',
      'useNavigation()',
      'useRoute()',
      'NavigationContainer'
    ]
  },
  state: {
    keywords: ['state', 'store', 'context', 'redux', 'zustand', 'mobx', 'recoil'],
    imports: ['zustand', 'redux', '@reduxjs/toolkit', 'mobx', 'recoil'],
    components: ['Provider', 'useStore', 'useSelector', 'useDispatch'],
    examples: [
      'const [state, setState] = useState()',
      'const store = useStore()',
      'useSelector(state => state.value)'
    ]
  },
  component: {
    keywords: ['component', 'view', 'text', 'button', 'input', 'list', 'scroll'],
    imports: ['react-native', 'expo'],
    components: ['View', 'Text', 'ScrollView', 'FlatList', 'TouchableOpacity', 'TextInput'],
    examples: [
      '<View style={styles.container}>',
      '<Text>Hello World</Text>',
      '<FlatList data={data} renderItem={renderItem} />'
    ]
  },
  api: {
    keywords: ['api', 'fetch', 'request', 'axios', 'graphql', 'rest', 'endpoint'],
    imports: ['axios', 'graphql', '@apollo/client', 'react-query', 'swr'],
    components: ['useQuery', 'useMutation', 'ApolloProvider'],
    examples: [
      'fetch(url).then(res => res.json())',
      'axios.get("/api/data")',
      'useQuery("key", fetchData)'
    ]
  },
  styling: {
    keywords: ['style', 'stylesheet', 'theme', 'color', 'layout', 'flex', 'design'],
    imports: ['styled-components', 'emotion', 'react-native-paper'],
    components: ['StyleSheet', 'ThemeProvider'],
    examples: [
      'StyleSheet.create({ container: { flex: 1 } })',
      'styled.View`flex: 1;`',
      'theme.colors.primary'
    ]
  }
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Authentication check
    const authResult = await requireAuth(req)
    if (!authResult.authorized) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Parse request body
    const body: ContextRequest = await req.json()
    const { projectId, prompt, options = {} } = body

    if (!projectId || !prompt) {
      return new Response(JSON.stringify({ error: 'Project ID and prompt are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Log request
    await logger.info('Context assembly request', {
      userId: authResult.userId,
      projectId,
      promptLength: prompt.length,
      options
    })

    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // 1. Analyze project structure
    const projectStructure = await analyzeProjectStructure(supabase, projectId)

    // 2. Detect patterns in prompt
    const detectedPatterns = detectPatterns(prompt)

    // 3. Select relevant files based on patterns and prompt
    const relevantFiles = await selectRelevantFiles(
      supabase,
      projectId,
      prompt,
      projectStructure,
      detectedPatterns,
      options.fileTypes
    )

    // 4. Get user interaction history if requested
    let userHistory: HistoryItem[] = []
    if (options.includeHistory !== false) {
      userHistory = await getUserHistory(supabase, authResult.userId, projectId, prompt)
    }

    // 5. Extract pattern examples if requested
    let patterns: PatternMatch[] = []
    if (options.includePatterns !== false) {
      patterns = extractPatternMatches(prompt, detectedPatterns, relevantFiles)
    }

    // 6. Compress context to fit token limits
    const compressedContext = await compressContext(
      projectStructure,
      relevantFiles,
      patterns,
      userHistory,
      options.maxTokens || 50000
    )

    // 7. Calculate context quality score
    const score = calculateContextScore(compressedContext)

    // 8. Count tokens
    const tokenCount = estimateTokenCount(compressedContext)

    // Log success
    await logger.info('Context assembly completed', {
      userId: authResult.userId,
      projectId,
      filesAnalyzed: compressedContext.relevantFiles.length,
      patternsFound: compressedContext.patterns.length,
      score,
      tokenCount
    })

    return new Response(JSON.stringify({
      context: compressedContext,
      score,
      tokenCount
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    await logger.error('Context assembly error', { error: error.message })
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function analyzeProjectStructure(supabase: any, projectId: string): Promise<ProjectFile[]> {
  // Get project files from database
  const { data: files, error } = await supabase
    .from('project_files')
    .select('path, type, size, content')
    .eq('project_id', projectId)
    .order('path')

  if (error) {
    throw new Error('Failed to fetch project files')
  }

  // Build file tree structure
  const fileTree: ProjectFile[] = files.map((file: any) => ({
    path: file.path,
    type: file.type,
    size: file.size,
    relevanceScore: 0
  }))

  return fileTree
}

function detectPatterns(prompt: string): Set<string> {
  const detectedPatterns = new Set<string>()
  const promptLower = prompt.toLowerCase()

  // Check each pattern type
  for (const [patternType, pattern] of Object.entries(REACT_NATIVE_PATTERNS)) {
    // Check keywords
    const hasKeyword = pattern.keywords.some(keyword => 
      promptLower.includes(keyword.toLowerCase())
    )

    // Check imports mentioned
    const hasImport = pattern.imports.some(imp => 
      promptLower.includes(imp.toLowerCase())
    )

    // Check components mentioned
    const hasComponent = pattern.components.some(comp => 
      promptLower.includes(comp.toLowerCase())
    )

    if (hasKeyword || hasImport || hasComponent) {
      detectedPatterns.add(patternType)
    }
  }

  return detectedPatterns
}

async function selectRelevantFiles(
  supabase: any,
  projectId: string,
  prompt: string,
  projectStructure: ProjectFile[],
  patterns: Set<string>,
  fileTypes?: string[]
): Promise<FileContext[]> {
  const relevantFiles: FileContext[] = []
  
  // Generate embedding for the prompt
  const promptEmbedding = await generateEmbedding(prompt)

  // Get files with content
  const { data: files } = await supabase
    .from('project_files')
    .select('*')
    .eq('project_id', projectId)
    .eq('type', 'file')
    .in('path', projectStructure.map(f => f.path))

  if (!files) return []

  // Score and filter files
  for (const file of files) {
    // Skip if file type not in requested types
    if (fileTypes && fileTypes.length > 0) {
      const ext = file.path.split('.').pop()
      if (!fileTypes.includes(ext)) continue
    }

    // Calculate relevance score
    let score = 0

    // 1. Path relevance
    const pathRelevance = calculatePathRelevance(file.path, prompt, patterns)
    score += pathRelevance * 0.3

    // 2. Content relevance (if available)
    if (file.content) {
      const contentRelevance = await calculateContentRelevance(
        file.content,
        prompt,
        promptEmbedding
      )
      score += contentRelevance * 0.5
    }

    // 3. Import/export relevance
    const imports = extractImports(file.content || '')
    const exports = extractExports(file.content || '')
    const structuralRelevance = calculateStructuralRelevance(imports, exports, patterns)
    score += structuralRelevance * 0.2

    // Add file if score is above threshold
    if (score > 0.3) {
      relevantFiles.push({
        path: file.path,
        content: file.content || '',
        language: detectLanguage(file.path),
        imports,
        exports,
        components: extractComponents(file.content || ''),
        relevanceScore: score
      })
    }
  }

  // Sort by relevance and limit
  relevantFiles.sort((a, b) => b.relevanceScore - a.relevanceScore)
  return relevantFiles.slice(0, 20) // Top 20 most relevant files
}

function calculatePathRelevance(path: string, prompt: string, patterns: Set<string>): number {
  let score = 0
  const pathLower = path.toLowerCase()
  const promptLower = prompt.toLowerCase()

  // Check if path contains prompt keywords
  const promptWords = promptLower.split(/\s+/)
  for (const word of promptWords) {
    if (pathLower.includes(word)) {
      score += 0.2
    }
  }

  // Check if path matches detected patterns
  for (const pattern of patterns) {
    if (pathLower.includes(pattern)) {
      score += 0.3
    }
  }

  // Boost score for common React Native file patterns
  if (pathLower.includes('screen') || pathLower.includes('component')) {
    score += 0.1
  }
  if (pathLower.includes('navigation') || pathLower.includes('navigator')) {
    score += 0.1
  }
  if (pathLower.includes('store') || pathLower.includes('context')) {
    score += 0.1
  }

  return Math.min(score, 1)
}

async function calculateContentRelevance(
  content: string,
  prompt: string,
  promptEmbedding: number[]
): Promise<number> {
  // For now, use simple keyword matching
  // In production, use embeddings for semantic similarity
  const contentLower = content.toLowerCase()
  const promptWords = prompt.toLowerCase().split(/\s+/)
  
  let matches = 0
  for (const word of promptWords) {
    if (contentLower.includes(word)) {
      matches++
    }
  }

  return Math.min(matches / promptWords.length, 1)
}

function calculateStructuralRelevance(
  imports: string[],
  exports: string[],
  patterns: Set<string>
): number {
  let score = 0

  // Check imports against pattern definitions
  for (const pattern of patterns) {
    const patternDef = REACT_NATIVE_PATTERNS[pattern as keyof typeof REACT_NATIVE_PATTERNS]
    if (patternDef) {
      for (const imp of imports) {
        if (patternDef.imports.some(pi => imp.includes(pi))) {
          score += 0.2
        }
      }
    }
  }

  // Boost for React Native core imports
  if (imports.some(imp => imp.includes('react-native'))) {
    score += 0.1
  }
  if (imports.some(imp => imp.includes('expo'))) {
    score += 0.1
  }

  return Math.min(score, 1)
}

function extractImports(content: string): string[] {
  const imports: string[] = []
  const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g
  let match

  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1])
  }

  return imports
}

function extractExports(content: string): string[] {
  const exports: string[] = []
  const exportRegex = /export\s+(?:default\s+)?(?:const|function|class)\s+(\w+)/g
  let match

  while ((match = exportRegex.exec(content)) !== null) {
    exports.push(match[1])
  }

  return exports
}

function extractComponents(content: string): string[] {
  const components: string[] = []
  
  // Find React component definitions
  const componentRegex = /(?:const|function)\s+(\w+)\s*[:=]\s*(?:\([^)]*\)\s*=>|\(\s*\)\s*=>|function)/g
  let match

  while ((match = componentRegex.exec(content)) !== null) {
    const name = match[1]
    // Check if it's likely a component (PascalCase)
    if (name[0] === name[0].toUpperCase()) {
      components.push(name)
    }
  }

  return components
}

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase()
  const languageMap: Record<string, string> = {
    'ts': 'typescript',
    'tsx': 'typescriptreact',
    'js': 'javascript',
    'jsx': 'javascriptreact',
    'json': 'json',
    'md': 'markdown',
    'yml': 'yaml',
    'yaml': 'yaml'
  }
  return languageMap[ext || ''] || 'plaintext'
}

async function getUserHistory(
  supabase: any,
  userId: string,
  projectId: string,
  currentPrompt: string
): Promise<HistoryItem[]> {
  // Get recent AI interactions for this user and project
  const { data: history } = await supabase
    .from('ai_cache')
    .select('prompt, response, created_at')
    .eq('user_id', userId)
    .eq('context->projectId', projectId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (!history) return []

  // Calculate relevance to current prompt
  const currentEmbedding = await generateEmbedding(currentPrompt)
  
  const historyItems: HistoryItem[] = []
  for (const item of history) {
    const relevance = await calculateSimilarity(
      await generateEmbedding(item.prompt),
      currentEmbedding
    )

    if (relevance > 0.5) {
      historyItems.push({
        prompt: item.prompt,
        response: item.response.substring(0, 500) + '...', // Truncate
        timestamp: item.created_at,
        relevance
      })
    }
  }

  return historyItems.sort((a, b) => b.relevance - a.relevance).slice(0, 5)
}

function extractPatternMatches(
  prompt: string,
  detectedPatterns: Set<string>,
  relevantFiles: FileContext[]
): PatternMatch[] {
  const matches: PatternMatch[] = []

  for (const patternType of detectedPatterns) {
    const patternDef = REACT_NATIVE_PATTERNS[patternType as keyof typeof REACT_NATIVE_PATTERNS]
    if (!patternDef) continue

    const examples: string[] = []
    
    // Find examples in relevant files
    for (const file of relevantFiles) {
      for (const example of patternDef.examples) {
        if (file.content.includes(example.split('(')[0])) {
          examples.push(example)
        }
      }
    }

    matches.push({
      pattern: patternType,
      type: patternType as any,
      confidence: examples.length > 0 ? 0.8 : 0.5,
      examples: examples.slice(0, 3)
    })
  }

  return matches
}

async function compressContext(
  projectStructure: ProjectFile[],
  relevantFiles: FileContext[],
  patterns: PatternMatch[],
  userHistory: HistoryItem[],
  maxTokens: number
): Promise<any> {
  // Estimate current token count
  let currentTokens = estimateTokenCount({
    projectStructure,
    relevantFiles,
    patterns,
    userHistory
  })

  // If under limit, return as is
  if (currentTokens <= maxTokens) {
    return {
      projectStructure: projectStructure.slice(0, 50), // Limit structure
      relevantFiles,
      patterns,
      userHistory,
      metadata: {
        totalFiles: projectStructure.length,
        selectedFiles: relevantFiles.length,
        compressionRatio: 1,
        patternCount: patterns.length
      }
    }
  }

  // Compress by reducing file content
  const compressionRatio = maxTokens / currentTokens
  const compressedFiles = relevantFiles.map(file => ({
    ...file,
    content: file.content.substring(0, Math.floor(file.content.length * compressionRatio))
  }))

  return {
    projectStructure: projectStructure.slice(0, 30),
    relevantFiles: compressedFiles,
    patterns,
    userHistory: userHistory.slice(0, 3),
    metadata: {
      totalFiles: projectStructure.length,
      selectedFiles: relevantFiles.length,
      compressionRatio,
      patternCount: patterns.length
    }
  }
}

function calculateContextScore(context: any): number {
  let score = 0

  // File relevance
  const avgFileScore = context.relevantFiles.reduce(
    (sum: number, file: FileContext) => sum + file.relevanceScore, 0
  ) / (context.relevantFiles.length || 1)
  score += avgFileScore * 0.4

  // Pattern coverage
  const patternScore = Math.min(context.patterns.length / 3, 1)
  score += patternScore * 0.3

  // History relevance
  const historyScore = context.userHistory.length > 0 ? 0.8 : 0
  score += historyScore * 0.2

  // Compression penalty
  const compressionPenalty = (1 - context.metadata.compressionRatio) * 0.1
  score -= compressionPenalty

  return Math.max(0, Math.min(1, score))
}

function estimateTokenCount(obj: any): number {
  // Rough estimation: 1 token ≈ 4 characters
  const jsonString = JSON.stringify(obj)
  return Math.ceil(jsonString.length / 4)
}

async function generateEmbedding(text: string): Promise<number[]> {
  // Placeholder - would use OpenAI embeddings in production
  // For now, return a mock embedding
  const hash = text.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return Array(1536).fill(0).map((_, i) => Math.sin(hash + i) * 0.1)
}

async function calculateSimilarity(embedding1: number[], embedding2: number[]): Promise<number> {
  // Cosine similarity
  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i]
    norm1 += embedding1[i] * embedding1[i]
    norm2 += embedding2[i] * embedding2[i]
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
}