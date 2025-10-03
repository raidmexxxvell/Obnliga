import type { ClubPlayerLink, SeasonAutomationResult } from '../types'

const API_BASE = import.meta.env.VITE_ADMIN_API_BASE || 'http://localhost:3000'

interface AdminLoginResponse {
  ok: boolean
  token: string
  expiresIn: number
  error?: string
}

export const adminLogin = async (login: string, password: string): Promise<AdminLoginResponse> => {
  const response = await fetch(`${API_BASE}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ login, password })
  })

  const data = (await response.json().catch(() => ({}))) as Partial<AdminLoginResponse>

  if (!response.ok) {
    return {
      ok: false,
      token: '',
      expiresIn: 0,
      error: data.error || 'invalid_credentials'
    }
  }

  return {
    ok: true,
    token: data.token ?? '',
    expiresIn: data.expiresIn ?? 0
  }
}

interface ApiResponseEnvelope<T> {
  ok: boolean
  data?: T
  error?: string
}

const ensureToken = (token?: string): string => {
  if (!token) {
    throw new Error('missing_token')
  }
  return token
}

export const adminRequest = async <T>(token: string | undefined, path: string, init: RequestInit = {}): Promise<T> => {
  const safeToken = ensureToken(token)
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${safeToken}`,
      ...(init.headers || {})
    }
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiResponseEnvelope<T>
    const error = payload?.error || response.statusText || 'request_failed'
    throw new Error(error)
  }

  const payload = (await response.json().catch(() => ({}))) as ApiResponseEnvelope<T>
  if (!payload?.ok) {
    throw new Error(payload?.error || 'request_failed')
  }

  return payload.data as T
}

export const adminGet = async <T>(token: string | undefined, path: string): Promise<T> =>
  adminRequest<T>(token, path, { method: 'GET' })

export const adminPost = async <T>(token: string | undefined, path: string, body?: unknown): Promise<T> =>
  adminRequest<T>(token, path, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body)
  })

export const adminPut = async <T>(token: string | undefined, path: string, body?: unknown): Promise<T> =>
  adminRequest<T>(token, path, {
    method: 'PUT',
    body: body === undefined ? undefined : JSON.stringify(body)
  })

export const adminDelete = async <T>(token: string | undefined, path: string): Promise<T> =>
  adminRequest<T>(token, path, { method: 'DELETE' })

export interface UpdateClubPlayersPayload {
  players: Array<{ personId: number; defaultShirtNumber?: number | null }>
}

export interface SeasonAutomationPayload {
  competitionId: number
  seasonName: string
  startDate: string
  matchDayOfWeek: number
  matchTime?: string
  clubIds: number[]
  copyClubPlayersToRoster?: boolean
  seriesFormat: 'SINGLE_MATCH' | 'TWO_LEGGED' | 'BEST_OF_N'
}

export interface ImportClubPlayersPayload {
  lines: string[]
}

export const fetchClubPlayers = async (token: string | undefined, clubId: number): Promise<ClubPlayerLink[]> =>
  adminGet<ClubPlayerLink[]>(token, `/api/admin/clubs/${clubId}/players`)

export const updateClubPlayers = async (
  token: string | undefined,
  clubId: number,
  payload: UpdateClubPlayersPayload
) => adminPut<ClubPlayerLink[]>(token, `/api/admin/clubs/${clubId}/players`, payload)

export const importClubPlayers = async (
  token: string | undefined,
  clubId: number,
  payload: ImportClubPlayersPayload
) => adminPost<ClubPlayerLink[]>(token, `/api/admin/clubs/${clubId}/players/import`, payload)

export const createSeasonAutomation = async (
  token: string | undefined,
  payload: SeasonAutomationPayload
) => adminPost<SeasonAutomationResult>(token, '/api/admin/seasons/auto', payload)
