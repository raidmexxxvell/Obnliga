import { FastifyInstance } from 'fastify'
import prisma from '../db'
import jwt from 'jsonwebtoken'
import { timingSafeEqual } from 'crypto'

const secureEquals = (left: string, right: string) => {
  const leftBuf = Buffer.from(left)
  const rightBuf = Buffer.from(right)
  if (leftBuf.length !== rightBuf.length) {
    return false
  }
  return timingSafeEqual(leftBuf, rightBuf)
}

export default async function (server: FastifyInstance) {
  server.post('/api/admin/login', async (request, reply) => {
    const { login, password } = (request.body || {}) as { login?: string; password?: string }

    if (!login || !password) {
      return reply.status(400).send({ ok: false, error: 'login_and_password_required' })
    }

    const expectedLogin = process.env.LOGIN_ADMIN
    const expectedPassword = process.env.PASSWORD_ADMIN

    if (!expectedLogin || !expectedPassword) {
      server.log.error('LOGIN_ADMIN or PASSWORD_ADMIN env variables are not configured')
      return reply.status(503).send({ ok: false, error: 'admin_auth_unavailable' })
    }

    const loginMatches = secureEquals(login, expectedLogin)
    const passwordMatches = secureEquals(password, expectedPassword)

    if (!loginMatches || !passwordMatches) {
      server.log.warn({ login }, 'admin login failed')
      return reply.status(401).send({ ok: false, error: 'invalid_credentials' })
    }

    const jwtSecret = process.env.JWT_SECRET || process.env.TELEGRAM_BOT_TOKEN || 'admin-dev-secret'
    const token = jwt.sign({ sub: 'admin', role: 'admin' }, jwtSecret, {
      expiresIn: '2h',
      issuer: 'obnliga-backend',
      audience: 'admin-dashboard'
    })

    return reply.send({ ok: true, token, expiresIn: 7200 })
  })

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
