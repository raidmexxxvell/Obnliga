import { useEffect, useMemo, useRef, useState } from 'react'
import { useAdminStore } from '../../store/adminStore'
import { ClubSeasonStats, MatchSummary, PlayerCareerStats, PlayerSeasonStats } from '../../types'

type StatView = 'standings' | 'scorers' | 'assists' | 'goalContribution' | 'discipline' | 'career'

const sortStandings = (rows: ClubSeasonStats[], matches: MatchSummary[]) => {
  const dataset = [...rows]
  if (!dataset.length) return dataset

  const seasonIds = new Set(dataset.map((row) => row.seasonId))
  type HeadToHeadEntry = { points: number; goalsFor: number; goalsAgainst: number }
  const headToHead = new Map<number, Map<number, HeadToHeadEntry>>()

  const ensureHeadToHead = (clubId: number, opponentId: number): HeadToHeadEntry => {
    let opponents = headToHead.get(clubId)
    if (!opponents) {
      opponents = new Map<number, HeadToHeadEntry>()
      headToHead.set(clubId, opponents)
    }
    let record = opponents.get(opponentId)
    if (!record) {
      record = { points: 0, goalsFor: 0, goalsAgainst: 0 }
      opponents.set(opponentId, record)
    }
    return record
  }

  for (const match of matches) {
    if (match.status !== 'FINISHED') continue
    if (!seasonIds.has(match.seasonId)) continue
    const home = ensureHeadToHead(match.homeTeamId, match.awayTeamId)
    const away = ensureHeadToHead(match.awayTeamId, match.homeTeamId)

    home.goalsFor += match.homeScore
    home.goalsAgainst += match.awayScore
    away.goalsFor += match.awayScore
    away.goalsAgainst += match.homeScore

    if (match.homeScore > match.awayScore) {
      home.points += 3
    } else if (match.homeScore < match.awayScore) {
      away.points += 3
    } else {
      home.points += 1
      away.points += 1
    }
  }

  const getHeadToHead = (clubId: number, opponentId: number): HeadToHeadEntry => {
    return headToHead.get(clubId)?.get(opponentId) ?? { points: 0, goalsFor: 0, goalsAgainst: 0 }
  }

  return dataset.sort((left, right) => {
    if (right.points !== left.points) return right.points - left.points

    const leftDiff = left.goalsFor - left.goalsAgainst
    const rightDiff = right.goalsFor - right.goalsAgainst
    if (rightDiff !== leftDiff) return rightDiff - leftDiff

    const leftVsRight = getHeadToHead(left.clubId, right.clubId)
    const rightVsLeft = getHeadToHead(right.clubId, left.clubId)

    if (rightVsLeft.points !== leftVsRight.points) return rightVsLeft.points - leftVsRight.points

    const leftHeadDiff = leftVsRight.goalsFor - leftVsRight.goalsAgainst
    const rightHeadDiff = rightVsLeft.goalsFor - rightVsLeft.goalsAgainst
    if (rightHeadDiff !== leftHeadDiff) return rightHeadDiff - leftHeadDiff

    if (rightVsLeft.goalsFor !== leftVsRight.goalsFor) return rightVsLeft.goalsFor - leftVsRight.goalsFor

    return right.goalsFor - left.goalsFor
  })
}

const sortScorers = (rows: PlayerSeasonStats[]) => {
  return [...rows].sort((left, right) => {
    if (right.goals !== left.goals) return right.goals - left.goals
    if (left.matchesPlayed !== right.matchesPlayed) return left.matchesPlayed - right.matchesPlayed
    const leftName = `${left.person.lastName} ${left.person.firstName}`
    const rightName = `${right.person.lastName} ${right.person.firstName}`
    return leftName.localeCompare(rightName, 'ru')
  })
}

const sortAssists = (rows: PlayerSeasonStats[]) => {
  return [...rows]
    .filter((row) => row.assists > 0)
    .sort((left, right) => {
      if (right.assists !== left.assists) return right.assists - left.assists
      if (left.matchesPlayed !== right.matchesPlayed) return left.matchesPlayed - right.matchesPlayed
      const leftName = `${left.person.lastName} ${left.person.firstName}`
      const rightName = `${right.person.lastName} ${right.person.firstName}`
      return leftName.localeCompare(rightName, 'ru')
    })
}

const sortGoalContributions = (rows: PlayerSeasonStats[]) => {
  return [...rows]
    .filter((row) => row.goals + row.assists > 0)
    .sort((left, right) => {
      const leftTotal = left.goals + left.assists
      const rightTotal = right.goals + right.assists
      if (rightTotal !== leftTotal) return rightTotal - leftTotal
      if (right.goals !== left.goals) return right.goals - left.goals
      const leftCleanGoals = left.goals - (left.penaltyGoals ?? 0)
      const rightCleanGoals = right.goals - (right.penaltyGoals ?? 0)
      if (rightCleanGoals !== leftCleanGoals) return rightCleanGoals - leftCleanGoals
      if (right.assists !== left.assists) return right.assists - left.assists
      if (left.matchesPlayed !== right.matchesPlayed) return left.matchesPlayed - right.matchesPlayed
      const leftName = `${left.person.lastName} ${left.person.firstName}`
      const rightName = `${right.person.lastName} ${right.person.firstName}`
      return leftName.localeCompare(rightName, 'ru')
    })
}

const sortDiscipline = (rows: PlayerSeasonStats[]) => {
  return rows
    .filter((row) => row.yellowCards > 0 || row.redCards > 0)
    .sort((left, right) => {
    if (right.yellowCards !== left.yellowCards) return right.yellowCards - left.yellowCards
      if (right.redCards !== left.redCards) return right.redCards - left.redCards
      return right.matchesPlayed - left.matchesPlayed
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
  const [careerClubId, setCareerClubId] = useState<number | undefined>(undefined)

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

  const standings = useMemo(
    () => sortStandings(data.clubStats, data.matches),
    [data.clubStats, data.matches]
  )
  const scorers = useMemo(() => sortScorers(data.playerStats), [data.playerStats])
  const assistsTop = useMemo(() => sortAssists(data.playerStats).slice(0, 10), [data.playerStats])
  const goalContributions = useMemo(() => sortGoalContributions(data.playerStats), [data.playerStats])
  const discipline = useMemo(() => sortDiscipline(data.playerStats), [data.playerStats])
  const careerSorted = useMemo(() => sortCareer(data.careerStats), [data.careerStats])
  const career = useMemo(
    () => (careerClubId ? careerSorted.filter((row) => row.clubId === careerClubId) : careerSorted),
    [careerSorted, careerClubId]
  )

  const careerClubOptions = useMemo(() => {
    const map = new Map<number, string>()
    for (const row of data.careerStats) {
      map.set(row.clubId, row.club.name)
    }
    return Array.from(map.entries()).sort((left, right) => left[1].localeCompare(right[1], 'ru'))
  }, [data.careerStats])

  const finishedMatchesByClub = useMemo(() => {
    const map = new Map<number, number>()
    for (const match of data.matches) {
      if (selectedSeasonId && match.seasonId !== selectedSeasonId) continue
      if (match.status !== 'FINISHED') continue
      map.set(match.homeTeamId, (map.get(match.homeTeamId) ?? 0) + 1)
      map.set(match.awayTeamId, (map.get(match.awayTeamId) ?? 0) + 1)
    }
    return map
  }, [data.matches, selectedSeasonId])

  useEffect(() => {
    if (!careerClubId) return
    if (!careerClubOptions.some(([id]) => id === careerClubId)) {
      setCareerClubId(undefined)
    }
  }, [careerClubId, careerClubOptions])

  const isLoading = Boolean(loading.stats || loading.seasons)

  const formatGoals = (goals: number, penaltyGoals?: number) => {
    if (penaltyGoals && penaltyGoals > 0) {
      return `${goals}(${penaltyGoals})`
    }
    return String(goals)
  }

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
            <button type="button" className={activeView === 'assists' ? 'chip active' : 'chip'} onClick={() => setActiveView('assists')}>
              Передачи
            </button>
            <button
              type="button"
              className={activeView === 'goalContribution' ? 'chip active' : 'chip'}
              onClick={() => setActiveView('goalContribution')}
            >
              Гол+Пасс
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
            <p>Сортировка: очки, разница голов, личные встречи.</p>
          </header>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Клуб</th>
                <th>Победы</th>
                <th>Ничьи</th>
                <th>Поражения</th>
                <th>Голы</th>
                <th>Очки</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((row, index) => (
                <tr key={`${row.seasonId}-${row.clubId}`}>
                  <td>{index + 1}</td>
                  <td>{row.club.name}</td>
                  <td>{row.wins}</td>
                  <td>
                    {(() => {
                      const totalMatches = finishedMatchesByClub.get(row.clubId)
                      if (totalMatches !== undefined) {
                        return Math.max(0, totalMatches - row.wins - row.losses)
                      }
                      return Math.max(0, row.points - row.wins * 3)
                    })()}
                  </td>
                  <td>{row.losses}</td>
                  <td>
                    {row.goalsFor}:{row.goalsAgainst} ({row.goalsFor - row.goalsAgainst})
                  </td>
                  <td>{row.points}</td>
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
            <p>При равенстве голов выше игрок с меньшим количеством матчей.</p>
          </header>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Клуб</th>
                <th>Матчи</th>
                <th>Голы</th>
              </tr>
            </thead>
            <tbody>
              {scorers.map((row, index) => (
                <tr key={`${row.seasonId}-${row.personId}`}>
                  <td>{index + 1}</td>
                  <td>{row.person.lastName} {row.person.firstName}</td>
                  <td>{row.club.name}</td>
                  <td>{row.matchesPlayed}</td>
                  <td>{formatGoals(row.goals, row.penaltyGoals)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!scorers.length ? <p className="muted">Нет статистики по голам.</p> : null}
        </section>
      ) : null}

      {activeView === 'assists' ? (
        <section className="card">
          <header>
            <h4>Таблица ассистентов</h4>
            <p>Топ-10 игроков по голевым передачам в выбранном сезоне.</p>
          </header>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Клуб</th>
                <th>Матчи</th>
                <th>Передачи</th>
              </tr>
            </thead>
            <tbody>
              {assistsTop.map((row, index) => (
                <tr key={`${row.seasonId}-${row.personId}`}>
                  <td>{index + 1}</td>
                  <td>{row.person.lastName} {row.person.firstName}</td>
                  <td>{row.club.name}</td>
                  <td>{row.matchesPlayed}</td>
                  <td>{row.assists}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!assistsTop.length ? <p className="muted">Передачи пока не зафиксированы.</p> : null}
        </section>
      ) : null}

      {activeView === 'goalContribution' ? (
        <section className="card">
          <header>
            <h4>Комбинированный рейтинг Гол+Пасс</h4>
            <p>Сортировка: Гол+Пасс, голы, чистые голы, передачи, количество матчей.</p>
          </header>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Клуб</th>
                <th>Матчи</th>
                <th>Голы</th>
                <th>Передачи</th>
                <th>Гол+Пасс</th>
              </tr>
            </thead>
            <tbody>
              {goalContributions.map((row, index) => {
                const total = row.goals + row.assists
                return (
                  <tr key={`${row.seasonId}-${row.personId}`}>
                    <td>{index + 1}</td>
                    <td>{row.person.lastName} {row.person.firstName}</td>
                    <td>{row.club.name}</td>
                    <td>{row.matchesPlayed}</td>
                    <td>{formatGoals(row.goals, row.penaltyGoals)}</td>
                    <td>{row.assists}</td>
                    <td>{total}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!goalContributions.length ? <p className="muted">Нет результативных действий в выбранном сезоне.</p> : null}
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
                  <td>{row.club.name}</td>
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
          <label className="stacked" style={{ maxWidth: 260 }}>
            Клуб
            <select
              value={careerClubId ?? ''}
              onChange={(event) => setCareerClubId(event.target.value ? Number(event.target.value) : undefined)}
            >
              <option value="">Все клубы</option>
              {careerClubOptions.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Игрок</th>
                <th>Клуб</th>
                <th>Матчи</th>
                <th>ЖК</th>
                <th>КК</th>
                <th>Пасы</th>
                <th>Голы</th>
              </tr>
            </thead>
            <tbody>
              {career.map((row, index) => (
                <tr key={`${row.personId}-${row.clubId}`}>
                  <td>{index + 1}</td>
                  <td>{row.person.lastName} {row.person.firstName}</td>
                  <td>{row.club.name}</td>
                  <td>{row.totalMatches}</td>
                  <td>{row.yellowCards}</td>
                  <td>{row.redCards}</td>
                  <td>{row.totalAssists}</td>
                  <td>{formatGoals(row.totalGoals, row.penaltyGoals)}</td>
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
