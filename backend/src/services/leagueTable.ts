import prisma from '../db'
import { Prisma } from '@prisma/client'

export interface LeagueSeasonSummary {
  id: number
  name: string
  startDate: string
  endDate: string
  isActive: boolean
  competition: {
    id: number
    name: string
    type: string
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

export type SeasonWithCompetition = Prisma.SeasonGetPayload<{
  include: {
    competition: true
  }
}>

const ensureSeasonSummary = (season: SeasonWithCompetition): LeagueSeasonSummary => ({
  id: season.id,
  name: season.name,
  startDate: season.startDate.toISOString(),
  endDate: season.endDate.toISOString(),
  isActive: season.isActive,
    competition: {
      id: season.competitionId,
      name: season.competition.name,
      type: season.competition.type,
    },
})

export const fetchLeagueSeasons = async (): Promise<LeagueSeasonSummary[]> => {
  const seasons = await prisma.season.findMany({
    orderBy: [{ startDate: 'desc' }],
    include: { competition: true },
  })
  return seasons.map(ensureSeasonSummary)
}

export const buildLeagueTable = async (
  season: SeasonWithCompetition
): Promise<LeagueTableResponse> => {
  const [stats, participants] = await Promise.all([
    prisma.clubSeasonStats.findMany({
      where: { seasonId: season.id },
      include: { club: true },
    }),
    prisma.seasonParticipant.findMany({
      where: { seasonId: season.id },
      include: { club: true },
    }),
  ])

  const statsByClubId = new Map<number, typeof stats[number]>()
  for (const entry of stats) {
    statsByClubId.set(entry.clubId, entry)
  }

  for (const participant of participants) {
    if (!statsByClubId.has(participant.clubId)) {
      statsByClubId.set(participant.clubId, {
        seasonId: season.id,
        clubId: participant.clubId,
        points: 0,
        wins: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        updatedAt: new Date(),
        club: participant.club,
      })
    }
  }

  const rows: LeagueTableEntry[] = Array.from(statsByClubId.values()).map(entry => {
    const draws = Math.max(entry.points - entry.wins * 3, 0)
    const matchesPlayed = entry.wins + entry.losses + draws
    const goalDifference = entry.goalsFor - entry.goalsAgainst
    return {
      position: 0,
      clubId: entry.clubId,
      clubName: entry.club.name,
      clubShortName: entry.club.shortName,
      clubLogoUrl: entry.club.logoUrl ?? null,
      matchesPlayed,
      wins: entry.wins,
      draws,
      losses: entry.losses,
      goalsFor: entry.goalsFor,
      goalsAgainst: entry.goalsAgainst,
      goalDifference,
      points: entry.points,
    }
  })

  rows.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor
    return a.clubName.localeCompare(b.clubName, 'ru')
  })

  rows.forEach((row, index) => {
    row.position = index + 1
  })

  return {
    season: ensureSeasonSummary(season),
    standings: rows,
  }
}
