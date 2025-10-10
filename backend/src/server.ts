import 'dotenv/config'
import Fastify from 'fastify'
import cors from '@fastify/cors'

const server = Fastify({ logger: true })

// Register CORS to allow frontend requests from different origin
server.register(cors, {
  origin: true, // Allow all origins in development, configure specifically for production
  credentials: true
})

server.get('/health', async () => {
  // TODO: extend health checks (DB, Redis, queues) in Phase 9
  return { status: 'ok' }
})

// Root route: redirect to WEBAPP_URL when available, otherwise return a small JSON.
server.get('/', async (request, reply) => {
  const webapp = process.env.WEBAPP_URL
  if (webapp) {
    return reply.redirect(webapp)
  }
  return reply.send({ message: 'Obnliga backend', health: '/health', api: ['/api/cache/:key'] })
})

// start Telegram bot if available
import { startBot } from './bot'
startBot().catch((e) => {
  server.log.warn({ err: e }, 'bot start failed')
})

// register cache routes (demo)
import cacheRoutes from './routes/cacheRoutes'
server.register(cacheRoutes)

// register user routes
import userRoutes from './routes/userRoutes'
server.register(userRoutes)

// register auth routes (telegram initData verifier)
import authRoutes from './routes/authRoutes'
server.register(authRoutes)

// register admin routes (RBAC / dashboard)
import adminRoutes from './routes/adminRoutes'
server.register(adminRoutes)

// register lineup portal routes (captain portal)
import lineupRoutes from './routes/lineupRoutes'
server.register(lineupRoutes)

// register judge portal routes
import judgeRoutes from './routes/judgeRoutes'
server.register(judgeRoutes)

// register public bracket routes
import bracketRoutes from './routes/bracketRoutes'
server.register(bracketRoutes)

// register public news routes
import newsRoutes from './routes/newsRoutes'
server.register(newsRoutes)

// register fastify websocket & cookie plugins and realtime
// websocket & cookie plugins and realtime will be registered in start() to avoid top-level await
import websocketPlugin from '@fastify/websocket'
import cookiePlugin from '@fastify/cookie'
import registerRealtime from './realtime'

// register ETag plugin (Phase 2 requirement)
import etagPlugin from './plugins/etag'
server.register(etagPlugin)

// news worker supervisor (BullMQ)
import { startNewsWorkerSupervisor, shutdownNewsWorker } from './queue/newsWorker'

server.addHook('onClose', async () => {
  await shutdownNewsWorker(server.log)
})

const start = async () => {
  try {
    // register cookie & websocket plugins and realtime module
    await server.register(cookiePlugin)
    await server.register(websocketPlugin)
    await registerRealtime(server)
    await startNewsWorkerSupervisor(server.log)
    await server.listen({ port: 3000, host: '0.0.0.0' })
    server.log.info('Server listening on 0.0.0.0:3000')
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
