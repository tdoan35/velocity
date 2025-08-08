import { useState } from 'react';
import { MobilePreview } from '@/components/preview/MobilePreview';
import { SnackIntegrationDemo } from '@/components/preview/SnackIntegrationDemo';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Smartphone, 
  Zap, 
  Share2, 
  Shield, 
  Clock,
  Users,
  AlertCircle,
  CheckCircle,
  Code2,
} from 'lucide-react';

export function PreviewDemo() {
  const [activeTab, setActiveTab] = useState<'preview' | 'features' | 'snack'>('preview');

  const features = [
    {
      icon: Smartphone,
      title: "Multiple Devices",
      description: "Test on 14+ device configurations including latest iPhones, iPads, and Android devices",
    },
    {
      icon: Zap,
      title: "Instant Hot Reload",
      description: "See changes instantly with WebSocket-powered hot reload functionality",
    },
    {
      icon: Users,
      title: "Session Pooling",
      description: "Pre-warmed sessions for instant access and optimal resource usage",
    },
    {
      icon: Share2,
      title: "Share Previews",
      description: "Generate secure public links to share previews with team members",
    },
    {
      icon: Shield,
      title: "Secure Sessions",
      description: "Row-level security ensures users only access their own preview sessions",
    },
    {
      icon: Clock,
      title: "Usage Analytics",
      description: "Track session duration, hot reloads, and device usage patterns",
    },
  ];

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Mobile Preview Demo</h1>
            <p className="text-muted-foreground mt-2">
              Real-time mobile app preview powered by Appetize.io
            </p>
          </div>
          <Badge variant="secondary" className="text-sm">
            <CheckCircle className="w-3 h-3 mr-1" />
            Appetize.io Integration
          </Badge>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 border-b">
          <Button
            variant={activeTab === 'preview' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('preview')}
          >
            Appetize Preview
          </Button>
          <Button
            variant={activeTab === 'snack' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('snack')}
          >
            <Code2 className="w-4 h-4 mr-2" />
            Snack Preview
          </Button>
          <Button
            variant={activeTab === 'features' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('features')}
          >
            Features
          </Button>
        </div>

        {/* Tab Content */}
        {activeTab === 'preview' ? (
          <div className="space-y-6">
            {/* API Key Alert */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                <strong>Demo Mode:</strong> To enable live preview, add your Appetize.io API key to the environment variables.
                The preview UI is fully functional and ready for integration.
              </AlertDescription>
            </Alert>

            {/* Preview Component */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                <MobilePreview className="h-[800px]" />
              </div>

              {/* Side Panel */}
              <div className="space-y-6">
                {/* Session Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Session Info</CardTitle>
                    <CardDescription>Preview session details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Status</span>
                      <Badge variant="outline">No Session</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Device</span>
                      <span>Not Selected</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Duration</span>
                      <span>0:00</span>
                    </div>
                  </CardContent>
                </Card>

                {/* Quick Stats */}
                <Card>
                  <CardHeader>
                    <CardTitle>Quick Stats</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Hot Reloads</span>
                      <Badge variant="secondary">0</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Sessions Today</span>
                      <Badge variant="secondary">0</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Pool Size</span>
                      <Badge variant="secondary">0</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        ) : activeTab === 'snack' ? (
          <div className="h-[800px]">
            <SnackIntegrationDemo />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index}>
                <CardHeader>
                  <feature.icon className="w-10 h-10 mb-2 text-primary" />
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Technical Details */}
        <Card>
          <CardHeader>
            <CardTitle>Technical Implementation</CardTitle>
            <CardDescription>Architecture overview of the preview system</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h4 className="font-semibold mb-2">Edge Functions</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• appetize-api</li>
                  <li>• preview-sessions</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">Database Tables</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• preview_sessions</li>
                  <li>• preview_session_metrics</li>
                  <li>• preview_session_pool</li>
                </ul>
              </div>
              <div>
                <h4 className="font-semibold mb-2">React Components</h4>
                <ul className="text-sm text-muted-foreground space-y-1">
                  <li>• MobilePreview</li>
                  <li>• useAppetizePreview</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}