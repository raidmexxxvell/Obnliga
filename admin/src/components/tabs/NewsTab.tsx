import { FormEvent, useEffect, useMemo, useState } from 'react'
import { adminPost } from '../../api/adminClient'
import { useAdminStore } from '../../store/adminStore'
import type { NewsItem } from '@shared/types'

const defaultFormState = {
  title: '',
  content: '',
  coverUrl: '',
  sendToTelegram: true
}

type FeedbackKind = 'success' | 'error'

type FeedbackState = {
  kind: FeedbackKind
  message: string
  meta?: string
} | null

const formatDate = (iso: string) => {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    })
  } catch (err) {
    return iso
  }
}

const getPreview = (content: string, limit = 160) => {
  const trimmed = content.trim()
  if (trimmed.length <= limit) return trimmed
  const slice = trimmed.slice(0, limit)
  const lastSpace = slice.lastIndexOf(' ')
  return `${slice.slice(0, lastSpace > 60 ? lastSpace : limit)}…`
}

export const NewsTab = () => {
  const {
    token,
    data,
    fetchNews,
    prependNews,
    loading,
    error,
    clearError,
    newsVersion
  } = useAdminStore((state) => ({
    token: state.token,
    data: state.data,
    fetchNews: state.fetchNews,
    prependNews: state.prependNews,
    loading: state.loading,
    error: state.error,
    clearError: state.clearError,
    newsVersion: state.newsVersion
  }))

  const [form, setForm] = useState(defaultFormState)
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [submitting, setSubmitting] = useState(false)

  const isLoading = Boolean(loading.news)

  useEffect(() => {
    if (!token) return
    if (data.news.length) return
    void fetchNews({ force: true }).catch(() => undefined)
  }, [token, data.news.length, fetchNews])

  const latestNews = useMemo(() => data.news.slice(0, 6), [data.news])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!form.title.trim()) {
      setFeedback({ kind: 'error', message: 'Введите заголовок новости.' })
      return
    }
    if (!form.content.trim()) {
      setFeedback({ kind: 'error', message: 'Введите текст новости.' })
      return
    }
    if (!token) {
      setFeedback({ kind: 'error', message: 'Нет токена администратора. Войдите заново.' })
      return
    }

    setSubmitting(true)
    setFeedback(null)
    try {
      const payload = {
        title: form.title.trim(),
        content: form.content.trim(),
        coverUrl: form.coverUrl.trim() ? form.coverUrl.trim() : undefined,
        sendToTelegram: form.sendToTelegram
      }

      const created = await adminPost<NewsItem>(token, '/api/admin/news', payload)
      prependNews(created)
      setForm(defaultFormState)
      setFeedback({
        kind: 'success',
        message: 'Новость опубликована',
        meta: `ID: ${created.id}${created.sendToTelegram ? ' • Telegram задача поставлена' : ''}`
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось опубликовать новость'
      setFeedback({ kind: 'error', message })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRefresh = () => {
    void fetchNews({ force: true }).catch(() => undefined)
  }

  return (
    <div className="tab-sections">
      <header className="tab-header">
        <div>
          <h3>Новости лиги</h3>
          <p>Публикуйте обновления и отправляйте их пользователям в Telegram.</p>
        </div>
        <div className="tab-header-actions">
          <button className="button-ghost" type="button" disabled={isLoading} onClick={handleRefresh}>
            {isLoading ? 'Обновляем…' : 'Обновить ленту'}
          </button>
          {newsVersion !== undefined ? (
            <span className="news-version" title="Текущая версия кэша новостей">
              ver. {newsVersion}
            </span>
          ) : null}
        </div>
      </header>

      {feedback ? (
        <div className={`inline-feedback ${feedback.kind}`}>
          <div>
            <strong>{feedback.message}</strong>
            {feedback.meta ? <span className="feedback-meta">{feedback.meta}</span> : null}
          </div>
          <button type="button" className="feedback-close" onClick={() => setFeedback(null)}>
            ×
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="inline-feedback error">
          <div>
            <strong>{error}</strong>
          </div>
          <button type="button" className="feedback-close" onClick={() => clearError()}>
            ×
          </button>
        </div>
      ) : null}

      <section className="card news-form">
        <header>
          <h4>Новая публикация</h4>
          <p>Заполните поля и нажмите «Опубликовать». Новость появится в приложении мгновенно.</p>
        </header>
        <form className="stacked" onSubmit={handleSubmit}>
          <label>
            Заголовок
            <input
              name="title"
              maxLength={100}
              required
              placeholder="Например, Итоги 5 тура"
              value={form.title}
              onChange={(event) => setForm((state) => ({ ...state, title: event.target.value }))}
            />
          </label>
          <label>
            Содержимое
            <textarea
              name="content"
              required
              rows={8}
              placeholder="Длинное описание, поддерживаются переводы строк"
              value={form.content}
              onChange={(event) => setForm((state) => ({ ...state, content: event.target.value }))}
            />
          </label>
          <label>
            Изображение (URL)
            <input
              name="coverUrl"
              type="url"
              placeholder="https://liga.ru/images/news.jpg"
              value={form.coverUrl}
              onChange={(event) => setForm((state) => ({ ...state, coverUrl: event.target.value }))}
            />
          </label>
          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={form.sendToTelegram}
              onChange={(event) => setForm((state) => ({ ...state, sendToTelegram: event.target.checked }))}
            />
            <span>Отправить в Telegram бота</span>
          </label>
          <div className="form-actions">
            <button className="button-primary" type="submit" disabled={submitting}>
              {submitting ? 'Публикуем…' : 'Опубликовать'}
            </button>
          </div>
        </form>
      </section>

      <section className="card news-preview">
        <header>
          <h4>Последние новости</h4>
          <p>Список синхронизирован со storefront и обновляется без перезагрузки.</p>
        </header>
        {latestNews.length ? (
          <ul className="news-preview-list">
            {latestNews.map((item) => (
              <li key={item.id} className="news-preview-item">
                <div className="news-preview-header">
                  <h5>{item.title}</h5>
                  <time dateTime={item.createdAt}>{formatDate(item.createdAt)}</time>
                </div>
                <p className="news-preview-body">{getPreview(item.content)}</p>
                <footer className="news-preview-footer">
                  <span className={`news-chip${item.sendToTelegram ? ' sent' : ''}`}>
                    {item.sendToTelegram ? 'Telegram ✓' : 'Только лента'}
                  </span>
                  {item.coverUrl ? (
                    <a href={item.coverUrl} target="_blank" rel="noreferrer" className="news-link">
                      Обложка
                    </a>
                  ) : null}
                </footer>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-placeholder">Новостей пока нет — опубликуйте первую запись!</div>
        )}
      </section>
    </div>
  )
}
