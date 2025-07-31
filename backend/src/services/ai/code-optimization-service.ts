import { createClient } from '@supabase/supabase-js';
import { ESLint } from 'eslint';
import * as ts from 'typescript';
import { z } from 'zod';

// Optimization configuration schema
const OptimizationConfigSchema = z.object({
  enablePerformanceChecks: z.boolean().default(true),
  enableAccessibilityChecks: z.boolean().default(true),
  enableCrossPlatformChecks: z.boolean().default(true),
  enableSecurityChecks: z.boolean().default(true),
  autoFix: z.boolean().default(true),
  strictMode: z.boolean().default(false),
});

type OptimizationConfig = z.infer<typeof OptimizationConfigSchema>;

// Optimization result interface
export interface OptimizationResult {
  optimizedCode: string;
  issues: OptimizationIssue[];
  suggestions: OptimizationSuggestion[];
  score: number; // 0-100
  fixedCount: number;
  accessibilityScore: number; // 0-100
  performanceScore: number; // 0-100
  compatibilityScore: number; // 0-100
}

export interface OptimizationIssue {
  type: 'error' | 'warning' | 'info';
  category: 'performance' | 'accessibility' | 'compatibility' | 'style' | 'security';
  message: string;
  line?: number;
  column?: number;
  severity: 'critical' | 'major' | 'minor';
  fixAvailable: boolean;
}

export interface OptimizationSuggestion {
  title: string;
  description: string;
  category: string;
  impact: 'high' | 'medium' | 'low';
  codeExample?: string;
}

// React Native specific ESLint rules
const REACT_NATIVE_ESLINT_CONFIG = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  plugins: [
    'react',
    'react-native',
    'react-hooks',
    '@typescript-eslint',
    'jsx-a11y',
  ],
  rules: {
    // Performance rules
    'react/jsx-no-bind': ['error', {
      ignoreRefs: true,
      allowArrowFunctions: true,
      allowFunctions: false,
      allowBind: false,
    }],
    'react/no-unused-prop-types': 'error',
    'react/no-unused-state': 'error',
    'react-native/no-unused-styles': 'error',
    'react-native/no-inline-styles': 'warn',
    'react-native/no-color-literals': 'warn',
    
    // Accessibility rules
    'jsx-a11y/accessible-emoji': 'error',
    'react-native/no-raw-text': ['error', {
      skip: ['Button', 'Text'],
    }],
    
    // Best practices
    'react-hooks/rules-of-hooks': 'error',
    'react-hooks/exhaustive-deps': 'warn',
    'react/no-unstable-nested-components': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { 
      argsIgnorePattern: '^_',
      varsIgnorePattern: '^_',
    }],
  },
};

// WCAG accessibility patterns
const ACCESSIBILITY_PATTERNS = {
  touchTargets: {
    minSize: 44, // 44x44 points minimum
    message: 'Touch targets should be at least 44x44 points for accessibility',
  },
  colorContrast: {
    normal: 4.5,
    large: 3.0,
    message: 'Text color contrast should meet WCAG AA standards',
  },
  semanticElements: {
    patterns: ['Button', 'TouchableOpacity', 'Pressable'],
    message: 'Use semantic touchable components with proper accessibility props',
  },
};

// Platform-specific patterns
const PLATFORM_PATTERNS = {
  ios: {
    statusBar: 'StatusBar.setBarStyle',
    safeArea: 'SafeAreaView',
    haptics: 'HapticFeedback',
  },
  android: {
    backHandler: 'BackHandler',
    permissions: 'PermissionsAndroid',
    toasts: 'ToastAndroid',
  },
};

export class CodeOptimizationService {
  private supabase: ReturnType<typeof createClient>;
  private config: OptimizationConfig;
  private eslint: ESLint;

  constructor(
    supabaseUrl: string,
    supabaseKey: string,
    config?: Partial<OptimizationConfig>
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.config = OptimizationConfigSchema.parse(config || {});
    
    // Initialize ESLint
    this.eslint = new ESLint({
      baseConfig: REACT_NATIVE_ESLINT_CONFIG,
      fix: this.config.autoFix,
    });
  }

  /**
   * Optimize and validate React Native code
   */
  async optimizeCode(
    code: string,
    options?: {
      fileName?: string;
      platform?: 'ios' | 'android' | 'both';
      targetSDK?: string;
      projectId?: string;
    }
  ): Promise<OptimizationResult> {
    const issues: OptimizationIssue[] = [];
    const suggestions: OptimizationSuggestion[] = [];
    let optimizedCode = code;
    let fixedCount = 0;

    // 1. Run ESLint checks and fixes
    if (this.config.enablePerformanceChecks || this.config.enableAccessibilityChecks) {
      const eslintResult = await this.runESLintChecks(optimizedCode, options?.fileName);
      issues.push(...eslintResult.issues);
      if (eslintResult.fixedCode) {
        optimizedCode = eslintResult.fixedCode;
        fixedCount += eslintResult.fixedCount;
      }
    }

    // 2. Run TypeScript analysis
    const tsResult = await this.runTypeScriptAnalysis(optimizedCode);
    issues.push(...tsResult.issues);
    suggestions.push(...tsResult.suggestions);

    // 3. Check accessibility compliance
    if (this.config.enableAccessibilityChecks) {
      const a11yResult = await this.checkAccessibility(optimizedCode);
      issues.push(...a11yResult.issues);
      suggestions.push(...a11yResult.suggestions);
    }

    // 4. Check cross-platform compatibility
    if (this.config.enableCrossPlatformChecks) {
      const compatResult = await this.checkCrossPlatformCompatibility(
        optimizedCode,
        options?.platform || 'both'
      );
      issues.push(...compatResult.issues);
      suggestions.push(...compatResult.suggestions);
    }

    // 5. Performance optimizations
    if (this.config.enablePerformanceChecks) {
      const perfResult = await this.applyPerformanceOptimizations(optimizedCode);
      if (perfResult.optimizedCode !== optimizedCode) {
        optimizedCode = perfResult.optimizedCode;
        fixedCount += perfResult.fixedCount;
      }
      suggestions.push(...perfResult.suggestions);
    }

    // 6. Security checks
    if (this.config.enableSecurityChecks) {
      const securityResult = await this.checkSecurity(optimizedCode);
      issues.push(...securityResult.issues);
      suggestions.push(...securityResult.suggestions);
    }

    // Calculate scores
    const scores = this.calculateScores(issues, suggestions);

    // Store optimization results if projectId provided
    if (options?.projectId) {
      await this.storeOptimizationResults(options.projectId, {
        originalCode: code,
        optimizedCode,
        issues,
        suggestions,
        scores,
      });
    }

    return {
      optimizedCode,
      issues,
      suggestions,
      score: scores.overall,
      fixedCount,
      accessibilityScore: scores.accessibility,
      performanceScore: scores.performance,
      compatibilityScore: scores.compatibility,
    };
  }

  /**
   * Run ESLint checks
   */
  private async runESLintChecks(
    code: string,
    fileName: string = 'component.tsx'
  ): Promise<{
    issues: OptimizationIssue[];
    fixedCode?: string;
    fixedCount: number;
  }> {
    try {
      const results = await this.eslint.lintText(code, {
        filePath: fileName,
      });

      const issues: OptimizationIssue[] = [];
      let fixedCode: string | undefined;
      let fixedCount = 0;

      for (const result of results) {
        // Convert ESLint messages to our format
        for (const message of result.messages) {
          issues.push({
            type: message.severity === 2 ? 'error' : 'warning',
            category: this.categorizeESLintRule(message.ruleId || ''),
            message: message.message,
            line: message.line,
            column: message.column,
            severity: message.severity === 2 ? 'major' : 'minor',
            fixAvailable: message.fix !== undefined,
          });
        }

        // Get fixed output if available
        if (result.output) {
          fixedCode = result.output;
          fixedCount = result.fixableErrorCount + result.fixableWarningCount;
        }
      }

      return { issues, fixedCode, fixedCount };
    } catch (error) {
      console.error('ESLint error:', error);
      return { issues: [], fixedCount: 0 };
    }
  }

  /**
   * Run TypeScript analysis
   */
  private async runTypeScriptAnalysis(
    code: string
  ): Promise<{
    issues: OptimizationIssue[];
    suggestions: OptimizationSuggestion[];
  }> {
    const issues: OptimizationIssue[] = [];
    const suggestions: OptimizationSuggestion[] = [];

    try {
      // Create TypeScript source file
      const sourceFile = ts.createSourceFile(
        'component.tsx',
        code,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );

      // Check for type issues
      const typeChecker = ts.createProgram(['component.tsx'], {
        jsx: ts.JsxEmit.ReactNative,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2020,
        strict: this.config.strictMode,
      }).getTypeChecker();

      // Visit nodes to find issues
      ts.forEachChild(sourceFile, (node) => {
        this.visitTypeScriptNode(node, sourceFile, issues, suggestions);
      });

    } catch (error) {
      console.error('TypeScript analysis error:', error);
    }

    return { issues, suggestions };
  }

  /**
   * Check accessibility compliance
   */
  private async checkAccessibility(
    code: string
  ): Promise<{
    issues: OptimizationIssue[];
    suggestions: OptimizationSuggestion[];
  }> {
    const issues: OptimizationIssue[] = [];
    const suggestions: OptimizationSuggestion[] = [];

    // Check for missing accessibility props
    const touchableRegex = /<(TouchableOpacity|TouchableHighlight|Pressable|Button)[^>]*>/g;
    const matches = code.matchAll(touchableRegex);

    for (const match of matches) {
      const element = match[0];
      
      // Check for accessibility props
      if (!element.includes('accessible=') && !element.includes('accessibilityLabel=')) {
        issues.push({
          type: 'warning',
          category: 'accessibility',
          message: `${match[1]} is missing accessibility props`,
          severity: 'major',
          fixAvailable: true,
        });
      }

      // Check for minimum touch target size
      if (element.includes('style=') && !element.includes('minHeight') && !element.includes('height')) {
        suggestions.push({
          title: 'Ensure minimum touch target size',
          description: `${match[1]} should have a minimum size of 44x44 points for accessibility`,
          category: 'accessibility',
          impact: 'high',
          codeExample: `style={{ minHeight: 44, minWidth: 44 }}`,
        });
      }
    }

    // Check for color contrast (simplified check)
    const colorRegex = /color:\s*['"]?(#[0-9a-fA-F]{6}|[a-zA-Z]+)['"]?/g;
    const colorMatches = code.matchAll(colorRegex);

    for (const match of colorMatches) {
      suggestions.push({
        title: 'Verify color contrast',
        description: 'Ensure text colors meet WCAG AA contrast requirements',
        category: 'accessibility',
        impact: 'medium',
      });
    }

    return { issues, suggestions };
  }

  /**
   * Check cross-platform compatibility
   */
  private async checkCrossPlatformCompatibility(
    code: string,
    platform: 'ios' | 'android' | 'both'
  ): Promise<{
    issues: OptimizationIssue[];
    suggestions: OptimizationSuggestion[];
  }> {
    const issues: OptimizationIssue[] = [];
    const suggestions: OptimizationSuggestion[] = [];

    // Check for platform-specific code without proper guards
    const platformSpecificAPIs = [
      { api: 'StatusBar.setBarStyle', platform: 'ios' },
      { api: 'ToastAndroid', platform: 'android' },
      { api: 'PermissionsAndroid', platform: 'android' },
      { api: 'ActionSheetIOS', platform: 'ios' },
    ];

    for (const { api, platform: apiPlatform } of platformSpecificAPIs) {
      if (code.includes(api)) {
        // Check if wrapped in Platform check
        const platformCheckRegex = new RegExp(
          `Platform\\.OS\\s*===\\s*['"]${apiPlatform}['"].*${api}`,
          's'
        );

        if (!platformCheckRegex.test(code)) {
          issues.push({
            type: 'error',
            category: 'compatibility',
            message: `${api} is ${apiPlatform}-specific and should be wrapped in Platform.OS check`,
            severity: 'critical',
            fixAvailable: true,
          });
        }
      }
    }

    // Suggest using cross-platform alternatives
    if (code.includes('TouchableOpacity') && platform === 'both') {
      suggestions.push({
        title: 'Consider using Pressable',
        description: 'Pressable provides better cross-platform behavior and more features',
        category: 'compatibility',
        impact: 'low',
        codeExample: `import { Pressable } from 'react-native';

<Pressable
  onPress={handlePress}
  style={({ pressed }) => [
    styles.button,
    pressed && styles.pressed
  ]}
>
  <Text>Press me</Text>
</Pressable>`,
      });
    }

    return { issues, suggestions };
  }

  /**
   * Apply performance optimizations
   */
  private async applyPerformanceOptimizations(
    code: string
  ): Promise<{
    optimizedCode: string;
    fixedCount: number;
    suggestions: OptimizationSuggestion[];
  }> {
    let optimizedCode = code;
    let fixedCount = 0;
    const suggestions: OptimizationSuggestion[] = [];

    // 1. Replace inline styles with StyleSheet
    const inlineStyleRegex = /style={{([^}]+)}}/g;
    const inlineStyles = code.matchAll(inlineStyleRegex);
    
    for (const match of inlineStyles) {
      suggestions.push({
        title: 'Move inline styles to StyleSheet',
        description: 'Using StyleSheet.create() improves performance by avoiding style object recreation',
        category: 'performance',
        impact: 'medium',
        codeExample: `const styles = StyleSheet.create({
  container: ${match[1]}
});`,
      });
    }

    // 2. Optimize image usage
    if (code.includes('<Image') && !code.includes('resizeMode')) {
      suggestions.push({
        title: 'Specify Image resizeMode',
        description: 'Always specify resizeMode for images to improve performance',
        category: 'performance',
        impact: 'low',
      });
    }

    // 3. Check for unnecessary re-renders
    if (code.includes('useState') && !code.includes('useCallback') && !code.includes('useMemo')) {
      suggestions.push({
        title: 'Consider memoization',
        description: 'Use useCallback and useMemo to prevent unnecessary re-renders',
        category: 'performance',
        impact: 'high',
        codeExample: `const memoizedCallback = useCallback(() => {
  // Your callback logic
}, [dependencies]);

const memoizedValue = useMemo(() => {
  // Expensive computation
}, [dependencies]);`,
      });
    }

    // 4. Optimize list rendering
    if (code.includes('ScrollView') && code.includes('.map(')) {
      optimizedCode = optimizedCode.replace(
        /<ScrollView([^>]*)>([\s\S]*?)\.map\(([\s\S]*?)<\/ScrollView>/g,
        (match, attrs, before, mapContent) => {
          fixedCount++;
          return `<FlatList${attrs}
  data={yourData}
  renderItem={({ item }) => ${mapContent.trim()}
  keyExtractor={(item) => item.id}
/>`;
        }
      );

      suggestions.push({
        title: 'Use FlatList for long lists',
        description: 'FlatList provides better performance for long lists with virtualization',
        category: 'performance',
        impact: 'high',
      });
    }

    return { optimizedCode, fixedCount, suggestions };
  }

  /**
   * Check security issues
   */
  private async checkSecurity(
    code: string
  ): Promise<{
    issues: OptimizationIssue[];
    suggestions: OptimizationSuggestion[];
  }> {
    const issues: OptimizationIssue[] = [];
    const suggestions: OptimizationSuggestion[] = [];

    // Check for hardcoded sensitive data
    const sensitivePatterns = [
      { pattern: /api[_-]?key\s*[:=]\s*['"][^'"]+['"]/gi, type: 'API key' },
      { pattern: /password\s*[:=]\s*['"][^'"]+['"]/gi, type: 'password' },
      { pattern: /secret\s*[:=]\s*['"][^'"]+['"]/gi, type: 'secret' },
    ];

    for (const { pattern, type } of sensitivePatterns) {
      if (pattern.test(code)) {
        issues.push({
          type: 'error',
          category: 'security',
          message: `Hardcoded ${type} detected. Use environment variables instead`,
          severity: 'critical',
          fixAvailable: false,
        });
      }
    }

    // Check for unsafe WebView usage
    if (code.includes('WebView') && !code.includes('originWhitelist')) {
      issues.push({
        type: 'warning',
        category: 'security',
        message: 'WebView should use originWhitelist for security',
        severity: 'major',
        fixAvailable: true,
      });

      suggestions.push({
        title: 'Secure WebView configuration',
        description: 'Always configure WebView with proper security settings',
        category: 'security',
        impact: 'high',
        codeExample: `<WebView
  source={{ uri: 'https://example.com' }}
  originWhitelist={['https://*']}
  javaScriptEnabled={false}
  domStorageEnabled={false}
/>`,
      });
    }

    return { issues, suggestions };
  }

  /**
   * Helper methods
   */

  private categorizeESLintRule(ruleId: string): OptimizationIssue['category'] {
    if (ruleId.includes('a11y') || ruleId.includes('accessibility')) {
      return 'accessibility';
    }
    if (ruleId.includes('performance') || ruleId.includes('memo')) {
      return 'performance';
    }
    if (ruleId.includes('security')) {
      return 'security';
    }
    if (ruleId.includes('native')) {
      return 'compatibility';
    }
    return 'style';
  }

  private visitTypeScriptNode(
    node: ts.Node,
    sourceFile: ts.SourceFile,
    issues: OptimizationIssue[],
    suggestions: OptimizationSuggestion[]
  ): void {
    // Check for 'any' type usage
    if (ts.isTypeReferenceNode(node) && node.typeName.getText() === 'any') {
      const { line, character } = sourceFile.getLineAndCharacterOfPosition(node.getStart());
      issues.push({
        type: 'warning',
        category: 'style',
        message: 'Avoid using "any" type. Use specific types instead',
        line: line + 1,
        column: character + 1,
        severity: 'minor',
        fixAvailable: false,
      });
    }

    // Recursively visit child nodes
    ts.forEachChild(node, (child) => {
      this.visitTypeScriptNode(child, sourceFile, issues, suggestions);
    });
  }

  private calculateScores(
    issues: OptimizationIssue[],
    suggestions: OptimizationSuggestion[]
  ): {
    overall: number;
    accessibility: number;
    performance: number;
    compatibility: number;
  } {
    // Calculate category scores
    const categoryScores = {
      accessibility: 100,
      performance: 100,
      compatibility: 100,
    };

    // Deduct points for issues
    for (const issue of issues) {
      const deduction = issue.severity === 'critical' ? 20 : 
                       issue.severity === 'major' ? 10 : 5;
      
      if (issue.category in categoryScores) {
        categoryScores[issue.category as keyof typeof categoryScores] -= deduction;
      }
    }

    // Ensure scores don't go below 0
    Object.keys(categoryScores).forEach(key => {
      categoryScores[key as keyof typeof categoryScores] = 
        Math.max(0, categoryScores[key as keyof typeof categoryScores]);
    });

    // Calculate overall score
    const overall = Math.round(
      (categoryScores.accessibility + 
       categoryScores.performance + 
       categoryScores.compatibility) / 3
    );

    return {
      overall,
      ...categoryScores,
    };
  }

  private async storeOptimizationResults(
    projectId: string,
    results: any
  ): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('code_optimization_history')
        .insert({
          project_id: projectId,
          original_code: results.originalCode,
          optimized_code: results.optimizedCode,
          issues: results.issues,
          suggestions: results.suggestions,
          scores: results.scores,
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error('Error storing optimization results:', error);
      }
    } catch (error) {
      console.error('Error storing optimization results:', error);
    }
  }

  /**
   * Generate optimization report
   */
  async generateOptimizationReport(
    result: OptimizationResult
  ): Promise<string> {
    let report = '# Code Optimization Report\n\n';

    // Overall score
    report += `## Overall Score: ${result.score}/100\n\n`;
    report += `- Accessibility: ${result.accessibilityScore}/100\n`;
    report += `- Performance: ${result.performanceScore}/100\n`;
    report += `- Compatibility: ${result.compatibilityScore}/100\n\n`;

    // Fixed issues
    if (result.fixedCount > 0) {
      report += `## Fixed Issues: ${result.fixedCount}\n\n`;
    }

    // Remaining issues
    if (result.issues.length > 0) {
      report += `## Issues (${result.issues.length})\n\n`;
      
      const groupedIssues = this.groupBy(result.issues, 'category');
      for (const [category, issues] of Object.entries(groupedIssues)) {
        report += `### ${category.charAt(0).toUpperCase() + category.slice(1)}\n\n`;
        for (const issue of issues) {
          report += `- **${issue.type}**: ${issue.message}`;
          if (issue.line) {
            report += ` (line ${issue.line})`;
          }
          report += '\n';
        }
        report += '\n';
      }
    }

    // Suggestions
    if (result.suggestions.length > 0) {
      report += `## Suggestions (${result.suggestions.length})\n\n`;
      
      const groupedSuggestions = this.groupBy(result.suggestions, 'impact');
      for (const [impact, suggestions] of Object.entries(groupedSuggestions)) {
        report += `### ${impact.charAt(0).toUpperCase() + impact.slice(1)} Impact\n\n`;
        for (const suggestion of suggestions) {
          report += `- **${suggestion.title}**: ${suggestion.description}\n`;
          if (suggestion.codeExample) {
            report += `\n\`\`\`typescript\n${suggestion.codeExample}\n\`\`\`\n`;
          }
        }
        report += '\n';
      }
    }

    return report;
  }

  private groupBy<T>(array: T[], key: keyof T): Record<string, T[]> {
    return array.reduce((result, item) => {
      const group = String(item[key]);
      if (!result[group]) {
        result[group] = [];
      }
      result[group].push(item);
      return result;
    }, {} as Record<string, T[]>);
  }
}