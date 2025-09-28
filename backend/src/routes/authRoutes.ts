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
    // Telegram WebApp initData can contain flattened fields (id, username, photo_url)
    // or a JSON-encoded `user` field. Support both.
    let userId = params.id
    let username = params.username ?? params.first_name
    let photoUrl = params.photo_url
    if (!userId && params.user) {
      try {
        const uobj = JSON.parse(params.user)
        userId = String(uobj.id ?? uobj.user_id)
        username = username || (uobj.username ?? uobj.first_name)
        photoUrl = photoUrl || (uobj.photo_url || uobj.photoUrl)
      } catch (e) {
        // ignore parse errors
      }
    }

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

  // Get current user by JWT (cookie, Authorization header, or ?token=)
  server.get('/api/auth/me', async (request, reply) => {
    const authHeader = (request.headers && (request.headers.authorization as string)) || ''
    const qToken = (request.query as any)?.token
    const cookieToken = (request as any).cookies?.session
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : (qToken || cookieToken)
    if (!token) return reply.status(401).send({ error: 'no_token' })
    const jwtSecret = process.env.JWT_SECRET || process.env.TELEGRAM_BOT_TOKEN || 'dev-secret'
    try {
      const payload: any = jwt.verify(token, jwtSecret)
      const sub = payload?.sub
      if (!sub) return reply.status(401).send({ error: 'bad_token' })
      // find user by userId (stored as BigInt in DB)
      const u = await (prisma as any).user.findUnique({ where: { userId: BigInt(sub) as any } })
      if (!u) return reply.status(404).send({ error: 'not_found' })
      return reply.send({ ok: true, user: u })
    } catch (e) {
      const msg = (e as any)?.message
      return reply.status(401).send({ error: 'invalid_token', detail: msg })
    }
  })
}
