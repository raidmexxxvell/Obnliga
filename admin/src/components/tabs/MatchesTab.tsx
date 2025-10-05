import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
import {
  adminDelete,
  adminGet,
  adminPost,
  adminPut,
  createSeasonAutomation,
  createSeasonPlayoffs
} from '../../api/adminClient'
import { useAdminStore } from '../../store/adminStore'
import {
  Club,
  FriendlyMatch,
  MatchEventEntry,
  MatchLineupEntry,
  MatchSeries,
  MatchSummary,
  Person,
  Season,
  SeasonAutomationResult,
  PlayoffCreationResult,
  SeasonParticipant
} from '../../types'

type FeedbackLevel = 'info' | 'success' | 'error'

type SeriesFormState = {
  stageName: string
  homeClubId: number | ''
  awayClubId: number | ''
}

type MatchFormState = {
  matchDateTime: string
  homeTeamName: string
  awayTeamName: string
  stadiumId: number | ''
  refereeId: number | ''
  eventName: string
}

type EventFormState = {
  teamId: number | ''
  playerId: number | ''
  minute: number | ''
  eventType: MatchEventEntry['eventType']
  relatedPlayerId: number | ''
}

type SeasonAutomationFormState = {
  competitionId: number | ''
  seasonName: string
  startDate: string
  matchDayOfWeek: string
  matchTime: string
  clubIds: number[]
  copyClubPlayersToRoster: boolean
  seriesFormat: 'SINGLE_MATCH' | 'TWO_LEGGED' | 'BEST_OF_N'
}

type MatchUpdateFormState = {
  homeScore: number | ''
  awayScore: number | ''
  status: MatchSummary['status']
  stadiumId: number | ''
  refereeId: number | ''
  matchDateTime: string
}

const playoffBestOfOptions = [3, 5, 7]

const defaultSeriesForm: SeriesFormState = {
  stageName: '',
  homeClubId: '',
  awayClubId: ''
}

const defaultMatchForm: MatchFormState = {
  matchDateTime: '',
  homeTeamName: '',
  awayTeamName: '',
  stadiumId: '',
  refereeId: '',
  eventName: ''
}

const defaultEventForm: EventFormState = {
  teamId: '',
  playerId: '',
  minute: '',
  eventType: 'GOAL',
  relatedPlayerId: ''
}

type EventPlayerOption = {
  personId: number
  clubId: number
  person: Person
  club: Club
  source: 'lineup' | 'roster'
  shirtNumber?: number | null
}

const defaultAutomationForm: SeasonAutomationFormState = {
  competitionId: '',
  seasonName: '',
  startDate: new Date().toISOString().slice(0, 10),
  matchDayOfWeek: '0',
  matchTime: '12:00',
  clubIds: [],
  copyClubPlayersToRoster: true,
  seriesFormat: 'SINGLE_MATCH'
}

const buildMatchUpdateForm = (match: MatchSummary): MatchUpdateFormState => ({
  homeScore: typeof match.homeScore === 'number' ? match.homeScore : '',
  awayScore: typeof match.awayScore === 'number' ? match.awayScore : '',
  status: match.status,
  stadiumId: match.stadiumId ?? '',
  refereeId: match.refereeId ?? '',
  matchDateTime: match.matchDateTime.slice(0, 16)
})

const seriesFormatNames: Record<SeasonAutomationFormState['seriesFormat'], string> = {
  SINGLE_MATCH: 'Лига: один круг',
  TWO_LEGGED: 'Лига: два круга (дом и гости)',
  BEST_OF_N: 'Лига + плей-офф до двух побед'
}

const automationSeriesLabels: Record<SeasonAutomationFormState['seriesFormat'], string> = {
  SINGLE_MATCH: `${seriesFormatNames.SINGLE_MATCH} (каждый с каждым)`,
  TWO_LEGGED: `${seriesFormatNames.TWO_LEGGED}`,
  BEST_OF_N: `${seriesFormatNames.BEST_OF_N}`
}

const competitionTypeLabels: Record<'LEAGUE' | 'CUP' | 'HYBRID', string> = {
  LEAGUE: 'Лига',
  CUP: 'Кубок',
  HYBRID: 'Лига + кубок'
}

const weekdayOptions = [
  { value: '0', label: 'Воскресенье' },
  { value: '1', label: 'Понедельник' },
  { value: '2', label: 'Вторник' },
  { value: '3', label: 'Среда' },
  { value: '4', label: 'Четверг' },
  { value: '5', label: 'Пятница' },
  { value: '6', label: 'Суббота' }
]

const seriesStatuses: MatchSeries['seriesStatus'][] = ['IN_PROGRESS', 'FINISHED']

const seriesStatusLabels: Record<MatchSeries['seriesStatus'], string> = {
  IN_PROGRESS: 'В процессе',
  FINISHED: 'Завершена'
}

const matchStatuses: MatchSummary['status'][] = ['SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED']

const matchStatusLabels: Record<MatchSummary['status'], string> = {
  SCHEDULED: 'Запланирован',
  LIVE: 'Идёт',
  FINISHED: 'Завершён',
  POSTPONED: 'Перенесён'
}

const eventTypes: MatchEventEntry['eventType'][] = ['GOAL', 'PENALTY_GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUB_IN', 'SUB_OUT']

const eventTypeLabels: Record<MatchEventEntry['eventType'], string> = {
  GOAL: 'Гол',
  PENALTY_GOAL: 'Гол с пенальти',
  YELLOW_CARD: 'Жёлтая карточка',
  RED_CARD: 'Красная карточка',
  SUB_IN: 'Замена (вышел)',
  SUB_OUT: 'Замена (ушёл)'
}

export const MatchesTab = () => {
  const {
    token,
    data,
    selectedSeasonId,
    setSelectedSeason,
    fetchSeasons,
    fetchSeries,
    fetchMatches,
    fetchFriendlyMatches,
    fetchDictionaries,
    loading,
    error
  } = useAdminStore((state) => ({
    token: state.token,
    data: state.data,
    selectedSeasonId: state.selectedSeasonId,
    setSelectedSeason: state.setSelectedSeason,
    fetchSeasons: state.fetchSeasons,
    fetchSeries: state.fetchSeries,
    fetchMatches: state.fetchMatches,
    fetchFriendlyMatches: state.fetchFriendlyMatches,
    fetchDictionaries: state.fetchDictionaries,
    loading: state.loading,
    error: state.error
  }))

  const friendlyMatchesSorted = useMemo<FriendlyMatch[]>(() => {
    if (!data.friendlyMatches?.length) return []
    return [...data.friendlyMatches].sort((left, right) => (left.matchDateTime < right.matchDateTime ? 1 : -1))
  }, [data.friendlyMatches])
  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackLevel, setFeedbackLevel] = useState<FeedbackLevel>('info')

  const [seriesForm, setSeriesForm] = useState<SeriesFormState>(defaultSeriesForm)
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null)
  const [seriesStatusUpdate, setSeriesStatusUpdate] = useState<MatchSeries['seriesStatus']>('IN_PROGRESS')
  const [seriesWinnerId, setSeriesWinnerId] = useState<number | ''>('')
  const [matchForm, setMatchForm] = useState<MatchFormState>(defaultMatchForm)
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [isMatchModalOpen, setMatchModalOpen] = useState(false)
  const [matchUpdateForms, setMatchUpdateForms] = useState<Record<string, MatchUpdateFormState>>({})
  const matchModalRef = useRef<HTMLDivElement | null>(null)

  const [eventForm, setEventForm] = useState<EventFormState>(defaultEventForm)

  const [matchLineup, setMatchLineup] = useState<MatchLineupEntry[]>([])
  const [matchEvents, setMatchEvents] = useState<MatchEventEntry[]>([])
  const [lineupClubFilter, setLineupClubFilter] = useState<number | ''>('')

  const [automationForm, setAutomationForm] = useState<SeasonAutomationFormState>(defaultAutomationForm)
  const [automationResult, setAutomationResult] = useState<SeasonAutomationResult | null>(null)
  const [automationLoading, setAutomationLoading] = useState(false)
  const [playoffBestOf, setPlayoffBestOf] = useState<number>(playoffBestOfOptions[0])
  const [playoffLoading, setPlayoffLoading] = useState(false)
  const [playoffResult, setPlayoffResult] = useState<PlayoffCreationResult | null>(null)

  const isLoading = Boolean(loading.matches || loading.seasons)

  const selectedSeason = useMemo<Season | undefined>(() => {
    return data.seasons.find((season) => season.id === selectedSeasonId)
  }, [data.seasons, selectedSeasonId])

  const seasonParticipants = useMemo<SeasonParticipant[]>(() => {
    return selectedSeason?.participants ?? []
  }, [selectedSeason])

  // Одноразовая инициализация словарей и сезонов
  const bootRef = useRef(false)
  useEffect(() => {
    if (!token || bootRef.current) return
    bootRef.current = true
    void fetchDictionaries().catch(() => undefined)
    void fetchSeasons().catch(() => undefined)
    void fetchFriendlyMatches().catch(() => undefined)
  }, [token, fetchDictionaries, fetchSeasons, fetchFriendlyMatches])

  useEffect(() => {
    if (!selectedSeasonId || !token) return
    void fetchSeries(selectedSeasonId).catch(() => undefined)
    void fetchMatches(selectedSeasonId).catch(() => undefined)
  }, [selectedSeasonId, token, fetchSeries, fetchMatches])

  useEffect(() => {
    setPlayoffResult(null)
  }, [selectedSeasonId])

  const handleFeedback = (message: string, level: FeedbackLevel) => {
    setFeedback(message)
    setFeedbackLevel(level)
  }

  const ensureSeasonSelected = (): number | null => {
    if (!selectedSeasonId) {
      handleFeedback('Сначала выберите сезон', 'error')
      return null
    }
    return selectedSeasonId
  }

  const runWithMessages = async (fn: () => Promise<unknown>, successMessage: string) => {
    if (!token) {
      handleFeedback('Нет токена авторизации', 'error')
      return
    }
    try {
      await fn()
      handleFeedback(successMessage, 'success')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось выполнить операцию'
      handleFeedback(message, 'error')
    }
  }

  const loadMatchDetails = async (matchId: string) => {
    if (!token) return
    try {
      const [lineup, events] = await Promise.all([
        adminGet<MatchLineupEntry[]>(token, `/api/admin/matches/${matchId}/lineup`),
        adminGet<MatchEventEntry[]>(token, `/api/admin/matches/${matchId}/events`)
      ])
      setMatchLineup(lineup)
      setMatchEvents(events)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось загрузить детали матча'
      handleFeedback(message, 'error')
    }
  }

  const toggleAutomationClub = (clubId: number) => {
    setAutomationForm((form) => {
      if (form.clubIds.includes(clubId)) {
        return { ...form, clubIds: form.clubIds.filter((id) => id !== clubId) }
      }
      return { ...form, clubIds: [...form.clubIds, clubId] }
    })
  }

  const moveAutomationClub = (clubId: number, direction: -1 | 1) => {
    setAutomationForm((form) => {
      const index = form.clubIds.findIndex((id) => id === clubId)
      if (index === -1) return form
      const nextIndex = index + direction
      if (nextIndex < 0 || nextIndex >= form.clubIds.length) return form
      const next = [...form.clubIds]
      const [removed] = next.splice(index, 1)
      next.splice(nextIndex, 0, removed)
      return { ...form, clubIds: next }
    })
  }

  const handleAutomationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!automationForm.competitionId || !automationForm.seasonName.trim() || !automationForm.startDate) {
      handleFeedback('Заполните данные соревнования, даты и названия', 'error')
      return
    }
    if (automationForm.clubIds.length < 2) {
      handleFeedback('Выберите минимум две команды для участия', 'error')
      return
    }
    if (!token) {
      handleFeedback('Нет токена авторизации', 'error')
      return
    }

    const competitionId = Number(automationForm.competitionId)
    const matchDay = Number(automationForm.matchDayOfWeek)
    const payload = {
      competitionId,
      seasonName: automationForm.seasonName.trim(),
      startDate: automationForm.startDate,
      matchDayOfWeek: Number.isFinite(matchDay) ? matchDay : 0,
      matchTime: automationForm.matchTime || undefined,
      clubIds: automationForm.clubIds,
      copyClubPlayersToRoster: automationForm.copyClubPlayersToRoster,
      seriesFormat: automationForm.seriesFormat
    }

    try {
      setAutomationLoading(true)
      const result = await createSeasonAutomation(token, payload)
      setAutomationResult(result)
      handleFeedback(
        `Сезон создан автоматически: ${result.participantsCreated} команд, ${result.matchesCreated} матчей, ${result.rosterEntriesCreated} заявок, ${result.seriesCreated} серий плей-офф`,
        'success'
      )
      await fetchSeasons()
      setSelectedSeason(result.seasonId)
      setAutomationForm({
        ...defaultAutomationForm,
        startDate: new Date().toISOString().slice(0, 10)
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось запустить автоматизацию'
      handleFeedback(message, 'error')
    } finally {
      setAutomationLoading(false)
    }
  }

  const handleCreatePlayoffs = async () => {
    const seasonId = ensureSeasonSelected()
    if (!seasonId) return
    if (!token) {
      handleFeedback('Нет токена авторизации', 'error')
      return
    }
    if (playoffsDisabledReason) {
      handleFeedback(playoffsDisabledReason, 'error')
      return
    }
    try {
      setPlayoffLoading(true)
      const result = await createSeasonPlayoffs(token, seasonId, {
        bestOfLength: playoffBestOf
      })
      setPlayoffResult(result)
      const byeClubName = result.byeClubId
        ? data.clubs.find((club) => club.id === result.byeClubId)?.name ?? `клуб #${result.byeClubId}`
        : null
      const successMessage = [`Серий: ${result.seriesCreated}`, `Матчей: ${result.matchesCreated}`]
      if (byeClubName) {
        successMessage.push(`${byeClubName} автоматически проходит дальше`)
      }
      handleFeedback(`Плей-офф создан (${successMessage.join(', ')})`, 'success')
      await Promise.all([fetchSeries(seasonId), fetchMatches(seasonId), fetchSeasons()])
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Не удалось создать плей-офф'
      handleFeedback(message, 'error')
    } finally {
      setPlayoffLoading(false)
    }
  }

  const handleSeriesSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const seasonId = ensureSeasonSelected()
    if (!seasonId || !seriesForm.stageName || !seriesForm.homeClubId || !seriesForm.awayClubId) {
      handleFeedback('Укажите стадии и клубы для серии', 'error')
      return
    }
    await runWithMessages(async () => {
      const payload = {
        seasonId,
        stageName: seriesForm.stageName.trim(),
        homeClubId: seriesForm.homeClubId,
        awayClubId: seriesForm.awayClubId
      }
      if (editingSeriesId) {
        await adminPut(token, `/api/admin/series/${editingSeriesId}`, {
          seriesStatus: seriesStatusUpdate,
          winnerClubId: seriesWinnerId || undefined
        })
      } else {
        await adminPost(token, '/api/admin/series', payload)
      }
      await fetchSeries(seasonId)
    }, 'Серия сохранена')
    setSeriesForm(defaultSeriesForm)
    setEditingSeriesId(null)
    setSeriesWinnerId('')
    setSeriesStatusUpdate('IN_PROGRESS')
  }

  const handleSeriesEdit = (series: MatchSeries) => {
    setEditingSeriesId(series.id)
    setSeriesForm({ stageName: series.stageName, homeClubId: series.homeClubId, awayClubId: series.awayClubId })
    setSeriesStatusUpdate(series.seriesStatus)
    setSeriesWinnerId(series.winnerClubId ?? '')
  }

  const handleSeriesDelete = async (series: MatchSeries) => {
    const seasonId = ensureSeasonSelected()
    if (!seasonId) return
    await runWithMessages(async () => {
      await adminDelete(token, `/api/admin/series/${series.id}`)
      await fetchSeries(seasonId)
    }, `Серия «${series.stageName}» удалена`)
  }

  const handleMatchSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const matchDate = matchForm.matchDateTime
    const homeName = matchForm.homeTeamName.trim()
    const awayName = matchForm.awayTeamName.trim()

    if (!matchDate || !homeName || !awayName) {
      handleFeedback('Укажите дату и названия команд', 'error')
      return
    }
    if (homeName.toLowerCase() === awayName.toLowerCase()) {
      handleFeedback('Названия команд должны отличаться', 'error')
      return
    }
    await runWithMessages(async () => {
      await adminPost(token, '/api/admin/friendly-matches', {
        matchDateTime: new Date(matchDate).toISOString(),
        homeTeamName: homeName,
        awayTeamName: awayName,
        stadiumId: matchForm.stadiumId || undefined,
        refereeId: matchForm.refereeId || undefined,
        eventName: matchForm.eventName.trim() || undefined
      })
      await fetchFriendlyMatches()
    }, 'Товарищеский матч создан')
    setMatchForm(defaultMatchForm)
  }

  const handleFriendlyMatchDelete = async (matchId: string) => {
    await runWithMessages(async () => {
      await adminDelete(token, `/api/admin/friendly-matches/${matchId}`)
      await fetchFriendlyMatches()
    }, 'Товарищеский матч удалён')
  }

  const handleMatchSelect = (match: MatchSummary) => {
    setSelectedMatchId(match.id)
    setMatchModalOpen(true)
    setLineupClubFilter('')
    setMatchUpdateForms((forms) => ({
      ...forms,
      [match.id]: buildMatchUpdateForm(match)
    }))
    void loadMatchDetails(match.id)
  }

  const closeMatchModal = () => {
    setMatchModalOpen(false)
    setSelectedMatchId(null)
    setMatchLineup([])
    setMatchEvents([])
    setLineupClubFilter('')
  }

  const handleMatchUpdate = async (match: MatchSummary, form: MatchUpdateFormState) => {
    const seasonId = ensureSeasonSelected()
    if (!seasonId) return
    await runWithMessages(async () => {
      await adminPut(token, `/api/admin/matches/${match.id}`, {
        matchDateTime: form.matchDateTime ? new Date(form.matchDateTime).toISOString() : undefined,
        homeScore: form.homeScore === '' ? undefined : Number(form.homeScore),
        awayScore: form.awayScore === '' ? undefined : Number(form.awayScore),
        status: form.status,
        stadiumId: form.stadiumId === '' ? undefined : Number(form.stadiumId),
        refereeId: form.refereeId === '' ? undefined : Number(form.refereeId)
      })
      await fetchMatches(seasonId)
      await loadMatchDetails(match.id)
    }, 'Матч обновлён')
  }

  const adjustMatchScore = (match: MatchSummary, key: 'homeScore' | 'awayScore', delta: -1 | 1) => {
    setMatchUpdateForms((forms) => {
      const current = forms[match.id] ?? buildMatchUpdateForm(match)
      const fallback = key === 'homeScore' ? match.homeScore : match.awayScore
      const currentValue = typeof current[key] === 'number' ? current[key] : fallback
      const nextValue = Math.max(0, (currentValue ?? 0) + delta)
      return {
        ...forms,
        [match.id]: {
          ...current,
          [key]: nextValue
        }
      }
    })
  }

  const setMatchScore = (match: MatchSummary, key: 'homeScore' | 'awayScore', value: number | '') => {
    setMatchUpdateForms((forms) => {
      const current = forms[match.id] ?? buildMatchUpdateForm(match)
      return {
        ...forms,
        [match.id]: {
          ...current,
          [key]: value === '' ? '' : Math.max(0, value)
        }
      }
    })
  }

  const setMatchStatus = (match: MatchSummary, status: MatchSummary['status']) => {
    setMatchUpdateForms((forms) => {
      const current = forms[match.id] ?? buildMatchUpdateForm(match)
      const nextForm: MatchUpdateFormState = { ...current, status }
      if (status === 'LIVE') {
        nextForm.homeScore = typeof nextForm.homeScore === 'number' ? nextForm.homeScore : 0
        nextForm.awayScore = typeof nextForm.awayScore === 'number' ? nextForm.awayScore : 0
      }
      return {
        ...forms,
        [match.id]: nextForm
      }
    })
  }

  const setMatchDateTime = (match: MatchSummary, value: string) => {
    setMatchUpdateForms((forms) => {
      const current = forms[match.id] ?? buildMatchUpdateForm(match)
      return {
        ...forms,
        [match.id]: {
          ...current,
          matchDateTime: value
        }
      }
    })
  }

  useEffect(() => {
    setEventForm(defaultEventForm)
    setLineupClubFilter('')
  }, [selectedMatchId])

  useEffect(() => {
    if (!selectedMatchId) {
      setMatchModalOpen(false)
    }
  }, [selectedMatchId])

  useEffect(() => {
    if (!isMatchModalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const timer = window.setTimeout(() => {
      matchModalRef.current?.focus()
    }, 0)
    return () => {
      document.body.style.overflow = previousOverflow
      window.clearTimeout(timer)
    }
  }, [isMatchModalOpen])

  const handleMatchDelete = async (match: MatchSummary) => {
    const seasonId = ensureSeasonSelected()
    if (!seasonId) return
    await runWithMessages(async () => {
      await adminDelete(token, `/api/admin/matches/${match.id}`)
      await fetchMatches(seasonId)
    }, 'Матч удалён')
    if (selectedMatchId === match.id) {
      setMatchModalOpen(false)
      setSelectedMatchId(null)
      setMatchLineup([])
      setMatchEvents([])
    }
  }

  const handleLineupRemove = async (entry: MatchLineupEntry) => {
    if (!selectedMatchId) return
    await runWithMessages(async () => {
      await adminDelete(token, `/api/admin/matches/${selectedMatchId}/lineup/${entry.personId}`)
      await loadMatchDetails(selectedMatchId)
    }, 'Игрок удалён из состава')
  }

  const handleEventSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedMatchId || !eventForm.teamId || !eventForm.playerId || !eventForm.minute) {
      handleFeedback('Команда, игрок и минута обязательны для события', 'error')
      return
    }
    const playerEntry = matchPlayersById.get(eventForm.playerId)
    if (!playerEntry || playerEntry.clubId !== eventForm.teamId) {
      handleFeedback('Игрок должен быть из выбранной команды', 'error')
      return
    }
    if (eventForm.relatedPlayerId) {
      const relatedEntry = matchPlayersById.get(eventForm.relatedPlayerId)
      if (!relatedEntry || relatedEntry.clubId !== playerEntry.clubId) {
        handleFeedback('Второй игрок должен быть из той же команды, что и автор события', 'error')
        return
      }
    }
    await runWithMessages(async () => {
      await adminPost(token, `/api/admin/matches/${selectedMatchId}/events`, {
        teamId: eventForm.teamId,
        playerId: eventForm.playerId,
        minute: eventForm.minute,
        eventType: eventForm.eventType,
        relatedPlayerId: eventForm.relatedPlayerId || undefined
      })
      await loadMatchDetails(selectedMatchId)
    }, 'Событие добавлено')
    setEventForm(defaultEventForm)
  }

  const handleEventDelete = async (entry: MatchEventEntry) => {
    if (!selectedMatchId) return
    await runWithMessages(async () => {
      await adminDelete(token, `/api/admin/matches/${selectedMatchId}/events/${entry.id}`)
      await loadMatchDetails(selectedMatchId)
    }, 'Событие удалено')
  }

  const availableClubs = data.clubs
  const seasonSeries = data.series.filter((series) => series.seasonId === selectedSeasonId)
  const seasonMatches = data.matches.filter((match) => match.seasonId === selectedSeasonId)

  const matchesSorted = useMemo(() => {
    if (!seasonMatches.length) return []
    return [...seasonMatches].sort((a, b) => new Date(a.matchDateTime).getTime() - new Date(b.matchDateTime).getTime())
  }, [seasonMatches])

  const matchesGrouped = useMemo(() => {
    if (!matchesSorted.length) return []
    const map = new Map<string, { label: string; matches: MatchSummary[] }>()
    for (const match of matchesSorted) {
      const roundId = match.round?.id ?? 'no-round'
      const key = typeof roundId === 'number' ? `round-${roundId}` : 'round-none'
      const label = match.round?.label?.trim() || 'Регулярный сезон'
      if (!map.has(key)) {
        map.set(key, { label, matches: [] })
      }
      map.get(key)!.matches.push(match)
    }
    return Array.from(map.entries()).map(([key, value]) => ({ key, ...value }))
  }, [matchesSorted])
  const selectedMatch = useMemo(() => {
    if (!selectedMatchId) return null
    return seasonMatches.find((match) => match.id === selectedMatchId) ?? null
  }, [selectedMatchId, seasonMatches])

  const selectedMatchTeams = useMemo(() => {
    if (!selectedMatch) return []
    const home = availableClubs.find((club) => club.id === selectedMatch.homeTeamId)
    const away = availableClubs.find((club) => club.id === selectedMatch.awayTeamId)
    return [home, away].filter(Boolean) as Club[]
  }, [availableClubs, selectedMatch])

  useEffect(() => {
    if (!lineupClubFilter) return
    const stillValid = selectedMatchTeams.some((team) => team.id === lineupClubFilter)
    if (!stillValid) {
      setLineupClubFilter('')
    }
  }, [lineupClubFilter, selectedMatchTeams])

  const matchLineupByClub = useMemo(() => {
    const map = new Map<number, MatchLineupEntry[]>()
    for (const entry of matchLineup) {
      if (!map.has(entry.clubId)) {
        map.set(entry.clubId, [])
      }
      map.get(entry.clubId)!.push(entry)
    }
    map.forEach((list) => {
      list.sort((a, b) => {
        if (a.role !== b.role) {
          return a.role === 'STARTER' ? -1 : 1
        }
        const last = a.person.lastName.localeCompare(b.person.lastName, 'ru')
        if (last !== 0) return last
        return a.person.firstName.localeCompare(b.person.firstName, 'ru')
      })
    })
    return map
  }, [matchLineup])

  const filteredMatchLineup = useMemo(() => {
    if (!lineupClubFilter) return []
    return matchLineupByClub.get(lineupClubFilter) ?? []
  }, [lineupClubFilter, matchLineupByClub])

  const matchPlayersPool = useMemo<EventPlayerOption[]>(() => {
    const options: EventPlayerOption[] = []
    matchLineupByClub.forEach((entries) => {
      entries.forEach((entry) => {
        options.push({
          personId: entry.personId,
          clubId: entry.clubId,
          person: entry.person,
          club: entry.club,
          source: 'lineup',
          shirtNumber: entry.shirtNumber
        })
      })
    })
    return options.sort((a, b) => {
      const last = a.person.lastName.localeCompare(b.person.lastName, 'ru')
      if (last !== 0) return last
      return a.person.firstName.localeCompare(b.person.firstName, 'ru')
    })
  }, [matchLineupByClub])

  const matchPlayersById = useMemo(() => {
    const map = new Map<number, EventPlayerOption>()
    for (const option of matchPlayersPool) {
      map.set(option.personId, option)
    }
    return map
  }, [matchPlayersPool])

  const eventPlayerOptions = useMemo(() => {
    if (!eventForm.teamId) return []
    return matchPlayersPool.filter((entry) => entry.clubId === eventForm.teamId)
  }, [eventForm.teamId, matchPlayersPool])

  const relatedEventPlayerOptions = useMemo(() => {
    if (!eventForm.playerId) return []
    const primary = matchPlayersById.get(eventForm.playerId)
    if (!primary) return []
    return matchPlayersPool.filter((entry) => entry.clubId === primary.clubId && entry.personId !== primary.personId)
  }, [eventForm.playerId, matchPlayersById, matchPlayersPool])

  useEffect(() => {
    setMatchUpdateForms((forms) => {
      let changed = false
      const next = { ...forms }
      for (const match of seasonMatches) {
        if (!next[match.id]) {
          next[match.id] = buildMatchUpdateForm(match)
          changed = true
        }
      }
      return changed ? next : forms
    })
  }, [seasonMatches])
  useEffect(() => {
    setEventForm((form) => {
      const available = new Set(matchPlayersPool.map((entry) => entry.personId))
      const updates: Partial<EventFormState> = {}
      if (form.playerId && !available.has(form.playerId)) {
        updates.playerId = ''
      }
      if (form.relatedPlayerId && !available.has(form.relatedPlayerId)) {
        updates.relatedPlayerId = ''
      }
      if (!Object.keys(updates).length) return form
      return { ...form, ...updates }
    })
  }, [matchPlayersPool])

  const hasUnfinishedMatches = seasonMatches.some((match) => match.status !== 'FINISHED')
  const playoffFormatEnabled = selectedSeason?.competition.seriesFormat === 'BEST_OF_N'
  const playoffsDisabledReason = useMemo(() => {
    if (!selectedSeasonId) return 'Выберите сезон, чтобы запускать плей-офф'
    if (!selectedSeason) return 'Сезон не найден'
    if (!playoffFormatEnabled) return 'Текущее соревнование не использует формат плей-офф'
    if (seasonSeries.length > 0) return 'Серии уже созданы для этого сезона'
    if (seasonParticipants.length < 2) return 'Недостаточно участников для плей-офф'
    if (seasonMatches.length === 0) return 'Нет матчей регулярного сезона'
    if (hasUnfinishedMatches) return 'Сначала завершите все матчи регулярного этапа'
    return null
  }, [
    hasUnfinishedMatches,
    playoffFormatEnabled,
    seasonMatches.length,
    seasonParticipants.length,
    seasonSeries.length,
    selectedSeason,
    selectedSeasonId
  ])

  const formattedMatchDate = selectedMatch
    ? new Date(selectedMatch.matchDateTime).toLocaleString('ru-RU', {
        day: '2-digit',
        month: 'long',
        hour: '2-digit',
        minute: '2-digit'
      })
    : ''
  const matchTeamsLabel = selectedMatchTeams.length
    ? selectedMatchTeams.map((team) => team.name).join(' vs ')
    : ''
  const selectedMatchForm = selectedMatch ? matchUpdateForms[selectedMatch.id] ?? buildMatchUpdateForm(selectedMatch) : null
  const selectedMatchStatus: MatchSummary['status'] =
    selectedMatchForm?.status ?? selectedMatch?.status ?? 'SCHEDULED'
  const isSelectedMatchLive = selectedMatchStatus === 'LIVE'
  const homeScoreForControls =
    typeof selectedMatchForm?.homeScore === 'number'
      ? selectedMatchForm.homeScore
      : typeof selectedMatch?.homeScore === 'number'
        ? selectedMatch.homeScore
        : 0
  const awayScoreForControls =
    typeof selectedMatchForm?.awayScore === 'number'
      ? selectedMatchForm.awayScore
      : typeof selectedMatch?.awayScore === 'number'
        ? selectedMatch.awayScore
        : 0
  const homeScoreInputValue: number | '' = selectedMatchForm
    ? selectedMatchForm.homeScore === ''
      ? ''
      : selectedMatchForm.homeScore
    : typeof selectedMatch?.homeScore === 'number'
      ? selectedMatch.homeScore
      : ''
  const awayScoreInputValue: number | '' = selectedMatchForm
    ? selectedMatchForm.awayScore === ''
      ? ''
      : selectedMatchForm.awayScore
    : typeof selectedMatch?.awayScore === 'number'
      ? selectedMatch.awayScore
      : ''

  return (
    <>
      <div className="tab-sections">
      <header className="tab-header">
        <div>
          <h3>Сезоны и расписание</h3>
          <p>Формируйте календарь, управляйте участниками и контролируйте ход матчей.</p>
        </div>
        <button className="button-ghost" type="button" onClick={() => fetchSeasons()} disabled={isLoading}>
          {isLoading ? 'Обновляем…' : 'Обновить сезоны'}
        </button>
      </header>
      {feedback ? <div className={`inline-feedback ${feedbackLevel}`}>{feedback}</div> : null}
      {error ? <div className="inline-feedback error">{error}</div> : null}

      <section className="card-grid">
        <article className="card automation-card">
          <header>
            <h4>Автоматизация сезона</h4>
            <p>
              Подготовьте сезон одним действием: выберите команды, дату старта и день недели — расписание и заявки сформируются автоматически.
            </p>
          </header>
          <form className="stacked" onSubmit={handleAutomationSubmit}>
            <label>
              Соревнование
              <select
                value={automationForm.competitionId || ''}
                onChange={(event) => {
                  const nextId = event.target.value ? Number(event.target.value) : ''
                  const nextFormat = nextId
                    ? data.competitions.find((competition) => competition.id === Number(nextId))?.seriesFormat ?? 'SINGLE_MATCH'
                    : 'SINGLE_MATCH'
                  setAutomationForm((form) => ({
                    ...form,
                    competitionId: nextId,
                    seriesFormat: nextFormat
                  }))
                }}
                required
              >
                <option value="">—</option>
                {data.competitions.map((competition) => (
                  <option key={competition.id} value={competition.id}>
                    {competition.name} ({seriesFormatNames[competition.seriesFormat]})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Название сезона
              <input
                value={automationForm.seasonName}
                onChange={(event) =>
                  setAutomationForm((form) => ({ ...form, seasonName: event.target.value }))
                }
                placeholder="Например: Осень 2025"
                required
              />
            </label>
            <div className="automation-grid">
              <label>
                Дата старта
                <input
                  type="date"
                  value={automationForm.startDate}
                  onChange={(event) =>
                    setAutomationForm((form) => ({ ...form, startDate: event.target.value }))
                  }
                  required
                />
              </label>
              <label>
                День недели
                <select
                  value={automationForm.matchDayOfWeek}
                  onChange={(event) =>
                    setAutomationForm((form) => ({ ...form, matchDayOfWeek: event.target.value }))
                  }
                  required
                >
                  {weekdayOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Время начала
                <input
                  type="time"
                  value={automationForm.matchTime}
                  onChange={(event) =>
                    setAutomationForm((form) => ({ ...form, matchTime: event.target.value }))
                  }
                />
              </label>
            </div>
            <div className="automation-format">
              <span className="automation-format-label">Формат серий</span>
              <span className="automation-format-value">
                {automationForm.competitionId ? automationSeriesLabels[automationForm.seriesFormat] : 'Выберите соревнование'}
              </span>
            </div>
            {automationForm.seriesFormat === 'BEST_OF_N' ? (
              <p className="muted">
                Групповой этап проходит в один круг. Порядок списка справа задаёт посев плей-офф: первая команда играет с
                последней, вторая — с предпоследней и т.д. Если участников нечётное число, верхняя по посеву команда
                автоматически проходит в следующий раунд.
              </p>
            ) : null}
            <label className="checkbox">
              <input
                type="checkbox"
                checked={automationForm.copyClubPlayersToRoster}
                onChange={(event) =>
                  setAutomationForm((form) => ({ ...form, copyClubPlayersToRoster: event.target.checked }))
                }
              />
              Перенести шаблонные составы клуба в сезонную заявку
            </label>
            <div className="club-selection">
              <div>
                <h5>Команды</h5>
                <p className="muted">Выберите участников (минимум 2).</p>
                <div className="club-selection-list">
                  {data.clubs.map((club) => (
                    <label key={club.id} className="checkbox club-checkbox">
                      <span>{club.name}</span>
                      <input
                        type="checkbox"
                        checked={automationForm.clubIds.includes(club.id)}
                        onChange={() => toggleAutomationClub(club.id)}
                      />
                    </label>
                  ))}
                </div>
              </div>
              <div className="selected-clubs">
                <h5>Посев и порядок матчей</h5>
                {automationForm.clubIds.length === 0 ? (
                  <p className="muted">Список пуст — отметьте команды слева.</p>
                ) : (
                  <ol>
                    {automationForm.clubIds.map((clubId, index) => {
                      const club = data.clubs.find((item) => item.id === clubId)
                      if (!club) return null
                      return (
                        <li key={clubId}>
                          <span>
                            №{index + 1}. {club.name}
                          </span>
                          <span className="reorder-buttons">
                            <button type="button" onClick={() => moveAutomationClub(clubId, -1)} disabled={index === 0}>
                              ▲
                            </button>
                            <button
                              type="button"
                              onClick={() => moveAutomationClub(clubId, 1)}
                              disabled={index === automationForm.clubIds.length - 1}
                            >
                              ▼
                            </button>
                          </span>
                        </li>
                      )
                    })}
                  </ol>
                )}
              </div>
            </div>
            <div className="form-actions">
              <button className="button-primary" type="submit" disabled={automationLoading}>
                {automationLoading ? 'Формируем…' : 'Создать сезон автоматически'}
              </button>
              <button
                className="button-secondary"
                type="button"
                onClick={() => setAutomationForm({ ...defaultAutomationForm, startDate: new Date().toISOString().slice(0, 10) })}
                disabled={automationLoading}
              >
                Очистить форму
              </button>
            </div>
          </form>
          {automationResult ? (
            <div className="automation-summary">
              <p>
                Сезон #{automationResult.seasonId}: команд — {automationResult.participantsCreated}, матчей — {automationResult.matchesCreated},
                заявок — {automationResult.rosterEntriesCreated}, серий — {automationResult.seriesCreated}.
              </p>
            </div>
          ) : null}
        </article>
        <article className="card">
          <header>
            <h4>Выбор сезона</h4>
            <p>Используйте селектор, чтобы работать с конкретным сезоном.</p>
          </header>
          <label className="stacked">
            Активный сезон
            <select
              value={selectedSeasonId ?? ''}
              onChange={(event) => setSelectedSeason(event.target.value ? Number(event.target.value) : undefined)}
            >
              <option value="">—</option>
              {data.seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.name} — {season.competition.name} ({competitionTypeLabels[season.competition.type]})
                </option>
              ))}
            </select>
          </label>
          {selectedSeason ? (
            <div className="season-details">
              <p>
                Соревнование: <strong>{selectedSeason.competition.name}</strong>
              </p>
              <p>
                Период: {selectedSeason.startDate.slice(0, 10)} — {selectedSeason.endDate.slice(0, 10)}
              </p>
            </div>
          ) : null}
        </article>
      </section>

      <section className="card-grid">
        <article className="card playoff-card">
          <header>
            <h4>Плей-офф после регулярки</h4>
            <p>Когда все матчи сыграны, сформируйте сетку автоматически с учётом посева.</p>
          </header>
          {!selectedSeason ? (
            <p className="muted">Выберите сезон, чтобы управлять плей-офф.</p>
          ) : !playoffFormatEnabled ? (
            <p className="muted">Соревнование «{selectedSeason.competition.name}» не предполагает серию до побед.</p>
          ) : (
            <div className="stacked">
              <label>
                Формат серий
                <select
                  value={playoffBestOf}
                  onChange={(event) => setPlayoffBestOf(Number(event.target.value))}
                  disabled={playoffLoading}
                >
                  {playoffBestOfOptions.map((option) => (
                    <option key={option} value={option}>
                      До {option === 3 ? 'двух' : option === 5 ? 'трёх' : 'четырёх'} побед (best-of-{option})
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="button-primary"
                type="button"
                onClick={handleCreatePlayoffs}
                disabled={playoffLoading || Boolean(playoffsDisabledReason)}
                title={playoffsDisabledReason ?? undefined}
              >
                {playoffLoading ? 'Создаём…' : 'Сгенерировать плей-офф'}
              </button>
              {playoffsDisabledReason ? (
                <p className="muted">{playoffsDisabledReason}</p>
              ) : (
                <p className="muted">
                  Серии создаются по посеву из списка участников сезонов. Каждая вторая игра проводится на площадке соперника.
                </p>
              )}
              {playoffResult ? (
                <div className="inline-feedback success">
                  Серий: {playoffResult.seriesCreated}, матчей: {playoffResult.matchesCreated}
                  {playoffResult.byeClubId
                    ? `, ${data.clubs.find((club) => club.id === playoffResult.byeClubId)?.name ?? `клуб #${playoffResult.byeClubId}`} проходит дальше`
                    : ''}
                </div>
              ) : null}
            </div>
          )}
        </article>
        <article className="card">
          <header>
            <h4>{editingSeriesId ? 'Редактирование серии' : 'Создать серию'}</h4>
            <p>Контролируйте стадии плей-офф и финальные серии.</p>
          </header>
          <form className="stacked" onSubmit={handleSeriesSubmit}>
            <label>
              Стадия
              <input value={seriesForm.stageName} onChange={(event) => setSeriesForm((form) => ({ ...form, stageName: event.target.value }))} required />
            </label>
            <label>
              Хозяева серии
              <select
                value={seriesForm.homeClubId}
                onChange={(event) => setSeriesForm((form) => ({ ...form, homeClubId: event.target.value ? Number(event.target.value) : '' }))}
                required
              >
                <option value="">—</option>
                {seasonParticipants.map((participant) => (
                  <option key={participant.clubId} value={participant.clubId}>
                    {participant.club.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Гости серии
              <select
                value={seriesForm.awayClubId}
                onChange={(event) => setSeriesForm((form) => ({ ...form, awayClubId: event.target.value ? Number(event.target.value) : '' }))}
                required
              >
                <option value="">—</option>
                {seasonParticipants.map((participant) => (
                  <option key={participant.clubId} value={participant.clubId}>
                    {participant.club.name}
                  </option>
                ))}
              </select>
            </label>
            {editingSeriesId ? (
              <>
                <label>
                  Статус
                  <select value={seriesStatusUpdate} onChange={(event) => setSeriesStatusUpdate(event.target.value as MatchSeries['seriesStatus'])}>
                    {seriesStatuses.map((status) => (
                      <option key={status} value={status}>
                        {seriesStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Победитель
                  <select value={seriesWinnerId} onChange={(event) => setSeriesWinnerId(event.target.value ? Number(event.target.value) : '')}>
                    <option value="">—</option>
                    {seasonParticipants.map((participant) => (
                      <option key={participant.clubId} value={participant.clubId}>
                        {participant.club.name}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            ) : null}
            <div className="form-actions">
              <button className="button-primary" type="submit" disabled={!selectedSeasonId}>
                {editingSeriesId ? 'Сохранить серию' : 'Создать серию'}
              </button>
              {editingSeriesId ? (
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => {
                    setEditingSeriesId(null)
                    setSeriesForm(defaultSeriesForm)
                    setSeriesWinnerId('')
                    setSeriesStatusUpdate('IN_PROGRESS')
                  }}
                >
                  Отмена
                </button>
              ) : null}
            </div>
          </form>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Стадия</th>
                  <th>Хозяева</th>
                  <th>Гости</th>
                  <th>Статус</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {seasonSeries.map((series) => (
                  <tr key={series.id}>
                    <td>{series.stageName}</td>
                    <td>{availableClubs.find((club) => club.id === series.homeClubId)?.name ?? series.homeClubId}</td>
                    <td>{availableClubs.find((club) => club.id === series.awayClubId)?.name ?? series.awayClubId}</td>
                    <td>
                      {seriesStatusLabels[series.seriesStatus]}
                      {series.winnerClubId ? ` → ${availableClubs.find((club) => club.id === series.winnerClubId)?.name}` : ''}
                    </td>
                    <td className="table-actions">
                      <button type="button" onClick={() => handleSeriesEdit(series)}>
                        Изм.
                      </button>
                      <button type="button" className="danger" onClick={() => handleSeriesDelete(series)}>
                        Удал.
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="card">
          <header>
            <h4>Создать матч</h4>
            <p>Добавьте товарищескую игру — она не попадёт в статистику сезона и карьеры.</p>
          </header>
          <form className="stacked" onSubmit={handleMatchSubmit}>
            <label>
              Дата и время
              <input
                type="datetime-local"
                value={matchForm.matchDateTime}
                onChange={(event) => setMatchForm((form) => ({ ...form, matchDateTime: event.target.value }))}
                required
              />
            </label>
            <label>
              Хозяева
              <input
                type="text"
                value={matchForm.homeTeamName}
                onChange={(event) => setMatchForm((form) => ({ ...form, homeTeamName: event.target.value }))}
                placeholder="Например: ФК Обнинск"
                required
              />
            </label>
            <label>
              Гости
              <input
                type="text"
                value={matchForm.awayTeamName}
                onChange={(event) => setMatchForm((form) => ({ ...form, awayTeamName: event.target.value }))}
                placeholder="Например: ФК Звезда"
                required
              />
            </label>
            <label>
              Стадион
              <select
                value={matchForm.stadiumId}
                onChange={(event) => setMatchForm((form) => ({ ...form, stadiumId: event.target.value ? Number(event.target.value) : '' }))}
              >
                <option value="">—</option>
                {data.stadiums.map((stadium) => (
                  <option key={stadium.id} value={stadium.id}>
                    {stadium.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Судья
              <select
                value={matchForm.refereeId}
                onChange={(event) => setMatchForm((form) => ({ ...form, refereeId: event.target.value ? Number(event.target.value) : '' }))}
              >
                <option value="">—</option>
                {data.persons
                  .filter((person) => !person.isPlayer)
                  .map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.lastName} {person.firstName}
                    </option>
                  ))}
              </select>
            </label>
            <label>
                Наименование события
                <input
                  type="text"
                  value={matchForm.eventName}
                  onChange={(event) => setMatchForm((form) => ({ ...form, eventName: event.target.value }))}
                  placeholder="Например: Кубок открытия сезона"
                />
            </label>
              <button className="button-primary" type="submit">
              Создать матч
            </button>
          </form>
        </article>

        <article className="card" style={{ gridColumn: '1 / -1' }}>
          <header>
            <h4>Матчи сезона</h4>
            <p>Выберите матч для редактирования счёта, статуса и составов.</p>
          </header>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Матч</th>
                  <th>Счёт</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {matchesGrouped.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-row">
                      Матчи не найдены. Создайте игру или обновите фильтр сезона.
                    </td>
                  </tr>
                ) : (
                  matchesGrouped.map((group) => (
                    <React.Fragment key={group.key}>
                      <tr className="round-row">
                        <td colSpan={4}>{group.label}</td>
                      </tr>
                      {group.matches.map((match) => {
                        const home = availableClubs.find((club) => club.id === match.homeTeamId)
                        const away = availableClubs.find((club) => club.id === match.awayTeamId)
                        const form = matchUpdateForms[match.id] ?? buildMatchUpdateForm(match)
                        const resolvedHomeScore =
                          form.homeScore === '' || typeof form.homeScore !== 'number'
                            ? match.homeScore
                            : form.homeScore
                        const resolvedAwayScore =
                          form.awayScore === '' || typeof form.awayScore !== 'number'
                            ? match.awayScore
                            : form.awayScore
                        const homeScoreDisplay =
                          typeof resolvedHomeScore === 'number' ? resolvedHomeScore : '—'
                        const awayScoreDisplay =
                          typeof resolvedAwayScore === 'number' ? resolvedAwayScore : '—'
                        return (
                          <tr key={match.id} className={selectedMatchId === match.id ? 'active-row' : undefined}>
                            <td>{new Date(match.matchDateTime).toLocaleString('ru-RU')}</td>
                            <td>
                              <div className="match-cell">
                                <span>
                                  {home?.name ?? match.homeTeamId} vs {away?.name ?? match.awayTeamId}
                                </span>
                                <span className={`status-badge status-${form.status.toLowerCase()}`}>
                                  {matchStatusLabels[form.status]}
                                </span>
                              </div>
                            </td>
                            <td>
                              <div className="score-display">
                                <span>{homeScoreDisplay}</span>
                                <span className="score-separator">:</span>
                                <span>{awayScoreDisplay}</span>
                              </div>
                            </td>
                            <td className="table-actions">
                              <button type="button" onClick={() => handleMatchSelect(match)}>
                                Детали
                              </button>
                              <button type="button" className="danger" onClick={() => handleMatchDelete(match)}>
                                Удал.
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </React.Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </article>
        <article className="card" style={{ gridColumn: '1 / -1' }}>
          <header
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap' }}
          >
            <div>
              <h4>Товарищеские матчи</h4>
              <p>Игры вне сезона для гибких экспериментов и подготовки.</p>
            </div>
            <button
              type="button"
              className="button-ghost"
              onClick={() => void fetchFriendlyMatches()}
              disabled={Boolean(loading.friendlyMatches)}
            >
              {loading.friendlyMatches ? 'Обновляем…' : 'Обновить'}
            </button>
          </header>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Дата</th>
                  <th>Матч</th>
                  <th>Детали</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {friendlyMatchesSorted.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="empty-row">
                      Пока нет товарищеских встреч. Создайте первую игру выше.
                    </td>
                  </tr>
                ) : (
                  friendlyMatchesSorted.map((match) => {
                    const matchDate = new Date(match.matchDateTime).toLocaleString('ru-RU', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })
                    const stadiumName =
                      match.stadium?.name ??
                      (match.stadiumId ? data.stadiums.find((stadium) => stadium.id === match.stadiumId)?.name : undefined)
                    const refereePerson =
                      match.referee ??
                      (match.refereeId ? data.persons.find((person) => person.id === match.refereeId) : undefined)
                    const refereeName = refereePerson
                      ? `${refereePerson.lastName} ${refereePerson.firstName}`.trim()
                      : undefined
                    return (
                      <tr key={match.id}>
                        <td>{matchDate}</td>
                        <td>
                          <div className="match-cell">
                            <span>
                              {match.homeTeamName} vs {match.awayTeamName}
                            </span>
                            {match.eventName ? <span className="muted">{match.eventName}</span> : null}
                          </div>
                        </td>
                        <td>
                          {stadiumName || refereeName ? (
                            <div className="muted">
                              {stadiumName ? <div>Стадион: {stadiumName}</div> : null}
                              {refereeName ? <div>Судья: {refereeName}</div> : null}
                            </div>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td className="table-actions">
                          <button type="button" className="danger" onClick={() => handleFriendlyMatchDelete(match.id)}>
                            Удал.
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </article>
      </section>
      </div>
      {isMatchModalOpen && selectedMatchId && selectedMatch ? (
        <div className="modal-overlay" role="dialog" aria-modal="true">
          <div
            className="modal-card match-modal"
            tabIndex={-1}
            ref={matchModalRef}
            aria-label={`Подтверждение состава: ${matchTeamsLabel}`}
          >
            <header className="modal-header">
              <div>
                <h5>Детали матча</h5>
                <p>
                  {formattedMatchDate}
                  {matchTeamsLabel ? ` · ${matchTeamsLabel}` : ''}
                </p>
              </div>
              <button type="button" className="button-ghost" onClick={closeMatchModal}>
                Закрыть
              </button>
            </header>
            <div className="modal-body">
              <form
                className="stacked"
                onSubmit={(event) => {
                  event.preventDefault()
                  if (selectedMatch && selectedMatchForm) {
                    void handleMatchUpdate(selectedMatch, selectedMatchForm)
                  }
                }}
              >
                <h6>Параметры матча</h6>
                <label>
                  Статус
                  <select
                    value={selectedMatchStatus}
                    onChange={(event) => {
                      if (selectedMatch) {
                        setMatchStatus(selectedMatch, event.target.value as MatchSummary['status'])
                      }
                    }}
                  >
                    {matchStatuses.map((status) => (
                      <option key={status} value={status}>
                        {matchStatusLabels[status]}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Дата и время
                  <input
                    type="datetime-local"
                    value={selectedMatchForm?.matchDateTime ?? ''}
                    onChange={(event) => {
                      if (!selectedMatch) return
                      setMatchDateTime(selectedMatch, event.target.value)
                    }}
                  />
                </label>

                <label className="stacked">
                  Счёт
                  <div className="score-editor">
                    <div className={`score-control${isSelectedMatchLive ? ' live' : ''}`}>
                      {isSelectedMatchLive && selectedMatch ? (
                        <button
                          type="button"
                          className="score-button"
                          onClick={() => adjustMatchScore(selectedMatch, 'homeScore', -1)}
                          disabled={homeScoreForControls <= 0}
                          aria-label="Уменьшить счёт хозяев"
                        >
                          −
                        </button>
                      ) : null}
                      <input
                        type="number"
                        value={homeScoreInputValue}
                        onChange={(event) => {
                          if (!selectedMatch) return
                          const raw = event.target.value
                          if (raw === '') {
                            setMatchScore(selectedMatch, 'homeScore', '')
                          } else {
                            const numeric = Number(raw)
                            if (!Number.isNaN(numeric)) {
                              setMatchScore(selectedMatch, 'homeScore', numeric)
                            }
                          }
                        }}
                        className="score-input"
                        min={0}
                        aria-label="Счёт хозяев"
                      />
                      {isSelectedMatchLive && selectedMatch ? (
                        <button
                          type="button"
                          className="score-button"
                          onClick={() => adjustMatchScore(selectedMatch, 'homeScore', 1)}
                          aria-label="Увеличить счёт хозяев"
                        >
                          +
                        </button>
                      ) : null}
                    </div>
                    <span className="score-separator">:</span>
                    <div className={`score-control${isSelectedMatchLive ? ' live' : ''}`}>
                      {isSelectedMatchLive && selectedMatch ? (
                        <button
                          type="button"
                          className="score-button"
                          onClick={() => adjustMatchScore(selectedMatch, 'awayScore', -1)}
                          disabled={awayScoreForControls <= 0}
                          aria-label="Уменьшить счёт гостей"
                        >
                          −
                        </button>
                      ) : null}
                      <input
                        type="number"
                        value={awayScoreInputValue}
                        onChange={(event) => {
                          if (!selectedMatch) return
                          const raw = event.target.value
                          if (raw === '') {
                            setMatchScore(selectedMatch, 'awayScore', '')
                          } else {
                            const numeric = Number(raw)
                            if (!Number.isNaN(numeric)) {
                              setMatchScore(selectedMatch, 'awayScore', numeric)
                            }
                          }
                        }}
                        className="score-input"
                        min={0}
                        aria-label="Счёт гостей"
                      />
                      {isSelectedMatchLive && selectedMatch ? (
                        <button
                          type="button"
                          className="score-button"
                          onClick={() => adjustMatchScore(selectedMatch, 'awayScore', 1)}
                          aria-label="Увеличить счёт гостей"
                        >
                          +
                        </button>
                      ) : null}
                    </div>
                  </div>
                </label>

                <button className="button-secondary" type="submit">
                  Сохранить изменения
                </button>
              </form>

              <div className="split-columns">
                <div>
                  <h6>Состав</h6>
                  <label className="stacked">
                    Команда
                    <select
                      value={lineupClubFilter}
                      onChange={(event) => setLineupClubFilter(event.target.value ? Number(event.target.value) : '')}
                      disabled={!selectedMatch || selectedMatchTeams.length === 0}
                    >
                      <option value="">
                        {selectedMatch ? (selectedMatchTeams.length ? 'Выберите команду' : 'Клубы не найдены') : 'Выберите матч'}
                      </option>
                      {selectedMatchTeams.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!lineupClubFilter ? (
                    <p className="muted">Сначала выберите команду, чтобы увидеть подтверждённый состав.</p>
                  ) : filteredMatchLineup.length === 0 ? (
                    <p className="muted">Для выбранной команды пока нет подтверждённой заявки.</p>
                  ) : (
                    <ul className="list">
                      {filteredMatchLineup.map((entry) => (
                        <li key={`${entry.matchId}-${entry.personId}`}>
                          <span>
                            №{entry.shirtNumber || '?'} {entry.person.lastName} {entry.person.firstName}
                          </span>
                          <span className="list-actions">
                            <button type="button" className="danger" onClick={() => handleLineupRemove(entry)}>
                              Удал.
                            </button>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <h6>События</h6>
                  <form className="stacked" onSubmit={handleEventSubmit}>
                    <label>
                      Команда
                      <select
                        value={eventForm.teamId}
                        onChange={(event) =>
                          setEventForm((form) => ({
                            ...form,
                            teamId: event.target.value ? Number(event.target.value) : '',
                            playerId: '',
                            relatedPlayerId: ''
                          }))
                        }
                        required
                        disabled={!selectedMatch}
                      >
                        <option value="">{selectedMatch ? 'Выберите команду' : 'Выберите матч'}</option>
                        {selectedMatchTeams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Игрок
                      <select
                        value={eventForm.playerId}
                        onChange={(event) =>
                          setEventForm((form) => ({
                            ...form,
                            playerId: event.target.value ? Number(event.target.value) : '',
                            relatedPlayerId: ''
                          }))
                        }
                        required
                        disabled={!selectedMatch || !eventForm.teamId || eventPlayerOptions.length === 0}
                      >
                        <option value="">
                          {selectedMatch
                            ? eventForm.teamId
                              ? eventPlayerOptions.length === 0
                                ? 'Нет игроков в заявке'
                                : 'Выберите игрока'
                              : 'Сначала выберите команду'
                            : 'Выберите матч'}
                        </option>
                        {eventPlayerOptions.map((entry) => (
                          <option key={entry.personId} value={entry.personId}>
                            №{entry.shirtNumber || '?'} {entry.person.lastName} {entry.person.firstName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="grid-two">
                      <label>
                        Минута
                        <input
                          type="number"
                          value={eventForm.minute}
                          onChange={(event) => setEventForm((form) => ({ ...form, minute: event.target.value ? Number(event.target.value) : '' }))}
                          min={0}
                          required
                        />
                      </label>
                      <label>
                        Тип события
                        <select
                          value={eventForm.eventType}
                          onChange={(event) => setEventForm((form) => ({ ...form, eventType: event.target.value as EventFormState['eventType'] }))}
                        >
                          {eventTypes.map((type) => (
                            <option key={type} value={type}>
                              {eventTypeLabels[type]}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <label>
                      Второй игрок (опционально)
                      <select
                        value={eventForm.relatedPlayerId}
                        onChange={(event) => setEventForm((form) => ({ ...form, relatedPlayerId: event.target.value ? Number(event.target.value) : '' }))}
                        disabled={!selectedMatch || !eventForm.playerId || relatedEventPlayerOptions.length === 0}
                      >
                        <option value="">
                          {selectedMatch
                            ? eventForm.playerId
                              ? relatedEventPlayerOptions.length === 0
                                ? 'Нет второго игрока'
                                : 'Выберите игрока'
                              : 'Сначала выберите основного игрока'
                            : 'Выберите матч'}
                        </option>
                        {relatedEventPlayerOptions.map((entry) => (
                          <option key={entry.personId} value={entry.personId}>
                            №{entry.shirtNumber || '?'} {entry.person.lastName} {entry.person.firstName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button className="button-secondary" type="submit">
                      Добавить событие
                    </button>
                  </form>
                  <ul className="list">
                    {matchEvents.map((entry) => (
                      <li key={entry.id}>
                        <span>
                          {entry.minute}' {eventTypeLabels[entry.eventType]} — №{entry.player.shirtNumber || '?'} {entry.player.lastName} {entry.player.firstName}
                          {entry.relatedPerson ? ` · ассист: №${entry.relatedPerson.shirtNumber || '?'} ${entry.relatedPerson.lastName} ${entry.relatedPerson.firstName}` : ''}
                        </span>
                        <span className="list-actions">
                          <button type="button" className="danger" onClick={() => handleEventDelete(entry)}>
                            Удал.
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
