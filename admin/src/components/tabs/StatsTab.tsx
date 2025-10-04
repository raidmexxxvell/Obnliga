import { useEffect, useMemo, useRef, useState } from 'react'
import { useAdminStore } from '../../store/adminStore'
import { ClubSeasonStats, PlayerCareerStats, PlayerSeasonStats } from '../../types'

type StatView = 'standings' | 'scorers' | 'discipline' | 'career'

const sortStandings = (rows: ClubSeasonStats[]) => {
  return [...rows].sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points
    const diffLeft = left.goalsFor - left.goalsAgainst
    const diffRight = right.goalsFor - right.goalsAgainst
    if (diffRight !== diffLeft) return diffRight - diffLeft
    return right.goalsFor - left.goalsFor
  })
}

const sortScorers = (rows: PlayerSeasonStats[]) => {
  return [...rows].sort((left, right) => {
    if (right.goals !== left.goals) return right.goals - left.goals
    if (right.assists !== left.assists) return right.assists - left.assists
    return right.matchesPlayed - left.matchesPlayed
  })
}

const sortDiscipline = (rows: PlayerSeasonStats[]) => {
  return [...rows].sort((left, right) => {
    if (right.yellowCards !== left.yellowCards) return right.yellowCards - left.yellowCards
    return right.redCards - left.redCards
  })
}

const sortCareer = (rows: PlayerCareerStats[]) => {
  return [...rows].sort((left, right) => {
    if (right.totalGoals !== left.totalGoals) return right.totalGoals - left.totalGoals
    if (right.totalAssists !== left.totalAssists) return right.totalAssists - left.totalAssists
    return right.totalMatches - left.totalMatches
  })
}

export const StatsTab = () => {
  const {
    token,
    data,
    selectedCompetitionId,
    selectedSeasonId,
    setSelectedSeason,
    setSelectedCompetition,
    fetchSeasons,
    fetchStats,
    loading,
    error
  } = useAdminStore((state) => ({
    token: state.token,
    data: state.data,
    selectedCompetitionId: state.selectedCompetitionId,
    selectedSeasonId: state.selectedSeasonId,
    setSelectedSeason: state.setSelectedSeason,
    setSelectedCompetition: state.setSelectedCompetition,
    fetchSeasons: state.fetchSeasons,
    fetchStats: state.fetchStats,
    loading: state.loading,
    error: state.error
  }))

  const [activeView, setActiveView] = useState<StatView>('standings')

  // Одноразовая загрузка сезонов
  const bootRef = useRef(false)
  useEffect(() => {
    if (!token || bootRef.current) return
    bootRef.current = true
    void fetchSeasons().catch(() => undefined)
  }, [token, fetchSeasons])

  // Явная загрузка статистики только по выбору сезона
  useEffect(() => {
    if (!token || !selectedSeasonId) return
    void fetchStats(selectedSeasonId).catch(() => undefined)
  }, [token, selectedSeasonId, fetchStats])

  const selectedSeason = useMemo(
    () => data.seasons.find((season) => season.id === selectedSeasonId),
    [data.seasons, selectedSeasonId]
  )

  const competitionOptions = useMemo(() => {
    const map = new Map<number, { id: number; name: string }>()
    for (const season of data.seasons) {
      if (!map.has(season.competition.id)) {
        map.set(season.competition.id, {
          id: season.competition.id,
          name: season.competition.name
        })
      }
    }
    return Array.from(map.values()).sort((left, right) => left.name.localeCompare(right.name, 'ru'))
  }, [data.seasons])

  useEffect(() => {
    if (!competitionOptions.length || !token) return
    if (!selectedCompetitionId) {
      setSelectedCompetition(competitionOptions[0]?.id)
    }
  }, [competitionOptions, selectedCompetitionId, setSelectedCompetition, token])

  const seasonsForCompetition = useMemo(() => {
    if (!selectedCompetitionId) return data.seasons
    return data.seasons.filter((season) => season.competitionId === selectedCompetitionId)
  }, [data.seasons, selectedCompetitionId])

  const standings = useMemo(() => sortStandings(data.clubStats), [data.clubStats])
  const scorers = useMemo(() => sortScorers(data.playerStats), [data.playerStats])
  const discipline = useMemo(() => sortDiscipline(data.playerStats), [data.playerStats])
  const career = useMemo(() => sortCareer(data.careerStats), [data.careerStats])

  const isLoading = Boolean(loading.stats || loading.seasons)

  return (
    <div className="tab-sections">
      <header className="tab-header">
        <div>
          <h3>Статистика сезона</h3>
          <p>Рейтинги команд и игроков, рассчитанные по данным лиги.</p>
        </div>
        <button
          className="button-ghost"
          type="button"
          disabled={!selectedSeasonId || isLoading}
          onClick={() => selectedSeasonId && fetchStats(selectedSeasonId)}
        >
          {isLoading ? 'Обновляем…' : 'Пересчитать'}
        </button>
      </header>
      {error ? <div className="inline-feedback error">{error}</div> : null}
      <section className="card-grid">
        <article className="card">
          <header>
            <h4>Выбор сезона</h4>
            <p>Показываются только доступные статистические показатели.</p>
          </header>
          <label className="stacked">
            Турнир
            <div className="chip-row">
              {competitionOptions.map((competition) => (
                <button
                  key={competition.id}
                  type="button"
                  className={selectedCompetitionId === competition.id ? 'chip active' : 'chip'}
                  onClick={() => setSelectedCompetition(competition.id)}
                >
                  {competition.name}
                </button>
              ))}
            </div>
          </label>
          <label className="stacked">
            Сезон
            <select
              value={selectedSeasonId ?? ''}
              onChange={(event) => setSelectedSeason(event.target.value ? Number(event.target.value) : undefined)}
            >
              <option value="">—</option>
              {seasonsForCompetition.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name} ({season.competition.name})
                </option>
              ))}
            </select>
          </label>
          {selectedSeason ? (
            <p className="muted">
              Период: {selectedSeason.startDate.slice(0, 10)} — {selectedSeason.endDate.slice(0, 10)}
            </p>
          ) : (
            <p className="muted">Выберите сезон, чтобы увидеть таблицы.</p>
          )}
        </article>
        <article className="card">
          <header>
            <h4>Срез данных</h4>
            <p>Переключайтесь между показателями клубов и игроков.</p>
          </header>
          <nav className="chip-row">
            <button type="button" className={activeView === 'standings' ? 'chip active' : 'chip'} onClick={() => setActiveView('standings')}>
              Таблица
            </button>
            <button type="button" className={activeView === 'scorers' ? 'chip active' : 'chip'} onClick={() => setActiveView('scorers')}>
              Бомбардиры
            </button>
            <button type="button" className={activeView === 'discipline' ? 'chip active' : 'chip'} onClick={() => setActiveView('discipline')}>
              Дисциплина
            </button>
            <button type="button" className={activeView === 'career' ? 'chip active' : 'chip'} onClick={() => setActiveView('career')}>
              Карьера
            </button>
          </nav>
          <p className="muted">Все данные обновляются автоматически по завершении матчей.</p>
        </article>
      </section>

      {activeView === 'standings' ? (
        <section className="card">
          <header>
            <h4>Турнирная таблица</h4>
            <p>Стандартная сортировка: очки, разница голов, забитые голы.</p>
          </header>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Клуб</th>
                <th>Очки</th>
                <th>Победы</th>
                <th>Поражения</th>
                <th>Голы</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, index) => (
                <tr key={`${row.seasonId}-${row.clubId}`}>
                  <td>{index + 1}</td>
                  <td>{row.club.shortName}</td>
                  <td>{row.points}</td>
                  <td>{row.wins}</td>
                  <td>{row.losses}</td>
                  <td>
                    {row.goalsFor}:{row.goalsAgainst} ({row.goalsFor - row.goalsAgainst})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!standings.length ? <p className="muted">Нет данных для выбранного сезона.</p> : null}
        </section>
      ) : null}

      {activeView === 'scorers' ? (
        <section className="card">
          <header>
            <h4>Список бомбардиров</h4>
            <p>Ассисты учитываются при равенстве забитых голов.</p>
          </header>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Клуб</th>
                <th>Голы</th>
                <th>Пасы</th>
                <th>Матчи</th>
                <th>ЖК</th>
                <th>КК</th>
              </tr>
            </thead>
            <tbody>
              {scorers.map((row, index) => (
                <tr key={`${row.seasonId}-${row.personId}`}>
                  <td>{index + 1}</td>
                  <td>{row.person.lastName} {row.person.firstName}</td>
                  <td>{row.club.shortName}</td>
                  <td>{row.goals}</td>
                  <td>{row.assists}</td>
                  <td>{row.matchesPlayed}</td>
                  <td>{row.yellowCards}</td>
                  <td>{row.redCards}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!scorers.length ? <p className="muted">Нет статистики по голам.</p> : null}
        </section>
      ) : null}

      {activeView === 'discipline' ? (
        <section className="card">
          <header>
            <h4>Дисциплинарные показатели</h4>
            <p>Список игроков с наибольшим количеством жёлтых карточек.</p>
          </header>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Клуб</th>
                <th>Жёлтые карточки</th>
                <th>Красные карточки</th>
              </tr>
            </thead>
            <tbody>
              {discipline.map((row, index) => (
                <tr key={`${row.seasonId}-${row.personId}`}>
                  <td>{index + 1}</td>
                  <td>{row.person.lastName} {row.person.firstName}</td>
                  <td>{row.club.shortName}</td>
                  <td>{row.yellowCards}</td>
                  <td>{row.redCards}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!discipline.length ? <p className="muted">Дисциплинарных записей пока нет.</p> : null}
        </section>
      ) : null}

      {activeView === 'career' ? (
        <section className="card">
          <header>
            <h4>Карьера игроков</h4>
            <p>Показатель учитывает суммарные голы и количество матчей.</p>
          </header>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Клуб</th>
                <th>Голы</th>
                <th>Пасы</th>
                <th>Матчи</th>
                <th>ЖК</th>
                <th>КК</th>
              </tr>
            </thead>
            <tbody>
              {career.map((row, index) => (
                <tr key={`${row.personId}-${row.clubId}`}>
                  <td>{index + 1}</td>
                  <td>{row.person.lastName} {row.person.firstName}</td>
                  <td>{row.club.shortName}</td>
                  <td>{row.totalGoals}</td>
                  <td>{row.totalAssists}</td>
                  <td>{row.totalMatches}</td>
                  <td>{row.yellowCards}</td>
                  <td>{row.redCards}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!career.length ? <p className="muted">Карьерная статистика отсутсвует.</p> : null}
        </section>
      ) : null}
    </div>
  )
}
