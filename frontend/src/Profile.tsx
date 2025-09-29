import React, { useEffect, useState } from 'react'
import './profile.css'

export default function Profile() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState<boolean>(false)

  useEffect(() => {
    loadProfile()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadProfile() {
    setLoading(true)
    const metaEnv: any = (import.meta as any).env || {}
    const backend = metaEnv.VITE_BACKEND_URL || ''
    const meUrl = backend ? `${backend.replace(/\/$/, '')}/api/auth/me` : '/api/auth/me'
    // 1) try token-based load
    try {
      const token = localStorage.getItem('session')
      const headers: any = {}
      if (token) headers['Authorization'] = `Bearer ${token}`
      const resp = await fetch(meUrl, { headers })
      if (resp.ok) {
        const data = await resp.json()
        if (data?.ok && data.user) {
          setUser(data.user)
          setLoading(false)
          return
        }
      }
    } catch (e) {
      // ignore and try initData path
    }

    // 2) if no token/user yet and we are inside Telegram WebApp, try to send initData lazily
    try {
      // @ts-ignore
      const tg = (window as any)?.Telegram?.WebApp
      if (tg && (tg.initData || (tg.initDataUnsafe && tg.initDataUnsafe.user))) {
        const initDataValue = tg.initData || JSON.stringify({ user: tg.initDataUnsafe.user })
        const initUrl = backend ? `${backend.replace(/\/$/, '')}/api/auth/telegram-init` : '/api/auth/telegram-init'
        const r = await fetch(initUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: initDataValue })
        })
        if (r.ok) {
          const dd = await r.json()
          if (dd?.token) localStorage.setItem('session', dd.token)
          // fetch profile now that we have token
          try {
            const token = dd?.token || localStorage.getItem('session')
            const headers: any = {}
            if (token) headers['Authorization'] = `Bearer ${token}`
            const me = await fetch(meUrl, { headers })
            if (me.ok) {
              const md = await me.json()
              if (md?.ok && md.user) setUser(md.user)
            }
          } catch (e) {
            // ignore
          }
        }
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="profile-card card neon-card">
      <div className="avatar-wrap">
        {user && user.photoUrl ? (
          <img src={user.photoUrl} alt={user.tgUsername || 'avatar'} className="avatar neon-border" />
        ) : (
          <div className="avatar placeholder neon-border">{loading ? '...' : '👤'}</div>
        )}
      </div>
      <div className="profile-name">{user?.tgUsername ? `@${user.tgUsername}` : loading ? 'Загрузка...' : 'Гость'}</div>
      <div className="profile-meta">{user?.createdAt ? formatDate(user.createdAt) : ''}</div>
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

