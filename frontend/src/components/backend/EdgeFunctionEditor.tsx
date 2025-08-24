import React, { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Play, Save, Plus, Trash2, Upload, Download, Settings, Loader2, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import type { EdgeFunction, DeploymentResult, TestResult } from '../../types/editor';

interface EdgeFunctionEditorProps {
  projectId: string;
  className?: string;
  onFunctionChange?: (functions: EdgeFunction[]) => void;
}

interface FunctionTemplate {
  name: string;
  description: string;
  code: string;
  category: 'api' | 'webhook' | 'cron' | 'auth';
}

const FUNCTION_TEMPLATES: FunctionTemplate[] = [
  {
    name: 'Hello World',
    description: 'Simple HTTP handler that returns a greeting',
    category: 'api',
    code: `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

serve(async (req: Request) => {
  const { name } = await req.json()
  
  const data = {
    message: \`Hello \${name || 'World'}!\`,
    timestamp: new Date().toISOString()
  }

  return new Response(
    JSON.stringify(data),
    { 
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      } 
    }
  )
})`,
  },
  {
    name: 'Database Query',
    description: 'Function that queries the Supabase database',
    category: 'api',
    code: `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_ANON_KEY') ?? '',
    {
      global: {
        headers: { Authorization: req.headers.get('Authorization')! },
      },
    }
  )

  try {
    const { data, error } = await supabaseClient
      .from('users')
      .select('*')
      .limit(10)

    if (error) throw error

    return new Response(JSON.stringify({ data }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})`,
  },
  {
    name: 'Auth Webhook',
    description: 'Webhook handler for authentication events',
    category: 'webhook',
    code: `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req: Request) => {
  const payload = await req.json()
  
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    if (payload.type === 'user.created') {
      // Create user profile
      const { error } = await supabaseAdmin
        .from('profiles')
        .insert({
          user_id: payload.record.id,
          email: payload.record.email,
          full_name: payload.record.user_metadata?.full_name || null,
        })

      if (error) throw error
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})`,
  },
];

export function EdgeFunctionEditor({ projectId, className, onFunctionChange }: EdgeFunctionEditorProps) {
  const [functions, setFunctions] = useState<EdgeFunction[]>([]);
  const [selectedFunction, setSelectedFunction] = useState<string | null>(null);
  const [isDeploying, setIsDeploying] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testPayload, setTestPayload] = useState('{}');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [showNewFunction, setShowNewFunction] = useState(false);
  const [newFunctionName, setNewFunctionName] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  // Mock initial data
  useEffect(() => {
    const mockFunctions: EdgeFunction[] = [
      {
        id: '1',
        name: 'hello-world',
        slug: 'hello-world',
        status: 'active',
        version: 1,
        code: FUNCTION_TEMPLATES[0].code,
        created_at: '2024-01-15T10:30:00Z',
        updated_at: '2024-01-15T10:30:00Z',
      },
      {
        id: '2',
        name: 'user-profile-webhook',
        slug: 'user-profile-webhook',
        status: 'active',
        version: 2,
        code: FUNCTION_TEMPLATES[2].code,
        created_at: '2024-01-16T14:20:00Z',
        updated_at: '2024-01-17T09:15:00Z',
      },
    ];

    setFunctions(mockFunctions);
    if (mockFunctions.length > 0) {
      setSelectedFunction(mockFunctions[0].id);
    }
  }, []);

  const getSelectedFunction = (): EdgeFunction | null => {
    return functions.find(f => f.id === selectedFunction) || null;
  };

  const createFunction = () => {
    if (!newFunctionName.trim()) {
      toast.error('Please enter a function name');
      return;
    }

    const template = FUNCTION_TEMPLATES.find(t => t.name === selectedTemplate);
    const slug = newFunctionName.toLowerCase().replace(/[^a-z0-9]/g, '-');

    const newFunction: EdgeFunction = {
      id: Date.now().toString(),
      name: newFunctionName,
      slug,
      status: 'inactive',
      version: 1,
      code: template?.code || FUNCTION_TEMPLATES[0].code,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setFunctions(prev => [...prev, newFunction]);
    setSelectedFunction(newFunction.id);
    setNewFunctionName('');
    setSelectedTemplate('');
    setShowNewFunction(false);
    onFunctionChange?.([...functions, newFunction]);
    toast.success(`Function "${newFunction.name}" created`);
  };

  const deleteFunction = (functionId: string) => {
    const func = functions.find(f => f.id === functionId);
    if (!func) return;

    if (confirm(`Are you sure you want to delete function "${func.name}"?`)) {
      const newFunctions = functions.filter(f => f.id !== functionId);
      setFunctions(newFunctions);
      if (selectedFunction === functionId) {
        setSelectedFunction(newFunctions.length > 0 ? newFunctions[0].id : null);
      }
      onFunctionChange?.(newFunctions);
      toast.success(`Function "${func.name}" deleted`);
    }
  };

  const updateFunctionCode = (code: string) => {
    if (!selectedFunction) return;

    setFunctions(prev => prev.map(func => 
      func.id === selectedFunction
        ? { ...func, code, updated_at: new Date().toISOString() }
        : func
    ));
  };

  const deployFunction = async () => {
    const func = getSelectedFunction();
    if (!func) return;

    setIsDeploying(true);

    try {
      // Mock deployment
      await new Promise(resolve => setTimeout(resolve, 2000));

      setFunctions(prev => prev.map(f => 
        f.id === selectedFunction
          ? { ...f, status: 'active', version: f.version + 1 }
          : f
      ));

      toast.success(`Function "${func.name}" deployed successfully`);
    } catch (error: any) {
      toast.error('Deployment failed: ' + error.message);
    } finally {
      setIsDeploying(false);
    }
  };

  const testFunction = async () => {
    const func = getSelectedFunction();
    if (!func) return;

    setIsTesting(true);

    try {
      let payload;
      try {
        payload = JSON.parse(testPayload);
      } catch {
        throw new Error('Invalid JSON payload');
      }

      // Mock API call
      await new Promise(resolve => setTimeout(resolve, 1500));

      const mockResult: TestResult = {
        success: true,
        response: {
          message: 'Hello World!',
          timestamp: new Date().toISOString(),
          payload,
        },
        duration: 1500,
      };

      setTestResult(mockResult);
      toast.success('Function tested successfully');
    } catch (error: any) {
      const errorResult: TestResult = {
        success: false,
        error: error.message,
        duration: 100,
      };
      
      setTestResult(errorResult);
      toast.error('Function test failed: ' + error.message);
    } finally {
      setIsTesting(false);
    }
  };

  const getStatusColor = (status: EdgeFunction['status']) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'inactive':
        return 'bg-gray-100 text-gray-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className={`h-full flex flex-col ${className}`}>
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Edge Functions</h3>
          <Button variant="outline" size="sm" onClick={() => setShowNewFunction(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Function
          </Button>
        </div>
      </div>

      {showNewFunction && (
        <div className="p-4 border-b bg-muted/50 space-y-3">
          <Input
            placeholder="Function name (e.g., send-email)"
            value={newFunctionName}
            onChange={(e) => setNewFunctionName(e.target.value)}
          />
          
          <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
            <SelectTrigger>
              <SelectValue placeholder="Choose a template" />
            </SelectTrigger>
            <SelectContent>
              {FUNCTION_TEMPLATES.map((template) => (
                <SelectItem key={template.name} value={template.name}>
                  <div className="flex items-center space-x-2">
                    <Badge variant="outline" className="text-xs">
                      {template.category}
                    </Badge>
                    <span>{template.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <div className="flex items-center space-x-2">
            <Button onClick={createFunction} size="sm">
              Create Function
            </Button>
            <Button variant="outline" onClick={() => setShowNewFunction(false)} size="sm">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 flex">
        {/* Functions Sidebar */}
        <div className="w-1/3 border-r p-4">
          <h4 className="font-medium mb-3">Functions</h4>
          <div className="space-y-2">
            {functions.map((func) => (
              <Card
                key={func.id}
                className={`cursor-pointer transition-colors ${
                  selectedFunction === func.id ? 'bg-accent' : ''
                }`}
                onClick={() => setSelectedFunction(func.id)}
              >
                <CardContent className="p-3">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{func.name}</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteFunction(func.id);
                        }}
                        className="h-6 w-6 p-0"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                    
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-xs ${getStatusColor(func.status)}`}>
                        {func.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">v{func.version}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Function Editor */}
        <div className="flex-1 p-4">
          {selectedFunction ? (
            <Tabs defaultValue="code" className="h-full">
              <div className="flex items-center justify-between mb-4">
                <TabsList>
                  <TabsTrigger value="code">Code</TabsTrigger>
                  <TabsTrigger value="test">Test</TabsTrigger>
                  <TabsTrigger value="settings">Settings</TabsTrigger>
                  <TabsTrigger value="logs">Logs</TabsTrigger>
                </TabsList>

                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={testFunction}
                    disabled={isTesting}
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Test
                  </Button>
                  
                  <Button
                    onClick={deployFunction}
                    disabled={isDeploying}
                    size="sm"
                  >
                    {isDeploying ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-2" />
                    )}
                    Deploy
                  </Button>
                </div>
              </div>

              <TabsContent value="code" className="h-full">
                <div className="h-full flex flex-col">
                  <div className="flex-1">
                    <Textarea
                      value={getSelectedFunction()?.code || ''}
                      onChange={(e) => updateFunctionCode(e.target.value)}
                      className="h-full font-mono text-sm resize-none"
                      placeholder="Enter your function code here..."
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="test" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Test Function</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-2 block">Request Payload (JSON)</label>
                      <Textarea
                        value={testPayload}
                        onChange={(e) => setTestPayload(e.target.value)}
                        placeholder='{"name": "World", "message": "Hello"}'
                        rows={6}
                        className="font-mono text-sm"
                      />
                    </div>

                    <Button
                      onClick={testFunction}
                      disabled={isTesting}
                      className="w-full"
                    >
                      {isTesting ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4 mr-2" />
                      )}
                      Run Test
                    </Button>
                  </CardContent>
                </Card>

                {testResult && (
                  <Card>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Test Result</CardTitle>
                        <div className="flex items-center space-x-2">
                          {testResult.success ? (
                            <CheckCircle className="h-5 w-5 text-green-600" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-600" />
                          )}
                          <Badge variant="outline">
                            {testResult.duration}ms
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div>
                        <h4 className="text-sm font-medium mb-2">
                          {testResult.success ? 'Response' : 'Error'}
                        </h4>
                        <pre className="text-sm bg-muted p-3 rounded overflow-auto max-h-64">
                          {testResult.success
                            ? JSON.stringify(testResult.response, null, 2)
                            : testResult.error
                          }
                        </pre>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="settings" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Function Settings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Settings configuration coming soon...</p>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="logs" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle>Function Logs</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground">Real-time logs coming soon...</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          ) : (
            <div className="h-full flex items-center justify-center">
              <div className="text-center text-muted-foreground">
                <Settings className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">No Function Selected</p>
                <p className="text-sm">Select a function from the sidebar to edit or create a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}