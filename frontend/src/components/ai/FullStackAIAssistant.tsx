import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { ScrollArea } from '../ui/scroll-area';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Send, Loader2, Code, Database, Server, Lightbulb, Copy, ThumbsUp, ThumbsDown } from 'lucide-react';
import { useProjectEditorStore } from '../../stores/useProjectEditorStore';
import { toast } from 'sonner';

interface FullStackAIAssistantProps {
  projectId: string;
  projectType: 'frontend-only' | 'full-stack';
}

interface AIMessage {
  id: string;
  type: 'user' | 'ai';
  content: string;
  timestamp: Date;
  codeSnippets?: CodeSnippet[];
  suggestions?: string[];
}

interface CodeSnippet {
  language: string;
  code: string;
  filename?: string;
  description?: string;
}

interface AISuggestion {
  id: string;
  type: 'component' | 'function' | 'schema' | 'improvement';
  title: string;
  description: string;
  code?: string;
  priority: 'low' | 'medium' | 'high';
}

export function FullStackAIAssistant({ projectId, projectType }: FullStackAIAssistantProps) {
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions] = useState<AISuggestion[]>([
    {
      id: '1',
      type: 'component',
      title: 'User Profile Component',
      description: 'Create a reusable user profile component with avatar and basic info',
      priority: 'high',
      code: `export function UserProfile({ user }) {\n  return (\n    <div className="profile">\n      <img src={user.avatar} alt={user.name} />\n      <h3>{user.name}</h3>\n      <p>{user.email}</p>\n    </div>\n  );\n}`,
    },
    {
      id: '2',
      type: 'function',
      title: 'Authentication Handler',
      description: 'Add Supabase authentication with sign up and login',
      priority: 'high',
    },
    {
      id: '3',
      type: 'schema',
      title: 'User Data Schema',
      description: 'Define database schema for user profiles and preferences',
      priority: 'medium',
    },
  ]);

  const {
    activeFile,
    frontendFiles,
    backendFiles,
    createFile
  } = useProjectEditorStore();

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMessage: AIMessage = {
      id: Date.now().toString(),
      type: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Simulate AI response
      await new Promise(resolve => setTimeout(resolve, 1500));

      const aiResponse: AIMessage = {
        id: (Date.now() + 1).toString(),
        type: 'ai',
        content: generateAIResponse(input),
        timestamp: new Date(),
        codeSnippets: generateCodeSnippets(input),
        suggestions: ['Consider adding error handling', 'Test with different screen sizes', 'Add accessibility attributes'],
      };

      setMessages(prev => [...prev, aiResponse]);
    } catch (error: any) {
      toast.error('Failed to get AI response: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const generateAIResponse = (userInput: string): string => {
    const input = userInput.toLowerCase();
    
    if (input.includes('component')) {
      return "I'll help you create a component. Based on your project context, here's a React Native component that follows best practices and integrates with your existing code structure.";
    }
    
    if (input.includes('database') || input.includes('schema')) {
      return "I can help you design a database schema. Let me suggest a structure that works well with Supabase and your app requirements.";
    }
    
    if (input.includes('api') || input.includes('function')) {
      return "I'll help you create an API endpoint or Edge Function. Here's a solution that integrates with your Supabase setup.";
    }
    
    return "I understand you need help with your project. Let me provide a solution that works with your current codebase and follows React Native and Supabase best practices.";
  };

  const generateCodeSnippets = (userInput: string): CodeSnippet[] => {
    const input = userInput.toLowerCase();
    
    if (input.includes('component')) {
      return [
        {
          language: 'typescript',
          filename: 'components/CustomComponent.tsx',
          description: 'React Native component with TypeScript',
          code: `import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface CustomComponentProps {
  title: string;
  onPress?: () => void;
}

export function CustomComponent({ title, onPress }: CustomComponentProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
});`,
        },
      ];
    }
    
    if (input.includes('database') || input.includes('schema')) {
      return [
        {
          language: 'sql',
          filename: 'migrations/001_create_users.sql',
          description: 'Database migration for user table',
          code: `-- Create users table
CREATE TABLE users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view own profile" ON users 
FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON users 
FOR UPDATE USING (auth.uid() = id);`,
        },
      ];
    }
    
    return [];
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success('Code copied to clipboard');
  };

  const implementSuggestion = async (suggestion: AISuggestion) => {
    if (suggestion.code) {
      try {
        const filename = `frontend/components/${suggestion.title.replace(/\s+/g, '')}.tsx`;
        await createFile(filename, suggestion.code);
        toast.success(`Created ${filename}`);
      } catch (error: any) {
        toast.error('Failed to create file: ' + error.message);
      }
    }
  };

  const getPriorityColor = (priority: AISuggestion['priority']) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-green-100 text-green-800';
    }
  };

  const getSuggestionIcon = (type: AISuggestion['type']) => {
    switch (type) {
      case 'component':
        return <Code className="h-4 w-4" />;
      case 'function':
        return <Server className="h-4 w-4" />;
      case 'schema':
        return <Database className="h-4 w-4" />;
      case 'improvement':
        return <Lightbulb className="h-4 w-4" />;
    }
  };

  return (
    <div className="h-80 flex flex-col bg-card">
      <Tabs defaultValue="chat" className="flex-1 flex flex-col">
        <div className="p-3 border-b">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="chat">AI Chat</TabsTrigger>
            <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="chat" className="flex-1 flex flex-col m-0">
          {/* Chat Messages */}
          <ScrollArea className="flex-1 p-3">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Lightbulb className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">Ask me anything about your {projectType} project!</p>
                <div className="mt-4 space-y-1 text-xs">
                  <p>• "Create a user profile component"</p>
                  <p>• "Design a database schema for posts"</p>
                  <p>• "Add authentication to my app"</p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] p-3 rounded-lg ${
                        message.type === 'user'
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted'
                      }`}
                    >
                      <p className="text-sm">{message.content}</p>
                      
                      {message.codeSnippets && message.codeSnippets.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {message.codeSnippets.map((snippet, index) => (
                            <div key={index} className="bg-gray-900 text-gray-100 p-3 rounded text-xs overflow-auto">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center space-x-2">
                                  <Badge variant="outline" className="text-xs">
                                    {snippet.language}
                                  </Badge>
                                  {snippet.filename && (
                                    <span className="text-gray-400">{snippet.filename}</span>
                                  )}
                                </div>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => copyCode(snippet.code)}
                                  className="h-6 px-2"
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                              {snippet.description && (
                                <p className="text-gray-400 text-xs mb-2">{snippet.description}</p>
                              )}
                              <pre className="whitespace-pre-wrap">{snippet.code}</pre>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {message.suggestions && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {message.suggestions.map((suggestion, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {suggestion}
                            </Badge>
                          ))}
                        </div>
                      )}
                      
                      <div className="flex items-center justify-between mt-2 text-xs opacity-70">
                        <span>{message.timestamp.toLocaleTimeString()}</span>
                        {message.type === 'ai' && (
                          <div className="flex items-center space-x-1">
                            <Button variant="ghost" size="sm" className="h-6 px-1">
                              <ThumbsUp className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-6 px-1">
                              <ThumbsDown className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex justify-start">
                    <div className="bg-muted p-3 rounded-lg">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Input */}
          <div className="p-3 border-t">
            <div className="flex space-x-2">
              <Textarea
                placeholder="Ask AI to help with your project..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                className="min-h-[60px] resize-none"
              />
              <Button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                size="sm"
                className="self-end"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="suggestions" className="flex-1 m-0 p-3 overflow-auto">
          <div className="space-y-3">
            {suggestions.map((suggestion) => (
              <Card key={suggestion.id} className="p-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3">
                    {getSuggestionIcon(suggestion.type)}
                    <div className="flex-1">
                      <h4 className="font-medium text-sm">{suggestion.title}</h4>
                      <p className="text-xs text-muted-foreground mt-1">{suggestion.description}</p>
                      <div className="flex items-center space-x-2 mt-2">
                        <Badge variant="outline" className="text-xs">
                          {suggestion.type}
                        </Badge>
                        <Badge variant="outline" className={`text-xs ${getPriorityColor(suggestion.priority)}`}>
                          {suggestion.priority}
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => implementSuggestion(suggestion)}
                  >
                    Implement
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}