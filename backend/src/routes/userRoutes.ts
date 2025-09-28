import { FastifyInstance } from 'fastify'
import prisma from '../db'

export default async function (server: FastifyInstance) {
  // Create or update user (idempotent upsert by userId)
  server.post('/api/users', async (request, reply) => {
    const body = request.body as any
    const { userId, username, photoUrl } = body
    if (!userId) return reply.status(400).send({ error: 'userId is required' })

    try {
      const user = await (prisma as any).user.upsert({
        where: { userId: BigInt(userId) as any },
        create: {
          userId: BigInt(userId) as any,
          tgUsername: username,
          photoUrl,
        },
        update: {
          tgUsername: username,
          photoUrl,
        },
      })
      return reply.send(user)
    } catch (err) {
      server.log.error({ err }, 'user upsert failed')
      return reply.status(500).send({ error: 'internal' })
    }
  })

  // Get user by Telegram userId
  server.get('/api/users/:userId', async (request, reply) => {
    const { userId } = request.params as any
    if (!userId) return reply.status(400).send({ error: 'userId required' })
    try {
      const u = await (prisma as any).user.findUnique({ where: { userId: BigInt(userId) as any } })
      if (!u) return reply.status(404).send({ error: 'not_found' })
      return reply.send(u)
    } catch (err) {
      server.log.error({ err }, 'user fetch failed')
      return reply.status(500).send({ error: 'internal' })
    }
  })
}
