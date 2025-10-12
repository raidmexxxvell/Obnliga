import React from 'react'
import type { LeagueTableResponse } from '@shared/types'

type LeagueTableViewProps = {
  table?: LeagueTableResponse
  loading: boolean
  error?: string
  onRetry: () => void
  lastUpdated?: number
}

const formatDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return date.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

const formatTime = (value?: number): string => {
  if (!value) return ''
  const date = new Date(value)
  return date.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  })
}

const formatDiff = (value: number): string => {
  if (value > 0) {
    return `+${value}`
  }
  if (value === 0) {
    return '0'
  }
  return `${value}`
}

export const LeagueTableView: React.FC<LeagueTableViewProps> = ({
  table,
  loading,
  error,
  onRetry,
  lastUpdated,
}) => {
  if (loading) {
    return (
      <div className="league-table-placeholder" aria-live="polite" aria-busy="true">
        <div className="skeleton skeleton-heading" />
        <div className="skeleton skeleton-row" />
        <div className="skeleton skeleton-row" />
        <div className="skeleton skeleton-row" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="inline-feedback error" role="alert">
        <div>Не удалось загрузить таблицу. Код: {error}</div>
        <button type="button" className="button-secondary" onClick={onRetry}>
          Повторить
        </button>
      </div>
    )
  }

  if (!table) {
    return (
      <div className="inline-feedback info" role="status">
        Данные таблицы пока недоступны.
      </div>
    )
  }

  const { season, standings } = table
  const updatedLabel = lastUpdated ? `Обновлено в ${formatTime(lastUpdated)}` : 'Актуальные данные'
  const seasonRange = `${formatDate(season.startDate)} — ${formatDate(season.endDate)}`

  return (
    <section className="league-table" aria-label="Турнирная таблица">
      <header className="league-table-header">
        <div className="league-table-title">
          <h2>Турнирная таблица</h2>
          <p>Сортировка: очки, личные встречи, разница голов.</p>
          <span className="season-meta">
            {season.competition.name} · {season.name} · {seasonRange}
          </span>
        </div>
        <span className="muted">{updatedLabel}</span>
      </header>
      <div role="table" className="league-table-grid">
        <div role="row" className="league-table-row head">
          <div role="columnheader" className="col-meta">
            <span className="meta-position">№</span>
          </div>
          <div role="columnheader" className="col-club">
            Клуб
          </div>
          <div role="columnheader" className="stat-group">
            <span className="stat">
              <span>И</span>
              <span className="muted">Матчи</span>
            </span>
            <span className="stat">
              <span>В</span>
              <span className="muted">Победы</span>
            </span>
            <span className="stat">
              <span>Н</span>
              <span className="muted">Ничьи</span>
            </span>
            <span className="stat">
              <span>П</span>
              <span className="muted">Поражения</span>
            </span>
            <span className="stat">
              <span>Голы</span>
              <span className="muted">Забито / пропущено</span>
            </span>
            <span className="stat diff">
              <span>±</span>
              <span className="muted">Разница</span>
            </span>
          </div>
          <div role="columnheader" className="col-points">
            <span className="points-label">Очки</span>
          </div>
        </div>
        {standings.length === 0 ? (
          <div role="row" className="league-table-row empty">
            <span role="cell" className="col-empty">
              Нет сыгранных матчей.
            </span>
          </div>
        ) : (
          standings.map(entry => {
            const fallbackLabel = entry.clubShortName || entry.clubName
            const diffDisplay = formatDiff(entry.goalDifference)
            return (
              <div role="row" className="league-table-row" key={entry.clubId}>
                <div role="cell" className="col-meta">
                  <span className="meta-position">{entry.position}</span>
                  {entry.clubLogoUrl ? (
                    <img
                      src={entry.clubLogoUrl}
                      alt={`Логотип клуба ${entry.clubName}`}
                      className="club-logo"
                    />
                  ) : (
                    <span className="club-logo fallback" aria-hidden>
                      {fallbackLabel.slice(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>
                <div role="cell" className="col-club">
                  <span className="club-name">
                    <strong>{entry.clubName}</strong>
                    <span className="muted">{fallbackLabel}</span>
                  </span>
                </div>
                <div role="cell" className="stat-group" aria-label={`Статистика клуба ${entry.clubName}`}>
                  <span className="stat">
                    <span>{entry.matchesPlayed}</span>
                    <span className="muted">Матчи</span>
                  </span>
                  <span className="stat">
                    <span>{entry.wins}</span>
                    <span className="muted">Победы</span>
                  </span>
                  <span className="stat">
                    <span>{entry.draws}</span>
                    <span className="muted">Ничьи</span>
                  </span>
                  <span className="stat">
                    <span>{entry.losses}</span>
                    <span className="muted">Поражения</span>
                  </span>
                  <span className="stat">
                    <span>
                      {entry.goalsFor}:{entry.goalsAgainst}
                    </span>
                    <span className="muted">Голы</span>
                  </span>
                  <span className="stat diff" data-positive={entry.goalDifference >= 0}>
                    <span>{diffDisplay}</span>
                    <span className="muted">Разница</span>
                  </span>
                </div>
                <div role="cell" className="col-points">
                  <span className="points">{entry.points}</span>
                  <span className="points-label">Очки</span>
                </div>
              </div>
            )
          })
        )}
      </div>
    </section>
  )
}
