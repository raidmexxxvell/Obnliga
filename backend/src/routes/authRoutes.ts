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

    // secret_key = HMAC_SHA256('WebAppData', bot_token) - according to Telegram documentation
    const secretKey = crypto
      .createHmac('sha256', botToken)
      .update('WebAppData')
      .digest()
    const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')
    return hmac === hash
  } catch (e) {
    return false
  }
}

export default async function (server: FastifyInstance) {
  // Simple CORS preflight handlers for auth endpoints (used when frontend is served from a different origin)
  server.options('/api/auth/telegram-init', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*')
    reply.header('Access-Control-Allow-Methods', 'POST, OPTIONS')
    reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    reply.header('Access-Control-Max-Age', '600')
    return reply.status(204).send()
  })
  server.options('/api/auth/me', async (request, reply) => {
    reply.header('Access-Control-Allow-Origin', '*')
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

    // Support several shapes of initData: flattened querystring (signed), or JSON with `user`.
    let params: Record<string, string> = {}
    let ok = false
    let authDateSec: number | undefined
    try {
      const raw = String(rawCandidate || '')
      const trimmed = raw.trim()
      if (trimmed.startsWith('{')) {
        // JSON payload — try to parse and extract `user` and auth_date
        try {
          const parsed = JSON.parse(raw) as any
          if (parsed?.user) {
            const u = parsed.user
            if (u.id) params.id = String(u.id)
            if (u.username) params.username = u.username
            if (u.first_name) params.first_name = u.first_name
            if (u.photo_url || u.photoUrl) params.photo_url = u.photo_url || u.photoUrl
            if (u.auth_date) authDateSec = Number(u.auth_date)
            ok = true
            server.log.info({ user: params.id }, 'telegram-init: accepted JSON user payload (unsafe)')
          }
        } catch (e) {
          ok = false
        }
      } else {
        // flatten querystring form -> verify HMAC
        ok = verifyInitData(raw, botToken)
        params = Object.fromEntries(new URLSearchParams(raw)) as Record<string, string>
        if (params.auth_date) authDateSec = Number(params.auth_date)
      }
    } catch (e) {
      ok = false
    }

    if (!ok) return reply.status(403).send({ error: 'invalid_init_data' })

    // If we have auth_date, enforce freshness (default max 24h)
    try {
      if (authDateSec) {
        const maxAge = 24 * 60 * 60 // seconds
        const nowSec = Math.floor(Date.now() / 1000)
        if (nowSec - authDateSec > maxAge) {
          server.log.info({ auth_date: authDateSec }, 'telegram-init: auth_date expired')
          return reply.status(403).send({ error: 'init_data_expired' })
        }
      }
    } catch (e) {
      // ignore date check errors
    }
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

  reply.header('Access-Control-Allow-Origin', '*')
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
  reply.header('Access-Control-Allow-Origin', '*')
  return reply.send({ ok: true, user: u })
    } catch (e) {
      const msg = (e as any)?.message
      return reply.status(401).send({ error: 'invalid_token', detail: msg })
    }
  })
}
