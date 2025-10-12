import React from 'react'
import type { LeagueMatchView, LeagueRoundCollection } from '@shared/types'

type LeagueRoundsViewProps = {
  mode: 'schedule' | 'results'
  data?: LeagueRoundCollection
  loading: boolean
  error?: string
  onRetry: () => void
  lastUpdated?: number
}

const DATE_RANGE_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

const DATE_ONLY_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: '2-digit',
})

const TIME_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  hour: '2-digit',
  minute: '2-digit',
})

const formatRangeDate = (value: string): string => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return value
  }
  return DATE_RANGE_FORMATTER.format(date)
}

const parseMatchDateTime = (value: string): {
  isValid: boolean
  dateLabel: string
  timeLabel: string
} => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return {
      isValid: false,
      dateLabel: value,
      timeLabel: '',
    }
  }
  return {
    isValid: true,
    dateLabel: DATE_ONLY_FORMATTER.format(date),
    timeLabel: TIME_FORMATTER.format(date),
  }
}

const buildLocationLabel = (match: LeagueMatchView): string => {
  const { location } = match
  if (!location) {
    return 'Локация уточняется'
  }
  const parts = [location.city, location.stadiumName].filter(Boolean)
  if (parts.length === 0) {
    return 'Локация уточняется'
  }
  return parts.join(' · ')
}

const resolveShortName = (club: LeagueMatchView['homeClub']): string => {
  if (club.shortName && club.shortName.trim().length > 0) {
    return club.shortName.trim()
  }
  return club.name
}

const buildMatchDescriptor = (match: LeagueMatchView, mode: 'schedule' | 'results') => {
  const { timeLabel, dateLabel } = parseMatchDateTime(match.matchDateTime)
  const isLive = match.status === 'LIVE'
  const isFinished = match.status === 'FINISHED'
  const isPostponed = match.status === 'POSTPONED'

  if (isPostponed) {
    return {
      main: 'Перенесён',
      secondary: timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel,
      showLive: false,
      penalty: null,
    }
  }

  if (mode === 'results' || isFinished || isLive) {
    const main = `${match.homeScore} : ${match.awayScore}`
    const secondary = timeLabel ? `${dateLabel} · ${timeLabel}` : dateLabel
    const penalty = match.hasPenaltyShootout && match.penaltyHomeScore !== null && match.penaltyAwayScore !== null
      ? `Пенальти ${match.penaltyHomeScore}:${match.penaltyAwayScore}`
      : null
    return {
      main,
      secondary,
      showLive: isLive,
      penalty,
    }
  }

  return {
    main: timeLabel || 'Время уточняется',
    secondary: dateLabel,
    showLive: false,
    penalty: null,
  }
}

const formatUpdatedLabel = (timestamp?: number): string => {
  if (!timestamp) {
    return 'Актуальные данные'
  }
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) {
    return 'Актуальные данные'
  }
  return `Обновлено в ${TIME_FORMATTER.format(date)}`
}

const getEmptyMessage = (mode: 'schedule' | 'results'): string => {
  if (mode === 'schedule') {
    return 'Подходящих матчей пока нет — следите за обновлениями.'
  }
  return 'Результаты матчей появятся сразу после завершения игр.'
}

export const LeagueRoundsView: React.FC<LeagueRoundsViewProps> = ({
  mode,
  data,
  loading,
  error,
  onRetry,
  lastUpdated,
}) => {
  if (loading) {
    return (
      <div className="league-rounds-placeholder" aria-live="polite" aria-busy="true">
        <div className="skeleton skeleton-heading" />
        <div className="skeleton skeleton-card" />
        <div className="skeleton skeleton-card" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="inline-feedback error" role="alert">
        <div>Не удалось загрузить данные. Код: {error}</div>
        <button type="button" className="button-secondary" onClick={onRetry}>
          Повторить
        </button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="inline-feedback info" role="status">
        {getEmptyMessage(mode)}
      </div>
    )
  }

  const { season, rounds } = data
  const headerTitle = mode === 'schedule' ? 'Календарь матчей' : 'Последние результаты'
  const updatedLabel = formatUpdatedLabel(lastUpdated)

  return (
    <section className="league-rounds" aria-label={headerTitle}>
      <header className="league-rounds-header">
        <div>
          <h2>{headerTitle}</h2>
          <p>
            {season.name} · {formatRangeDate(season.startDate)} — {formatRangeDate(season.endDate)}
          </p>
        </div>
        <span className="muted">{updatedLabel}</span>
      </header>

      {rounds.length === 0 ? (
        <div className="inline-feedback info" role="status">
          {getEmptyMessage(mode)}
        </div>
      ) : (
        <div className="league-rounds-grid">
          {rounds.map(round => {
            const roundKey = round.roundId ?? round.roundLabel
            const roundTypeLabel = round.roundType === 'PLAYOFF' ? 'Плей-офф' : null
            return (
              <article className="league-round-card" key={roundKey}>
                <header className="league-round-card-header">
                  <h3>{round.roundLabel}</h3>
                  {roundTypeLabel && <span className="league-round-chip">{roundTypeLabel}</span>}
                </header>
                <div className="league-round-card-body">
                  {round.matches.map(match => {
                    const descriptor = buildMatchDescriptor(match, mode)
                    const homeName = resolveShortName(match.homeClub)
                    const awayName = resolveShortName(match.awayClub)
                    const location = buildLocationLabel(match)
                    return (
                      <div
                        className={
                          'league-match-row' + (descriptor.showLive ? ' live' : '') + (match.status === 'POSTPONED' ? ' postponed' : '')
                        }
                        key={match.id}
                      >
                        <div className="league-match-teams">
                          <div className="league-match-team">
                            {match.homeClub.logoUrl ? (
                              <img
                                src={match.homeClub.logoUrl}
                                alt={`Логотип клуба ${match.homeClub.name}`}
                                className="club-logo"
                              />
                            ) : (
                              <span className="club-logo fallback" aria-hidden>
                                {homeName.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                            <span className="team-name">{homeName}</span>
                          </div>
                          <div className="league-match-score">
                            <span className="score-main">{descriptor.main}</span>
                            {descriptor.secondary && (
                              <span className="score-sub">{descriptor.secondary}</span>
                            )}
                            {descriptor.penalty && (
                              <span className="score-penalty">{descriptor.penalty}</span>
                            )}
                            {descriptor.showLive && <span className="score-live">Матч идёт</span>}
                          </div>
                          <div className="league-match-team">
                            {match.awayClub.logoUrl ? (
                              <img
                                src={match.awayClub.logoUrl}
                                alt={`Логотип клуба ${match.awayClub.name}`}
                                className="club-logo"
                              />
                            ) : (
                              <span className="club-logo fallback" aria-hidden>
                                {awayName.slice(0, 2).toUpperCase()}
                              </span>
                            )}
                            <span className="team-name">{awayName}</span>
                          </div>
                        </div>
                        <div className="league-match-location">
                          <span>{location}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
