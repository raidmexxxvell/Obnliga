import type { PointerEvent, TouchEvent } from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NewsItem } from '@shared/types'
import { wsClient } from '../wsClient'

const API_BASE = ((import.meta as ImportMeta & { env?: { VITE_BACKEND_URL?: string } }).env?.VITE_BACKEND_URL) || ''
const ROTATION_INTERVAL_MS = 7_000
const SWIPE_THRESHOLD = 40

const buildUrl = (path: string) => (API_BASE ? `${API_BASE}${path}` : path)

const getPreview = (content: string, limit = 220) => {
  const trimmed = content.trim()
  if (trimmed.length <= limit) {
    return trimmed
  }
  const soft = trimmed.slice(0, limit)
  const lastSpace = soft.lastIndexOf(' ')
  return `${soft.slice(0, lastSpace > 80 ? lastSpace : limit)}…`
}

type NewsModalState = {
  item: NewsItem
} | null

export const NewsSection = () => {
  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const [modalState, setModalState] = useState<NewsModalState>(null)
  const touchStartX = useRef<number | null>(null)

  const next = useCallback(() => {
    setActiveIndex((current) => {
      if (news.length === 0) return 0
      return (current + 1) % news.length
    })
  }, [news.length])

  const prev = useCallback(() => {
    setActiveIndex((current) => {
      if (news.length === 0) return 0
      const nextIndex = current - 1
      return nextIndex >= 0 ? nextIndex : Math.max(news.length - 1, 0)
    })
  }, [news.length])

  const fetchNews = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch(buildUrl('/api/news'), {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      })
      if (!response.ok) {
        throw new Error(`news_fetch_failed_${response.status}`)
      }
      const payload = await response.json()
      const items = (payload?.data ?? []) as NewsItem[]
      setNews(items)
      setError(null)
      setActiveIndex(0)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'news_fetch_failed'
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchNews()
  }, [fetchNews])

  useEffect(() => {
    if (news.length <= 1) return
    const timer = setInterval(() => {
      next()
    }, ROTATION_INTERVAL_MS)
    return () => clearInterval(timer)
  }, [news.length, next])

  useEffect(() => {
    const handler = (message: any) => {
      if (!message?.payload) return
      const item = message.payload as NewsItem
      setNews((current) => {
        const deduped = current.filter((entry) => entry.id !== item.id)
        return [item, ...deduped]
      })
      setActiveIndex(0)
    }
    wsClient.on('news.full', handler)
    const removeHandler = (message: any) => {
      const id = message?.payload?.id
      if (!id) return
      setNews((current) => {
        const filtered = current.filter((entry) => entry.id !== id)
        if (filtered.length === current.length) {
          return current
        }
        setActiveIndex((prev) => {
          if (filtered.length === 0) return 0
          return Math.min(prev, filtered.length - 1)
        })
        return filtered
      })
    }
    wsClient.on('news.remove', removeHandler)
  }, [])

  const activeItem = useMemo(() => news[activeIndex] ?? null, [news, activeIndex])

  const handleTouchStart = (event: TouchEvent | PointerEvent) => {
    const point = 'touches' in event ? event.touches[0] : event
    touchStartX.current = point.clientX
  }

  const handleTouchEnd = (event: TouchEvent | PointerEvent) => {
    if (touchStartX.current === null) return
    const point = 'changedTouches' in event ? event.changedTouches[0] : event
    const delta = point.clientX - touchStartX.current
    if (delta >= SWIPE_THRESHOLD) {
      prev()
    } else if (delta <= -SWIPE_THRESHOLD) {
      next()
    }
    touchStartX.current = null
  }

  const openModal = (item: NewsItem) => setModalState({ item })
  const closeModal = () => setModalState(null)

  if (loading) {
    return (
      <section className="news-column" aria-busy="true">
        <header className="news-header">
          <h2>Новости</h2>
          <span className="news-meta">Загружаем…</span>
        </header>
        <div className="news-placeholder">Подтягиваем свежие материалы</div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="news-column" aria-live="polite">
        <header className="news-header">
          <h2>Новости</h2>
        </header>
        <div className="news-placeholder error">Не удалось загрузить новости ({error}).</div>
      </section>
    )
  }

  if (!activeItem) {
    return (
      <section className="news-column">
        <header className="news-header">
          <h2>Новости</h2>
        </header>
        <div className="news-placeholder">Пока новостей нет. Возвращайтесь позже!</div>
      </section>
    )
  }

  return (
    <section className="news-column">
      <header className="news-header">
        <h2>Новости</h2>
      </header>

      <article
        className="news-card"
        role="group"
        aria-roledescription="слайд новости"
        aria-label={activeItem.title}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onPointerDown={handleTouchStart}
        onPointerUp={handleTouchEnd}
      >
        <div className="news-card-body">
          <time className="news-date" dateTime={activeItem.createdAt}>
            {new Date(activeItem.createdAt).toLocaleDateString('ru-RU', {
              day: '2-digit',
              month: 'long'
            })}
          </time>
          <h3>{activeItem.title}</h3>
          <p>{getPreview(activeItem.content)}</p>
        </div>
        <footer className="news-card-footer">
          <button className="news-more" type="button" onClick={() => openModal(activeItem)}>
            Читать полностью
          </button>
          <div className="news-dots" role="tablist" aria-label="Список новостей">
            {news.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === activeIndex}
                className={`news-dot${index === activeIndex ? ' active' : ''}`}
                onClick={() => setActiveIndex(index)}
              >
                <span className="sr-only">{item.title}</span>
              </button>
            ))}
          </div>
        </footer>
      </article>

      {modalState ? (
        <div className="news-modal" role="dialog" aria-modal="true" aria-label={modalState.item.title}>
          <div className="news-modal-content">
            <header>
              <time className="news-date" dateTime={modalState.item.createdAt}>
                {new Date(modalState.item.createdAt).toLocaleString('ru-RU', {
                  day: '2-digit',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </time>
              <h3>{modalState.item.title}</h3>
            </header>
            {modalState.item.coverUrl ? (
              <div className="news-cover">
                <img src={modalState.item.coverUrl} alt="Обложка новости" loading="lazy" />
              </div>
            ) : null}
            <div className="news-content">
              {modalState.item.content.split('\n').map((paragraph, idx) => (
                <p key={idx}>{paragraph}</p>
              ))}
            </div>
            <button className="news-close" type="button" onClick={closeModal}>
              Закрыть
            </button>
          </div>
          <div className="news-modal-backdrop" role="presentation" onClick={closeModal} />
        </div>
      ) : null}
    </section>
  )
}
