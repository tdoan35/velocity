import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { useProjectEditorStore } from '../stores/useProjectEditorStore';
import { toast } from 'sonner';
import { Loader2, Settings, Download, Share2, Eye, Code, FileText, Play, Shield, Activity, RefreshCw, Zap } from 'lucide-react';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '../components/ui/resizable';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { FullStackFileExplorer } from '../components/editor/FullStackFileExplorer';
import { EnhancedEditorContainer } from '../components/editor/EnhancedEditorContainer';
import { FullStackPreviewPanel } from '../components/preview/FullStackPreviewPanel';
import { FullStackAIAssistant } from '../components/ai/FullStackAIAssistant';
import { VerticalCollapsiblePanel } from '../components/layout/vertical-collapsible-panel';
import { SecurityProvider, useSecurity } from '../components/security/SecurityProvider';
import { SecurityDashboard } from '../components/security/SecurityDashboard';
import { PerformanceDashboard } from '../components/performance/PerformanceDashboard';

// Comprehensive mock data for a complete project
const mockProjectData = {
  id: 'demo-project-12345',
  name: 'Velocity E-commerce App',
  description: 'A full-stack React Native e-commerce application with Supabase backend',
  user_id: 'demo-user-123',
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  prd_sections: [
    {
      id: 'prd-1',
      title: 'Product Overview',
      content: 'Build a modern e-commerce mobile app with real-time features',
      order_index: 1,
    }
  ]
};

const mockFrontendFiles = {
  'frontend/App.tsx': {
    path: 'frontend/App.tsx',
    content: `import React, { useState, useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from './lib/supabase';
import { ProductsScreen } from './screens/ProductsScreen';
import { CartScreen } from './screens/CartScreen';
import { ProfileScreen } from './screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
    } catch (error) {
      console.error('Auth check failed:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading Velocity...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            
            if (route.name === 'Products') {
              iconName = focused ? 'storefront' : 'storefront-outline';
            } else if (route.name === 'Cart') {
              iconName = focused ? 'cart' : 'cart-outline';
            } else if (route.name === 'Profile') {
              iconName = focused ? 'person' : 'person-outline';
            }
            
            return <Ionicons name={iconName} size={size} color={color} />;
          },
          tabBarActiveTintColor: '#6366f1',
          tabBarInactiveTintColor: 'gray',
          headerStyle: {
            backgroundColor: '#6366f1',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        })}
      >
        <Tab.Screen name="Products" component={ProductsScreen} />
        <Tab.Screen name="Cart" component={CartScreen} />
        <Tab.Screen name="Profile" component={ProfileScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#64748b',
  },
});`,
    type: 'typescript',
    lastModified: new Date(),
  },

  'frontend/screens/ProductsScreen.tsx': {
    path: 'frontend/screens/ProductsScreen.tsx',
    content: `import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, Image, StyleSheet, RefreshControl } from 'react-native';
import { supabase } from '../lib/supabase';

interface Product {
  id: string;
  name: string;
  price: number;
  description: string;
  image_url: string;
  category: string;
  in_stock: boolean;
}

export function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .eq('in_stock', true)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      setProducts(data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchProducts();
  };

  const addToCart = async (product: Product) => {
    // Add to cart logic here
    console.log('Added to cart:', product.name);
  };

  const renderProduct = ({ item }: { item: Product }) => (
    <View style={styles.productCard}>
      <Image source={{ uri: item.image_url }} style={styles.productImage} />
      <View style={styles.productInfo}>
        <Text style={styles.productName}>{item.name}</Text>
        <Text style={styles.productDescription}>{item.description}</Text>
        <Text style={styles.productPrice}>$\{item.price.toFixed(2)}</Text>
        <TouchableOpacity
          style={styles.addToCartButton}
          onPress={() => addToCart(item)}
        >
          <Text style={styles.addToCartText}>Add to Cart</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={products}
        renderItem={renderProduct}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.productList}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  productList: {
    padding: 16,
  },
  productCard: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  productImage: {
    width: '100%',
    height: 200,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  productInfo: {
    padding: 16,
  },
  productName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#1f2937',
    marginBottom: 4,
  },
  productDescription: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#059669',
    marginBottom: 12,
  },
  addToCartButton: {
    backgroundColor: '#6366f1',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  addToCartText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
});`,
    type: 'typescript',
    lastModified: new Date(),
  },

  'frontend/package.json': {
    path: 'frontend/package.json',
    content: JSON.stringify({
      name: 'velocity-ecommerce-app',
      version: '1.0.0',
      main: 'App.tsx',
      scripts: {
        start: 'expo start',
        android: 'expo start --android',
        ios: 'expo start --ios',
        web: 'expo start --web'
      },
      dependencies: {
        '@supabase/supabase-js': '^2.38.0',
        '@react-navigation/native': '^6.1.7',
        '@react-navigation/bottom-tabs': '^6.5.8',
        'expo': '~49.0.0',
        'react': '18.2.0',
        'react-native': '0.72.6',
        '@expo/vector-icons': '^13.0.0'
      },
      devDependencies: {
        '@babel/core': '^7.20.0',
        '@types/react': '~18.2.14',
        'typescript': '^5.1.3'
      }
    }, null, 2),
    type: 'json',
    lastModified: new Date(),
  },
};

const mockBackendFiles = {
  'backend/functions/products/index.ts': {
    path: 'backend/functions/products/index.ts',
    content: `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    switch (req.method) {
      case 'GET':
        return await getProducts(supabaseClient, req);
      case 'POST':
        return await createProduct(supabaseClient, req);
      case 'PUT':
        return await updateProduct(supabaseClient, req);
      case 'DELETE':
        return await deleteProduct(supabaseClient, req);
      default:
        return new Response('Method not allowed', { status: 405, headers: corsHeaders });
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function getProducts(supabase: any, req: Request) {
  const url = new URL(req.url);
  const category = url.searchParams.get('category');
  const limit = parseInt(url.searchParams.get('limit') || '20');

  let query = supabase
    .from('products')
    .select('*')
    .eq('in_stock', true)
    .limit(limit)
    .order('created_at', { ascending: false });

  if (category) {
    query = query.eq('category', category);
  }

  const { data, error } = await query;

  if (error) throw error;

  return new Response(
    JSON.stringify({ products: data }), 
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function createProduct(supabase: any, req: Request) {
  const { name, price, description, image_url, category } = await req.json();

  const { data, error } = await supabase
    .from('products')
    .insert([{
      name,
      price,
      description,
      image_url,
      category,
      in_stock: true,
    }])
    .select()
    .single();

  if (error) throw error;

  return new Response(
    JSON.stringify({ product: data }), 
    { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function updateProduct(supabase: any, req: Request) {
  const { id, ...updates } = await req.json();

  const { data, error } = await supabase
    .from('products')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;

  return new Response(
    JSON.stringify({ product: data }), 
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function deleteProduct(supabase: any, req: Request) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', id);

  if (error) throw error;

  return new Response(
    JSON.stringify({ message: 'Product deleted successfully' }), 
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}`,
    type: 'typescript',
    lastModified: new Date(),
  },

  'backend/migrations/20231120_create_products.sql': {
    path: 'backend/migrations/20231120_create_products.sql',
    content: `-- Create products table
CREATE TABLE IF NOT EXISTS products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  image_url TEXT,
  category TEXT NOT NULL,
  in_stock BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create cart table
CREATE TABLE IF NOT EXISTS cart (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, product_id)
);

-- Enable RLS
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Everyone can view products" ON products FOR SELECT USING (true);
CREATE POLICY "Everyone can view categories" ON categories FOR SELECT USING (true);
CREATE POLICY "Users can manage their cart" ON cart FOR ALL USING (auth.uid() = user_id);

-- Insert sample data
INSERT INTO categories (name, description) VALUES
  ('Electronics', 'Electronic devices and gadgets'),
  ('Clothing', 'Fashion and apparel'),
  ('Books', 'Books and publications'),
  ('Home', 'Home and garden items');

INSERT INTO products (name, description, price, image_url, category) VALUES
  ('iPhone 15 Pro', 'Latest Apple smartphone with advanced features', 999.99, 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=400', 'Electronics'),
  ('MacBook Air M2', 'Powerful laptop for creative professionals', 1199.99, 'https://images.unsplash.com/photo-1541807084-5c52b6b3adef?w=400', 'Electronics'),
  ('Nike Air Max', 'Comfortable running shoes', 129.99, 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=400', 'Clothing'),
  ('React Handbook', 'Complete guide to React development', 29.99, 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?w=400', 'Books');`,
    type: 'sql',
    lastModified: new Date(),
  },
};

// Mock monitoring hooks
const mockSecurityMonitoring = {
  onFileSave: (fileName: string, content: string, language: string) => {
    console.log(`Security scan: ${fileName} (${language})`);
  },
  onFileOpen: (fileName: string, content: string, language: string) => {
    console.log(`File opened: ${fileName} (${language})`);
  },
};

const mockPerformanceMonitoring = {
  getPerformanceScore: () => 85,
};

function ProjectEditorTestContent() {
  const [activeThreats] = useState(0);
  const [isSecurityEnabled] = useState(true);
  const [buildStatus, setBuildStatus] = useState<'idle' | 'generating' | 'building' | 'success' | 'error'>('success');
  const [deploymentUrl] = useState('https://snack.expo.dev/@velocity/ecommerce-demo');
  
  const [isAIAssistantOpen, setIsAIAssistantOpen] = useState(false);
  const [isSecurityPanelOpen, setIsSecurityPanelOpen] = useState(false);
  const [isPerformancePanelOpen, setIsPerformancePanelOpen] = useState(false);

  const {
    projectData,
    isSupabaseConnected,
  } = useProjectEditorStore();

  const handleGenerateProject = async () => {
    setBuildStatus('generating');
    toast.info('Generating project structure...');
    
    // Simulate generation process
    setTimeout(() => {
      setBuildStatus('building');
      toast.info('Building project...');
      
      setTimeout(() => {
        setBuildStatus('success');
        toast.success('Project structure generated successfully!');
      }, 2000);
    }, 1500);
  };

  const handleDeploy = async () => {
    toast.info('Deploying to Expo Snack...');
    
    setTimeout(() => {
      toast.success('Project deployed successfully!');
    }, 2000);
  };

  const handleShare = () => {
    if (deploymentUrl) {
      navigator.clipboard.writeText(deploymentUrl);
      toast.success('Deployment URL copied to clipboard!');
    } else {
      toast.error('No deployment URL available');
    }
  };

  const simulateThreat = () => {
    toast.warning('Security threat detected in uploaded file!');
  };

  const simulatePerformanceIssue = () => {
    toast.warning('Performance degradation detected - consider code optimization');
  };

  return (
    <div className="h-screen flex flex-col bg-background">
      {/* Demo Control Bar */}
      <div className="border-b bg-muted/50 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Project Editor Demo Controls</span>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" onClick={handleGenerateProject}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Simulate Generate
            </Button>
            <Button variant="ghost" size="sm" onClick={simulateThreat}>
              <Shield className="h-4 w-4 mr-2" />
              Test Security Alert
            </Button>
            <Button variant="ghost" size="sm" onClick={simulatePerformanceIssue}>
              <Activity className="h-4 w-4 mr-2" />
              Test Performance Alert
            </Button>
          </div>
        </div>
      </div>

      {/* Header */}
      <header className="border-b bg-card px-4 py-3 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Code className="h-5 w-5 text-primary" />
            <h1 className="font-semibold text-foreground">
              {projectData?.name || 'Velocity E-commerce App'}
            </h1>
          </div>
          
          {/* Build Status */}
          <div className="flex items-center space-x-2 text-sm">
            {buildStatus === 'generating' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
                <span className="text-blue-600">Generating...</span>
              </>
            )}
            {buildStatus === 'building' && (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                <span className="text-orange-600">Building...</span>
              </>
            )}
            {buildStatus === 'success' && (
              <>
                <div className="h-2 w-2 bg-green-500 rounded-full" />
                <span className="text-green-600">Ready</span>
              </>
            )}
            {buildStatus === 'error' && (
              <>
                <div className="h-2 w-2 bg-red-500 rounded-full" />
                <span className="text-red-600">Error</span>
              </>
            )}
          </div>

          {/* Supabase Connection Status */}
          {isSupabaseConnected && (
            <div className="flex items-center space-x-2 text-sm">
              <div className="h-2 w-2 bg-green-500 rounded-full" />
              <span className="text-green-600">Supabase Connected</span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center space-x-2">
          {/* Security Status */}
          {isSecurityEnabled && (
            <div className="flex items-center space-x-2 text-sm">
              <Shield className={`h-4 w-4 ${activeThreats > 0 ? 'text-red-500' : 'text-green-500'}`} />
              {activeThreats > 0 ? (
                <Badge variant="destructive" className="text-xs">
                  {activeThreats} threats
                </Badge>
              ) : (
                <Badge variant="outline" className="text-xs bg-green-100 text-green-800">
                  Secure
                </Badge>
              )}
            </div>
          )}

          {/* Performance Status */}
          <div className="flex items-center space-x-2 text-sm">
            <Activity className="h-4 w-4 text-blue-500" />
            <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800">
              Score: {mockPerformanceMonitoring.getPerformanceScore()}/100
            </Badge>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleGenerateProject}
            disabled={buildStatus === 'generating' || buildStatus === 'building'}
          >
            <FileText className="h-4 w-4 mr-2" />
            Generate
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeploy}
            disabled={buildStatus !== 'success'}
          >
            <Play className="h-4 w-4 mr-2" />
            Deploy
          </Button>
          
          {deploymentUrl && (
            <Button variant="outline" size="sm" onClick={handleShare}>
              <Share2 className="h-4 w-4 mr-2" />
              Share
            </Button>
          )}
          
          <Button
            variant="outline" 
            size="sm"
            onClick={() => setIsSecurityPanelOpen(!isSecurityPanelOpen)}
          >
            <Shield className="h-4 w-4 mr-2" />
            Security
          </Button>

          <Button
            variant="outline" 
            size="sm"
            onClick={() => setIsPerformancePanelOpen(!isPerformancePanelOpen)}
          >
            <Activity className="h-4 w-4 mr-2" />
            Performance
          </Button>
          
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup direction="horizontal" className="h-full">
          {/* File Explorer */}
          <ResizablePanel defaultSize={20} minSize={15} maxSize={30}>
            <FullStackFileExplorer
              projectId="demo-project-12345"
              showBackend={isSupabaseConnected}
            />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          {/* Editor */}
          <ResizablePanel defaultSize={50} minSize={30}>
            <EnhancedEditorContainer
              projectId="demo-project-12345"
              projectType={isSupabaseConnected ? 'full-stack' : 'frontend-only'}
              onFileSave={mockSecurityMonitoring.onFileSave}
              onFileOpen={mockSecurityMonitoring.onFileOpen}
            />
          </ResizablePanel>
          
          <ResizableHandle withHandle />
          
          {/* Preview */}
          <ResizablePanel defaultSize={30} minSize={20}>
            <FullStackPreviewPanel
              projectId="demo-project-12345"
              showAPITesting={isSupabaseConnected}
            />
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* Performance Panel (Collapsible) */}
      <VerticalCollapsiblePanel
        isOpen={isPerformancePanelOpen}
        onToggle={setIsPerformancePanelOpen}
        title="Performance Dashboard"
        className="border-t"
        defaultHeight="400px"
      >
        <PerformanceDashboard />
      </VerticalCollapsiblePanel>

      {/* Security Panel (Collapsible) */}
      <VerticalCollapsiblePanel
        isOpen={isSecurityPanelOpen}
        onToggle={setIsSecurityPanelOpen}
        title="Security Dashboard"
        className="border-t"
        defaultHeight="400px"
      >
        <SecurityDashboard projectId="demo-project-12345" />
      </VerticalCollapsiblePanel>

      {/* AI Assistant Panel (Collapsible) */}
      <VerticalCollapsiblePanel
        isOpen={isAIAssistantOpen}
        onToggle={setIsAIAssistantOpen}
        title="AI Assistant"
        className="border-t"
      >
        <FullStackAIAssistant
          projectId="demo-project-12345"
          projectType={isSupabaseConnected ? 'full-stack' : 'frontend-only'}
        />
      </VerticalCollapsiblePanel>

      {/* Floating Action Buttons */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsPerformancePanelOpen(!isPerformancePanelOpen)}
          className={mockPerformanceMonitoring.getPerformanceScore() < 70 ? 'border-orange-500 bg-orange-50' : ''}
        >
          <Activity className="h-4 w-4 mr-2" />
          Performance
          <Badge variant="outline" className="ml-2 text-xs">
            {mockPerformanceMonitoring.getPerformanceScore()}
          </Badge>
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsSecurityPanelOpen(!isSecurityPanelOpen)}
          className={activeThreats > 0 ? 'border-red-500 bg-red-50' : ''}
        >
          <Shield className="h-4 w-4 mr-2" />
          Security
          {activeThreats > 0 && (
            <Badge variant="destructive" className="ml-2 text-xs">
              {activeThreats}
            </Badge>
          )}
        </Button>
        
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsAIAssistantOpen(!isAIAssistantOpen)}
        >
          <Eye className="h-4 w-4 mr-2" />
          AI Assistant
        </Button>
      </div>
    </div>
  );
}

export function ProjectEditorTest() {
  // Mock authentication
  useEffect(() => {
    const authStore = useAuthStore.getState();
    useAuthStore.setState({
      user: {
        id: 'demo-user-123',
        email: 'demo@velocity.com',
        name: 'Demo User',
        created_at: new Date().toISOString(),
      },
      isAuthenticated: true,
      isLoading: false,
    });

    // Set up project editor store with comprehensive mock data
    useProjectEditorStore.setState({
      projectId: 'demo-project-12345',
      projectData: mockProjectData,
      projectType: 'full-stack',
      frontendFiles: mockFrontendFiles,
      backendFiles: mockBackendFiles,
      sharedFiles: {},
      openTabs: ['frontend/App.tsx'],
      activeFile: 'frontend/App.tsx',
      buildStatus: 'success',
      deploymentUrl: 'https://snack.expo.dev/@velocity/ecommerce-demo',
      isSupabaseConnected: true,
      isLoading: false,
      error: null,
    });

    // Cleanup function
    return () => {
      authStore.setUser(null);
      authStore.setError(null);
      authStore.setLoading(false);
      useProjectEditorStore.getState().reset();
    };
  }, []);

  return (
    <SecurityProvider projectId="demo-project-12345">
      <ProjectEditorTestContent />
    </SecurityProvider>
  );
}