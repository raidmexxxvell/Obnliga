import { FastifyInstance } from 'fastify'
import prisma from '../db'
import jwt from 'jsonwebtoken'

export default async function (server: FastifyInstance) {
  // Temporary admin-only test login endpoint.
  // Protect by ADMIN_SECRET header. Do NOT enable permanently in production without review.
  server.post('/api/admin/test-login', async (request, reply) => {
    const headerSecret = (request.headers['x-admin-secret'] || '') as string
    const adminSecret = process.env.ADMIN_SECRET
    if (!adminSecret || headerSecret !== adminSecret) {
      return reply.status(403).send({ error: 'forbidden' })
    }

    const body = request.body as any
    const { userId, username, photoUrl } = body || {}
    if (!userId) return reply.status(400).send({ error: 'userId required' })

    try {
      const user = await (prisma as any).user.upsert({
        where: { userId: BigInt(userId) as any },
        create: { userId: BigInt(userId) as any, tgUsername: username, photoUrl },
        update: { tgUsername: username, photoUrl },
      })

      const jwtSecret = process.env.JWT_SECRET || process.env.TELEGRAM_BOT_TOKEN || 'dev-secret'
      const token = jwt.sign({ sub: String(user.userId), username: user.tgUsername }, jwtSecret, { expiresIn: '7d' })

      // Return token + user for quick testing
      return reply.send({ ok: true, user, token })
    } catch (err) {
      server.log.error({ err }, 'admin test-login failed')
      return reply.status(500).send({ error: 'internal' })
    }
  })
}
