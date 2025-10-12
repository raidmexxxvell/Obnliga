// Общие типы между backend и frontend (черновые)
export interface Match {
  id: string
  home: string
  away: string
  startsAt?: string
  score?: string
}

export interface User {
  id: string
  displayName?: string
  balance?: number
}

// Prisma/DB-backed user (Telegram)
export interface DbUser {
  id: number
  telegramId: string // хранится как строка, чтобы избежать потери точности
  username?: string | null
  firstName?: string | null
  photoUrl?: string | null
  createdAt?: string
  updatedAt?: string
}

export interface NewsItem {
  id: string
  title: string
  content: string
  coverUrl?: string | null
  sendToTelegram?: boolean
  createdAt: string
}

export interface LeagueSeasonSummary {
  id: number
  name: string
  startDate: string
  endDate: string
  isActive: boolean
  competition: {
    id: number
    name: string
    type: 'LEAGUE' | 'CUP'
  }
}

export interface LeagueTableEntry {
  position: number
  clubId: number
  clubName: string
  clubShortName: string
  clubLogoUrl: string | null
  matchesPlayed: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
}

export interface LeagueTableResponse {
  season: LeagueSeasonSummary
  standings: LeagueTableEntry[]
}
