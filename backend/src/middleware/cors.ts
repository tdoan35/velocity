import { cors } from 'hono/cors'

export function corsMiddleware() {
  const origins = process.env.CORS_ORIGINS
  const allowOrigin = origins ? origins.split(',').map(o => o.trim()) : '*'

  return cors({
    origin: allowOrigin,
    allowHeaders: ['Authorization', 'Content-Type', 'x-client-info', 'apikey'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    maxAge: 86400,
  })
}
