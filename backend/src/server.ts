import Fastify from 'fastify'

const server = Fastify({ logger: true })

server.get('/health', async () => {
  // TODO: extend health checks (DB, Redis, queues) in Phase 9
  return { status: 'ok' }
})

// start Telegram bot if available
import { startBot } from './bot'
startBot().catch((e) => {
  server.log.warn({ err: e }, 'bot start failed')
})

// register cache routes (demo)
import cacheRoutes from './routes/cacheRoutes'
server.register(cacheRoutes)

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
