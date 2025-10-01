import { FastifyInstance } from 'fastify'
import prisma from '../db'
import jwt from 'jsonwebtoken'
import { parse as parseInitData, validate as validateInitData, validate3rd as validateInitDataSignature } from '@telegram-apps/init-data-node'
import { serializePrisma } from '../utils/serialization'
import { defaultCache } from '../cache'

const INIT_DATA_MAX_AGE_SEC = 24 * 60 * 60

export default async function (server: FastifyInstance) {
  // Simple CORS preflight handlers for auth endpoints (used when frontend is served from a different origin)
  server.options('/api/auth/telegram-init', async (request, reply) => {
    const origin = (request.headers.origin as string) || '*'
    reply.header('Access-Control-Allow-Origin', origin)
    reply.header('Access-Control-Allow-Credentials', 'true')
    reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    reply.header('Access-Control-Max-Age', '600')
    return reply.status(204).send()
  })
  server.options('/api/auth/me', async (request, reply) => {
    const origin = (request.headers.origin as string) || '*'
    reply.header('Access-Control-Allow-Origin', origin)
    reply.header('Access-Control-Allow-Credentials', 'true')
    reply.header('Access-Control-Allow-Methods', 'GET, OPTIONS')
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    reply.header('Access-Control-Max-Age', '600')
    return reply.status(204).send()
  })
  server.post('/api/auth/telegram-init', async (request, reply) => {
    const body = request.body as any
    // Accept initData from multiple possible places (body, query, header)
    const q = request.query as any
    const headerInit = (request.headers['x-telegram-init-data'] || request.headers['x-telegram-initdata']) as string | undefined
    const rawCandidate = body?.initData || body?.init_data || q?.initData || q?.init_data || headerInit || (typeof body === 'string' ? body : undefined)
    if (!rawCandidate) return reply.status(400).send({ error: 'initData required' })

    const botToken = process.env.TELEGRAM_BOT_TOKEN
    if (!botToken) {
      server.log.warn('TELEGRAM_BOT_TOKEN not set; cannot verify initData')
      return reply.status(500).send({ error: 'server misconfigured' })
    }

    const rawInitData = String(rawCandidate || '')
    const trimmedInitData = rawInitData.trim()

    let userId: string | undefined
    let username: string | undefined
    let photoUrl: string | undefined
    let authDateSec: number | undefined
    let verificationMethod: 'hash' | 'signature' | 'json' | undefined

    try {
      if (!trimmedInitData) {
        throw new Error('empty_init_data')
      }

      if (trimmedInitData.startsWith('{')) {
        // JSON payload — fallback for dev environments when initData string is unavailable.
        verificationMethod = 'json'
        const parsed = JSON.parse(trimmedInitData)
        const u = parsed?.user
        if (!u?.id) {
          throw new Error('json_payload_missing_user')
        }
        userId = String(u.id)
        username = u.username || u.first_name || u.last_name
        photoUrl = u.photo_url || u.photoUrl
        if (u.auth_date) authDateSec = Number(u.auth_date)
        server.log.warn({ userId }, 'telegram-init: accepted JSON user payload without signature (dev fallback)')
        server.log.info({ userId, username, photoUrl, verificationMethod }, 'telegram-init: initData processed via JSON payload')
      } else {
        // Signed initData — verify using hash and fall back to Telegram signature.
        const maxAge = INIT_DATA_MAX_AGE_SEC
        try {
          validateInitData(trimmedInitData, botToken, { expiresIn: maxAge })
          verificationMethod = 'hash'
        } catch (hashErr) {
          const botId = Number.parseInt(botToken.split(':')[0] ?? '', 10)
          server.log.warn({ err: hashErr }, 'telegram-init: hash verification failed, attempting signature fallback')
          if (!Number.isFinite(botId)) {
            throw hashErr
          }
          await validateInitDataSignature(trimmedInitData, botId, { expiresIn: maxAge })
          verificationMethod = 'signature'
        }

        const parsed = parseInitData(trimmedInitData, true) as any
        const parsedUser = parsed?.user
        if (parsedUser?.id != null) {
          userId = String(parsedUser.id)
        }
        if (parsedUser) {
          const composedName = [parsedUser.firstName, parsedUser.lastName].filter(Boolean).join(' ').trim()
          username = parsedUser.username || (composedName.length ? composedName : undefined)
          photoUrl = parsedUser.photoUrl || photoUrl
        }
        const parsedAuth = parsed?.authDate
        if (parsedAuth instanceof Date) {
          authDateSec = Math.floor(parsedAuth.getTime() / 1000)
        } else if (typeof parsedAuth === 'number') {
          authDateSec = parsedAuth
        } else if (typeof parsedAuth === 'string') {
          const parsedNumber = Number(parsedAuth)
          if (!Number.isNaN(parsedNumber)) authDateSec = parsedNumber
        }

        server.log.info({ userId, username, photoUrl, verificationMethod }, 'telegram-init: initData verified')
      }
    } catch (err) {
      server.log.warn({ err, rawCandidate }, 'initData verification failed')
      return reply.status(403).send({ error: 'invalid_init_data' })
    }

    if (authDateSec) {
      const nowSec = Math.floor(Date.now() / 1000)
      if (nowSec - authDateSec > INIT_DATA_MAX_AGE_SEC) {
        server.log.info({ auth_date: authDateSec }, 'telegram-init: auth_date expired')
        return reply.status(403).send({ error: 'init_data_expired' })
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

      // Invalidate cache after upsert
      const userCacheKey = `user:${userId}`
      await defaultCache.invalidate(userCacheKey)

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

      const serializedUser = serializePrisma(user)
  const origin = (request.headers.origin as string) || '*'
  reply.header('Access-Control-Allow-Origin', origin)
  reply.header('Access-Control-Allow-Credentials', 'true')
      return reply.send({ ok: true, user: serializedUser, token })
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
      const jwtPayload: any = jwt.verify(token, jwtSecret)
      const sub = jwtPayload?.sub
      if (!sub) return reply.status(401).send({ error: 'bad_token' })
      
      // Use cache for user data (5 min TTL)
      const cacheKey = `user:${sub}`
      const u = await defaultCache.get(cacheKey, async () => {
        return await (prisma as any).user.findUnique({ where: { userId: BigInt(sub) as any } })
      }, 300) // 5 minutes TTL
      
      if (!u) return reply.status(404).send({ error: 'not_found' })
      const serializedUser = serializePrisma(u)
  const origin = (request.headers.origin as string) || '*'
  reply.header('Access-Control-Allow-Origin', origin)
  reply.header('Access-Control-Allow-Credentials', 'true')
      return reply.send({ ok: true, user: serializedUser })
    } catch (e) {
      const msg = (e as any)?.message
      return reply.status(401).send({ error: 'invalid_token', detail: msg })
    }
  })
}
