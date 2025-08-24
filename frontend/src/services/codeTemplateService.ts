import type { ProjectContext } from '../types/editor';

export interface CodeTemplate {
  id: string;
  name: string;
  description: string;
  category: 'component' | 'screen' | 'hook' | 'service' | 'function' | 'migration' | 'api';
  language: 'typescript' | 'javascript' | 'sql';
  tags: string[];
  template: string;
  requiredInputs?: TemplateInput[];
  files?: TemplateFile[];
}

export interface TemplateInput {
  key: string;
  label: string;
  type: 'text' | 'select' | 'boolean' | 'array';
  required: boolean;
  placeholder?: string;
  options?: string[];
  defaultValue?: any;
}

export interface TemplateFile {
  path: string;
  content: string;
  language: 'typescript' | 'javascript' | 'sql';
}

export interface GeneratedCode {
  files: TemplateFile[];
  instructions?: string[];
  dependencies?: string[];
}

class CodeTemplateService {
  private templates: CodeTemplate[] = [];

  constructor() {
    this.initializeTemplates();
  }

  private initializeTemplates() {
    this.templates = [
      // React Native Components
      {
        id: 'rn-functional-component',
        name: 'React Native Functional Component',
        description: 'A functional React Native component with TypeScript',
        category: 'component',
        language: 'typescript',
        tags: ['react-native', 'component', 'typescript'],
        template: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface {{componentName}}Props {
  {{#if hasTitle}}
  title?: string;
  {{/if}}
  {{#each customProps}}
  {{name}}{{#unless required}}?{{/unless}}: {{type}};
  {{/each}}
}

export function {{componentName}}({{#if hasProps}}{ {{#if hasTitle}}title{{/if}}{{#each customProps}}, {{name}}{{/each}} }: {{componentName}}Props{{/if}}) {
  return (
    <View style={styles.container}>
      {{#if hasTitle}}
      <Text style={styles.title}>{title || '{{componentName}}'}</Text>
      {{/if}}
      {{#each elements}}
      <{{tag}}{{#if props}} {{props}}{{/if}}>{{content}}</{{tag}}>
      {{/each}}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    {{#if backgroundColor}}
    backgroundColor: '{{backgroundColor}}',
    {{/if}}
  },
  {{#if hasTitle}}
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  {{/if}}
  {{#each customStyles}}
  {{name}}: {
    {{styles}}
  },
  {{/each}}
});`,
        requiredInputs: [
          { key: 'componentName', label: 'Component Name', type: 'text', required: true, placeholder: 'MyComponent' },
          { key: 'hasTitle', label: 'Include Title Prop', type: 'boolean', required: false, defaultValue: true },
          { key: 'backgroundColor', label: 'Background Color', type: 'text', required: false, placeholder: '#ffffff' },
        ],
      },

      // React Native Screens
      {
        id: 'rn-screen-with-navigation',
        name: 'React Native Screen with Navigation',
        description: 'A complete screen component with navigation and Supabase integration',
        category: 'screen',
        language: 'typescript',
        tags: ['react-native', 'screen', 'navigation', 'supabase'],
        template: `import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { supabase } from '../services/supabase';
{{#if needsAuth}}
import { useAuth } from '../hooks/useAuth';
{{/if}}

interface {{screenName}}Props {
  route?: any;
}

export function {{screenName}}({ route }: {{screenName}}Props) {
  const navigation = useNavigation();
  {{#if needsAuth}}
  const { user } = useAuth();
  {{/if}}
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<{{dataType}}[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      
      {{#if needsAuth}}
      if (!user) return;
      {{/if}}
      
      const { data: result, error } = await supabase
        .from('{{tableName}}')
        .select('*')
        {{#if needsAuth}}
        .eq('user_id', user.id)
        {{/if}}
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      setData(result || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{{screenTitle}}</Text>
      </View>
      
      <View style={styles.content}>
        {data.map((item, index) => (
          <View key={item.id || index} style={styles.item}>
            <Text style={styles.itemTitle}>{item.title || item.name}</Text>
            {{#if showDescription}}
            <Text style={styles.itemDescription}>{item.description}</Text>
            {{/if}}
          </View>
        ))}
        
        {data.length === 0 && (
          <Text style={styles.emptyText}>No data found</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    padding: 20,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  content: {
    padding: 20,
  },
  item: {
    backgroundColor: '#fff',
    padding: 16,
    marginBottom: 12,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  {{#if showDescription}}
  itemDescription: {
    fontSize: 14,
    color: '#666',
  },
  {{/if}}
  emptyText: {
    textAlign: 'center',
    color: '#666',
    fontSize: 16,
    marginTop: 40,
  },
});`,
        requiredInputs: [
          { key: 'screenName', label: 'Screen Name', type: 'text', required: true, placeholder: 'HomeScreen' },
          { key: 'screenTitle', label: 'Screen Title', type: 'text', required: true, placeholder: 'Home' },
          { key: 'tableName', label: 'Supabase Table Name', type: 'text', required: true, placeholder: 'posts' },
          { key: 'dataType', label: 'Data Type Interface', type: 'text', required: true, placeholder: 'Post' },
          { key: 'needsAuth', label: 'Requires Authentication', type: 'boolean', required: false, defaultValue: true },
          { key: 'showDescription', label: 'Show Item Description', type: 'boolean', required: false, defaultValue: true },
        ],
      },

      // Custom Hooks
      {
        id: 'custom-hook',
        name: 'Custom React Hook',
        description: 'A custom React hook with TypeScript',
        category: 'hook',
        language: 'typescript',
        tags: ['react', 'hook', 'typescript'],
        template: `import { useState, useEffect{{#if needsCallback}}, useCallback{{/if}} } from 'react';
{{#if usesSupabase}}
import { supabase } from '../services/supabase';
{{/if}}

{{#if hasInterface}}
interface {{interfaceName}} {
  {{#each interfaceFields}}
  {{name}}: {{type}};
  {{/each}}
}
{{/if}}

export function {{hookName}}({{#if hasParams}}{{params}}{{/if}}) {
  const [{{stateName}}, set{{capitalizedStateName}}] = useState<{{stateType}}>({{defaultValue}});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  {{#if hasEffect}}
  useEffect(() => {
    {{effectBody}}
  }, [{{effectDependencies}}]);
  {{/if}}

  {{#if needsCallback}}
  const {{callbackName}} = useCallback(async ({{callbackParams}}) => {
    try {
      setLoading(true);
      setError(null);
      
      {{callbackBody}}
      
    } catch (err: any) {
      setError(err.message);
      console.error('{{hookName}} error:', err);
    } finally {
      setLoading(false);
    }
  }, [{{callbackDependencies}}]);
  {{/if}}

  return {
    {{stateName}},
    set{{capitalizedStateName}},
    loading,
    error,
    {{#if needsCallback}}
    {{callbackName}},
    {{/if}}
  };
}`,
        requiredInputs: [
          { key: 'hookName', label: 'Hook Name', type: 'text', required: true, placeholder: 'useCustomHook' },
          { key: 'stateName', label: 'State Variable Name', type: 'text', required: true, placeholder: 'data' },
          { key: 'stateType', label: 'State Type', type: 'text', required: true, placeholder: 'any[]' },
          { key: 'defaultValue', label: 'Default Value', type: 'text', required: true, placeholder: '[]' },
          { key: 'usesSupabase', label: 'Uses Supabase', type: 'boolean', required: false, defaultValue: false },
        ],
      },

      // Supabase Edge Functions
      {
        id: 'supabase-edge-function',
        name: 'Supabase Edge Function',
        description: 'A Supabase Edge Function with TypeScript',
        category: 'function',
        language: 'typescript',
        tags: ['supabase', 'edge-function', 'serverless'],
        template: `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
{{#if needsCors}}
import { corsHeaders } from '../_shared/cors.ts'
{{/if}}

{{#if hasInterface}}
interface {{requestInterface}} {
  {{#each requestFields}}
  {{name}}{{#unless required}}?{{/unless}}: {{type}};
  {{/each}}
}
{{/if}}

serve(async (req) => {
  {{#if needsCors}}
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  {{/if}}

  try {
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      {{#if needsServiceRole}}
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {{else}}
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
      {{/if}}
    )

    {{#if needsAuth}}
    // Get authenticated user
    const {
      data: { user },
      error: authError,
    } = await supabaseClient.auth.getUser()

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      )
    }
    {{/if}}

    // Parse request body
    {{#if hasRequestBody}}
    const body: {{requestInterface}} = await req.json()
    {{/if}}

    // Function logic
    {{functionBody}}

    return new Response(
      JSON.stringify(result),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  } catch (error) {
    console.error('Function error:', error)
    
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }
})`,
        requiredInputs: [
          { key: 'functionName', label: 'Function Name', type: 'text', required: true, placeholder: 'my-function' },
          { key: 'needsAuth', label: 'Requires Authentication', type: 'boolean', required: false, defaultValue: true },
          { key: 'needsServiceRole', label: 'Use Service Role Key', type: 'boolean', required: false, defaultValue: false },
          { key: 'needsCors', label: 'Include CORS Headers', type: 'boolean', required: false, defaultValue: true },
          { key: 'hasRequestBody', label: 'Has Request Body', type: 'boolean', required: false, defaultValue: true },
        ],
      },

      // Database Migrations
      {
        id: 'supabase-migration',
        name: 'Database Migration',
        description: 'A Supabase database migration with RLS policies',
        category: 'migration',
        language: 'sql',
        tags: ['supabase', 'migration', 'database', 'sql'],
        template: `-- Migration: {{migrationName}}
-- Description: {{description}}
-- Created: {{timestamp}}

{{#if createTable}}
-- Create {{tableName}} table
CREATE TABLE {{tableName}} (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  {{#each columns}}
  {{name}} {{type}}{{#unless nullable}} NOT NULL{{/unless}}{{#if defaultValue}} DEFAULT {{defaultValue}}{{/if}},
  {{/each}}
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
{{/if}}

{{#if hasIndexes}}
-- Create indexes
{{#each indexes}}
CREATE {{#if unique}}UNIQUE {{/if}}INDEX {{name}} ON {{../tableName}} ({{columns}});
{{/each}}
{{/if}}

{{#if hasForeignKeys}}
-- Add foreign key constraints
{{#each foreignKeys}}
ALTER TABLE {{../tableName}} ADD CONSTRAINT {{constraintName}}
  FOREIGN KEY ({{column}}) REFERENCES {{referencedTable}}({{referencedColumn}})
  {{#if onDelete}}ON DELETE {{onDelete}}{{/if}};
{{/each}}
{{/if}}

{{#if enableRLS}}
-- Enable Row Level Security
ALTER TABLE {{tableName}} ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
{{#each rlsPolicies}}
CREATE POLICY "{{name}}" ON {{../tableName}}
  FOR {{operation}} 
  {{#if roles}}TO {{roles}}{{/if}}
  USING ({{condition}});
{{/each}}
{{/if}}

{{#if hasUpdatedAtTrigger}}
-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_{{tableName}}_updated_at 
  BEFORE UPDATE ON {{tableName}} 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();
{{/if}}

{{#if hasCustomSQL}}
-- Custom SQL
{{customSQL}}
{{/if}}`,
        requiredInputs: [
          { key: 'migrationName', label: 'Migration Name', type: 'text', required: true, placeholder: 'create_users_table' },
          { key: 'description', label: 'Description', type: 'text', required: true, placeholder: 'Create users table with basic fields' },
          { key: 'tableName', label: 'Table Name', type: 'text', required: true, placeholder: 'users' },
          { key: 'createTable', label: 'Create New Table', type: 'boolean', required: false, defaultValue: true },
          { key: 'enableRLS', label: 'Enable Row Level Security', type: 'boolean', required: false, defaultValue: true },
          { key: 'hasUpdatedAtTrigger', label: 'Add Updated At Trigger', type: 'boolean', required: false, defaultValue: true },
        ],
      },
    ];
  }

  /**
   * Get all available templates
   */
  getTemplates(): CodeTemplate[] {
    return this.templates;
  }

  /**
   * Get templates by category
   */
  getTemplatesByCategory(category: CodeTemplate['category']): CodeTemplate[] {
    return this.templates.filter(template => template.category === category);
  }

  /**
   * Get template by ID
   */
  getTemplate(id: string): CodeTemplate | null {
    return this.templates.find(template => template.id === id) || null;
  }

  /**
   * Generate code from template
   */
  generateCode(
    templateId: string,
    inputs: Record<string, any>,
    context?: ProjectContext
  ): GeneratedCode {
    const template = this.getTemplate(templateId);
    if (!template) {
      throw new Error(`Template not found: ${templateId}`);
    }

    // Process template with inputs
    const processedContent = this.processTemplate(template.template, inputs, context);
    
    // Generate file path
    const filePath = this.generateFilePath(template, inputs, context);

    const files: TemplateFile[] = [
      {
        path: filePath,
        content: processedContent,
        language: template.language,
      }
    ];

    // Add additional files if template specifies them
    if (template.files) {
      template.files.forEach(file => {
        files.push({
          ...file,
          content: this.processTemplate(file.content, inputs, context),
        });
      });
    }

    return {
      files,
      instructions: this.generateInstructions(template, inputs),
      dependencies: this.extractDependencies(template, inputs),
    };
  }

  /**
   * Process template string with inputs
   */
  private processTemplate(
    template: string,
    inputs: Record<string, any>,
    context?: ProjectContext
  ): string {
    let processed = template;

    // Simple template processing (replace {{variable}} with values)
    Object.entries(inputs).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      processed = processed.replace(regex, String(value));
    });

    // Add timestamp if needed
    processed = processed.replace(/{{timestamp}}/g, new Date().toISOString());

    // Add capitalized versions
    Object.entries(inputs).forEach(([key, value]) => {
      if (typeof value === 'string') {
        const capitalizedKey = key.charAt(0).toUpperCase() + key.slice(1);
        const capitalizedValue = value.charAt(0).toUpperCase() + value.slice(1);
        
        processed = processed.replace(
          new RegExp(`{{capitalized${capitalizedKey}}}`, 'g'),
          capitalizedValue
        );
      }
    });

    return processed;
  }

  /**
   * Generate file path for template
   */
  private generateFilePath(
    template: CodeTemplate,
    inputs: Record<string, any>,
    context?: ProjectContext
  ): string {
    const basePath = context?.projectType === 'full-stack' ? 'frontend' : '';
    
    switch (template.category) {
      case 'component':
        return `${basePath}/components/${inputs.componentName || 'MyComponent'}.tsx`;
      case 'screen':
        return `${basePath}/screens/${inputs.screenName || 'MyScreen'}.tsx`;
      case 'hook':
        return `${basePath}/hooks/${inputs.hookName || 'useCustomHook'}.ts`;
      case 'service':
        return `${basePath}/services/${inputs.serviceName || 'myService'}.ts`;
      case 'function':
        return `backend/functions/${inputs.functionName || 'my-function'}/index.ts`;
      case 'migration':
        const timestamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0].replace('T', '');
        return `backend/migrations/${timestamp}_${inputs.migrationName || 'migration'}.sql`;
      default:
        return `${inputs.fileName || 'generated-file'}.${template.language === 'sql' ? 'sql' : 'ts'}`;
    }
  }

  /**
   * Generate instructions for using the generated code
   */
  private generateInstructions(
    template: CodeTemplate,
    inputs: Record<string, any>
  ): string[] {
    const instructions: string[] = [];

    switch (template.category) {
      case 'component':
        instructions.push(
          `Import the component: import { ${inputs.componentName} } from './components/${inputs.componentName}';`,
          'Use the component in your JSX: <' + inputs.componentName + ' />'
        );
        break;
      case 'screen':
        instructions.push(
          'Add the screen to your navigation stack',
          'Update your navigation types if using TypeScript'
        );
        break;
      case 'hook':
        instructions.push(
          `Import the hook: import { ${inputs.hookName} } from './hooks/${inputs.hookName}';`,
          'Use the hook in your component'
        );
        break;
      case 'function':
        instructions.push(
          'Deploy the function using: supabase functions deploy',
          'Test the function using the Supabase dashboard or API'
        );
        break;
      case 'migration':
        instructions.push(
          'Run the migration using: supabase db push',
          'Verify the changes in your database'
        );
        break;
    }

    return instructions;
  }

  /**
   * Extract dependencies from template
   */
  private extractDependencies(
    template: CodeTemplate,
    inputs: Record<string, any>
  ): string[] {
    const dependencies: string[] = [];

    // Check for common dependencies in template content
    if (template.template.includes('@react-navigation')) {
      dependencies.push('@react-navigation/native', '@react-navigation/stack');
    }
    
    if (template.template.includes('supabase')) {
      dependencies.push('@supabase/supabase-js');
    }

    return dependencies;
  }

  /**
   * Search templates by query
   */
  searchTemplates(query: string): CodeTemplate[] {
    const lowercaseQuery = query.toLowerCase();
    
    return this.templates.filter(template =>
      template.name.toLowerCase().includes(lowercaseQuery) ||
      template.description.toLowerCase().includes(lowercaseQuery) ||
      template.tags.some(tag => tag.toLowerCase().includes(lowercaseQuery))
    );
  }
}

export const codeTemplateService = new CodeTemplateService();