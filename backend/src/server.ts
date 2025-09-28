import 'dotenv/config'
import Fastify from 'fastify'

const server = Fastify({ logger: true })

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

// register ETag plugin (Phase 2 requirement)
import etagPlugin from './plugins/etag'
server.register(etagPlugin)

const start = async () => {
  try {
    await server.listen({ port: 3000, host: '0.0.0.0' })
    server.log.info('Server listening on 0.0.0.0:3000')
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

start()
