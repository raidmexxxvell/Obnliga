import React, { useEffect, useState } from 'react'
import './profile.css'
import { wsClient } from './wsClient'

interface CacheEntry {
  data: any
  timestamp: number
  etag?: string
}

const CACHE_TTL = 5 * 60 * 1000 // 5 минут
const CACHE_KEY = 'obnliga_profile_cache'

export default function Profile() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // WebSocket real-time updates для профиля
  useEffect(() => {
    if (!user?.userId) return

    const userTopic = `user:${user.userId}`
    const profileTopic = 'profile' // Глобальные обновления профилей
    
    console.log(`Subscribing to topics: ${userTopic}, ${profileTopic}`)
    
    // Подписываемся на персональный топик пользователя
    wsClient.subscribe(userTopic)
    // Подписываемся на общий топик профилей
    wsClient.subscribe(profileTopic)

    // Обработчик патчей для реального времени
    const handlePatch = (msg: any) => {
      if (msg.type === 'patch') {
        const { topic, payload } = msg
        
        // Персональные обновления пользователя
        if (topic === userTopic && payload.userId === user.userId) {
          console.log('Received user patch:', payload)
          setUser((prev: any) => {
            const updated = { ...prev, ...payload }
            // Обновляем кэш
            setCachedProfile(updated)
            return updated
          })
        }
        
        // Глобальные обновления профилей (если касаются текущего пользователя)
        if (topic === profileTopic && payload.userId === user.userId) {
          console.log('Received profile patch:', payload)
          setUser((prev: any) => {
            const updated = { ...prev, ...payload }
            setCachedProfile(updated)
            return updated
          })
        }
      }
    }

    wsClient.on('patch', handlePatch)

    // Cleanup при размонтировании или смене пользователя
    return () => {
      wsClient.unsubscribe(userTopic)
      wsClient.unsubscribe(profileTopic)
      // Удаляем обработчик
      const handlers = (wsClient as any).handlers.get('patch') || []
      const index = handlers.indexOf(handlePatch)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }, [user?.userId])

  function getCachedProfile(): CacheEntry | null {
    try {
      const stored = localStorage.getItem(CACHE_KEY)
      if (!stored) return null
      const entry: CacheEntry = JSON.parse(stored)
      const now = Date.now()
      if (now - entry.timestamp > CACHE_TTL) {
        localStorage.removeItem(CACHE_KEY)
        return null
      }
      return entry
    } catch {
      return null
    }
  }

  function setCachedProfile(data: any, etag?: string) {
    try {
      const entry: CacheEntry = {
        data,
        timestamp: Date.now(),
        etag
      }
      localStorage.setItem(CACHE_KEY, JSON.stringify(entry))
    } catch {
      // ignore
    }
  }

  async function loadProfile() {
    // Проверяем кэш сначала
    const cached = getCachedProfile()
    if (cached && cached.data) {
      setUser(cached.data)
      console.log('Loaded profile from cache')
      return
    }

    setLoading(true)
    const metaEnv: any = (import.meta as any).env || {}
    const backend = metaEnv.VITE_BACKEND_URL || ''
    const meUrl = backend ? `${backend.replace(/\/$/, '')}/api/auth/me` : '/api/auth/me'
    
    // 1) Check if we're inside Telegram WebApp first and try to authenticate
    try {
      // @ts-ignore
      const tg = (window as any)?.Telegram?.WebApp
      if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        console.log('Telegram user data:', tg.initDataUnsafe.user)
        const unsafe = tg.initDataUnsafe.user
        const fallbackName = unsafe.username || [unsafe.first_name, unsafe.last_name].filter(Boolean).join(' ').trim()
        if (!user) {
          setUser({
            tgUsername: fallbackName || 'Гость',
            photoUrl: unsafe.photo_url,
            createdAt: new Date().toISOString()
          })
        }
        
        // Try to send initData to backend
        const initUrl = backend ? `${backend.replace(/\/$/, '')}/api/auth/telegram-init` : '/api/auth/telegram-init'
        
        // Prepare initData - use the raw initData string if available
        let initDataValue = tg.initData
        if (!initDataValue) {
          // Fallback: construct from initDataUnsafe
          const user = tg.initDataUnsafe.user
          initDataValue = JSON.stringify({ 
            user: {
              id: user.id,
              first_name: user.first_name,
              last_name: user.last_name,
              username: user.username,
              photo_url: user.photo_url,
              language_code: user.language_code
            }
          })
        }
        
        console.log('Sending initData to backend')
        const headers: Record<string, string> = { 'Content-Type': 'application/json' }
        if (typeof initDataValue === 'string' && initDataValue.length > 0) {
          headers['X-Telegram-Init-Data'] = initDataValue
        }
        // Добавляем ETag из кэша если есть
        if (cached?.etag) {
          headers['If-None-Match'] = cached.etag
        }

        const r = await fetch(initUrl, {
          method: 'POST',
          headers,
          credentials: 'include',
          body: JSON.stringify({ initData: initDataValue })
        })
        
        if (r.status === 304) {
          // Используем кэшированные данные
          if (cached?.data) {
            setUser(cached.data)
            console.log('Using cached profile (304 Not Modified)')
            setLoading(false)
            return
          }
        } else if (r.ok) {
          const dd = await r.json()
          console.log('Backend response:', dd)
          if (dd?.token) {
            localStorage.setItem('session', dd.token)
          }
          if (dd?.ok && dd.user) {
            const etag = r.headers.get('ETag')
            setCachedProfile(dd.user, etag || undefined)
            setUser(dd.user)
            setLoading(false)
            return
          }
        } else {
          console.error('Backend auth failed:', await r.text())
          setUser(null)
        }
      }
    } catch (e) {
      console.error('Telegram WebApp auth error:', e)
      setUser(null)
    }

    // 2) Try token-based load as fallback
    try {
      const token = localStorage.getItem('session')
      if (token) {
        const headers: any = { 'Authorization': `Bearer ${token}` }
        // Добавляем ETag из кэша если есть
        if (cached?.etag) {
          headers['If-None-Match'] = cached.etag
        }
        
        const resp = await fetch(meUrl, { headers, credentials: 'include' })
        
        if (resp.status === 304) {
          // Используем кэшированные данные
          if (cached?.data) {
            setUser(cached.data)
            console.log('Using cached profile (304 Not Modified)')
            setLoading(false)
            return
          }
        } else if (resp.ok) {
          const data = await resp.json()
          console.log('Token-based profile load:', data)
          if (data?.ok && data.user) {
            const etag = resp.headers.get('ETag')
            setCachedProfile(data.user, etag || undefined)
            setUser(data.user)
            setLoading(false)
            return
          }
        }
      }
    } catch (e) {
      console.error('Token-based load error:', e)
    }

    setLoading(false)
  }

  return (
    <div className="profile-container">
      <div className="profile-header">
        <div className="avatar-section">
          {user && user.photoUrl ? (
            <img src={user.photoUrl} alt={user.tgUsername || 'avatar'} className="profile-avatar" />
          ) : (
            <div className="profile-avatar placeholder">{loading ? '⏳' : '👤'}</div>
          )}
          <div className="status-indicator online"></div>
        </div>
        
        <div className="profile-info">
          <h1 className="profile-name">
            {loading ? 'Загрузка...' : user?.tgUsername || 'Гость'}
          </h1>
          {user?.userId && (
            <div className="profile-id">ID: {user.userId}</div>
          )}
          {user?.createdAt && (
            <div className="profile-joined">
              Участник с {formatDate(user.createdAt)}
            </div>
          )}
        </div>
      </div>
      
      <div className="profile-stats">
        <div className="stat-item">
          <div className="stat-value">0</div>
          <div className="stat-label">Матчи</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">0</div>
          <div className="stat-label">Голы</div>
        </div>
        <div className="stat-item">
          <div className="stat-value">0</div>
          <div className="stat-label">Рейтинг</div>
        </div>
      </div>

    </div>
  )
}

function formatDate(dt?: string) {
  if (!dt) return ''
  try {
    const d = new Date(dt)
    // Convert to Moscow time (UTC+3) and format dd.mm.yyyy
    const ms = d.getTime() + 3 * 60 * 60 * 1000
    const md = new Date(ms)
    const day = String(md.getUTCDate()).padStart(2, '0')
    const month = String(md.getUTCMonth() + 1).padStart(2, '0')
    const year = md.getUTCFullYear()
    return `${day}.${month}.${year}`
  } catch (e) {
    return dt
  }
}