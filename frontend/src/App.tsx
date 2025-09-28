import React, { useEffect, useState } from 'react'
import './app.css'

export default function App() {
  const [showSplash, setShowSplash] = useState(true)
  const [progress, setProgress] = useState(0)
  const [isExiting, setIsExiting] = useState(false)

  useEffect(() => {
    const duration = 1600 // splash duration in ms
    const start = Date.now()
    const interval = setInterval(() => {
      const elapsed = Date.now() - start
      const p = Math.min(100, Math.round((elapsed / duration) * 100))
      setProgress(p)
      if (p >= 100) {
        clearInterval(interval)
        // start exit sequence (small delay for smoothness)
        setIsExiting(true)
      }
    }, 40)

    return () => { clearInterval(interval) }
  }, [])

  useEffect(() => {
    if (!isExiting) return
    const t = setTimeout(() => setShowSplash(false), 350)
    return () => clearTimeout(t)
  }, [isExiting])

  if (showSplash) {
    return (
      <div className={"app-root splash" + (isExiting ? " exiting" : "")}>
        <div className="accent-shape left" aria-hidden />
        <div className="accent-shape right" aria-hidden />
        <div className="splash-inner">
          {/* use league logo from public/ so it's served at /logo_liga.png */}
          <img src="/logo_liga.png" alt="Логотип Лиги" className="logo animate heartbeat" />
          <h2 className="neon-title">Футбольная Лига</h2>
          <p className="neon-sub">Загружаем...</p>
          <div style={{marginTop:14, display:'flex', flexDirection:'column', alignItems:'center'}}>
            <div className="progress" aria-hidden>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>
            <div style={{marginTop:8, fontSize:12, opacity:0.9, color:'#bfefff'}}>{progress}%</div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app-root main">
      <div className="card">
        <h1 style={{marginTop:0}}>Привет!</h1>
        <p>Добро пожаловать в мини-приложение Футбольной Лиги.</p>
        <p>Откройте бота в Telegram и отправьте /start, чтобы получить ссылку на WebApp.</p>
      </div>
    </div>
  )
}
