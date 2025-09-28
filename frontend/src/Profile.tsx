import React, { useEffect, useState } from 'react'
import './profile.css'

export default function Profile() {
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    // Try to fetch current user - placeholder: expects tg init flow to post user
    // In production this should call /api/auth/telegram-init or verify initData
    ;(async () => {
      try {
        // demo: fetch first user or return null
        const resp = await fetch('/api/users/0')
        if (resp.ok) {
          const data = await resp.json()
          setUser(data)
        }
      } catch (e) {
        // ignore - demo only
      }
    })()
  }, [])

  return (
    <div className="profile-card card neon-card">
      <div className="avatar-wrap">
        {user && user.photoUrl ? (
          <img src={user.photoUrl} alt={user.tgUsername || 'avatar'} className="avatar neon-border" />
        ) : (
          <div className="avatar placeholder neon-border">👤</div>
        )}
      </div>
      <div className="profile-name">{user?.tgUsername ? `@${user.tgUsername}` : 'Гость'}</div>
      <div className="profile-meta">{user?.createdAt ? formatDate(user.createdAt) : ''}</div>
      <div style={{marginTop:10}}>
        <button className="neon-btn" onClick={onSendInit}>Send initData to server</button>
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

async function onSendInit() {
  // send initData (if running inside Telegram WebApp)
  try {
    // @ts-ignore
    const tg = (window as any)?.Telegram?.WebApp
    if (!tg || !tg.initData) {
      alert('initData not available (not running inside Telegram WebApp)')
      return
    }
    const resp = await fetch('/api/auth/telegram-init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ initData: tg.initData })
    })
    const data = await resp.json()
    if (!resp.ok) alert('initData verification failed: ' + JSON.stringify(data))
    else {
      alert('User verified and saved')
      // save token (if any) to localStorage as fallback when cookie isn't set
      if (data?.token) localStorage.setItem('session', data.token)
      window.location.reload()
    }
  } catch (e) {
    alert('send failed')
  }
}
