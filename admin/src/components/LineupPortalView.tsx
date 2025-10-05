import { FormEvent, useEffect, useMemo, useState } from 'react'
import {
  lineupFetchMatches,
  lineupFetchRoster,
  lineupUpdateRoster
} from '../api/adminClient'
import { useAdminStore } from '../store/adminStore'
import type { LineupPortalMatch, LineupPortalRosterEntry } from '../types'
import '../lineup.css'

const statusLabels: Record<LineupPortalMatch['status'], string> = {
  SCHEDULED: 'Запланирован',
  LIVE: 'В игре',
  FINISHED: 'Завершён',
  POSTPONED: 'Перенесён'
}

const formatKickoff = (iso: string) =>
  new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  })

const mapError = (code: string) => {
  switch (code) {
    case 'persons_not_in_roster':
      return 'Некоторые игроки отсутствуют в заявке сезона.'
    case 'club_not_in_match':
      return 'Выбранная команда не участвует в этом матче.'
    case 'match_not_found':
      return 'Матч не найден или удалён.'
    case 'payload_invalid':
      return 'Неверный формат данных. Попробуйте обновить страницу.'
    default:
      if (code.toLowerCase().includes('fetch')) {
        return 'Не удалось связаться с сервером. Проверьте подключение.'
      }
      return 'Не удалось выполнить запрос. Повторите попытку.'
  }
}

export const LineupPortalView = () => {
  const { lineupToken, logout } = useAdminStore((state) => ({
    lineupToken: state.lineupToken,
    logout: state.logout
  }))

  const [matches, setMatches] = useState<LineupPortalMatch[]>([])
  const [matchesLoading, setMatchesLoading] = useState(false)
  const [portalMessage, setPortalMessage] = useState<string | null>(null)
  const [portalError, setPortalError] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [activeMatch, setActiveMatch] = useState<LineupPortalMatch | null>(null)
  const [activeClubId, setActiveClubId] = useState<number | null>(null)
  const [roster, setRoster] = useState<LineupPortalRosterEntry[]>([])
  const [rosterLoading, setRosterLoading] = useState(false)
  const [selectedPlayers, setSelectedPlayers] = useState<Record<number, boolean>>({})
  const [saving, setSaving] = useState(false)

  const selectedCount = useMemo(
    () => roster.reduce((count, entry) => (selectedPlayers[entry.personId] ? count + 1 : count), 0),
    [roster, selectedPlayers]
  )

  const resetModalState = () => {
    setActiveMatch(null)
    setActiveClubId(null)
    setRoster([])
    setSelectedPlayers({})
    setModalOpen(false)
  }

  const handleUnauthorized = () => {
    setPortalError('Сессия истекла. Авторизуйтесь заново.')
    logout()
  }

  const fetchMatches = async () => {
    if (!lineupToken) return
    setMatchesLoading(true)
    setPortalError(null)
    setPortalMessage(null)
    try {
      const data = await lineupFetchMatches(lineupToken)
      setMatches(data)
      if (!data.length) {
        setPortalMessage('В ближайшие сутки матчей не найдено. Проверьте позже.')
      }
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'unauthorized') {
        handleUnauthorized()
      } else {
        setPortalError(mapError(code))
      }
    } finally {
      setMatchesLoading(false)
    }
  }

  useEffect(() => {
    if (lineupToken) {
      void fetchMatches()
    }
  }, [lineupToken])

  const openMatchModal = (match: LineupPortalMatch) => {
    setActiveMatch(match)
    setActiveClubId(match.homeClub.id)
    setModalOpen(true)
    setRoster([])
    setSelectedPlayers({})
  }

  const closeModal = () => {
    resetModalState()
  }

  useEffect(() => {
    const loadRoster = async () => {
      if (!modalOpen || !lineupToken || !activeMatch || !activeClubId) return
      setRosterLoading(true)
      setPortalError(null)
      try {
        const data = await lineupFetchRoster(lineupToken, activeMatch.id, activeClubId)
        setRoster(data)
        const selected: Record<number, boolean> = {}
        data.forEach((entry) => {
          selected[entry.personId] = entry.selected
        })
        setSelectedPlayers(selected)
      } catch (error) {
        const code = error instanceof Error ? error.message : ''
        if (code === 'unauthorized') {
          handleUnauthorized()
        } else {
          setPortalError(mapError(code))
        }
        resetModalState()
      } finally {
        setRosterLoading(false)
      }
    }

    void loadRoster()
  }, [modalOpen, lineupToken, activeMatch, activeClubId])

  const togglePlayer = (personId: number) => {
    setSelectedPlayers((prev) => ({ ...prev, [personId]: !prev[personId] }))
  }

  const handleSubmitRoster = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!lineupToken || !activeMatch || !activeClubId) return
    const payloadIds = Object.entries(selectedPlayers)
      .filter(([, isSelected]) => isSelected)
      .map(([id]) => Number(id))

    setSaving(true)
    setPortalError(null)
    setPortalMessage(null)
    try {
      await lineupUpdateRoster(lineupToken, activeMatch.id, {
        clubId: activeClubId,
        personIds: payloadIds
      })
      setPortalMessage('Состав сохранён. Заявленные игроки получили +1 к числу игр.')
      closeModal()
      void fetchMatches()
    } catch (error) {
      const code = error instanceof Error ? error.message : ''
      if (code === 'unauthorized') {
        handleUnauthorized()
      } else {
        setPortalError(mapError(code))
      }
    } finally {
      setSaving(false)
    }
  }

  if (!lineupToken) {
    return (
      <div className="portal-root">
        <div className="portal-shell" style={{ alignItems: 'center', textAlign: 'center' }}>
          <h2>Токен не найден</h2>
          <p>Сессия недоступна. Выполните вход снова.</p>
          <button type="button" className="portal-primary" onClick={() => logout()}>
            На страницу входа
          </button>
        </div>
      </div>
    )
  }

  const renderMatches = () => (
    <div className="portal-grid">
      <aside className="portal-card">
        <header className="portal-card-header">
          <h2>Ближайшие матчи</h2>
          <button type="button" className="portal-ghost" onClick={() => void fetchMatches()} disabled={matchesLoading}>
            {matchesLoading ? 'Обновляем…' : 'Обновить'}
          </button>
        </header>
        <p className="portal-sub">Отображаются игры в ближайшие 24 часа.</p>
        <ul className="portal-match-list">
          {matches.map((match) => {
            const title = `${match.homeClub.shortName} vs ${match.awayClub.shortName}`
            const roundLabel = match.round?.label ? match.round.label : 'Без стадии'
            const isActive = activeMatch?.id === match.id
            return (
              <li key={match.id} className={isActive ? 'active' : undefined}>
                <button type="button" onClick={() => openMatchModal(match)}>
                  <span className="match-date">{formatKickoff(match.matchDateTime)}</span>
                  <span className="match-round">{roundLabel}</span>
                  <span className="match-opponent">{title}</span>
                  <span className="match-venue">Статус: {statusLabels[match.status]}</span>
                </button>
              </li>
            )
          })}
        </ul>
        {matches.length === 0 ? <p className="portal-hint">Нет матчей для подтверждения состава.</p> : null}
      </aside>

      <section className="portal-card">
        <header className="portal-card-header">
          <h2>Инструкция</h2>
          <button type="button" className="portal-ghost" onClick={() => logout()}>
            Выйти
          </button>
        </header>
        <ol className="portal-steps">
          <li>Выберите матч слева. Доступны игры, которые начнутся в ближайшие сутки.</li>
          <li>Определите свою команду (дом или гости) в открывшемся окне.</li>
          <li>Отметьте игроков, которые выйдут на поле. Менять состав можно до стартового свистка.</li>
          <li>Сохраните изменения — игрокам сразу зачтётся +1 игра, а состав появится в админке.</li>
        </ol>
        <p className="portal-hint">Если состав меняется в последний момент, обновите список перед стартом матча.</p>
      </section>
    </div>
  )

  const renderModal = () => {
    if (!modalOpen || !activeMatch || !activeClubId) return null
    const homeActive = activeClubId === activeMatch.homeClub.id
    const awayActive = activeClubId === activeMatch.awayClub.id

    return (
      <div className="portal-overlay" role="dialog" aria-modal="true">
        <div className="portal-modal">
          <header className="portal-modal-header">
            <div>
              <h3>Подтверждение состава</h3>
              <p>
                {formatKickoff(activeMatch.matchDateTime)} · {activeMatch.homeClub.shortName} vs {activeMatch.awayClub.shortName}
              </p>
            </div>
            <button type="button" className="portal-ghost" onClick={closeModal}>
              Закрыть
            </button>
          </header>

          <div className="club-switcher">
            <button
              type="button"
              className={`club-chip${homeActive ? ' active' : ''}`}
              onClick={() => setActiveClubId(activeMatch.homeClub.id)}
            >
              {activeMatch.homeClub.shortName}
            </button>
            <button
              type="button"
              className={`club-chip${awayActive ? ' active' : ''}`}
              onClick={() => setActiveClubId(activeMatch.awayClub.id)}
            >
              {activeMatch.awayClub.shortName}
            </button>
          </div>

          <form className="portal-roster" onSubmit={handleSubmitRoster}>
            {rosterLoading ? <p className="portal-hint">Загружаем заявку клуба…</p> : null}
            <div className="portal-roster-grid">
              {roster.map((entry) => {
                const checked = Boolean(selectedPlayers[entry.personId])
                const surname = `${entry.person.lastName} ${entry.person.firstName}`.trim()
                return (
                  <label key={entry.personId} className={checked ? 'selected' : ''}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePlayer(entry.personId)}
                      aria-label={`Игрок ${surname}`}
                      disabled={saving}
                    />
                    <span className="player-name">
                      №{entry.shirtNumber} · {surname}
                    </span>
                  </label>
                )
              })}
            </div>
            <footer className="portal-actions">
              <span>Отмечено: {selectedCount} из {roster.length}</span>
              <button type="submit" className="portal-primary" disabled={saving}>
                {saving ? 'Сохраняем…' : 'Сохранить состав'}
              </button>
            </footer>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="portal-root">
      <div className="portal-accent" aria-hidden />
      <div className="portal-shell">
        <header className="portal-header">
          <div>
            <h1>Портал капитана</h1>
            <p>Подтвердите состав своей команды перед матчем.</p>
          </div>
          <div className="portal-badge" title="Линия связи активна">
            ✅
          </div>
        </header>

        {portalMessage ? <div className="portal-feedback success">{portalMessage}</div> : null}
        {portalError ? <div className="portal-feedback error">{portalError}</div> : null}

        {renderMatches()}
      </div>
      {renderModal()}
    </div>
  )
}
