import { FastifyInstance } from 'fastify'
import { defaultCache as cache } from '../cache'

export default async function (server: FastifyInstance) {
  server.get('/api/cache/:key', async (request, reply) => {
    const { key } = request.params as any
    const value = await cache.get(key, async () => {
      // demo loader — in real app replace with DB fetch
      return { at: new Date().toISOString(), key }
    }, 30)
    return reply.send(value)
  })

  server.post('/api/cache/invalidate/:key', async (request, reply) => {
    const { key } = request.params as any
    await cache.invalidate(key)
    return reply.send({ ok: true })
  })
}
