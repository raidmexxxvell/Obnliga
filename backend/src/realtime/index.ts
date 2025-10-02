import { FastifyInstance } from 'fastify'
import Redis from 'ioredis'
import jwt from 'jsonwebtoken'

type WS = any

export default async function registerRealtime(server: FastifyInstance) {
  const redisUrl = process.env.REDIS_URL
  const pub = redisUrl ? new Redis(redisUrl) : new Redis()
  const sub = redisUrl ? new Redis(redisUrl) : new Redis()

  // topic -> Set of sockets
  const topicMap = new Map<string, Set<WS>>()

  // when redis message arrives, forward to sockets
  sub.on('message', (channel: string, message: string) => {
    const set = topicMap.get(channel)
    if (!set) return
    for (const ws of set) {
      try { ws.send(JSON.stringify({ type: 'patch', topic: channel, payload: JSON.parse(message) })) } catch(e) {}
    }
  })

  // register websocket route
  // NOTE: plugin @fastify/websocket must be registered in server
  server.get('/realtime', { websocket: true }, (connection: any, req: any) => {
    // fastify-websocket will set connection.socket
    const socket: any = connection.socket
    // verify token
    const token = (req.query && req.query.token) || (req.headers && req.headers['sec-websocket-protocol'])
    const jwtSecret = process.env.JWT_SECRET || process.env.TELEGRAM_BOT_TOKEN || 'dev-secret'
    try {
      if (!token) throw new Error('no token')
      jwt.verify(String(token), jwtSecret)
    } catch (e) {
      socket.close(4001, 'unauthorized')
      return
    }

  socket.topics = new Set<string>()

    socket.on('message', async (raw: any) => {
      let msg: any
      try { msg = JSON.parse(String(raw)) } catch (e) { return }
      const { action, topic } = msg as { action?: string; topic?: string } || {}
      if (!topic || typeof topic !== 'string') return
      if (action === 'subscribe') {
        let set = topicMap.get(topic)
        if (!set) {
          set = new Set()
          topicMap.set(topic, set)
          await sub.subscribe(topic)
        }
        set.add(socket)
        socket.topics.add(topic)
        socket.send(JSON.stringify({ type: 'subscribed', topic }))
      } else if (action === 'unsubscribe') {
        const set = topicMap.get(topic)
        if (set) {
          set.delete(socket)
          socket.topics.delete(topic)
          if (set.size === 0) {
            topicMap.delete(topic)
            await sub.unsubscribe(topic)
          }
        }
        socket.send(JSON.stringify({ type: 'unsubscribed', topic }))
      }
    })

    socket.on('close', async () => {
      for (const topic of Array.from(socket.topics as Set<string>)) {
        const set = topicMap.get(topic)
        if (!set) continue
        set.delete(socket)
        if (set.size === 0) {
          topicMap.delete(topic)
          await sub.unsubscribe(topic)
        }
      }
    })
  })

  // helper to publish patches from server-side code
  server.decorate('publishTopic', async (topic: string, payload: any) => {
    await pub.publish(topic, JSON.stringify(payload))
  })
}
