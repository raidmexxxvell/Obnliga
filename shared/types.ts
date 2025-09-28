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
