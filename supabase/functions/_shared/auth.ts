// Authentication middleware for Edge Functions
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

export interface AuthResult {
  authorized: boolean
  userId?: string
  error?: string
}

export async function requireAuth(req: Request): Promise<AuthResult> {
  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return { authorized: false, error: 'Missing authorization header' }
    }

    const token = authHeader.replace('Bearer ', '')
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!
    )

    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      return { authorized: false, error: 'Invalid token' }
    }

    return { authorized: true, userId: user.id }
  } catch (error) {
    return { authorized: false, error: 'Authentication error' }
  }
}