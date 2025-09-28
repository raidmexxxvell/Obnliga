import { FastifyInstance } from 'fastify'
import prisma from '../db'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

function verifyInitData(initData: string, botToken: string) {
  try {
    const params = Object.fromEntries(new URLSearchParams(initData)) as Record<string, string>
    const hash = params.hash
    if (!hash) return false
    // remove hash
    delete params.hash

    const dataCheckArray = Object.keys(params).sort().map(k => `${k}=${params[k]}`)
    const dataCheckString = dataCheckArray.join('\n')

    // secret_key = sha256(bot_token)
    const secretKey = crypto.createHash('sha256').update(botToken).digest()
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
    return hmac === hash
  } catch (e) {
    return false
  }
}

export default async function (server: FastifyInstance) {
  server.post('/api/auth/telegram-init', async (request, reply) => {
    const body = request.body as any
    const { initData } = body || {}
    if (!initData) return reply.status(400).send({ error: 'initData required' })

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      server.log.warn('TELEGRAM_BOT_TOKEN not set; cannot verify initData')
      return reply.status(500).send({ error: 'server misconfigured' })
    }

    const ok = verifyInitData(initData, botToken)
    if (!ok) return reply.status(403).send({ error: 'invalid_init_data' })

    const params = Object.fromEntries(new URLSearchParams(initData)) as Record<string, string>
    const userId = params.id
    const username = params.username ?? params.first_name
    const photoUrl = params.photo_url

    if (!userId) return reply.status(400).send({ error: 'user id missing' })

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

      // Create a JWT session token (short lived) and set as httpOnly cookie
      const jwtSecret = process.env.JWT_SECRET || process.env.TELEGRAM_BOT_TOKEN || 'dev-secret'
      const token = jwt.sign({ sub: String(user.userId), username: user.tgUsername }, jwtSecret, { expiresIn: '7d' })

      // set cookie (httpOnly). Fastify reply.setCookie requires fastify-cookie plugin; we fallback to header if not present.
      try {
        // try set cookie if plugin available
        ;(reply as any).setCookie?.('session', token, { httpOnly: true, path: '/', sameSite: 'lax' })
      } catch (e) {
        // fallback: send token in body only
      }

      return reply.send({ ok: true, user, token })
    } catch (err) {
      server.log.error({ err }, 'telegram-init upsert failed')
      return reply.status(500).send({ error: 'internal' })
    }
  })
}
