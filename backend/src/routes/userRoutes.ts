import { FastifyInstance } from 'fastify'
import prisma from '../db'
import { serializePrisma } from '../utils/serialization'
import { defaultCache } from '../cache'

export default async function (server: FastifyInstance) {
  // Update user profile (with real-time broadcasting)
  server.put('/api/users/:userId', async (request, reply) => {
    const { userId } = request.params as any
    const body = request.body as any
    const { tgUsername, photoUrl } = body
    
    if (!userId) return reply.status(400).send({ error: 'userId is required' })

    try {
      const user = await (prisma as any).user.update({
        where: { userId: BigInt(userId) as any },
        data: {
          tgUsername,
          photoUrl,
          updatedAt: new Date()
        },
      })

      // Invalidate cache after update
      const userCacheKey = `user:${userId}`
      await defaultCache.invalidate(userCacheKey)

      // Publish real-time updates для WebSocket subscribers
      try {
        const userPayload = serializePrisma(user)
        
        // Персональный топик пользователя
        await (server as any).publishTopic(`user:${userId}`, {
          type: 'profile_updated',
          userId: userPayload.userId,
          tgUsername: userPayload.tgUsername,
          photoUrl: userPayload.photoUrl,
          updatedAt: userPayload.updatedAt
        })
        
        // Глобальный топик профилей
        await (server as any).publishTopic('profile', {
          type: 'profile_updated', 
          userId: userPayload.userId,
          tgUsername: userPayload.tgUsername,
          photoUrl: userPayload.photoUrl,
          updatedAt: userPayload.updatedAt
        })
        
        server.log.info({ userId }, 'Published profile updates to WebSocket topics')
      } catch (wsError) {
        server.log.warn({ err: wsError }, 'Failed to publish WebSocket updates')
      }

      return reply.send(serializePrisma(user))
    } catch (err) {
      server.log.error({ err }, 'user update failed')
      return reply.status(500).send({ error: 'internal' })
    }
  })

  // Batch update users (для админки)
  server.put('/api/users/batch', async (request, reply) => {
    const body = request.body as any
    const { updates } = body // [{ userId, tgUsername?, photoUrl? }]
    
    if (!Array.isArray(updates)) {
      return reply.status(400).send({ error: 'updates array is required' })
    }

    try {
      const results: any[] = []
      
      for (const update of updates) {
        const { userId, tgUsername, photoUrl } = update
        if (!userId) continue

        const user = await (prisma as any).user.update({
          where: { userId: BigInt(userId) as any },
          data: {
            ...(tgUsername !== undefined && { tgUsername }),
            ...(photoUrl !== undefined && { photoUrl }),
            updatedAt: new Date()
          },
        })

        // Invalidate cache
        const userCacheKey = `user:${userId}`
        await defaultCache.invalidate(userCacheKey)

        const userPayload = serializePrisma(user)
        results.push(userPayload)

        // Publish updates
        try {
          await (server as any).publishTopic(`user:${userId}`, {
            type: 'profile_updated',
            userId: userPayload.userId,
            tgUsername: userPayload.tgUsername,
            photoUrl: userPayload.photoUrl,
            updatedAt: userPayload.updatedAt
          })
          
          await (server as any).publishTopic('profile', {
            type: 'profile_updated',
            userId: userPayload.userId,
            tgUsername: userPayload.tgUsername,
            photoUrl: userPayload.photoUrl,
            updatedAt: userPayload.updatedAt
          })
        } catch (wsError) {
          server.log.warn({ err: wsError, userId }, 'Failed to publish WebSocket updates')
        }
      }

      server.log.info({ count: results.length }, 'Batch updated users with WebSocket notifications')
      return reply.send({ updated: results.length, users: results })
    } catch (err) {
      server.log.error({ err }, 'batch user update failed')
      return reply.status(500).send({ error: 'internal' })
    }
  })

  // Create or update user (idempotent upsert by userId) - existing endpoint
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

      // Invalidate cache after upsert
      const userCacheKey = `user:${userId}`
      await defaultCache.invalidate(userCacheKey)

      // Publish real-time updates для WebSocket subscribers
      try {
        const userPayload = serializePrisma(user)
        
        // Персональный топик пользователя
        await (server as any).publishTopic(`user:${userId}`, {
          type: 'profile_updated',
          userId: userPayload.userId,
          tgUsername: userPayload.tgUsername,
          photoUrl: userPayload.photoUrl,
          updatedAt: userPayload.updatedAt
        })
        
        // Глобальный топик профилей
        await (server as any).publishTopic('profile', {
          type: 'profile_updated',
          userId: userPayload.userId,
          tgUsername: userPayload.tgUsername,
          photoUrl: userPayload.photoUrl,
          updatedAt: userPayload.updatedAt
        })
        
        server.log.info({ userId }, 'Published profile updates to WebSocket topics')
      } catch (wsError) {
        server.log.warn({ err: wsError }, 'Failed to publish WebSocket updates')
      }

      return reply.send(serializePrisma(user))
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
      // Use cache for user data (5 min TTL)
      const cacheKey = `user:${userId}`
      const u = await defaultCache.get(cacheKey, async () => {
        return await (prisma as any).user.findUnique({ where: { userId: BigInt(userId) as any } })
      }, 300) // 5 minutes TTL
      
      if (!u) return reply.status(404).send({ error: 'not_found' })
      return reply.send(serializePrisma(u))
    } catch (err) {
      server.log.error({ err }, 'user fetch failed')
      return reply.status(500).send({ error: 'internal' })
    }
  })
}