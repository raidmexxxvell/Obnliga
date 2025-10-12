import { create } from 'zustand'
import type { LeagueSeasonSummary, LeagueTableResponse } from '@shared/types'
import { leagueApi } from '../api/leagueApi'
import { wsClient } from '../wsClient'

export type UITab = 'home' | 'league' | 'predictions' | 'leaderboard' | 'shop' | 'profile'
export type LeagueSubTab = 'table' | 'schedule' | 'results' | 'stats'

const SEASONS_TTL_MS = 55_000
const TABLE_TTL_MS = 240_000
const DOUBLE_TAP_THRESHOLD_MS = 450

interface LoadingState {
  seasons: boolean
  table: boolean
}

interface ErrorState {
  seasons?: string
  table?: string
}

interface AppState {
  currentTab: UITab
  leagueSubTab: LeagueSubTab
  leagueMenuOpen: boolean
  seasons: LeagueSeasonSummary[]
  seasonsVersion?: string
  seasonsFetchedAt: number
  tables: Record<number, LeagueTableResponse>
  tableVersions: Record<number, string | undefined>
  tableFetchedAt: Record<number, number>
  selectedSeasonId?: number
  activeSeasonId?: number
  loading: LoadingState
  errors: ErrorState
  lastLeagueTapAt: number
  realtimeAttached: boolean
  setTab: (tab: UITab) => void
  setLeagueSubTab: (view: LeagueSubTab) => void
  toggleLeagueMenu: (force?: boolean) => void
  tapLeagueNav: (now: number) => void
  closeLeagueMenu: () => void
  setSelectedSeason: (seasonId: number) => void
  fetchLeagueSeasons: (options?: { force?: boolean }) => Promise<{ ok: boolean }>
  fetchLeagueTable: (options?: { seasonId?: number; force?: boolean }) => Promise<{ ok: boolean }>
  applyRealtimeTable: (table: LeagueTableResponse) => void
  ensureRealtime: () => void
}

const ensureSeasonOrder = (seasons: LeagueSeasonSummary[]): LeagueSeasonSummary[] => {
  return [...seasons].sort((left, right) => right.startDate.localeCompare(left.startDate))
}

export const useAppStore = create<AppState>((set, get) => ({
  currentTab: 'home',
  leagueSubTab: 'table',
  leagueMenuOpen: false,
  seasons: [],
  seasonsVersion: undefined,
  seasonsFetchedAt: 0,
  tables: {},
  tableVersions: {},
  tableFetchedAt: {},
  selectedSeasonId: undefined,
  activeSeasonId: undefined,
  loading: { seasons: false, table: false },
  errors: {},
  lastLeagueTapAt: 0,
  realtimeAttached: false,
  setTab: tab => {
    set(state => ({
      currentTab: tab,
      leagueMenuOpen: tab === 'league' ? state.leagueMenuOpen : false,
    }))
  },
  setLeagueSubTab: view => set({ leagueSubTab: view }),
  toggleLeagueMenu: force => {
    set(state => ({
      leagueMenuOpen:
        typeof force === 'boolean' ? force : (state.currentTab === 'league' ? !state.leagueMenuOpen : state.leagueMenuOpen),
    }))
  },
  tapLeagueNav: now => {
    const state = get()
    if (state.currentTab !== 'league') {
      set({ currentTab: 'league', lastLeagueTapAt: now, leagueMenuOpen: false })
      return
    }
    const delta = now - state.lastLeagueTapAt
    if (delta > 0 && delta <= DOUBLE_TAP_THRESHOLD_MS) {
      set({ leagueMenuOpen: !state.leagueMenuOpen, lastLeagueTapAt: now })
      return
    }
    set({ lastLeagueTapAt: now })
  },
  closeLeagueMenu: () => set({ leagueMenuOpen: false }),
  setSelectedSeason: seasonId => {
    const seasons = get().seasons
    const found = seasons.find(season => season.id === seasonId)
    if (!found) {
      return
    }
    set({ selectedSeasonId: seasonId })
  },
  fetchLeagueSeasons: async options => {
    const { loading, seasonsFetchedAt } = get()
    const now = Date.now()
    if (loading.seasons) {
      return { ok: true }
    }
    if (!options?.force && seasonsFetchedAt && now - seasonsFetchedAt < SEASONS_TTL_MS) {
      return { ok: true }
    }
    set(state => ({
      loading: { ...state.loading, seasons: true },
      errors: { ...state.errors, seasons: undefined },
    }))
    const response = await leagueApi.fetchSeasons()
    if (!response.ok) {
      set(state => ({
        loading: { ...state.loading, seasons: false },
        errors: { ...state.errors, seasons: response.error },
      }))
      return { ok: false }
    }
    const ordered = ensureSeasonOrder(response.data)
    const active = ordered.find(season => season.isActive)
    const currentSelected = get().selectedSeasonId
    const nextSelected = currentSelected && ordered.some(season => season.id === currentSelected)
      ? currentSelected
      : active?.id ?? ordered[0]?.id

    set(state => ({
      seasons: ordered,
      seasonsVersion: response.version,
      seasonsFetchedAt: now,
      activeSeasonId: active?.id,
      selectedSeasonId: nextSelected,
      loading: { ...state.loading, seasons: false },
    }))

    if (nextSelected) {
      void get().fetchLeagueTable({ seasonId: nextSelected })
    }

    return { ok: true }
  },
  fetchLeagueTable: async options => {
    const seasonId = options?.seasonId ?? get().selectedSeasonId ?? get().activeSeasonId
    if (!seasonId) {
      return { ok: false }
    }
    const now = Date.now()
    const fetchedAt = get().tableFetchedAt[seasonId] ?? 0
    const currentlyLoading = get().loading.table
    if (!options?.force && currentlyLoading) {
      return { ok: true }
    }
    if (!options?.force && fetchedAt && now - fetchedAt < TABLE_TTL_MS) {
      return { ok: true }
    }
    set(state => ({
      loading: { ...state.loading, table: true },
      errors: { ...state.errors, table: undefined },
    }))
    const response = await leagueApi.fetchTable(seasonId)
    if (!response.ok) {
      set(state => ({
        loading: { ...state.loading, table: false },
        errors: { ...state.errors, table: response.error },
      }))
      return { ok: false }
    }
    set(state => ({
      tables: { ...state.tables, [seasonId]: response.data },
      tableVersions: { ...state.tableVersions, [seasonId]: response.version },
      tableFetchedAt: { ...state.tableFetchedAt, [seasonId]: now },
      loading: { ...state.loading, table: false },
    }))
    return { ok: true }
  },
  applyRealtimeTable: table => {
    const seasonId = table.season.id
    set(state => ({
      tables: { ...state.tables, [seasonId]: table },
      tableVersions: { ...state.tableVersions, [seasonId]: undefined },
      tableFetchedAt: { ...state.tableFetchedAt, [seasonId]: Date.now() },
      activeSeasonId: table.season.isActive ? seasonId : state.activeSeasonId,
    }))
  },
  ensureRealtime: () => {
    const state = get()
    if (state.realtimeAttached) {
      return
    }
    const unsubscribe = wsClient.on('league.table', message => {
      const payload = (message as { payload?: unknown }).payload
      if (!payload || typeof payload !== 'object') {
        return
      }
      const data = payload as LeagueTableResponse
      if (!data?.season || !Array.isArray(data.standings)) {
        return
      }
      get().applyRealtimeTable(data)
    })
    wsClient.subscribe('public:league:table')
    set({ realtimeAttached: true })

    // ensure disconnect cleanup on window unload to avoid dangling connection
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        unsubscribe()
        wsClient.unsubscribe('public:league:table')
      })
    }
  },
}))
