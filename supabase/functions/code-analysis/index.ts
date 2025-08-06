// Supabase Edge Function for code quality analysis and enhancement
import { createClient } from '@supabase/supabase-js'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { logger } from '../_shared/logger.ts'
import { detectPatterns, validatePatternUsage, REACT_NATIVE_PATTERNS } from '../_shared/patterns.ts'

interface CodeAnalysisRequest {
  code: string
  language?: string
  filePath?: string
  projectId?: string
  codeGenerationId?: string
  analysisType?: 'full' | 'security' | 'performance' | 'quick'
  platform?: 'ios' | 'android' | 'both'
  reactNativeVersion?: string
  enableAutoFix?: boolean
}

interface CodeIssue {
  severity: 'error' | 'warning' | 'info' | 'suggestion'
  category: 'security' | 'performance' | 'style' | 'bestpractice' | 'accessibility' | 'typescript' | 'react-native'
  ruleId: string
  message: string
  line?: number
  column?: number
  endLine?: number
  endColumn?: number
  isFixable: boolean
  fixSuggestion?: string
  autoFixable?: boolean
  fixCode?: string
}

interface SecurityVulnerability {
  type: string
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info'
  description: string
  impact: string
  remediation: string
  line?: number
  codeSnippet?: string
}

interface PerformanceIssue {
  type: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  category: 'rendering' | 'memory' | 'network' | 'computation' | 'storage'
  description: string
  suggestion: string
  estimatedImpactMs?: number
  affectedComponent?: string
  optimizedCode?: string
}

interface CodeEnhancement {
  type: 'refactor' | 'optimize' | 'modernize' | 'accessibility' | 'testing'
  priority: 'high' | 'medium' | 'low'
  title: string
  description: string
  currentCode: string
  suggestedCode: string
  estimatedEffort: 'trivial' | 'easy' | 'medium' | 'hard'
  breakingChange: boolean
}

interface AnalysisResult {
  overallScore: number
  readabilityScore: number
  maintainabilityScore: number
  performanceScore: number
  securityScore: number
  issues: CodeIssue[]
  vulnerabilities: SecurityVulnerability[]
  performanceIssues: PerformanceIssue[]
  enhancements: CodeEnhancement[]
  metrics: {
    linesOfCode: number
    cyclomaticComplexity: number
    errorCount: number
    warningCount: number
    infoCount: number
  }
  autoFixedCode?: string
}

// React Native specific rules
const REACT_NATIVE_RULES = {
  'rn-no-inline-styles': {
    pattern: /style\s*=\s*\{\{[^}]+\}\}/g,
    message: 'Avoid inline styles. Use StyleSheet.create() for better performance.',
    severity: 'warning' as const,
    category: 'style' as const,
    autoFixable: true
  },
  'rn-no-console': {
    pattern: /console\.(log|error|warn|info|debug)/g,
    message: 'Remove console statements in production code.',
    severity: 'warning' as const,
    category: 'bestpractice' as const,
    autoFixable: true
  },
  'rn-platform-specific': {
    pattern: /Platform\.OS\s*===?\s*['"](?:ios|android)['"]/g,
    checkFunction: (code: string) => {
      const matches = code.match(/Platform\.OS\s*===?\s*['"](?:ios|android)['"]/g)
      if (matches && matches.length > 2) {
        return 'Consider using Platform.select() for multiple platform checks.'
      }
      return null
    },
    severity: 'info' as const,
    category: 'bestpractice' as const
  },
  'rn-list-performance': {
    pattern: /<ScrollView[^>]*>[\s\S]*?\.map\(/g,
    message: 'Use FlatList or SectionList instead of ScrollView with map for better performance.',
    severity: 'warning' as const,
    category: 'performance' as const
  },
  'rn-image-optimization': {
    pattern: /<Image[^>]*source\s*=\s*\{[^}]*\}/g,
    checkFunction: (code: string) => {
      const imageRegex = /<Image[^>]*source\s*=\s*\{([^}]*)\}/g
      let match
      const issues = []
      while ((match = imageRegex.exec(code)) !== null) {
        const sourceContent = match[1]
        if (!sourceContent.includes('width') || !sourceContent.includes('height')) {
          issues.push('Specify image dimensions for better performance')
        }
      }
      return issues.length > 0 ? issues.join('. ') : null
    },
    severity: 'info' as const,
    category: 'performance' as const
  },
  'rn-accessibility': {
    pattern: /<(?:TouchableOpacity|TouchableHighlight|Pressable|Button)[^>]*>/g,
    checkFunction: (code: string) => {
      const touchableRegex = /<(TouchableOpacity|TouchableHighlight|Pressable|Button)([^>]*)>/g
      let match
      const issues = []
      while ((match = touchableRegex.exec(code)) !== null) {
        const props = match[2]
        if (!props.includes('accessible') && !props.includes('accessibilityLabel')) {
          issues.push(`${match[1]} missing accessibility props`)
        }
      }
      return issues.length > 0 ? issues.join('. ') : null
    },
    severity: 'warning' as const,
    category: 'accessibility' as const
  },
  'rn-key-prop': {
    pattern: /\.map\s*\([^)]*\)\s*=>\s*[^}]*<(?!Fragment)/g,
    checkFunction: (code: string) => {
      const mapRegex = /\.map\s*\(([^)]*)\)\s*=>\s*([^}]*)</g
      let match
      while ((match = mapRegex.exec(code)) !== null) {
        const renderContent = match[2]
        if (!renderContent.includes('key=')) {
          return 'Missing key prop in list rendering'
        }
      }
      return null
    },
    severity: 'error' as const,
    category: 'react-native' as const
  }
}

// TypeScript rules
const TYPESCRIPT_RULES = {
  'ts-no-any': {
    pattern: /:\s*any(?:\s|>|,|\)|\])/g,
    message: 'Avoid using "any" type. Use specific types for better type safety.',
    severity: 'error' as const,
    category: 'typescript' as const
  },
  'ts-explicit-return': {
    pattern: /(?:const|let|function)\s+\w+\s*=\s*(?:\([^)]*\)|[^=])\s*=>\s*\{/g,
    checkFunction: (code: string) => {
      const funcRegex = /(?:const|let|function)\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>\s*\{/g
      let match
      while ((match = funcRegex.exec(code)) !== null) {
        const funcName = match[1]
        // Check if it has explicit return type
        const beforeMatch = code.substring(Math.max(0, match.index - 50), match.index)
        if (!beforeMatch.includes(':') || beforeMatch.includes('=')) {
          return `Function "${funcName}" should have an explicit return type`
        }
      }
      return null
    },
    severity: 'warning' as const,
    category: 'typescript' as const
  }
}

// Security rules
const SECURITY_RULES = {
  'sec-no-eval': {
    pattern: /\b(eval|Function|setTimeout|setInterval)\s*\(/g,
    message: 'Avoid dynamic code execution for security reasons.',
    severity: 'error' as const,
    category: 'security' as const
  },
  'sec-no-hardcoded-secrets': {
    pattern: /(?:api[_-]?key|apikey|secret|password|pwd|token|auth)\s*[:=]\s*["'][^"']+["']/gi,
    message: 'Do not hardcode secrets. Use environment variables.',
    severity: 'critical' as const,
    category: 'security' as const
  },
  'sec-no-http': {
    pattern: /https?:\/\/(?!localhost|127\.0\.0\.1)/g,
    checkFunction: (code: string) => {
      const httpRegex = /http:\/\/(?!localhost|127\.0\.0\.1)/g
      if (httpRegex.test(code)) {
        return 'Use HTTPS instead of HTTP for external URLs'
      }
      return null
    },
    severity: 'warning' as const,
    category: 'security' as const
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authResult = await requireAuth(req)
    if (!authResult.authorized) {
      return new Response(JSON.stringify({ error: authResult.error }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const body: CodeAnalysisRequest = await req.json()
    const {
      code,
      language = 'typescript',
      filePath,
      projectId,
      codeGenerationId,
      analysisType = 'full',
      platform = 'both',
      enableAutoFix = false
    } = body

    if (!code) {
      return new Response(JSON.stringify({ error: 'Code is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    await logger.info('Code analysis request', {
      userId: authResult.userId,
      codeLength: code.length,
      analysisType,
      platform,
      enableAutoFix
    })

    // Perform analysis
    const analysisResult = await analyzeCode(code, {
      language,
      analysisType,
      platform,
      enableAutoFix
    })

    // Store results in database
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: qualityResult, error: dbError } = await supabase
      .from('code_quality_results')
      .insert({
        user_id: authResult.userId,
        project_id: projectId,
        code_generation_id: codeGenerationId,
        code_content: code,
        file_path: filePath,
        language,
        overall_score: analysisResult.overallScore,
        readability_score: analysisResult.readabilityScore,
        maintainability_score: analysisResult.maintainabilityScore,
        performance_score: analysisResult.performanceScore,
        security_score: analysisResult.securityScore,
        error_count: analysisResult.metrics.errorCount,
        warning_count: analysisResult.metrics.warningCount,
        info_count: analysisResult.metrics.infoCount,
        analysis_duration_ms: Date.now() - startTime,
        analyzer_version: '1.0.0'
      })
      .select()
      .single()

    if (dbError) {
      console.error('Failed to store analysis results:', dbError)
    } else {
      // Store individual issues
      if (analysisResult.issues.length > 0) {
        await storeIssues(supabase, qualityResult.id, analysisResult.issues)
      }
      if (analysisResult.vulnerabilities.length > 0) {
        await storeVulnerabilities(supabase, qualityResult.id, analysisResult.vulnerabilities)
      }
      if (analysisResult.performanceIssues.length > 0) {
        await storePerformanceIssues(supabase, qualityResult.id, analysisResult.performanceIssues)
      }
      if (analysisResult.enhancements.length > 0) {
        await storeEnhancements(supabase, qualityResult.id, analysisResult.enhancements)
      }
    }

    await logger.info('Code analysis completed', {
      userId: authResult.userId,
      overallScore: analysisResult.overallScore,
      issueCount: analysisResult.issues.length,
      vulnerabilityCount: analysisResult.vulnerabilities.length
    })

    return new Response(JSON.stringify(analysisResult), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    await logger.error('Code analysis error', { error: error.message })
    return new Response(JSON.stringify({ 
      error: 'Code analysis failed',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

const startTime = Date.now()

async function analyzeCode(
  code: string,
  options: {
    language: string
    analysisType: string
    platform: string
    enableAutoFix: boolean
  }
): Promise<AnalysisResult> {
  const issues: CodeIssue[] = []
  const vulnerabilities: SecurityVulnerability[] = []
  const performanceIssues: PerformanceIssue[] = []
  const enhancements: CodeEnhancement[] = []
  
  let autoFixedCode = code

  // Analyze with React Native rules
  if (options.analysisType === 'full' || options.analysisType === 'quick') {
    for (const [ruleId, rule] of Object.entries(REACT_NATIVE_RULES)) {
      const ruleIssues = checkRule(code, ruleId, rule)
      issues.push(...ruleIssues)
      
      if (options.enableAutoFix && rule.autoFixable) {
        autoFixedCode = applyAutoFix(autoFixedCode, ruleId, rule)
      }
    }
  }

  // Analyze with TypeScript rules
  for (const [ruleId, rule] of Object.entries(TYPESCRIPT_RULES)) {
    const ruleIssues = checkRule(code, ruleId, rule)
    issues.push(...ruleIssues)
  }

  // Security analysis
  if (options.analysisType === 'full' || options.analysisType === 'security') {
    vulnerabilities.push(...analyzeSecurityVulnerabilities(code))
    
    for (const [ruleId, rule] of Object.entries(SECURITY_RULES)) {
      const ruleIssues = checkRule(code, ruleId, rule)
      issues.push(...ruleIssues)
    }
  }

  // Performance analysis
  if (options.analysisType === 'full' || options.analysisType === 'performance') {
    performanceIssues.push(...analyzePerformanceIssues(code, options.platform))
  }

  // Generate enhancement suggestions
  if (options.analysisType === 'full') {
    enhancements.push(...generateEnhancements(code))
  }

  // Detect patterns for additional validation
  const detectedPatterns = detectPatterns(code)
  for (const pattern of detectedPatterns) {
    const validation = validatePatternUsage(code, pattern)
    if (!validation.valid) {
      validation.issues.forEach(issue => {
        issues.push({
          severity: 'warning',
          category: 'bestpractice',
          ruleId: `pattern-${pattern.id}`,
          message: issue,
          isFixable: false
        })
      })
    }
  }

  // Calculate metrics
  const metrics = calculateMetrics(code, issues)
  const scores = calculateScores(issues, vulnerabilities, performanceIssues, code)

  return {
    ...scores,
    issues,
    vulnerabilities,
    performanceIssues,
    enhancements,
    metrics,
    ...(options.enableAutoFix && autoFixedCode !== code ? { autoFixedCode } : {})
  }
}

function checkRule(
  code: string,
  ruleId: string,
  rule: any
): CodeIssue[] {
  const issues: CodeIssue[] = []
  
  if (rule.checkFunction) {
    const message = rule.checkFunction(code)
    if (message) {
      issues.push({
        severity: rule.severity,
        category: rule.category,
        ruleId,
        message,
        isFixable: rule.autoFixable || false
      })
    }
  } else if (rule.pattern) {
    const matches = [...code.matchAll(rule.pattern)]
    matches.forEach(match => {
      const lines = code.substring(0, match.index).split('\n')
      const line = lines.length
      const column = lines[lines.length - 1].length + 1
      
      issues.push({
        severity: rule.severity,
        category: rule.category,
        ruleId,
        message: rule.message,
        line,
        column,
        isFixable: rule.autoFixable || false,
        ...(rule.autoFixable ? { autoFixable: true } : {})
      })
    })
  }
  
  return issues
}

function applyAutoFix(code: string, ruleId: string, rule: any): string {
  if (!rule.autoFixable) return code
  
  switch (ruleId) {
    case 'rn-no-inline-styles':
      return fixInlineStyles(code)
    case 'rn-no-console':
      return code.replace(/console\.(log|error|warn|info|debug)\([^)]*\);?\n?/g, '')
    default:
      return code
  }
}

function fixInlineStyles(code: string): string {
  const styleRegex = /style\s*=\s*\{\{([^}]+)\}\}/g
  const styles: Record<string, any> = {}
  let styleIndex = 0
  
  const fixedCode = code.replace(styleRegex, (match, styleContent) => {
    styleIndex++
    const styleName = `dynamicStyle${styleIndex}`
    styles[styleName] = styleContent.trim()
    return `style={styles.${styleName}}`
  })
  
  if (Object.keys(styles).length > 0) {
    const styleSheetCode = `\nconst styles = StyleSheet.create({\n${
      Object.entries(styles).map(([name, content]) => 
        `  ${name}: {${content}}`
      ).join(',\n')
    }\n})\n`
    
    // Add StyleSheet import if not present
    if (!fixedCode.includes('StyleSheet')) {
      return fixedCode.replace(
        /from ['"]react-native['"]/,
        `from 'react-native'\nimport { StyleSheet } from 'react-native'`
      ) + styleSheetCode
    }
    
    return fixedCode + styleSheetCode
  }
  
  return fixedCode
}

function analyzeSecurityVulnerabilities(code: string): SecurityVulnerability[] {
  const vulnerabilities: SecurityVulnerability[] = []
  
  // Check for hardcoded secrets
  const secretPatterns = [
    /api[_-]?key\s*[:=]\s*["'][^"']{10,}["']/gi,
    /secret\s*[:=]\s*["'][^"']{10,}["']/gi,
    /password\s*[:=]\s*["'][^"']+["']/gi,
    /token\s*[:=]\s*["'][^"']{20,}["']/gi
  ]
  
  secretPatterns.forEach(pattern => {
    const matches = [...code.matchAll(pattern)]
    matches.forEach(match => {
      const lines = code.substring(0, match.index).split('\n')
      vulnerabilities.push({
        type: 'hardcoded-secret',
        severity: 'critical',
        description: 'Hardcoded secret detected',
        impact: 'Exposed credentials can lead to unauthorized access',
        remediation: 'Store secrets in environment variables or secure key management system',
        line: lines.length,
        codeSnippet: match[0]
      })
    })
  })
  
  // Check for unsafe data handling
  if (code.includes('dangerouslySetInnerHTML')) {
    vulnerabilities.push({
      type: 'xss-risk',
      severity: 'high',
      description: 'Potential XSS vulnerability with dangerouslySetInnerHTML',
      impact: 'Malicious scripts could be executed in user context',
      remediation: 'Sanitize HTML content or use safe alternatives'
    })
  }
  
  return vulnerabilities
}

function analyzePerformanceIssues(code: string, platform: string): PerformanceIssue[] {
  const issues: PerformanceIssue[] = []
  
  // Check for performance anti-patterns
  if (code.includes('.map(') && code.includes('<ScrollView')) {
    issues.push({
      type: 'inefficient-list-rendering',
      severity: 'high',
      category: 'rendering',
      description: 'Using ScrollView with map for large lists',
      suggestion: 'Use FlatList for better performance with large datasets',
      estimatedImpactMs: 100,
      affectedComponent: 'ScrollView'
    })
  }
  
  // Check for missing React.memo
  const componentRegex = /(?:export\s+)?(?:const|function)\s+(\w+)\s*[=:]\s*(?:\([^)]*\)|[^=])\s*=>/g
  const matches = [...code.matchAll(componentRegex)]
  matches.forEach(match => {
    const componentName = match[1]
    if (componentName[0] === componentName[0].toUpperCase() && 
        !code.includes(`React.memo(${componentName})`) &&
        !code.includes(`memo(${componentName})`)) {
      issues.push({
        type: 'missing-memoization',
        severity: 'medium',
        category: 'rendering',
        description: `Component "${componentName}" could benefit from React.memo`,
        suggestion: 'Wrap component with React.memo to prevent unnecessary re-renders',
        affectedComponent: componentName
      })
    }
  })
  
  return issues
}

function generateEnhancements(code: string): CodeEnhancement[] {
  const enhancements: CodeEnhancement[] = []
  
  // Suggest modern syntax
  if (code.includes('componentDidMount') || code.includes('componentWillUnmount')) {
    enhancements.push({
      type: 'modernize',
      priority: 'medium',
      title: 'Convert to functional component with hooks',
      description: 'Class components can be converted to functional components with hooks',
      currentCode: 'class MyComponent extends React.Component',
      suggestedCode: 'const MyComponent: React.FC = () =>',
      estimatedEffort: 'medium',
      breakingChange: false
    })
  }
  
  // Suggest accessibility improvements
  const touchableWithoutA11y = /<(TouchableOpacity|Pressable)(?![^>]*accessible)[^>]*>/g
  if (touchableWithoutA11y.test(code)) {
    enhancements.push({
      type: 'accessibility',
      priority: 'high',
      title: 'Add accessibility props to interactive elements',
      description: 'Interactive elements should have accessibility props',
      currentCode: '<TouchableOpacity onPress={handlePress}>',
      suggestedCode: '<TouchableOpacity accessible accessibilityLabel="Button" accessibilityRole="button" onPress={handlePress}>',
      estimatedEffort: 'trivial',
      breakingChange: false
    })
  }
  
  return enhancements
}

function calculateMetrics(code: string, issues: CodeIssue[]): any {
  const lines = code.split('\n')
  const linesOfCode = lines.filter(line => line.trim().length > 0).length
  
  // Simple cyclomatic complexity estimation
  const complexityKeywords = ['if', 'else', 'for', 'while', 'case', '&&', '||', '?']
  let cyclomaticComplexity = 1
  complexityKeywords.forEach(keyword => {
    const regex = new RegExp(`\\b${keyword}\\b`, 'g')
    const matches = code.match(regex)
    if (matches) {
      cyclomaticComplexity += matches.length
    }
  })
  
  const errorCount = issues.filter(i => i.severity === 'error').length
  const warningCount = issues.filter(i => i.severity === 'warning').length
  const infoCount = issues.filter(i => i.severity === 'info').length
  
  return {
    linesOfCode,
    cyclomaticComplexity,
    errorCount,
    warningCount,
    infoCount
  }
}

function calculateScores(
  issues: CodeIssue[],
  vulnerabilities: SecurityVulnerability[],
  performanceIssues: PerformanceIssue[],
  code: string
): any {
  // Calculate individual scores
  const securityScore = Math.max(0, 100 - (vulnerabilities.length * 20) - 
    (vulnerabilities.filter(v => v.severity === 'critical').length * 30))
  
  const performanceScore = Math.max(0, 100 - (performanceIssues.length * 15) -
    (performanceIssues.filter(p => p.severity === 'critical').length * 25))
  
  const errorPenalty = issues.filter(i => i.severity === 'error').length * 10
  const warningPenalty = issues.filter(i => i.severity === 'warning').length * 5
  
  const readabilityScore = Math.max(0, 100 - errorPenalty - warningPenalty)
  const maintainabilityScore = Math.max(0, 100 - errorPenalty - (warningPenalty / 2))
  
  // Calculate overall score (weighted average)
  const overallScore = Math.round(
    (securityScore * 0.35) +
    (performanceScore * 0.25) +
    (maintainabilityScore * 0.25) +
    (readabilityScore * 0.15)
  )
  
  return {
    overallScore,
    readabilityScore,
    maintainabilityScore,
    performanceScore,
    securityScore
  }
}

async function storeIssues(supabase: any, qualityResultId: string, issues: CodeIssue[]) {
  if (issues.length === 0) return
  
  const issueRecords = issues.map(issue => ({
    quality_result_id: qualityResultId,
    severity: issue.severity,
    category: issue.category,
    rule_id: issue.ruleId,
    message: issue.message,
    line_start: issue.line,
    column_start: issue.column,
    is_fixable: issue.isFixable,
    fix_suggestion: issue.fixSuggestion,
    auto_fixable: issue.autoFixable,
    fix_code: issue.fixCode,
    react_native_specific: issue.category === 'react-native'
  }))
  
  await supabase.from('code_issues').insert(issueRecords)
}

async function storeVulnerabilities(supabase: any, qualityResultId: string, vulnerabilities: SecurityVulnerability[]) {
  if (vulnerabilities.length === 0) return
  
  const vulnRecords = vulnerabilities.map(vuln => ({
    quality_result_id: qualityResultId,
    vulnerability_type: vuln.type,
    severity: vuln.severity,
    description: vuln.description,
    impact: vuln.impact,
    remediation: vuln.remediation,
    line_number: vuln.line,
    code_snippet: vuln.codeSnippet
  }))
  
  await supabase.from('security_vulnerabilities').insert(vulnRecords)
}

async function storePerformanceIssues(supabase: any, qualityResultId: string, issues: PerformanceIssue[]) {
  if (issues.length === 0) return
  
  const perfRecords = issues.map(issue => ({
    quality_result_id: qualityResultId,
    issue_type: issue.type,
    severity: issue.severity,
    category: issue.category,
    description: issue.description,
    suggestion: issue.suggestion,
    estimated_impact_ms: issue.estimatedImpactMs,
    affected_component: issue.affectedComponent,
    optimized_code: issue.optimizedCode
  }))
  
  await supabase.from('performance_issues').insert(perfRecords)
}

async function storeEnhancements(supabase: any, qualityResultId: string, enhancements: CodeEnhancement[]) {
  if (enhancements.length === 0) return
  
  const enhancementRecords = enhancements.map(enh => ({
    quality_result_id: qualityResultId,
    enhancement_type: enh.type,
    priority: enh.priority,
    title: enh.title,
    description: enh.description,
    current_code: enh.currentCode,
    suggested_code: enh.suggestedCode,
    estimated_effort: enh.estimatedEffort,
    breaking_change: enh.breakingChange,
    requires_testing: true
  }))
  
  await supabase.from('code_enhancements').insert(enhancementRecords)
}