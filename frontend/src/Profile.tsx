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
    
    // 1) Check if we're inside Telegram WebApp first and try to authenticate
    try {
      // @ts-ignore
      const tg = (window as any)?.Telegram?.WebApp
      if (tg && tg.initDataUnsafe && tg.initDataUnsafe.user) {
        console.log('Telegram user data:', tg.initDataUnsafe.user)
        
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
        const r = await fetch(initUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData: initDataValue })
        })
        
        if (r.ok) {
          const dd = await r.json()
          console.log('Backend response:', dd)
          if (dd?.token) {
            localStorage.setItem('session', dd.token)
            // If user data is directly in response, use it
            if (dd?.user) {
              setUser(dd.user)
              setLoading(false)
              return
            }
          }
        } else {
          console.error('Backend auth failed:', await r.text())
        }
      }
    } catch (e) {
      console.error('Telegram WebApp auth error:', e)
    }

    // 2) Try token-based load as fallback
    try {
      const token = localStorage.getItem('session')
      if (token) {
        const headers: any = { 'Authorization': `Bearer ${token}` }
        const resp = await fetch(meUrl, { headers })
        if (resp.ok) {
          const data = await resp.json()
          console.log('Token-based profile load:', data)
          if (data?.ok && data.user) {
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
    <div className="profile-card card neon-card">
      <div className="avatar-wrap">
        {user && user.photoUrl ? (
          <img src={user.photoUrl} alt={user.tgUsername || 'avatar'} className="avatar neon-border" />
        ) : (
          <div className="avatar placeholder neon-border">{loading ? '...' : '👤'}</div>
        )}
      </div>
      <div className="profile-name">
        {loading ? 'Загрузка...' : user?.tgUsername || 'Гость'}
      </div>
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

