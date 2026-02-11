import 'dotenv/config'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { corsMiddleware } from './middleware/cors.js'
import conversationRoutes from './routes/conversation.js'

const app = new Hono()

// Global middleware
app.use('*', corsMiddleware())

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', service: 'velocity-backend', timestamp: new Date().toISOString() })
})

// Routes
app.route('/v1/conversation', conversationRoutes)

// Start server
const port = parseInt(process.env.PORT || '8080', 10)

console.log(`Starting velocity-backend on port ${port}`)

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`velocity-backend listening on http://localhost:${info.port}`)
})
