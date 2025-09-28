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
