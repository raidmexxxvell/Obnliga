import QuickLRU from 'quick-lru'
import Redis from 'ioredis'
import dotenv from 'dotenv'

dotenv.config({ path: __dirname + '/../../.env' })

type Loader<T> = () => Promise<T>

const INVALIDATION_CHANNEL = 'multilevel-cache:invalidate'

export class MultiLevelCache {
  private lru: QuickLRU<string, any>
  private redis: Redis | null

  constructor(redisUrl?: string, lruOptions = { maxSize: 1000 }) {
    this.lru = new QuickLRU<string, any>(lruOptions)
    if (redisUrl) {
      this.redis = new Redis(redisUrl)
      // subscribe to invalidation messages
      const sub = new Redis(redisUrl)
      sub.subscribe(INVALIDATION_CHANNEL, (err) => {
        if (err) console.warn('Failed to subscribe cache invalidation channel', err)
      })
      sub.on('message', (_channel, message) => {
        try {
          const parsed = JSON.parse(message)
          if (parsed && parsed.key) {
            this.lru.delete(parsed.key)
          }
        } catch (e) {
          // ignore
        }
      })
    } else {
      this.redis = null
    }
  }

  async get<T>(key: string, loader: Loader<T>, ttlSeconds?: number): Promise<T> {
    // try in-memory
    if (this.lru.has(key)) {
      return this.lru.get(key) as T
    }

    // try redis
    if (this.redis) {
      const val = await this.redis.get(key)
      if (val != null) {
        try {
          const parsed = JSON.parse(val) as T
          // warm in-memory
          this.lru.set(key, parsed)
          return parsed
        } catch (e) {
          // fallthrough
        }
      }
    }

    // load fresh
    const fresh = await loader()
    // set in both layers
    this.lru.set(key, fresh)
    if (this.redis) {
      try {
        const payload = JSON.stringify(fresh)
        if (ttlSeconds && ttlSeconds > 0) {
          await this.redis.setex(key, ttlSeconds, payload)
        } else {
          await this.redis.set(key, payload)
        }
      } catch (e) {
        // ignore
      }
    }
    return fresh
  }

  async set<T>(key: string, value: T, ttlSeconds?: number) {
    this.lru.set(key, value)
    if (this.redis) {
      try {
        const payload = JSON.stringify(value)
        if (ttlSeconds && ttlSeconds > 0) {
          await this.redis.setex(key, ttlSeconds, payload)
        } else {
          await this.redis.set(key, payload)
        }
      } catch (e) {
        // ignore
      }
    }
    // publish invalidation so other instances can invalidate local caches (they'll re-read if requested)
    if (this.redis) {
      try {
        await this.redis.publish(INVALIDATION_CHANNEL, JSON.stringify({ key }))
      } catch (e) {
        // ignore
      }
    }
  }

  async invalidate(key: string) {
    this.lru.delete(key)
    if (this.redis) {
      try {
        await this.redis.del(key)
        await this.redis.publish(INVALIDATION_CHANNEL, JSON.stringify({ key }))
      } catch (e) {
        // ignore
      }
    }
  }
}

// create a default cache instance using REDIS_URL from env if present
const redisUrl = process.env.REDIS_URL || process.env.REDIS || undefined
export const defaultCache = new MultiLevelCache(redisUrl, { maxSize: 500 })

export default defaultCache
