import { createClient } from '@supabase/supabase-js'
import type { Context, Next } from 'hono'

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
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_ANON_KEY!,
    )

    const { data: { user }, error } = await supabase.auth.getUser(token)

    if (error || !user) {
      return { authorized: false, error: 'Invalid token' }
    }

    return { authorized: true, userId: user.id }
  } catch {
    return { authorized: false, error: 'Authentication error' }
  }
}

/**
 * Hono middleware that validates the JWT and sets `c.set('userId', ...)`.
 * Returns 401 JSON on failure.
 */
export async function authMiddleware(c: Context, next: Next) {
  const result = await requireAuth(c.req.raw)
  if (!result.authorized) {
    return c.json({ error: result.error }, 401)
  }
  c.set('userId', result.userId)
  await next()
}
