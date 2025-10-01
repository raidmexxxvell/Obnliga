import { create } from 'zustand'
import { adminLogin } from '../api/adminClient'

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

interface AdminState {
  status: 'idle' | 'authenticating' | 'authenticated' | 'error'
  token?: string
  error?: string
  activeTab: AdminTab
  login(login: string, password: string): Promise<void>
  logout(): void
  setTab(tab: AdminTab): void
  clearError(): void
}

type Setter = (partial: Partial<AdminState> | ((state: AdminState) => Partial<AdminState>), replace?: boolean) => void
type Getter = () => AdminState

const adminStoreCreator = (set: Setter, get: Getter): AdminState => ({
  status: initialToken ? 'authenticated' : 'idle',
  token: initialToken,
  error: undefined,
  activeTab: 'teams',
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
    } catch (err) {
      const message = err instanceof Error ? err.message : 'auth_failed'
      set({ status: 'error', error: message, token: undefined })
    }
  },
  logout() {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(storageKey)
    }
    set({ status: 'idle', token: undefined, activeTab: 'teams' })
  },
  setTab(tab: AdminTab) {
    set({ activeTab: tab })
  },
  clearError() {
    if (get().error) {
      set({ error: undefined, status: 'idle' })
    }
  }
})

export const useAdminStore = create<AdminState>()(adminStoreCreator)
