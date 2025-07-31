import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { createSupabaseClient } from '../_shared/database.ts';

interface AppetizeDevice {
  id: string;
  name: string;
  osVersion: string;
  deviceType: 'iphone' | 'ipad' | 'android';
  orientation: 'portrait' | 'landscape';
  width: number;
  height: number;
}

interface CreateSessionRequest {
  projectId: string;
  deviceId: string;
  orientation?: 'portrait' | 'landscape';
  appUrl: string;
}

interface SessionResponse {
  sessionId: string;
  publicKey: string;
  url: string;
  expiresAt: string;
}

const APPETIZE_API_KEY = Deno.env.get('APPETIZE_API_KEY') ?? '';
const APPETIZE_API_URL = 'https://api.appetize.io/v1';

const SUPPORTED_DEVICES: AppetizeDevice[] = [
  // iOS Devices
  { id: 'iphone15pro', name: 'iPhone 15 Pro', osVersion: '17.0', deviceType: 'iphone', orientation: 'portrait', width: 393, height: 852 },
  { id: 'iphone15', name: 'iPhone 15', osVersion: '17.0', deviceType: 'iphone', orientation: 'portrait', width: 393, height: 852 },
  { id: 'iphone14pro', name: 'iPhone 14 Pro', osVersion: '16.0', deviceType: 'iphone', orientation: 'portrait', width: 393, height: 852 },
  { id: 'iphone14', name: 'iPhone 14', osVersion: '16.0', deviceType: 'iphone', orientation: 'portrait', width: 390, height: 844 },
  { id: 'iphone13', name: 'iPhone 13', osVersion: '15.0', deviceType: 'iphone', orientation: 'portrait', width: 390, height: 844 },
  { id: 'iphone12', name: 'iPhone 12', osVersion: '14.0', deviceType: 'iphone', orientation: 'portrait', width: 390, height: 844 },
  { id: 'ipadpro13', name: 'iPad Pro 13"', osVersion: '17.0', deviceType: 'ipad', orientation: 'portrait', width: 1024, height: 1366 },
  { id: 'ipadpro11', name: 'iPad Pro 11"', osVersion: '17.0', deviceType: 'ipad', orientation: 'portrait', width: 834, height: 1194 },
  
  // Android Devices
  { id: 'pixel8pro', name: 'Pixel 8 Pro', osVersion: '14', deviceType: 'android', orientation: 'portrait', width: 412, height: 892 },
  { id: 'pixel7', name: 'Pixel 7', osVersion: '13', deviceType: 'android', orientation: 'portrait', width: 412, height: 915 },
  { id: 'pixel6', name: 'Pixel 6', osVersion: '12', deviceType: 'android', orientation: 'portrait', width: 411, height: 914 },
  { id: 'galaxys23', name: 'Samsung Galaxy S23', osVersion: '13', deviceType: 'android', orientation: 'portrait', width: 360, height: 780 },
  { id: 'galaxys22', name: 'Samsung Galaxy S22', osVersion: '12', deviceType: 'android', orientation: 'portrait', width: 360, height: 780 },
  { id: 'galaxytabs8', name: 'Samsung Galaxy Tab S8', osVersion: '13', deviceType: 'android', orientation: 'portrait', width: 800, height: 1280 },
];

async function createAppetizeSession(appUrl: string, device: AppetizeDevice): Promise<SessionResponse> {
  const response = await fetch(`${APPETIZE_API_URL}/apps`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${APPETIZE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      url: appUrl,
      platform: device.deviceType === 'android' ? 'android' : 'ios',
      device: device.name,
      osVersion: device.osVersion,
      orientation: device.orientation,
      params: {
        debug: true,
        proxy: 'intercept',
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Appetize API error: ${error}`);
  }

  const data = await response.json();
  
  // Create a session with the uploaded app
  const sessionResponse = await fetch(`${APPETIZE_API_URL}/sessions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${APPETIZE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      publicKey: data.publicKey,
      device: device.id,
      osVersion: device.osVersion,
      orientation: device.orientation,
      scale: 75, // 75% scale for better performance
      centered: true,
      deviceColor: 'black',
      params: {
        debug: true,
        proxy: 'intercept',
      },
    }),
  });

  if (!sessionResponse.ok) {
    const error = await sessionResponse.text();
    throw new Error(`Appetize session error: ${error}`);
  }

  const sessionData = await sessionResponse.json();
  
  return {
    sessionId: sessionData.token,
    publicKey: data.publicKey,
    url: `https://appetize.io/embed/${data.publicKey}?device=${device.id}&orientation=${device.orientation}&scale=75&autoplay=true`,
    expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour expiry
  };
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/appetize-api/, '');

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createSupabaseClient(authHeader);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    switch (path) {
      case '/devices': {
        if (req.method === 'GET') {
          return new Response(JSON.stringify({ devices: SUPPORTED_DEVICES }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;
      }

      case '/sessions': {
        if (req.method === 'POST') {
          const body: CreateSessionRequest = await req.json();
          const device = SUPPORTED_DEVICES.find(d => d.id === body.deviceId);
          
          if (!device) {
            return new Response(JSON.stringify({ error: 'Invalid device ID' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          // Store session in database for tracking
          const { error: insertError } = await supabase
            .from('preview_sessions')
            .insert({
              user_id: user.id,
              project_id: body.projectId,
              device_id: body.deviceId,
              app_url: body.appUrl,
              status: 'creating',
            });

          if (insertError) {
            console.error('Error storing session:', insertError);
          }

          try {
            const session = await createAppetizeSession(body.appUrl, device);
            
            // Update session with success status
            await supabase
              .from('preview_sessions')
              .update({
                session_id: session.sessionId,
                public_key: session.publicKey,
                preview_url: session.url,
                expires_at: session.expiresAt,
                status: 'active',
              })
              .eq('user_id', user.id)
              .eq('project_id', body.projectId)
              .order('created_at', { ascending: false })
              .limit(1);

            return new Response(JSON.stringify(session), {
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          } catch (error) {
            // Update session with error status
            await supabase
              .from('preview_sessions')
              .update({
                status: 'error',
                error_message: error.message,
              })
              .eq('user_id', user.id)
              .eq('project_id', body.projectId)
              .order('created_at', { ascending: false })
              .limit(1);

            throw error;
          }
        }
        break;
      }

      case '/sessions/status': {
        if (req.method === 'GET') {
          const sessionId = url.searchParams.get('sessionId');
          const projectId = url.searchParams.get('projectId');

          if (!sessionId && !projectId) {
            return new Response(JSON.stringify({ error: 'Missing sessionId or projectId' }), {
              status: 400,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          const query = supabase
            .from('preview_sessions')
            .select('*')
            .eq('user_id', user.id);

          if (sessionId) {
            query.eq('session_id', sessionId);
          } else if (projectId) {
            query.eq('project_id', projectId)
              .order('created_at', { ascending: false })
              .limit(1);
          }

          const { data, error } = await query.single();

          if (error || !data) {
            return new Response(JSON.stringify({ error: 'Session not found' }), {
              status: 404,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }

          return new Response(JSON.stringify(data), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;
      }

      case '/sessions/end': {
        if (req.method === 'POST') {
          const { sessionId } = await req.json();

          // Update session status
          const { error } = await supabase
            .from('preview_sessions')
            .update({
              status: 'ended',
              ended_at: new Date().toISOString(),
            })
            .eq('session_id', sessionId)
            .eq('user_id', user.id);

          if (error) {
            throw error;
          }

          // Call Appetize API to end session
          await fetch(`${APPETIZE_API_URL}/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${APPETIZE_API_KEY}`,
            },
          });

          return new Response(JSON.stringify({ success: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        break;
      }

      default: {
        return new Response(JSON.stringify({ error: 'Not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in appetize-api:', error);
    return new Response(JSON.stringify({ error: error.message || 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});