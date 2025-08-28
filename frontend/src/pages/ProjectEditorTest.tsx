import { useEffect } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { useProjectEditorStore } from '../stores/useProjectEditorStore';
import { SecurityProvider } from '../components/security/SecurityProvider';
import { ProjectEditorCore } from './ProjectEditor';

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

function ProjectEditorTestContent() {
  return (
    <div className="h-full">
      <ProjectEditorCore 
        projectId="demo-project-12345"
        showAuthRedirect={false}  // Don't redirect in test mode
        showProjectValidation={false}  // Don't validate project in test mode
        skipInitialization={true}  // Skip API calls, use mock data
      />
    </div>
  );
}

export function ProjectEditorTest() {
  // Mock authentication and project data
  useEffect(() => {
    const authStore = useAuthStore.getState();
    useAuthStore.setState({
      user: {
        id: 'demo-user-123',
        email: 'demo@velocity.com',
        created_at: new Date().toISOString(),
        aud: '',
        app_metadata: {},
        user_metadata: {},
        role: 'authenticated',
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
    <div className="min-h-screen w-full bg-background p-8 pt-16">
      <div className="w-full max-w-7xl mx-auto border border-border rounded-lg overflow-hidden" style={{ height: 'calc(100vh - 8rem)' }}>
        <SecurityProvider projectId="demo-project-12345">
          <ProjectEditorTestContent />
        </SecurityProvider>
      </div>
    </div>
  );
}