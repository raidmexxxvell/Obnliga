import React, { FormEvent, useMemo, useState } from 'react'
import './app.css'

// temporary stub: портал для подтверждения составов ожидает интеграции с API lineup

type AuthState = 'LOGIN' | 'ROSTER'

type DemoMatch = {
  id: string
  kickoff: string
  opponent: string
  venue: string
  roundLabel: string
}

type DemoPlayer = {
  id: number
  name: string
  shirt: number
  position: string
}

const demoMatches: DemoMatch[] = [
  {
    id: 'demo-1',
    kickoff: new Date(Date.now() + 1000 * 60 * 60 * 18).toISOString(),
    opponent: 'ФК «Звезда»',
    venue: 'Стадион «Текстильщик»',
    roundLabel: '5 тур'
  },
  {
    id: 'demo-2',
    kickoff: new Date(Date.now() + 1000 * 60 * 60 * 42).toISOString(),
    opponent: 'ФК «Полёт»',
    venue: 'Манеж «Обнинск»',
    roundLabel: '6 тур'
  }
]

const demoRoster: DemoPlayer[] = [
  { id: 11, name: 'Алексей Кудрявцев', shirt: 7, position: 'FW' },
  { id: 12, name: 'Илья Воронцов', shirt: 9, position: 'FW' },
  { id: 13, name: 'Марк Яковлев', shirt: 4, position: 'DF' },
  { id: 14, name: 'Юрий Самарин', shirt: 1, position: 'GK' },
  { id: 15, name: 'Павел Лебедев', shirt: 8, position: 'MF' },
  { id: 16, name: 'Антон Молотов', shirt: 17, position: 'MF' }
]

const formatKickoff = (iso: string) => {
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const LineupPortal: React.FC = () => {
  const [authState, setAuthState] = useState<AuthState>('LOGIN')
  const [clubName, setClubName] = useState<string>('')
  const [clubCode, setClubCode] = useState('')
  const [accessCode, setAccessCode] = useState('')
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(demoMatches[0]?.id ?? null)
  const [selectedPlayers, setSelectedPlayers] = useState<Record<number, boolean>>({})
  const [feedback, setFeedback] = useState<string>('')

  const activeMatch = useMemo(() => demoMatches.find((match) => match.id === selectedMatchId) ?? null, [selectedMatchId])

  const availableCount = useMemo(() => Object.values(selectedPlayers).filter(Boolean).length, [selectedPlayers])

  const handleLogin = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!clubCode.trim() || !accessCode.trim()) {
      setFeedback('Введите код клуба и пароль доступа')
      return
    }
    setFeedback('Вход выполнен в демонстрационном режиме — дождитесь реальной интеграции')
    setClubName(`Команда ${clubCode.toUpperCase()}`)
    setAuthState('ROSTER')
  }

  const togglePlayer = (playerId: number) => {
    setSelectedPlayers((prev) => ({ ...prev, [playerId]: !prev[playerId] }))
  }

  const handleRosterSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedMatchId) {
      setFeedback('Выберите матч из списка ближайших игр')
      return
    }
    if (!availableCount) {
      setFeedback('Отметьте хотя бы одного игрока, который выйдет на поле')
      return
    }
    setFeedback('temporary stub: заявка сохранена локально. После подключения API будем отправлять данные на сервер.')
  }

  return (
    <div className="portal-root">
      <div className="portal-accent" aria-hidden />
      <div className="portal-shell">
        <header className="portal-header">
          <div>
            <h1>Протокол матча</h1>
            <p>Отметьте состав за сутки до игры, чтобы статистика обновилась автоматически.</p>
          </div>
          <span className="portal-badge">β</span>
        </header>

        {feedback ? <div className="portal-feedback">{feedback}</div> : null}

        {authState === 'LOGIN' ? (
          <form className="portal-form" onSubmit={handleLogin}>
            <label>
              Код клуба
              <input value={clubCode} onChange={(event) => setClubCode(event.target.value)} placeholder="например, FC-OBN" />
            </label>
            <label>
              Пароль доступа
              <input
                type="password"
                value={accessCode}
                onChange={(event) => setAccessCode(event.target.value)}
                placeholder="получите у администратора"
              />
            </label>
            <button type="submit" className="portal-primary">Войти</button>
            <p className="portal-hint">После внедрения API здесь появится проверка токена и WebSocket подтверждения.</p>
          </form>
        ) : null}

        {authState === 'ROSTER' ? (
          <div className="portal-grid">
            <aside className="portal-card">
              <h2>{clubName || 'Клуб'}</h2>
              <p className="portal-sub">Выберите игру, которую нужно подтвердить.</p>
              <ul className="portal-match-list">
                {demoMatches.map((match) => (
                  <li key={match.id} className={match.id === selectedMatchId ? 'active' : ''}>
                    <button type="button" onClick={() => setSelectedMatchId(match.id)}>
                      <span className="match-date">{formatKickoff(match.kickoff)}</span>
                      <span className="match-round">{match.roundLabel}</span>
                      <span className="match-opponent">vs {match.opponent}</span>
                      <span className="match-venue">{match.venue}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="portal-hint">Реальные данные появятся после подключения эндпоинта /api/lineup/matches.</p>
            </aside>

            <section className="portal-card">
              <h2>Состав на матч</h2>
              <p className="portal-sub">
                {activeMatch ? `Матч начинается ${formatKickoff(activeMatch.kickoff)} · ${activeMatch.opponent}` : 'Выберите матч слева.'}
              </p>
              <form className="portal-roster" onSubmit={handleRosterSubmit}>
                <div className="portal-roster-grid">
                  {demoRoster.map((player) => {
                    const checked = Boolean(selectedPlayers[player.id])
                    return (
                      <label key={player.id} className={checked ? 'selected' : ''}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePlayer(player.id)}
                          aria-label={`Игрок ${player.name}`}
                        />
                        <span className="player-name">№{player.shirt} · {player.name}</span>
                        <span className="player-pos">{player.position}</span>
                      </label>
                    )
                  })}
                </div>
                <footer className="portal-actions">
                  <span>Отмечено: {availableCount} из {demoRoster.length}</span>
                  <button type="submit" className="portal-primary">Подтвердить состав</button>
                </footer>
              </form>
              <p className="portal-hint">
                После интеграции с backend система будет фиксировать подтверждение и запускать пересчёт статистики.
              </p>
            </section>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default LineupPortal
