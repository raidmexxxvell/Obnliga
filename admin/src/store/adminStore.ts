import { create } from 'zustand'
import { adminGet, adminLogin } from '../api/adminClient'
import {
  AchievementType,
  AppUser,
  Club,
  ClubSeasonStats,
  Competition,
  Disqualification,
  MatchSeries,
  MatchSummary,
  Person,
  PlayerCareerStats,
  PlayerSeasonStats,
  Prediction,
  Season,
  Stadium,
  UserAchievement
} from '../types'

export type AdminTab = 'teams' | 'matches' | 'stats' | 'players' | 'news'

const storageKey = 'obnliga-admin-token'

const readPersistedToken = () => {
  if (typeof window === 'undefined') return undefined
  try {
    const stored = window.localStorage.getItem(storageKey)
    return stored ?? undefined
  } catch (err) {
    console.warn('admin store: failed to read token from storage', err)
    return undefined
  }
}

const initialToken = readPersistedToken()

interface AdminData {
  clubs: Club[]
  persons: Person[]
  stadiums: Stadium[]
  competitions: Competition[]
  seasons: Season[]
  series: MatchSeries[]
  matches: MatchSummary[]
  clubStats: ClubSeasonStats[]
  playerStats: PlayerSeasonStats[]
  careerStats: PlayerCareerStats[]
  users: AppUser[]
  predictions: Prediction[]
  achievementTypes: AchievementType[]
  userAchievements: UserAchievement[]
  disqualifications: Disqualification[]
}

interface AdminState {
  status: 'idle' | 'authenticating' | 'authenticated' | 'error'
  token?: string
  error?: string
  activeTab: AdminTab
  selectedCompetitionId?: number
  selectedSeasonId?: number
  data: AdminData
  loading: Record<string, boolean>
  login(login: string, password: string): Promise<void>
  logout(): void
  setTab(tab: AdminTab): void
  clearError(): void
  setSelectedCompetition(competitionId?: number): void
  setSelectedSeason(seasonId?: number): void
  fetchDictionaries(): Promise<void>
  fetchSeasons(): Promise<void>
  fetchSeries(seasonId?: number): Promise<void>
  fetchMatches(seasonId?: number): Promise<void>
  fetchStats(seasonId?: number, competitionId?: number): Promise<void>
  fetchUsers(): Promise<void>
  fetchPredictions(): Promise<void>
  fetchAchievements(): Promise<void>
  fetchDisqualifications(): Promise<void>
  refreshTab(tab?: AdminTab): Promise<void>
}

type Setter = (partial: Partial<AdminState> | ((state: AdminState) => Partial<AdminState>), replace?: boolean) => void
type Getter = () => AdminState

const createEmptyData = (): AdminData => ({
  clubs: [],
  persons: [],
  stadiums: [],
  competitions: [],
  seasons: [],
  series: [],
  matches: [],
  clubStats: [],
  playerStats: [],
  careerStats: [],
  users: [],
  predictions: [],
  achievementTypes: [],
  userAchievements: [],
  disqualifications: []
})

const adminStoreCreator = (set: Setter, get: Getter): AdminState => {
  const run = async <T>(key: string, fn: () => Promise<T>): Promise<T> => {
    set((state) => ({
      loading: { ...state.loading, [key]: true },
      error: undefined
    }))
    try {
      const result = await fn()
      set((state) => ({ loading: { ...state.loading, [key]: false } }))
      return result
    } catch (err) {
      const message = err instanceof Error ? err.message : 'request_failed'
      set((state) => ({
        loading: { ...state.loading, [key]: false },
        error: message
      }))
      throw err
    }
  }

  const ensureToken = (): string => {
    const token = get().token
    if (!token) {
      throw new Error('missing_token')
    }
    return token
  }

  const store: AdminState = {
    status: initialToken ? 'authenticated' : 'idle',
    token: initialToken,
    error: undefined,
    activeTab: 'teams',
  selectedCompetitionId: undefined,
    selectedSeasonId: undefined,
    data: createEmptyData(),
    loading: {},
    async login(login: string, password: string) {
      set({ status: 'authenticating', error: undefined })
      try {
        const result = await adminLogin(login, password)
        if (!result.ok) {
          throw new Error(result.error || 'unknown_error')
        }
        if (typeof window !== 'undefined') {
          window.localStorage.setItem(storageKey, result.token)
        }
        set({ status: 'authenticated', token: result.token, error: undefined })
        try {
          await Promise.all([get().fetchDictionaries(), get().fetchSeasons()])
        } catch (err) {
          // Ошибка загрузки данных отображается через store.error
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'auth_failed'
        set({
          status: 'error',
          error: message,
          token: undefined,
          data: createEmptyData(),
          loading: {}
        })
      }
    },
    logout() {
      if (typeof window !== 'undefined') {
        window.localStorage.removeItem(storageKey)
      }
      set({
        status: 'idle',
        token: undefined,
        activeTab: 'teams',
        selectedSeasonId: undefined,
        error: undefined,
        data: createEmptyData(),
        loading: {}
      })
    },
    setTab(tab: AdminTab) {
      set({ activeTab: tab })
      void get()
        .refreshTab(tab)
        .catch(() => undefined)
    },
    clearError() {
      if (get().error) {
        set({ error: undefined, status: get().token ? 'authenticated' : 'idle' })
      }
    },
    setSelectedCompetition(competitionId?: number) {
      set({ selectedCompetitionId: competitionId })
      const seasons = get().data.seasons
      if (competitionId) {
        const firstSeason = seasons.find((season) => season.competitionId === competitionId)
        if (firstSeason) {
          get().setSelectedSeason(firstSeason.id)
          return
        }
      }
      const fallbackSeason = seasons[0]
      get().setSelectedSeason(fallbackSeason?.id)
    },
    setSelectedSeason(seasonId?: number) {
      const seasons = get().data.seasons
      const season = seasons.find((item) => item.id === seasonId)
      set({
        selectedSeasonId: seasonId,
        selectedCompetitionId: season ? season.competitionId : get().selectedCompetitionId
      })
      void (async () => {
        try {
          await Promise.all([
            get().fetchSeries(seasonId),
            get().fetchMatches(seasonId),
            get().fetchStats(seasonId, season?.competitionId)
          ])
        } catch (err) {
          // Ошибка уже зафиксирована в стейте run()
        }
      })()
    },
    async fetchDictionaries() {
      await run('dictionaries', async () => {
        const token = ensureToken()
        const [clubs, persons, stadiums, competitions] = await Promise.all([
          adminGet<Club[]>(token, '/api/admin/clubs'),
          adminGet<Person[]>(token, '/api/admin/persons'),
          adminGet<Stadium[]>(token, '/api/admin/stadiums'),
          adminGet<Competition[]>(token, '/api/admin/competitions')
        ])
        set((state) => ({
          data: {
            ...state.data,
            clubs,
            persons,
            stadiums,
            competitions
          }
        }))
      })
    },
    async fetchSeasons() {
      await run('seasons', async () => {
        const token = ensureToken()
        const seasons = await adminGet<Season[]>(token, '/api/admin/seasons')
        set((state) => {
          const nextSeason =
            seasons.find((season) => season.id === state.selectedSeasonId) ?? seasons[0]
          return {
            data: { ...state.data, seasons },
            selectedSeasonId: nextSeason?.id,
            selectedCompetitionId: nextSeason?.competitionId ?? state.selectedCompetitionId
          }
        })
      })
    },
    async fetchSeries(seasonId?: number) {
      await run('series', async () => {
        const token = ensureToken()
        const activeSeason = seasonId ?? get().selectedSeasonId
        const query = activeSeason ? `?seasonId=${activeSeason}` : ''
        const series = await adminGet<MatchSeries[]>(token, `/api/admin/series${query}`)
        set((state) => ({ data: { ...state.data, series } }))
      })
    },
    async fetchMatches(seasonId?: number) {
      await run('matches', async () => {
        const token = ensureToken()
        const activeSeason = seasonId ?? get().selectedSeasonId
        const query = activeSeason ? `?seasonId=${activeSeason}` : ''
        const matches = await adminGet<MatchSummary[]>(token, `/api/admin/matches${query}`)
        set((state) => ({ data: { ...state.data, matches } }))
      })
    },
    async fetchStats(seasonId?: number, competitionId?: number) {
      await run('stats', async () => {
        const token = ensureToken()
        const activeSeason = seasonId ?? get().selectedSeasonId
        const activeCompetition = competitionId ?? get().selectedCompetitionId
        const params = new URLSearchParams()
        if (activeSeason) {
          params.set('seasonId', String(activeSeason))
        } else if (activeCompetition) {
          params.set('competitionId', String(activeCompetition))
        }
        const seasonQuery = params.size ? `?${params.toString()}` : ''
        const careerQuery = activeCompetition ? `?competitionId=${activeCompetition}` : ''
        const [clubStats, playerStats, careerStats] = await Promise.all([
          adminGet<ClubSeasonStats[]>(token, `/api/admin/stats/club-season${seasonQuery}`),
          adminGet<PlayerSeasonStats[]>(token, `/api/admin/stats/player-season${seasonQuery}`),
          adminGet<PlayerCareerStats[]>(token, `/api/admin/stats/player-career${careerQuery}`)
        ])
        set((state) => ({
          data: { ...state.data, clubStats, playerStats, careerStats }
        }))
      })
    },
    async fetchUsers() {
      await run('users', async () => {
        const token = ensureToken()
        const users = await adminGet<AppUser[]>(token, '/api/admin/users')
        set((state) => ({ data: { ...state.data, users } }))
      })
    },
    async fetchPredictions() {
      await run('predictions', async () => {
        const token = ensureToken()
        const predictions = await adminGet<Prediction[]>(token, '/api/admin/predictions')
        set((state) => ({ data: { ...state.data, predictions } }))
      })
    },
    async fetchAchievements() {
      await run('achievements', async () => {
        const token = ensureToken()
        const [achievementTypes, userAchievements] = await Promise.all([
          adminGet<AchievementType[]>(token, '/api/admin/achievements/types'),
          adminGet<UserAchievement[]>(token, '/api/admin/achievements/users')
        ])
        set((state) => ({
          data: { ...state.data, achievementTypes, userAchievements }
        }))
      })
    },
    async fetchDisqualifications() {
      await run('disqualifications', async () => {
        const token = ensureToken()
        const disqualifications = await adminGet<Disqualification[]>(token, '/api/admin/disqualifications')
        set((state) => ({ data: { ...state.data, disqualifications } }))
      })
    },
    async refreshTab(tab?: AdminTab) {
      const target = tab ?? get().activeTab
      if (!get().token) return
      switch (target) {
        case 'teams':
          await Promise.all([get().fetchDictionaries(), get().fetchSeasons()])
          break
        case 'matches': {
          await get().fetchSeasons()
          const season = get().selectedSeasonId
          await Promise.all([get().fetchSeries(season), get().fetchMatches(season)])
          break
        }
        case 'stats': {
          await get().fetchSeasons()
          const season = get().selectedSeasonId
          const competitionId = get().selectedCompetitionId
          await get().fetchStats(season, competitionId)
          break
        }
        case 'players': {
          await Promise.all([get().fetchDictionaries(), get().fetchDisqualifications()])
          break
        }
        case 'news':
          await Promise.all([get().fetchUsers(), get().fetchPredictions(), get().fetchAchievements()])
          break
        default:
          break
      }
    }
  }

  if (initialToken) {
    let booted = false
    setTimeout(() => {
      if (booted) return
      booted = true
      store.refreshTab('teams').catch(() => undefined)
    }, 0)
  }

  return store
}

export const useAdminStore = create<AdminState>()(adminStoreCreator)
