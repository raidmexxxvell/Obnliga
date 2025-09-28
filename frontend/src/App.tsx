import React, { useEffect, useState } from 'react'

export default function App() {
  const [showSplash, setShowSplash] = useState(true)

  useEffect(() => {
    const t = setTimeout(() => setShowSplash(false), 1400)
    return () => clearTimeout(t)
  }, [])

  if (showSplash) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Segoe UI, Roboto, Arial' }}>
          <div style={{ textAlign: 'center' }}>
            <img src="/logo.svg" alt="logo" style={{ width: 120, opacity: 0.95 }} />
          <h2>Футбольная Лига</h2>
          <p>Загружаем...</p>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, fontFamily: 'Segoe UI, Roboto, Arial' }}>
      <h1>Привет!</h1>
      <p>Добро пожаловать в мини-приложение Футбольной Лиги.</p>
      <p>Откройте бота в Telegram и отправьте /start, чтобы получить ссылку на WebApp.</p>
    </div>
  )
}
