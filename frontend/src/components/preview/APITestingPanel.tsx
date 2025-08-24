import React, { useState } from 'react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Play, Loader2, Copy, Download } from 'lucide-react';
import { toast } from 'sonner';

interface APITestingPanelProps {
  projectId: string;
  supabaseConnected: boolean;
  className?: string;
}

interface APIRequest {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

interface APIResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
  responseTime: number;
}

export function APITestingPanel({ projectId, supabaseConnected, className }: APITestingPanelProps) {
  const [request, setRequest] = useState<APIRequest>({
    method: 'GET',
    url: '',
    headers: {},
    body: '',
  });
  const [response, setResponse] = useState<APIResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'rest' | 'graphql' | 'auth'>('rest');

  const handleSendRequest = async () => {
    if (!request.url.trim()) {
      toast.error('Please enter a URL');
      return;
    }

    setIsLoading(true);
    const startTime = Date.now();

    try {
      const fetchOptions: RequestInit = {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
          ...request.headers,
        },
      };

      if (request.method !== 'GET' && request.body) {
        fetchOptions.body = request.body;
      }

      const res = await fetch(request.url, fetchOptions);
      const responseBody = await res.text();
      const responseTime = Date.now() - startTime;

      setResponse({
        status: res.status,
        statusText: res.statusText,
        headers: Object.fromEntries(res.headers.entries()),
        body: responseBody,
        responseTime,
      });

      toast.success(`Request completed in ${responseTime}ms`);
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      setResponse({
        status: 0,
        statusText: 'Error',
        headers: {},
        body: error.message,
        responseTime,
      });

      toast.error('Request failed: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyResponse = () => {
    if (response) {
      navigator.clipboard.writeText(response.body);
      toast.success('Response copied to clipboard');
    }
  };

  const handleExportRequest = () => {
    const exportData = {
      request,
      response,
      timestamp: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: 'application/json',
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `api-test-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Request exported');
  };

  const getStatusColor = (status: number) => {
    if (status >= 200 && status < 300) return 'bg-green-500';
    if (status >= 300 && status < 400) return 'bg-yellow-500';
    if (status >= 400 && status < 500) return 'bg-red-500';
    if (status >= 500) return 'bg-red-700';
    return 'bg-gray-500';
  };

  return (
    <div className={`flex flex-col ${className}`}>
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as any)} className="flex-1 flex flex-col">
        <div className="p-3 border-b">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="rest">REST API</TabsTrigger>
            <TabsTrigger value="graphql">GraphQL</TabsTrigger>
            <TabsTrigger value="auth">Auth Testing</TabsTrigger>
          </TabsList>
        </div>

        <div className="flex-1 overflow-auto">
          <TabsContent value="rest" className="m-0 p-3 space-y-4">
            {/* Request Builder */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Request</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Method and URL */}
                <div className="flex gap-2">
                  <Select
                    value={request.method}
                    onValueChange={(value) => setRequest(prev => ({ ...prev, method: value }))}
                  >
                    <SelectTrigger className="w-32">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="GET">GET</SelectItem>
                      <SelectItem value="POST">POST</SelectItem>
                      <SelectItem value="PUT">PUT</SelectItem>
                      <SelectItem value="PATCH">PATCH</SelectItem>
                      <SelectItem value="DELETE">DELETE</SelectItem>
                    </SelectContent>
                  </Select>
                  
                  <Input
                    placeholder="Enter URL (e.g., https://api.example.com/endpoint)"
                    value={request.url}
                    onChange={(e) => setRequest(prev => ({ ...prev, url: e.target.value }))}
                    className="flex-1"
                  />
                </div>

                {/* Headers */}
                <div>
                  <label className="text-sm font-medium mb-2 block">Headers</label>
                  <Textarea
                    placeholder="Enter headers in JSON format (optional)&#10;{&#10;  &quot;Authorization&quot;: &quot;Bearer token&quot;,&#10;  &quot;X-Custom-Header&quot;: &quot;value&quot;&#10;}"
                    value={JSON.stringify(request.headers, null, 2)}
                    onChange={(e) => {
                      try {
                        const headers = JSON.parse(e.target.value || '{}');
                        setRequest(prev => ({ ...prev, headers }));
                      } catch {
                        // Invalid JSON, but don't update state
                      }
                    }}
                    rows={4}
                  />
                </div>

                {/* Body */}
                {request.method !== 'GET' && (
                  <div>
                    <label className="text-sm font-medium mb-2 block">Request Body</label>
                    <Textarea
                      placeholder="Enter request body (JSON)"
                      value={request.body}
                      onChange={(e) => setRequest(prev => ({ ...prev, body: e.target.value }))}
                      rows={6}
                    />
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2">
                  <Button
                    onClick={handleSendRequest}
                    disabled={isLoading || !request.url.trim()}
                    className="flex-1"
                  >
                    {isLoading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4 mr-2" />
                    )}
                    Send Request
                  </Button>
                  
                  <Button variant="outline" onClick={handleExportRequest}>
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Response */}
            {response && (
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">Response</CardTitle>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`${getStatusColor(response.status)} text-white`}>
                        {response.status} {response.statusText}
                      </Badge>
                      <Badge variant="outline">
                        {response.responseTime}ms
                      </Badge>
                      <Button variant="ghost" size="sm" onClick={handleCopyResponse}>
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Response Headers */}
                  <div className="mb-4">
                    <h4 className="text-sm font-medium mb-2">Headers</h4>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
                      {JSON.stringify(response.headers, null, 2)}
                    </pre>
                  </div>

                  {/* Response Body */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Body</h4>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-64">
                      {response.body}
                    </pre>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="graphql" className="m-0 p-3">
            <Card>
              <CardHeader>
                <CardTitle>GraphQL Testing</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center text-muted-foreground py-8">
                  <p className="text-lg mb-2">GraphQL Testing</p>
                  <p className="text-sm">Coming soon...</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="auth" className="m-0 p-3">
            <Card>
              <CardHeader>
                <CardTitle>Authentication Testing</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center text-muted-foreground py-8">
                  <p className="text-lg mb-2">Auth Testing</p>
                  <p className="text-sm">Test login, signup, and protected endpoints</p>
                  <p className="text-sm mt-2">Coming soon...</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </div>
      </Tabs>
    </div>
  );
}