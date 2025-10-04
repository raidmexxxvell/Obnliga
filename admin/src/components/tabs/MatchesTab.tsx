import { FormEvent, useEffect, useMemo, useRef, useState } from 'react'
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
  MatchEventEntry,
  MatchLineupEntry,
  MatchSeries,
  MatchSummary,
  Person,
  Season,
  SeasonAutomationResult,
  PlayoffCreationResult,
  SeasonParticipant,
  SeasonRosterEntry
} from '../../types'

type FeedbackLevel = 'success' | 'error' | 'info'

type SeasonFormState = {
  competitionId: number
  name: string
  startDate: string
  endDate: string
}

type ParticipantFormState = {
  clubId: number | ''
}

type RosterFormState = {
  clubId: number | ''
  personId: number | ''
  shirtNumber: number | ''
}

type SeriesFormState = {
  stageName: string
  homeClubId: number | ''
  awayClubId: number | ''
}

type MatchFormState = {
  matchDateTime: string
  homeTeamId: number | ''
  awayTeamId: number | ''
  stadiumId: number | ''
  refereeId: number | ''
  seriesId: string | ''
  seriesMatchNumber: number | ''
}

type MatchUpdateFormState = {
  homeScore: number | ''
  awayScore: number | ''
  status: MatchSummary['status']
  stadiumId: number | ''
  refereeId: number | ''
  matchDateTime: string
}

type LineupFormState = {
  clubId: number | ''
  personId: number | ''
  role: 'STARTER' | 'SUBSTITUTE'
  position: string
}

type EventFormState = {
  teamId: number | ''
  playerId: number | ''
  minute: number | ''
  eventType: 'GOAL' | 'YELLOW_CARD' | 'RED_CARD' | 'SUB_IN' | 'SUB_OUT'
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

const matchStatuses: MatchSummary['status'][] = ['SCHEDULED', 'LIVE', 'FINISHED', 'POSTPONED']
const seriesStatuses: MatchSeries['seriesStatus'][] = ['IN_PROGRESS', 'FINISHED']
const lineupRoles: Array<LineupFormState['role']> = ['STARTER', 'SUBSTITUTE']
const lineupRoleLabels: Record<LineupFormState['role'], string> = {
  STARTER: 'В основе',
  SUBSTITUTE: 'Запасной'
}

const eventTypes: Array<EventFormState['eventType']> = ['GOAL', 'YELLOW_CARD', 'RED_CARD', 'SUB_IN', 'SUB_OUT']
const eventTypeLabels: Record<EventFormState['eventType'], string> = {
  GOAL: 'Гол',
  YELLOW_CARD: 'Жёлтая карточка',
  RED_CARD: 'Красная карточка',
  SUB_IN: 'Замена (вышел)',
  SUB_OUT: 'Замена (ушёл)'
}

const playoffBestOfOptions = [3, 5, 7]

const defaultSeasonForm: SeasonFormState = {
  competitionId: 0,
  name: '',
  startDate: '',
  endDate: ''
}

const defaultParticipantForm: ParticipantFormState = {
  clubId: ''
}

const defaultRosterForm: RosterFormState = {
  clubId: '',
  personId: '',
  shirtNumber: ''
}

const defaultSeriesForm: SeriesFormState = {
  stageName: '',
  homeClubId: '',
  awayClubId: ''
}

const defaultMatchForm: MatchFormState = {
  matchDateTime: '',
  homeTeamId: '',
  awayTeamId: '',
  stadiumId: '',
  refereeId: '',
  seriesId: '',
  seriesMatchNumber: ''
}

const defaultLineupForm: LineupFormState = {
  clubId: '',
  personId: '',
  role: 'STARTER',
  position: ''
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

const automationSeriesFormatOptions: SeasonAutomationFormState['seriesFormat'][] = ['SINGLE_MATCH', 'TWO_LEGGED', 'BEST_OF_N']

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

export const MatchesTab = () => {
  const {
    token,
    data,
    selectedSeasonId,
    setSelectedSeason,
    fetchSeasons,
    fetchSeries,
    fetchMatches,
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
    fetchDictionaries: state.fetchDictionaries,
    loading: state.loading,
    error: state.error
  }))

  const [feedback, setFeedback] = useState<string | null>(null)
  const [feedbackLevel, setFeedbackLevel] = useState<FeedbackLevel>('info')

  const [seasonForm, setSeasonForm] = useState<SeasonFormState>(defaultSeasonForm)
  const [editingSeasonId, setEditingSeasonId] = useState<number | null>(null)

  const [participantForm, setParticipantForm] = useState<ParticipantFormState>(defaultParticipantForm)
  const [rosterForm, setRosterForm] = useState<RosterFormState>(defaultRosterForm)
  const [rosterClubFilter, setRosterClubFilter] = useState<number | ''>('')

  const [seriesForm, setSeriesForm] = useState<SeriesFormState>(defaultSeriesForm)
  const [editingSeriesId, setEditingSeriesId] = useState<string | null>(null)
  const [seriesStatusUpdate, setSeriesStatusUpdate] = useState<MatchSeries['seriesStatus']>('IN_PROGRESS')
  const [seriesWinnerId, setSeriesWinnerId] = useState<number | ''>('')

  const [matchForm, setMatchForm] = useState<MatchFormState>(defaultMatchForm)
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null)
  const [isMatchModalOpen, setMatchModalOpen] = useState(false)
  const [matchUpdateForms, setMatchUpdateForms] = useState<Record<string, MatchUpdateFormState>>({})
  const matchModalRef = useRef<HTMLDivElement | null>(null)

  const [lineupForm, setLineupForm] = useState<LineupFormState>(defaultLineupForm)
  const [eventForm, setEventForm] = useState<EventFormState>(defaultEventForm)

  const [matchLineup, setMatchLineup] = useState<MatchLineupEntry[]>([])
  const [matchEvents, setMatchEvents] = useState<MatchEventEntry[]>([])

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

  const rosterEntries = useMemo<SeasonRosterEntry[]>(() => {
    const entries = selectedSeason?.rosters ?? []
    if (!rosterClubFilter) return entries
    return entries.filter((entry) => entry.clubId === rosterClubFilter)
  }, [selectedSeason, rosterClubFilter])

  const participantClubIds = useMemo(() => new Set(seasonParticipants.map((entry) => entry.clubId)), [seasonParticipants])

  // Одноразовая инициализация словарей и сезонов
  const bootRef = useRef(false)
  useEffect(() => {
    if (!token || bootRef.current) return
    bootRef.current = true
    void fetchDictionaries().catch(() => undefined)
    void fetchSeasons().catch(() => undefined)
  }, [token, fetchDictionaries, fetchSeasons])

  useEffect(() => {
    if (!selectedSeasonId || !token) return
    void fetchSeries(selectedSeasonId).catch(() => undefined)
    void fetchMatches(selectedSeasonId).catch(() => undefined)
  }, [selectedSeasonId, token, fetchSeries, fetchMatches])

  useEffect(() => {
    if (selectedSeason && data.clubs.length && !rosterClubFilter) {
      const firstClub = selectedSeason.participants[0]?.clubId
      if (firstClub) setRosterClubFilter(firstClub)
    }
  }, [selectedSeason, data.clubs.length, rosterClubFilter])

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

  const handleSeasonSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!seasonForm.competitionId || !seasonForm.name || !seasonForm.startDate || !seasonForm.endDate) {
      handleFeedback('Все поля сезона обязательны', 'error')
      return
    }
    await runWithMessages(async () => {
      const payload = {
        competitionId: seasonForm.competitionId,
        name: seasonForm.name.trim(),
        startDate: seasonForm.startDate,
        endDate: seasonForm.endDate
      }
      if (editingSeasonId) {
        await adminPut(token, `/api/admin/seasons/${editingSeasonId}`, payload)
      } else {
        await adminPost(token, '/api/admin/seasons', payload)
      }
      await fetchSeasons()
    }, 'Сезон сохранён')
    setSeasonForm(defaultSeasonForm)
    setEditingSeasonId(null)
  }

  const handleSeasonEdit = (season: Season) => {
    setEditingSeasonId(season.id)
    setSeasonForm({
      competitionId: season.competitionId,
      name: season.name,
      startDate: season.startDate.slice(0, 10),
      endDate: season.endDate.slice(0, 10)
    })
  }

  const handleParticipantAdd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const seasonId = ensureSeasonSelected()
    if (!seasonId || !participantForm.clubId) return
    await runWithMessages(async () => {
      await adminPost(token, `/api/admin/seasons/${seasonId}/participants`, {
        clubId: participantForm.clubId
      })
      await fetchSeasons()
      await fetchSeries(seasonId)
      await fetchMatches(seasonId)
    }, 'Команда добавлена в сезон')
    setParticipantForm(defaultParticipantForm)
  }

  const handleParticipantRemove = async (club: Club) => {
    const seasonId = ensureSeasonSelected()
    if (!seasonId) return
    await runWithMessages(async () => {
      await adminDelete(token, `/api/admin/seasons/${seasonId}/participants/${club.id}`)
      await fetchSeasons()
      await fetchSeries(seasonId)
      await fetchMatches(seasonId)
    }, `Клуб «${club.name}» исключён из сезона`)
  }

  const handleRosterSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const seasonId = ensureSeasonSelected()
    if (!seasonId || !rosterForm.clubId || !rosterForm.personId || !rosterForm.shirtNumber) {
      handleFeedback('Для заявки заполните клуб, игрока и номер', 'error')
      return
    }
    await runWithMessages(async () => {
      await adminPost(token, `/api/admin/seasons/${seasonId}/roster`, {
        clubId: rosterForm.clubId,
        personId: rosterForm.personId,
        shirtNumber: rosterForm.shirtNumber,
        registrationDate: new Date().toISOString()
      })
      await fetchSeasons()
    }, 'Игрок заявлен на сезон')
    setRosterForm(defaultRosterForm)
  }

  const handleRosterRemove = async (entry: SeasonRosterEntry) => {
    const seasonId = ensureSeasonSelected()
    if (!seasonId) return
    await runWithMessages(async () => {
      await adminDelete(token, `/api/admin/seasons/${seasonId}/roster/${entry.personId}?clubId=${entry.clubId}`)
      await fetchSeasons()
    }, `${entry.person.lastName} ${entry.person.firstName} исключён из заявки`)
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
    const seasonId = ensureSeasonSelected()
    if (!seasonId || !matchForm.matchDateTime || !matchForm.homeTeamId || !matchForm.awayTeamId) {
      handleFeedback('Дата и команды обязательны', 'error')
      return
    }
    await runWithMessages(async () => {
      await adminPost(token, '/api/admin/matches', {
        seasonId,
        matchDateTime: new Date(matchForm.matchDateTime).toISOString(),
        homeTeamId: matchForm.homeTeamId,
        awayTeamId: matchForm.awayTeamId,
        stadiumId: matchForm.stadiumId || undefined,
        refereeId: matchForm.refereeId || undefined,
        seriesId: matchForm.seriesId || undefined,
        seriesMatchNumber: matchForm.seriesMatchNumber || undefined
      })
      await fetchMatches(seasonId)
    }, 'Матч создан')
    setMatchForm(defaultMatchForm)
  }

  const handleMatchSelect = (match: MatchSummary) => {
    setSelectedMatchId(match.id)
    setMatchModalOpen(true)
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

  useEffect(() => {
    setLineupForm(defaultLineupForm)
    setEventForm(defaultEventForm)
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

  const handleLineupSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!selectedMatchId || !lineupForm.clubId || !lineupForm.personId) {
      handleFeedback('Выберите клуб и игрока для заявки на матч', 'error')
      return
    }
    await runWithMessages(async () => {
      await adminPut(token, `/api/admin/matches/${selectedMatchId}/lineup`, {
        clubId: lineupForm.clubId,
        personId: lineupForm.personId,
        role: lineupForm.role,
        position: lineupForm.position || undefined
      })
      await loadMatchDetails(selectedMatchId)
    }, 'Состав обновлён')
    setLineupForm(defaultLineupForm)
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
  const playerDirectory = useMemo(() => data.persons.filter((person) => person.isPlayer), [data.persons])
  const seasonSeries = data.series.filter((series) => series.seasonId === selectedSeasonId)
  const seasonMatches = data.matches.filter((match) => match.seasonId === selectedSeasonId)
  const seasonRosterEntries = selectedSeason?.rosters ?? []

  const rosterByClub = useMemo(() => {
    const map = new Map<number, SeasonRosterEntry[]>()
    for (const entry of seasonRosterEntries) {
      const list = map.get(entry.clubId) ?? []
      list.push(entry)
      map.set(entry.clubId, list)
    }
    return map
  }, [seasonRosterEntries])

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

  const matchPlayersPool = useMemo<EventPlayerOption[]>(() => {
    if (!selectedMatch) return []
    const pool = new Map<number, EventPlayerOption>()

    const pushOption = (personId: number, clubId: number, person: Person, club: Club, source: EventPlayerOption['source']) => {
      if (!pool.has(personId)) {
        pool.set(personId, { personId, clubId, person, club, source })
      }
    }

    for (const entry of matchLineup) {
      pushOption(entry.personId, entry.clubId, entry.person, entry.club, 'lineup')
    }

    selectedMatchTeams.forEach((club) => {
      const roster = rosterByClub.get(club.id) ?? []
      roster.forEach((entry) => {
        pushOption(entry.personId, entry.clubId, entry.person, entry.club, 'roster')
      })
    })

    return Array.from(pool.values()).sort((a, b) => {
      const last = a.person.lastName.localeCompare(b.person.lastName, 'ru')
      if (last !== 0) return last
      return a.person.firstName.localeCompare(b.person.firstName, 'ru')
    })
  }, [matchLineup, rosterByClub, selectedMatch, selectedMatchTeams])

  const eventPlayerOptions = useMemo(() => {
    if (!eventForm.teamId) return matchPlayersPool
    return matchPlayersPool.filter((entry) => entry.clubId === eventForm.teamId)
  }, [eventForm.teamId, matchPlayersPool])
  const currentClubRoster = useMemo(() => {
    if (!lineupForm.clubId) return []
    return rosterByClub.get(lineupForm.clubId) ?? []
  }, [lineupForm.clubId, rosterByClub])

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
    setLineupForm((form) => {
      if (!form.clubId) return form
      const roster = rosterByClub.get(form.clubId) ?? []
      if (form.personId && !roster.some((entry) => entry.personId === form.personId)) {
        return { ...form, personId: '' }
      }
      return form
    })
  }, [rosterByClub])

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
    ? selectedMatchTeams.map((team) => team.shortName).join(' vs ')
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
            <label>
              Формат серий
              <select
                value={automationForm.seriesFormat}
                onChange={(event) =>
                  setAutomationForm((form) => ({
                    ...form,
                    seriesFormat: event.target.value as SeasonAutomationFormState['seriesFormat']
                  }))
                }
              >
                {automationSeriesFormatOptions.map((option) => (
                  <option key={option} value={option}>
                    {automationSeriesLabels[option]}
                  </option>
                ))}
              </select>
            </label>
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
                    <label key={club.id} className="checkbox">
                      <input
                        type="checkbox"
                        checked={automationForm.clubIds.includes(club.id)}
                        onChange={() => toggleAutomationClub(club.id)}
                      />
                      {club.name}
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
              <button className="button-secondary" type="button" onClick={() => handleSeasonEdit(selectedSeason)}>
                Редактировать сезон
              </button>
            </div>
          ) : null}
        </article>

        <article className="card">
          <header>
            <h4>{editingSeasonId ? 'Редактирование сезона' : 'Создать сезон'}</h4>
            <p>Дата закрывается автоматически после завершения матчей.</p>
          </header>
          <form className="stacked" onSubmit={handleSeasonSubmit}>
            <label>
              Соревнование
              <select
                value={seasonForm.competitionId || ''}
                onChange={(event) =>
                  setSeasonForm((form) => ({ ...form, competitionId: Number(event.target.value) }))
                }
                required
              >
                <option value="">—</option>
                {data.competitions.map((competition) => (
                  <option key={competition.id} value={competition.id}>
                    {competition.name} ({competitionTypeLabels[competition.type]})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Название
              <input value={seasonForm.name} onChange={(event) => setSeasonForm((form) => ({ ...form, name: event.target.value }))} required />
            </label>
            <label>
              Старт
              <input type="date" value={seasonForm.startDate} onChange={(event) => setSeasonForm((form) => ({ ...form, startDate: event.target.value }))} required />
            </label>
            <label>
              Завершение
              <input type="date" value={seasonForm.endDate} onChange={(event) => setSeasonForm((form) => ({ ...form, endDate: event.target.value }))} required />
            </label>
            <div className="form-actions">
              <button className="button-primary" type="submit" disabled={isLoading}>
                {editingSeasonId ? 'Сохранить сезон' : 'Создать сезон'}
              </button>
              {editingSeasonId ? (
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => {
                    setEditingSeasonId(null)
                    setSeasonForm(defaultSeasonForm)
                  }}
                >
                  Отмена
                </button>
              ) : null}
            </div>
          </form>
        </article>

        <article className="card">
          <header>
            <h4>Участники сезона</h4>
            <p>Добавляйте или удаляйте команды из текущего сезона.</p>
          </header>
          <form className="stacked" onSubmit={handleParticipantAdd}>
            <label>
              Команда
              <select
                value={participantForm.clubId}
                onChange={(event) =>
                  setParticipantForm({ clubId: event.target.value ? Number(event.target.value) : '' })
                }
                required
              >
                <option value="">—</option>
                {availableClubs
                  .filter((club) => !participantClubIds.has(club.id))
                  .map((club) => (
                    <option key={club.id} value={club.id}>
                      {club.name}
                    </option>
                  ))}
              </select>
            </label>
            <button className="button-primary" type="submit" disabled={isLoading || !selectedSeasonId}>
              Добавить участника
            </button>
          </form>
          <ul className="list">
            {seasonParticipants.map((participant) => (
              <li key={participant.clubId}>
                <span>{participant.club.name}</span>
                <span className="list-actions">
                  <button type="button" className="danger" onClick={() => handleParticipantRemove(participant.club)}>
                    Удал.
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </article>

        <article className="card">
          <header>
            <h4>Заявки на сезон</h4>
            <p>Добавляйте игроков в конкретную команду с номером.</p>
          </header>
          <form className="stacked" onSubmit={handleRosterSubmit}>
            <label>
              Команда
              <select
                value={rosterForm.clubId}
                onChange={(event) => {
                  const value = event.target.value ? Number(event.target.value) : ''
                  setRosterForm((form) => ({ ...form, clubId: value }))
                  setRosterClubFilter(value || '')
                }}
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
              Игрок
              <select
                value={rosterForm.personId}
                onChange={(event) =>
                  setRosterForm((form) => ({ ...form, personId: event.target.value ? Number(event.target.value) : '' }))
                }
                required
              >
                <option value="">—</option>
                {playerDirectory.map((player) => (
                  <option key={player.id} value={player.id}>
                    {player.lastName} {player.firstName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Номер
              <input
                type="number"
                value={rosterForm.shirtNumber}
                onChange={(event) =>
                  setRosterForm((form) => ({ ...form, shirtNumber: event.target.value ? Number(event.target.value) : '' }))
                }
                min={1}
                required
              />
            </label>
            <button className="button-primary" type="submit" disabled={!selectedSeasonId}>
              Добавить в заявку
            </button>
          </form>
          <label className="stacked">
            Отображать состав
            <select
              value={rosterClubFilter}
              onChange={(event) => setRosterClubFilter(event.target.value ? Number(event.target.value) : '')}
            >
              <option value="">Все клубы</option>
              {seasonParticipants.map((participant) => (
                <option key={participant.clubId} value={participant.clubId}>
                  {participant.club.name}
                </option>
              ))}
            </select>
          </label>
          <ul className="list">
            {rosterEntries.map((entry) => (
              <li key={`${entry.seasonId}-${entry.clubId}-${entry.personId}`}>
                <span>
                  #{entry.shirtNumber} — {entry.person.lastName} {entry.person.firstName} ({entry.club.shortName})
                </span>
                <span className="list-actions">
                  <button type="button" className="danger" onClick={() => handleRosterRemove(entry)}>
                    Удал.
                  </button>
                </span>
              </li>
            ))}
          </ul>
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
                    ? `, ${data.clubs.find((club) => club.id === playoffResult.byeClubId)?.shortName ?? `клуб #${playoffResult.byeClubId}`} проходит дальше`
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
                        {status}
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
                      {series.seriesStatus}
                      {series.winnerClubId ? ` → ${availableClubs.find((club) => club.id === series.winnerClubId)?.shortName}` : ''}
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
            <p>Планируйте календарь и назначайте площадку.</p>
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
              <select
                value={matchForm.homeTeamId}
                onChange={(event) => setMatchForm((form) => ({ ...form, homeTeamId: event.target.value ? Number(event.target.value) : '' }))}
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
              Гости
              <select
                value={matchForm.awayTeamId}
                onChange={(event) => setMatchForm((form) => ({ ...form, awayTeamId: event.target.value ? Number(event.target.value) : '' }))}
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
              Серия (опционально)
              <select
                value={matchForm.seriesId}
                onChange={(event) => setMatchForm((form) => ({ ...form, seriesId: event.target.value }))}
              >
                <option value="">—</option>
                {seasonSeries.map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.stageName}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Номер игры в серии
              <input
                type="number"
                value={matchForm.seriesMatchNumber}
                onChange={(event) =>
                  setMatchForm((form) => ({
                    ...form,
                    seriesMatchNumber: event.target.value ? Number(event.target.value) : ''
                  }))
                }
                min={1}
              />
            </label>
            <button className="button-primary" type="submit" disabled={!selectedSeasonId}>
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
                  <th>Статус</th>
                  <th aria-label="Действия" />
                </tr>
              </thead>
              <tbody>
                {seasonMatches.map((match) => {
                  const home = availableClubs.find((club) => club.id === match.homeTeamId)
                  const away = availableClubs.find((club) => club.id === match.awayTeamId)
                  const form = matchUpdateForms[match.id] ?? buildMatchUpdateForm(match)
                  const homeScoreValue = typeof form.homeScore === 'number' ? form.homeScore : match.homeScore
                  const awayScoreValue = typeof form.awayScore === 'number' ? form.awayScore : match.awayScore
                  const isLive = form.status === 'LIVE'
                  return (
                    <tr key={match.id} className={selectedMatchId === match.id ? 'active-row' : undefined}>
                      <td>{new Date(match.matchDateTime).toLocaleString()}</td>
                      <td>
                        {home?.shortName ?? match.homeTeamId} vs {away?.shortName ?? match.awayTeamId}
                      </td>
                      <td>
                        <div className="score-pair">
                          <div className={`score-control${isLive ? ' live' : ''}`}>
                            {isLive ? (
                              <button
                                type="button"
                                className="score-button"
                                onClick={() => adjustMatchScore(match, 'homeScore', -1)}
                                disabled={homeScoreValue <= 0}
                                aria-label="Уменьшить счёт хозяев"
                              >
                                −
                              </button>
                            ) : null}
                            <input
                              type="number"
                              value={form.homeScore === '' ? '' : form.homeScore}
                              onChange={(event) =>
                                setMatchUpdateForms((forms) => {
                                  const current = forms[match.id] ?? buildMatchUpdateForm(match)
                                  return {
                                    ...forms,
                                    [match.id]: {
                                      ...current,
                                      homeScore: event.target.value === '' ? '' : Number(event.target.value)
                                    }
                                  }
                                })
                              }
                              className="score-input"
                              min={0}
                              aria-label="Счёт хозяев"
                            />
                            {isLive ? (
                              <button
                                type="button"
                                className="score-button"
                                onClick={() => adjustMatchScore(match, 'homeScore', 1)}
                                aria-label="Увеличить счёт хозяев"
                              >
                                +
                              </button>
                            ) : null}
                          </div>
                          <span className="score-separator">:</span>
                          <div className={`score-control${isLive ? ' live' : ''}`}>
                            {isLive ? (
                              <button
                                type="button"
                                className="score-button"
                                onClick={() => adjustMatchScore(match, 'awayScore', -1)}
                                disabled={awayScoreValue <= 0}
                                aria-label="Уменьшить счёт гостей"
                              >
                                −
                              </button>
                            ) : null}
                            <input
                              type="number"
                              value={form.awayScore === '' ? '' : form.awayScore}
                              onChange={(event) =>
                                setMatchUpdateForms((forms) => {
                                  const current = forms[match.id] ?? buildMatchUpdateForm(match)
                                  return {
                                    ...forms,
                                    [match.id]: {
                                      ...current,
                                      awayScore: event.target.value === '' ? '' : Number(event.target.value)
                                    }
                                  }
                                })
                              }
                              className="score-input"
                              min={0}
                              aria-label="Счёт гостей"
                            />
                            {isLive ? (
                              <button
                                type="button"
                                className="score-button"
                                onClick={() => adjustMatchScore(match, 'awayScore', 1)}
                                aria-label="Увеличить счёт гостей"
                              >
                                +
                              </button>
                            ) : null}
                          </div>
                        </div>
                      </td>
                      <td>
                        <select
                          value={form.status}
                          onChange={(event) => {
                            const nextStatus = event.target.value as MatchSummary['status']
                            setMatchUpdateForms((forms) => {
                              const current = forms[match.id] ?? buildMatchUpdateForm(match)
                              const nextForm: MatchUpdateFormState = { ...current, status: nextStatus }
                              if (nextStatus === 'LIVE') {
                                nextForm.homeScore = 0
                                nextForm.awayScore = 0
                              }
                              return {
                                ...forms,
                                [match.id]: nextForm
                              }
                            })
                          }}
                        >
                          {matchStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="table-actions">
                        <button type="button" onClick={() => handleMatchSelect(match)}>
                          Детали
                        </button>
                        <button type="button" onClick={() => handleMatchUpdate(match, form)}>
                          Сохранить
                        </button>
                        <button type="button" className="danger" onClick={() => handleMatchDelete(match)}>
                          Удал.
                        </button>
                      </td>
                    </tr>
                  )
                })}
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
              <form className="stacked" onSubmit={handleLineupSubmit}>
                <h6>Заявка на матч</h6>
                <div className="grid-two">
                  <label>
                    Команда
                    <select
                      value={lineupForm.clubId}
                      onChange={(event) => setLineupForm((form) => ({ ...form, clubId: event.target.value ? Number(event.target.value) : '' }))}
                      required
                    >
                      <option value="">—</option>
                      {seasonParticipants.map((participant) => (
                        <option key={participant.clubId} value={participant.clubId}>
                          {participant.club.shortName}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Игрок
                    <select
                      value={lineupForm.personId}
                      onChange={(event) =>
                        setLineupForm((form) => ({ ...form, personId: event.target.value ? Number(event.target.value) : '' }))
                      }
                      required
                      disabled={!lineupForm.clubId || currentClubRoster.length === 0}
                    >
                      <option value="">{lineupForm.clubId ? '—' : 'Сначала выберите клуб'}</option>
                      {currentClubRoster.map((entry) => (
                        <option key={entry.personId} value={entry.personId}>
                          {entry.person.lastName} {entry.person.firstName} · №{entry.shirtNumber}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="grid-two">
                  <label>
                    Роль
                    <select value={lineupForm.role} onChange={(event) => setLineupForm((form) => ({ ...form, role: event.target.value as LineupFormState['role'] }))}>
                      {lineupRoles.map((role) => (
                        <option key={role} value={role}>
                          {lineupRoleLabels[role]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Позиция (опционально)
                    <input value={lineupForm.position} onChange={(event) => setLineupForm((form) => ({ ...form, position: event.target.value }))} />
                  </label>
                </div>
                <button className="button-primary" type="submit">
                  Сохранить заявку
                </button>
              </form>

              <div className="split-columns">
                <div>
                  <h6>Состав</h6>
                  <ul className="list">
                    {matchLineup.map((entry) => (
                      <li key={`${entry.matchId}-${entry.personId}`}>
                        <span>
                          {entry.role === 'STARTER' ? '⏱️' : '↩️'} {entry.person.lastName} {entry.person.firstName} ({entry.club.shortName}) — {lineupRoleLabels[entry.role]}
                        </span>
                        <span className="list-actions">
                          <button type="button" className="danger" onClick={() => handleLineupRemove(entry)}>
                            Удал.
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
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
                        <option value="">{selectedMatch ? '—' : 'Выберите матч'}</option>
                        {selectedMatchTeams.map((team) => (
                          <option key={team.id} value={team.id}>
                            {team.shortName}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Игрок
                      <select
                        value={eventForm.playerId}
                        onChange={(event) => setEventForm((form) => ({ ...form, playerId: event.target.value ? Number(event.target.value) : '' }))}
                        required
                        disabled={!selectedMatch || eventPlayerOptions.length === 0}
                      >
                        <option value="">{selectedMatch ? '—' : 'Выберите матч'}</option>
                        {eventPlayerOptions.map((entry) => (
                          <option key={entry.personId} value={entry.personId}>
                            {entry.person.lastName} {entry.person.firstName} ({entry.club.shortName})
                            {entry.source === 'roster' ? ' · сезонная заявка' : ''}
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
                        disabled={!selectedMatch || matchPlayersPool.length === 0}
                      >
                        <option value="">{selectedMatch ? '—' : 'Выберите матч'}</option>
                        {matchPlayersPool.map((entry) => (
                          <option key={entry.personId} value={entry.personId}>
                            {entry.person.lastName} {entry.person.firstName} ({entry.club.shortName})
                            {entry.source === 'roster' ? ' · сезонная заявка' : ''}
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
                          {entry.minute}' {eventTypeLabels[entry.eventType]} — {entry.player.lastName} {entry.player.firstName} ({entry.team.shortName})
                          {entry.relatedPerson ? ` · ассист: ${entry.relatedPerson.lastName} ${entry.relatedPerson.firstName}` : ''}
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
