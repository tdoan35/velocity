# Extending the Velocity Preview System

This guide covers how to extend and customize the Velocity Preview System to add new features, integrate with external services, or modify existing behavior.

## Architecture Overview

Before extending the system, understand the key extension points:

1. **Frontend Components** - React components for UI customization
2. **Edge Functions** - Serverless functions for backend logic
3. **Hooks & Services** - Core business logic and state management
4. **Database Schema** - Data model extensions
5. **WebSocket Events** - Real-time communication protocols

## Extension Points

### 1. Custom Device Profiles

Add support for new device types or custom configurations.

#### Creating a Device Profile

```typescript
// src/config/devices/custom-device.ts
export interface CustomDeviceProfile {
  id: string;
  name: string;
  type: 'phone' | 'tablet' | 'watch' | 'tv';
  os: 'ios' | 'android';
  screenSize: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  capabilities: {
    touch: boolean;
    multitouch: boolean;
    accelerometer: boolean;
    gyroscope: boolean;
    camera: boolean;
    microphone: boolean;
  };
  appetizeConfig: {
    device: string; // Appetize device identifier
    osVersion: string;
    params?: Record<string, any>;
  };
}

export const customDevice: CustomDeviceProfile = {
  id: 'custom-foldable',
  name: 'Custom Foldable Phone',
  type: 'phone',
  os: 'android',
  screenSize: {
    width: 2208,
    height: 1768,
    devicePixelRatio: 3
  },
  capabilities: {
    touch: true,
    multitouch: true,
    accelerometer: true,
    gyroscope: true,
    camera: true,
    microphone: true
  },
  appetizeConfig: {
    device: 'pixel_fold',
    osVersion: '14',
    params: {
      orientation: 'portrait',
      foldState: 'open'
    }
  }
};
```

#### Registering the Device

```typescript
// src/config/devices/index.ts
import { customDevice } from './custom-device';
import { defaultDevices } from './defaults';

export const deviceRegistry = {
  ...defaultDevices,
  [customDevice.id]: customDevice
};

// Update the device selector
export function getAvailableDevices(userPlan: string): DeviceProfile[] {
  const devices = Object.values(deviceRegistry);
  
  // Filter based on user plan
  return devices.filter(device => {
    if (userPlan === 'enterprise') return true;
    if (userPlan === 'pro' && device.type !== 'tv') return true;
    return device.type === 'phone';
  });
}
```

### 2. Custom Preview Controls

Add new interactive controls to the preview interface.

#### Creating a Control Component

```typescript
// src/components/preview/controls/NetworkThrottling.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Network } from 'lucide-react';

interface NetworkThrottlingProps {
  sessionId: string;
  onNetworkChange: (profile: NetworkProfile) => void;
}

export function NetworkThrottling({ sessionId, onNetworkChange }: NetworkThrottlingProps) {
  const [profile, setProfile] = useState<NetworkProfile>('4g');
  
  const profiles: Record<string, NetworkConfig> = {
    '4g': { download: 12, upload: 12, latency: 20 },
    '3g': { download: 1.6, upload: 0.768, latency: 300 },
    'slow3g': { download: 0.4, upload: 0.4, latency: 400 },
    'offline': { download: 0, upload: 0, latency: 0 }
  };

  const applyProfile = async (newProfile: string) => {
    const config = profiles[newProfile];
    
    // Call Edge Function to apply network throttling
    const response = await fetch('/api/preview-session/network', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId,
        network: config
      })
    });

    if (response.ok) {
      setProfile(newProfile);
      onNetworkChange(newProfile);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <Network className="w-4 h-4" />
      <Select value={profile} onValueChange={applyProfile}>
        <SelectTrigger className="w-32">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="4g">4G</SelectItem>
          <SelectItem value="3g">3G</SelectItem>
          <SelectItem value="slow3g">Slow 3G</SelectItem>
          <SelectItem value="offline">Offline</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
```

#### Integrating the Control

```typescript
// src/components/preview/PreviewControls.tsx
import { NetworkThrottling } from './controls/NetworkThrottling';

export function PreviewControls({ session }) {
  return (
    <div className="preview-controls">
      {/* Existing controls */}
      
      {/* Custom network throttling */}
      <NetworkThrottling 
        sessionId={session.id}
        onNetworkChange={(profile) => {
          console.log('Network changed to:', profile);
        }}
      />
    </div>
  );
}
```

### 3. Custom Hooks

Create reusable hooks for preview functionality.

#### Performance Monitoring Hook

```typescript
// src/hooks/usePreviewPerformance.ts
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface PerformanceData {
  fps: number;
  memory: number;
  cpu: number;
  network: {
    latency: number;
    bandwidth: number;
  };
}

export function usePreviewPerformance(sessionId: string) {
  const [metrics, setMetrics] = useState<PerformanceData | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    if (!sessionId || !isMonitoring) return;

    // Subscribe to performance metrics
    const channel = supabase
      .channel(`performance:${sessionId}`)
      .on('broadcast', { event: 'metrics' }, ({ payload }) => {
        setMetrics(payload);
      })
      .subscribe();

    // Poll for metrics every 2 seconds
    const interval = setInterval(async () => {
      const { data, error } = await supabase.functions.invoke(
        'preview-metrics/collect',
        { body: { sessionId } }
      );

      if (data && !error) {
        setMetrics(data);
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      channel.unsubscribe();
    };
  }, [sessionId, isMonitoring]);

  const startMonitoring = useCallback(() => {
    setIsMonitoring(true);
  }, []);

  const stopMonitoring = useCallback(() => {
    setIsMonitoring(false);
  }, []);

  return {
    metrics,
    isMonitoring,
    startMonitoring,
    stopMonitoring
  };
}
```

### 4. Custom Edge Functions

Extend backend functionality with new Edge Functions.

#### Preview Analytics Function

```typescript
// supabase/functions/preview-analytics/index.ts
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface AnalyticsEvent {
  sessionId: string;
  event: string;
  properties?: Record<string, any>;
  timestamp: string;
}

serve(async (req) => {
  const { method } = req;
  
  if (method === 'POST') {
    const event: AnalyticsEvent = await req.json();
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Store analytics event
    const { error } = await supabase
      .from('preview_analytics')
      .insert({
        session_id: event.sessionId,
        event_type: event.event,
        properties: event.properties,
        created_at: event.timestamp
      });

    // Process real-time analytics
    if (event.event === 'interaction') {
      await processInteractionAnalytics(supabase, event);
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response('Method not allowed', { status: 405 });
});

async function processInteractionAnalytics(supabase: any, event: AnalyticsEvent) {
  // Custom analytics processing
  const { data: session } = await supabase
    .from('preview_sessions')
    .select('project_id, device_info')
    .eq('id', event.sessionId)
    .single();

  if (session) {
    // Update interaction heatmap
    await supabase.rpc('update_interaction_heatmap', {
      project_id: session.project_id,
      device_type: session.device_info.type,
      coordinates: event.properties?.coordinates,
      interaction_type: event.properties?.type
    });
  }
}
```

### 5. Plugin System

Create a plugin architecture for third-party extensions.

#### Plugin Interface

```typescript
// src/plugins/types.ts
export interface PreviewPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  
  // Lifecycle hooks
  onInstall?: (context: PluginContext) => Promise<void>;
  onUninstall?: (context: PluginContext) => Promise<void>;
  onActivate?: (context: PluginContext) => void;
  onDeactivate?: (context: PluginContext) => void;
  
  // Preview hooks
  onSessionStart?: (session: PreviewSession) => void;
  onSessionEnd?: (session: PreviewSession) => void;
  onInteraction?: (interaction: InteractionEvent) => void;
  onError?: (error: PreviewError) => void;
  
  // UI extensions
  controls?: React.ComponentType<any>[];
  panels?: React.ComponentType<any>[];
  overlays?: React.ComponentType<any>[];
  
  // API extensions
  endpoints?: PluginEndpoint[];
  webhooks?: PluginWebhook[];
}

export interface PluginContext {
  userId: string;
  projectId: string;
  config: Record<string, any>;
  api: PluginAPI;
}
```

#### Example Plugin

```typescript
// src/plugins/examples/screenshot-annotation.ts
import { PreviewPlugin } from '../types';
import { ScreenshotAnnotation } from './components/ScreenshotAnnotation';

export const screenshotAnnotationPlugin: PreviewPlugin = {
  id: 'screenshot-annotation',
  name: 'Screenshot Annotation',
  version: '1.0.0',
  description: 'Add annotations to preview screenshots',
  
  controls: [ScreenshotAnnotation],
  
  onSessionStart(session) {
    console.log('Screenshot annotation enabled for session:', session.id);
  },
  
  endpoints: [
    {
      path: '/annotate',
      method: 'POST',
      handler: async (req) => {
        const { sessionId, screenshot, annotations } = req.body;
        
        // Process and store annotated screenshot
        const result = await processAnnotations(screenshot, annotations);
        
        return { 
          success: true, 
          annotatedUrl: result.url 
        };
      }
    }
  ]
};
```

#### Plugin Manager

```typescript
// src/plugins/manager.ts
export class PluginManager {
  private plugins: Map<string, PreviewPlugin> = new Map();
  private activePlugins: Set<string> = new Set();

  async register(plugin: PreviewPlugin) {
    // Validate plugin
    this.validatePlugin(plugin);
    
    // Store plugin
    this.plugins.set(plugin.id, plugin);
    
    // Run install hook
    if (plugin.onInstall) {
      await plugin.onInstall(this.getContext());
    }
  }

  async activate(pluginId: string) {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) throw new Error(`Plugin ${pluginId} not found`);
    
    // Activate plugin
    this.activePlugins.add(pluginId);
    
    // Run activation hook
    if (plugin.onActivate) {
      plugin.onActivate(this.getContext());
    }
    
    // Register UI components
    this.registerUIComponents(plugin);
    
    // Register API endpoints
    this.registerEndpoints(plugin);
  }

  getActivePlugins(): PreviewPlugin[] {
    return Array.from(this.activePlugins)
      .map(id => this.plugins.get(id))
      .filter(Boolean) as PreviewPlugin[];
  }

  // Plugin event dispatching
  async dispatchEvent(event: string, data: any) {
    for (const pluginId of this.activePlugins) {
      const plugin = this.plugins.get(pluginId);
      if (!plugin) continue;
      
      const handler = plugin[event as keyof PreviewPlugin];
      if (typeof handler === 'function') {
        try {
          await handler(data);
        } catch (error) {
          console.error(`Plugin ${pluginId} error in ${event}:`, error);
        }
      }
    }
  }
}
```

### 6. Custom Themes

Create custom visual themes for the preview interface.

```typescript
// src/themes/custom-theme.ts
export const customTheme = {
  name: 'Velocity Dark Pro',
  colors: {
    primary: '#0066FF',
    secondary: '#00D4FF',
    background: '#0A0A0A',
    surface: '#1A1A1A',
    text: '#FFFFFF',
    textMuted: '#888888',
    error: '#FF3B30',
    success: '#34C759',
    warning: '#FF9500'
  },
  preview: {
    deviceFrame: {
      color: '#2A2A2A',
      shadow: '0 20px 40px rgba(0, 102, 255, 0.2)'
    },
    controls: {
      background: 'rgba(26, 26, 26, 0.95)',
      border: '1px solid rgba(255, 255, 255, 0.1)'
    },
    metrics: {
      good: '#34C759',
      warning: '#FF9500',
      bad: '#FF3B30'
    }
  }
};
```

## Best Practices

### 1. Performance Considerations

- Use React.memo for expensive components
- Implement virtual scrolling for large lists
- Debounce rapid API calls
- Use WebSocket subscriptions for real-time data

### 2. Error Handling

```typescript
// Always wrap extensions in error boundaries
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  fallback?: React.ComponentType<any>
) {
  return class extends React.Component<P> {
    state = { hasError: false };
    
    static getDerivedStateFromError() {
      return { hasError: true };
    }
    
    componentDidCatch(error: Error, info: ErrorInfo) {
      console.error('Extension error:', error, info);
    }
    
    render() {
      if (this.state.hasError) {
        return fallback ? <fallback /> : <div>Extension error</div>;
      }
      return <Component {...this.props} />;
    }
  };
}
```

### 3. Type Safety

```typescript
// Use strict types for all extensions
import { z } from 'zod';

const DeviceConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['phone', 'tablet', 'watch', 'tv']),
  screenSize: z.object({
    width: z.number().positive(),
    height: z.number().positive(),
    devicePixelRatio: z.number().positive()
  })
});

export type DeviceConfig = z.infer<typeof DeviceConfigSchema>;

export function validateDeviceConfig(config: unknown): DeviceConfig {
  return DeviceConfigSchema.parse(config);
}
```

### 4. Testing Extensions

```typescript
// src/plugins/__tests__/plugin.test.ts
import { PluginManager } from '../manager';
import { mockPlugin } from './mocks';

describe('Plugin System', () => {
  let manager: PluginManager;
  
  beforeEach(() => {
    manager = new PluginManager();
  });
  
  test('registers plugin successfully', async () => {
    await manager.register(mockPlugin);
    expect(manager.getPlugin(mockPlugin.id)).toBeDefined();
  });
  
  test('activates plugin and registers components', async () => {
    await manager.register(mockPlugin);
    await manager.activate(mockPlugin.id);
    
    const activePlugins = manager.getActivePlugins();
    expect(activePlugins).toHaveLength(1);
    expect(activePlugins[0].id).toBe(mockPlugin.id);
  });
});
```

## Publishing Extensions

### Package Structure

```
my-preview-extension/
├── package.json
├── README.md
├── src/
│   ├── index.ts
│   ├── components/
│   ├── hooks/
│   └── types.ts
├── dist/
└── examples/
```

### Package.json

```json
{
  "name": "@velocity/preview-extension-example",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "velocity": {
    "type": "preview-extension",
    "compatibleVersions": ">=1.0.0"
  },
  "peerDependencies": {
    "@velocity/preview-sdk": "^1.0.0",
    "react": "^18.0.0"
  }
}
```

### Distribution

1. Build your extension: `npm run build`
2. Publish to npm: `npm publish`
3. Submit to Velocity Marketplace
4. Users can install via: `velocity extension install your-extension`

## Support

- Extension API Docs: https://docs.velocity.dev/preview/extensions
- Example Extensions: https://github.com/velocity-dev/preview-extensions
- Developer Forum: https://forum.velocity.dev/c/extensions
- Extension Support: extensions@velocity.dev