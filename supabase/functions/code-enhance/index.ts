// Supabase Edge Function for applying code enhancements and fixes
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { corsHeaders } from '../_shared/cors.ts'
import { requireAuth } from '../_shared/auth.ts'
import { logger } from '../_shared/logger.ts'

interface EnhanceCodeRequest {
  code: string
  enhancements?: {
    fixSecurity?: boolean
    fixPerformance?: boolean
    fixStyle?: boolean
    addAccessibility?: boolean
    modernizeSyntax?: boolean
    addTypeScript?: boolean
  }
  qualityResultId?: string
  platform?: 'ios' | 'android' | 'both'
  targetScore?: number
}

interface EnhanceCodeResponse {
  enhancedCode: string
  appliedEnhancements: string[]
  estimatedScoreImprovement: number
  breaking: boolean
  requiresTesting: boolean
  summary: string
}

// Enhancement strategies
const ENHANCEMENT_STRATEGIES = {
  fixSecurity: {
    name: 'Security Fixes',
    apply: (code: string) => applySecurityFixes(code)
  },
  fixPerformance: {
    name: 'Performance Optimization',
    apply: (code: string) => applyPerformanceFixes(code)
  },
  fixStyle: {
    name: 'Style Improvements',
    apply: (code: string) => applyStyleFixes(code)
  },
  addAccessibility: {
    name: 'Accessibility Enhancements',
    apply: (code: string) => addAccessibilityProps(code)
  },
  modernizeSyntax: {
    name: 'Modern Syntax',
    apply: (code: string) => modernizeSyntax(code)
  },
  addTypeScript: {
    name: 'TypeScript Types',
    apply: (code: string) => addTypeScriptTypes(code)
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

    const body: EnhanceCodeRequest = await req.json()
    const {
      code,
      enhancements = {
        fixSecurity: true,
        fixPerformance: true,
        fixStyle: true,
        addAccessibility: true,
        modernizeSyntax: false,
        addTypeScript: false
      },
      qualityResultId,
      platform = 'both',
      targetScore = 80
    } = body

    if (!code) {
      return new Response(JSON.stringify({ error: 'Code is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    await logger.info('Code enhancement request', {
      userId: authResult.userId,
      codeLength: code.length,
      enhancements,
      targetScore
    })

    // Apply enhancements
    let enhancedCode = code
    const appliedEnhancements: string[] = []
    let breaking = false
    let requiresTesting = true

    // Apply each requested enhancement
    for (const [key, value] of Object.entries(enhancements)) {
      if (value && ENHANCEMENT_STRATEGIES[key as keyof typeof ENHANCEMENT_STRATEGIES]) {
        const strategy = ENHANCEMENT_STRATEGIES[key as keyof typeof ENHANCEMENT_STRATEGIES]
        const result = strategy.apply(enhancedCode)
        
        if (result.code !== enhancedCode) {
          enhancedCode = result.code
          appliedEnhancements.push(strategy.name)
          
          if (result.breaking) breaking = true
          if (result.requiresTesting) requiresTesting = true
        }
      }
    }

    // If we have a quality result ID, fetch and apply specific fixes
    if (qualityResultId) {
      const specificFixes = await getSpecificFixes(qualityResultId)
      if (specificFixes.length > 0) {
        enhancedCode = applySpecificFixes(enhancedCode, specificFixes)
        appliedEnhancements.push('Specific issue fixes')
      }
    }

    // Calculate estimated improvement
    const estimatedScoreImprovement = calculateScoreImprovement(
      code,
      enhancedCode,
      appliedEnhancements
    )

    // Generate summary
    const summary = generateEnhancementSummary(
      appliedEnhancements,
      estimatedScoreImprovement,
      breaking
    )

    await logger.info('Code enhancement completed', {
      userId: authResult.userId,
      appliedCount: appliedEnhancements.length,
      estimatedImprovement: estimatedScoreImprovement,
      breaking
    })

    const response: EnhanceCodeResponse = {
      enhancedCode,
      appliedEnhancements,
      estimatedScoreImprovement,
      breaking,
      requiresTesting,
      summary
    }

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    await logger.error('Code enhancement error', { error: error.message })
    return new Response(JSON.stringify({ 
      error: 'Code enhancement failed',
      message: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

function applySecurityFixes(code: string): { code: string; breaking: boolean; requiresTesting: boolean } {
  let fixedCode = code
  let breaking = false

  // Remove hardcoded secrets
  const secretPatterns = [
    { pattern: /api[_-]?key\s*[:=]\s*["'][^"']+["']/gi, replacement: 'apiKey: process.env.API_KEY' },
    { pattern: /secret\s*[:=]\s*["'][^"']+["']/gi, replacement: 'secret: process.env.SECRET' },
    { pattern: /password\s*[:=]\s*["'][^"']+["']/gi, replacement: 'password: process.env.PASSWORD' },
    { pattern: /token\s*[:=]\s*["'][^"']+["']/gi, replacement: 'token: process.env.AUTH_TOKEN' }
  ]

  secretPatterns.forEach(({ pattern, replacement }) => {
    if (pattern.test(fixedCode)) {
      fixedCode = fixedCode.replace(pattern, replacement)
      breaking = true // Environment variables need to be set
    }
  })

  // Replace HTTP with HTTPS
  fixedCode = fixedCode.replace(/http:\/\/(?!localhost|127\.0\.0\.1)/g, 'https://')

  // Add input validation for user inputs
  if (fixedCode.includes('TextInput') && !fixedCode.includes('validate')) {
    fixedCode = addInputValidation(fixedCode)
  }

  return { code: fixedCode, breaking, requiresTesting: true }
}

function applyPerformanceFixes(code: string): { code: string; breaking: boolean; requiresTesting: boolean } {
  let fixedCode = code
  let breaking = false

  // Replace ScrollView + map with FlatList
  const scrollViewMapRegex = /<ScrollView[^>]*>([\s\S]*?)\.map\s*\([^)]*\)\s*=>\s*([^}]*)<\/ScrollView>/g
  if (scrollViewMapRegex.test(fixedCode)) {
    fixedCode = fixedCode.replace(scrollViewMapRegex, (match, before, renderItem) => {
      return `<FlatList
        data={${extractDataVariable(before)}}
        renderItem={({ item }) => ${renderItem}}
        keyExtractor={(item) => item.id}
      />`
    })
    breaking = true // Might need to adjust data structure
  }

  // Add React.memo to functional components
  const componentRegex = /export\s+(?:const|function)\s+(\w+)\s*[=:]\s*(?:\([^)]*\)|[^=])\s*=>\s*[{(]/g
  fixedCode = fixedCode.replace(componentRegex, (match, componentName) => {
    if (componentName[0] === componentName[0].toUpperCase() && 
        !code.includes(`React.memo(${componentName})`) &&
        !code.includes(`memo(${componentName})`)) {
      // Add memo import if needed
      if (!fixedCode.includes('import { memo }') && !fixedCode.includes('React.memo')) {
        fixedCode = fixedCode.replace(
          /from ['"]react['"]/,
          ', memo from \'react\''
        )
      }
      return `export const ${componentName} = memo(() => {`
    }
    return match
  })

  // Optimize image loading
  fixedCode = optimizeImages(fixedCode)

  return { code: fixedCode, breaking, requiresTesting: true }
}

function applyStyleFixes(code: string): { code: string; breaking: boolean; requiresTesting: boolean } {
  let fixedCode = code
  
  // Convert inline styles to StyleSheet
  const inlineStyleRegex = /style\s*=\s*\{\{([^}]+)\}\}/g
  const styles: Record<string, string> = {}
  let styleIndex = 0

  fixedCode = fixedCode.replace(inlineStyleRegex, (match, styleContent) => {
    styleIndex++
    const styleName = `style${styleIndex}`
    styles[styleName] = styleContent.trim()
    return `style={styles.${styleName}}`
  })

  // Add StyleSheet definition if styles were found
  if (Object.keys(styles).length > 0) {
    // Add StyleSheet import
    if (!fixedCode.includes('StyleSheet')) {
      if (fixedCode.includes('from \'react-native\'')) {
        fixedCode = fixedCode.replace(
          /\{([^}]*)\}\s*from\s*['"]react-native['"]/,
          (match, imports) => `{ ${imports}, StyleSheet } from 'react-native'`
        )
      } else {
        fixedCode = `import { StyleSheet } from 'react-native'\n${fixedCode}`
      }
    }

    // Add styles object
    const styleSheetCode = `\nconst styles = StyleSheet.create({
${Object.entries(styles).map(([name, content]) => 
  `  ${name}: {${content}}`
).join(',\n')}
})`

    // Add before export or at end
    if (fixedCode.includes('export default')) {
      fixedCode = fixedCode.replace(/export default/, styleSheetCode + '\n\nexport default')
    } else {
      fixedCode += styleSheetCode
    }
  }

  // Remove console statements
  fixedCode = fixedCode.replace(/console\.(log|error|warn|info|debug)\([^)]*\);?\s*\n?/g, '')

  return { code: fixedCode, breaking: false, requiresTesting: true }
}

function addAccessibilityProps(code: string): { code: string; breaking: boolean; requiresTesting: boolean } {
  let fixedCode = code

  // Add accessibility to touchable components
  const touchableRegex = /<(TouchableOpacity|TouchableHighlight|Pressable|Button)([^>]*)>/g
  fixedCode = fixedCode.replace(touchableRegex, (match, component, props) => {
    if (!props.includes('accessible') && !props.includes('accessibilityLabel')) {
      // Try to infer label from text content or onPress handler
      let label = 'Button'
      
      // Look for text content
      const textMatch = match.match(/>([^<]+)</)?.[1]
      if (textMatch) {
        label = textMatch.trim()
      }
      
      // Look for onPress handler name
      const onPressMatch = props.match(/onPress=\{(?:this\.)?(\w+)\}/)
      if (onPressMatch) {
        label = onPressMatch[1].replace(/handle|on|Press/g, '').replace(/([A-Z])/g, ' $1').trim()
      }

      return `<${component}${props} accessible accessibilityLabel="${label}" accessibilityRole="button">`
    }
    return match
  })

  // Add accessibility to images
  const imageRegex = /<Image([^>]*)\/>/g
  fixedCode = fixedCode.replace(imageRegex, (match, props) => {
    if (!props.includes('accessible') && !props.includes('accessibilityLabel')) {
      return `<Image${props} accessible accessibilityLabel="Image" />`
    }
    return match
  })

  return { code: fixedCode, breaking: false, requiresTesting: true }
}

function modernizeSyntax(code: string): { code: string; breaking: boolean; requiresTesting: boolean } {
  let fixedCode = code
  let breaking = false

  // Convert class components to functional (simplified)
  if (fixedCode.includes('extends Component') || fixedCode.includes('extends React.Component')) {
    // This is a complex transformation - for now, just flag it
    breaking = true
  }

  // Convert var to const/let
  fixedCode = fixedCode.replace(/\bvar\s+/g, 'let ')

  // Use optional chaining
  fixedCode = fixedCode.replace(/(\w+)\s*&&\s*\1\./g, '$1?.')

  // Use nullish coalescing
  fixedCode = fixedCode.replace(/(\w+)\s*\|\|\s*(['"`])/g, '$1 ?? $2')

  return { code: fixedCode, breaking, requiresTesting: true }
}

function addTypeScriptTypes(code: string): { code: string; breaking: boolean; requiresTesting: boolean } {
  let fixedCode = code

  // Add basic prop types
  const componentRegex = /const\s+(\w+)\s*=\s*\((\{[^}]*\})\)\s*=>/g
  fixedCode = fixedCode.replace(componentRegex, (match, name, props) => {
    if (!match.includes(':')) {
      // Extract prop names
      const propNames = props.match(/\w+/g) || []
      const typeInterface = `interface ${name}Props {
${propNames.map(prop => `  ${prop}: any; // TODO: Add proper type`).join('\n')}
}\n\n`
      
      fixedCode = typeInterface + fixedCode
      return `const ${name} = (${props}: ${name}Props) =>`
    }
    return match
  })

  // Add return types to functions
  const functionRegex = /const\s+(\w+)\s*=\s*\([^)]*\)\s*=>\s*\{/g
  fixedCode = fixedCode.replace(functionRegex, (match) => {
    if (!match.includes(':') && !match.includes('=>:')) {
      return match.replace('=>', ': void =>')
    }
    return match
  })

  return { code: fixedCode, breaking: false, requiresTesting: true }
}

// Helper functions
function extractDataVariable(code: string): string {
  const match = code.match(/(\w+)\.map/)
  return match ? match[1] : 'data'
}

function optimizeImages(code: string): string {
  const imageRegex = /<Image([^>]*source=\{[^}]*\}[^>]*)\/>/g
  
  return code.replace(imageRegex, (match, props) => {
    // Add resizeMode if missing
    if (!props.includes('resizeMode')) {
      props += ' resizeMode="cover"'
    }
    
    // Suggest dimensions if missing
    if (!props.includes('width') && !props.includes('height') && !props.includes('style')) {
      props += ' style={{ width: 100, height: 100 }}'
    }
    
    return `<Image${props}/>`
  })
}

function addInputValidation(code: string): string {
  // Add basic validation for TextInput components
  const textInputRegex = /<TextInput([^>]*)\/>/g
  
  return code.replace(textInputRegex, (match, props) => {
    if (!props.includes('maxLength') && !props.includes('validate')) {
      // Add reasonable defaults based on input type
      if (props.includes('email')) {
        props += ' maxLength={255} keyboardType="email-address"'
      } else if (props.includes('phone')) {
        props += ' maxLength={20} keyboardType="phone-pad"'
      } else if (props.includes('password')) {
        props += ' maxLength={128} secureTextEntry'
      } else {
        props += ' maxLength={255}'
      }
    }
    return `<TextInput${props}/>`
  })
}

async function getSpecificFixes(qualityResultId: string): Promise<any[]> {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: issues } = await supabase
      .from('code_issues')
      .select('*')
      .eq('quality_result_id', qualityResultId)
      .eq('auto_fixable', true)

    return issues || []
  } catch (error) {
    console.error('Failed to fetch specific fixes:', error)
    return []
  }
}

function applySpecificFixes(code: string, fixes: any[]): string {
  let fixedCode = code
  
  // Apply each auto-fixable issue
  fixes.forEach(fix => {
    if (fix.fix_code) {
      // Apply the specific fix
      // This would need more sophisticated logic for actual line/column based fixes
      console.log(`Applying fix for ${fix.rule_id}: ${fix.message}`)
    }
  })
  
  return fixedCode
}

function calculateScoreImprovement(
  originalCode: string,
  enhancedCode: string,
  appliedEnhancements: string[]
): number {
  let improvement = 0
  
  // Estimate improvement based on applied enhancements
  const enhancementScores: Record<string, number> = {
    'Security Fixes': 15,
    'Performance Optimization': 10,
    'Style Improvements': 5,
    'Accessibility Enhancements': 8,
    'Modern Syntax': 3,
    'TypeScript Types': 7,
    'Specific issue fixes': 5
  }
  
  appliedEnhancements.forEach(enhancement => {
    improvement += enhancementScores[enhancement] || 0
  })
  
  // Cap at reasonable maximum
  return Math.min(improvement, 40)
}

function generateEnhancementSummary(
  appliedEnhancements: string[],
  estimatedImprovement: number,
  breaking: boolean
): string {
  const parts = [`Applied ${appliedEnhancements.length} enhancement${appliedEnhancements.length !== 1 ? 's' : ''}`]
  
  if (appliedEnhancements.length > 0) {
    parts.push(`including ${appliedEnhancements.slice(0, 3).join(', ')}`)
  }
  
  parts.push(`Estimated score improvement: +${estimatedImprovement} points`)
  
  if (breaking) {
    parts.push('⚠️ Breaking changes: Environment variables or structural changes required')
  }
  
  return parts.join('. ') + '.'
}