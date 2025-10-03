import { Competition, MatchStatus, PrismaClient, SeriesFormat } from '@prisma/client'
import { FastifyBaseLogger } from 'fastify'

type ClubId = number

type RoundRobinPair = {
  roundIndex: number
  homeClubId: ClubId
  awayClubId: ClubId
}

type SeasonAutomationInput = {
  competition: Competition
  clubIds: ClubId[]
  seasonName: string
  startDateISO: string
  matchDayOfWeek: number
  matchTime?: string | null
  roundsPerPair?: number
  copyClubPlayersToRoster?: boolean
  bestOfLength?: number
}

export type SeasonAutomationResult = {
  seasonId: number
  matchesCreated: number
  participantsCreated: number
  rosterEntriesCreated: number
}

const ensureUniqueClubs = (clubIds: ClubId[]): ClubId[] => {
  const seen = new Set<ClubId>()
  const unique: ClubId[] = []
  for (const id of clubIds) {
    if (!seen.has(id)) {
      unique.push(id)
      seen.add(id)
    }
  }
  return unique
}

const deriveRoundsPerPair = (competition: Competition, input?: SeasonAutomationInput['roundsPerPair']): number => {
  if (input && input > 0) return input
  switch (competition.seriesFormat) {
    case SeriesFormat.TWO_LEGGED:
      return 2
    case SeriesFormat.BEST_OF_N:
      return 3
    case SeriesFormat.SINGLE_MATCH:
    default:
      return 1
  }
}

const parseBestOfLength = (competition: Competition, provided?: number): number => {
  if (competition.seriesFormat !== SeriesFormat.BEST_OF_N) {
    return deriveRoundsPerPair(competition)
  }
  if (provided && provided >= 1) {
    return provided
  }
  return 3
}

const generateRoundRobinPairs = (clubIds: ClubId[], roundsPerPair: number): RoundRobinPair[] => {
  const uniqueClubs = ensureUniqueClubs(clubIds)
  if (uniqueClubs.length < 2) {
    return []
  }

  const teams = [...uniqueClubs]
  const hasBye = teams.length % 2 === 1
  if (hasBye) {
    teams.push(-1)
  }

  const totalTeams = teams.length
  const rounds = totalTeams - 1
  const half = totalTeams / 2
  const rotation = teams.slice(1)
  const baseSchedule: RoundRobinPair[][] = []

  let current = [teams[0], ...rotation]

  for (let round = 0; round < rounds; round++) {
    const roundPairs: RoundRobinPair[] = []
    for (let i = 0; i < half; i++) {
      const home = current[i]
      const away = current[totalTeams - 1 - i]
      if (home === -1 || away === -1) continue
      if (round % 2 === 0) {
        roundPairs.push({ roundIndex: round, homeClubId: home, awayClubId: away })
      } else {
        roundPairs.push({ roundIndex: round, homeClubId: away, awayClubId: home })
      }
    }
    baseSchedule.push(roundPairs)

    const fixed = current[0]
    const rotating = current.slice(1)
    rotating.unshift(rotating.pop() as number)
    current = [fixed, ...rotating]
  }

  const flattened: RoundRobinPair[] = []
  for (let cycle = 0; cycle < roundsPerPair; cycle++) {
    for (let round = 0; round < baseSchedule.length; round++) {
      const roundPairs = baseSchedule[round]
      for (const pair of roundPairs) {
        if (cycle % 2 === 0) {
          flattened.push({
            roundIndex: cycle * baseSchedule.length + round,
            homeClubId: pair.homeClubId,
            awayClubId: pair.awayClubId
          })
        } else {
          flattened.push({
            roundIndex: cycle * baseSchedule.length + round,
            homeClubId: pair.awayClubId,
            awayClubId: pair.homeClubId
          })
        }
      }
    }
  }

  return flattened
}

const alignDateToWeekday = (date: Date, weekday: number): Date => {
  const clone = new Date(date)
  const currentWeekday = clone.getUTCDay()
  const normalizedWeekday = ((weekday % 7) + 7) % 7
  const delta = (normalizedWeekday - currentWeekday + 7) % 7
  clone.setUTCDate(clone.getUTCDate() + delta)
  return clone
}

const applyTimeToDate = (date: Date, time?: string | null): Date => {
  if (!time) return date
  const match = /^([0-2]\d):([0-5]\d)$/.exec(time.trim())
  if (!match) return date
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const withTime = new Date(date)
  withTime.setUTCHours(hours, minutes, 0, 0)
  return withTime
}

const addDays = (date: Date, days: number): Date => {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export const runSeasonAutomation = async (
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
  input: SeasonAutomationInput
): Promise<SeasonAutomationResult> => {
  const uniqueClubIds = ensureUniqueClubs(input.clubIds)
  if (uniqueClubIds.length < 2) {
    throw new Error('not_enough_participants')
  }

  const roundsPerPair = input.competition.seriesFormat === SeriesFormat.BEST_OF_N
    ? parseBestOfLength(input.competition, input.bestOfLength)
    : deriveRoundsPerPair(input.competition, input.roundsPerPair)

  const pairs = generateRoundRobinPairs(uniqueClubIds, roundsPerPair)
  const alignedStartDate = alignDateToWeekday(new Date(input.startDateISO), input.matchDayOfWeek)
  const kickoffDate = applyTimeToDate(alignedStartDate, input.matchTime)
  const totalRounds = pairs.reduce((max, pair) => Math.max(max, pair.roundIndex), 0) + (pairs.length ? 1 : 0)

  const season = await prisma.$transaction(async (tx) => {
    const createdSeason = await tx.season.create({
      data: {
        competitionId: input.competition.id,
        name: input.seasonName.trim(),
        startDate: kickoffDate,
        endDate: totalRounds > 0 ? addDays(kickoffDate, (totalRounds - 1) * 7) : kickoffDate
      }
    })

    const participantsData = uniqueClubIds.map((clubId) => ({ seasonId: createdSeason.id, clubId }))
    let participantsCreated = 0
    if (participantsData.length) {
      const result = await tx.seasonParticipant.createMany({ data: participantsData, skipDuplicates: true })
      participantsCreated = result.count
    }

    let rosterEntriesCreated = 0
    if (input.copyClubPlayersToRoster) {
      const clubPlayers = await tx.clubPlayer.findMany({
        where: { clubId: { in: uniqueClubIds } },
        orderBy: [{ clubId: 'asc' }, { defaultShirtNumber: 'asc' }, { personId: 'asc' }]
      })

      const clubToNumbers = new Map<number, Set<number>>()
      const rosterPayload: {
        seasonId: number
        clubId: number
        personId: number
        shirtNumber: number
        registrationDate: Date
      }[] = []

      for (const player of clubPlayers) {
        const takenNumbers = clubToNumbers.get(player.clubId) ?? new Set<number>()
        if (!clubToNumbers.has(player.clubId)) {
          clubToNumbers.set(player.clubId, takenNumbers)
        }
        let shirtNumber = player.defaultShirtNumber ?? 0
        if (shirtNumber && takenNumbers.has(shirtNumber)) {
          shirtNumber = 0
        }
        if (!shirtNumber || shirtNumber <= 0) {
          shirtNumber = 1
          while (takenNumbers.has(shirtNumber)) {
            shirtNumber += 1
          }
        }
        takenNumbers.add(shirtNumber)
        rosterPayload.push({
          seasonId: createdSeason.id,
          clubId: player.clubId,
          personId: player.personId,
          shirtNumber,
          registrationDate: new Date()
        })
      }

      if (rosterPayload.length) {
        const result = await tx.seasonRoster.createMany({ data: rosterPayload, skipDuplicates: true })
        rosterEntriesCreated = result.count
      }
    }

    const matchPayload = pairs.map((pair) => {
      const matchDate = addDays(kickoffDate, pair.roundIndex * 7)
      return {
        seasonId: createdSeason.id,
        matchDateTime: matchDate,
        homeTeamId: pair.homeClubId,
        awayTeamId: pair.awayClubId,
        status: MatchStatus.SCHEDULED
      }
    })

    let matchesCreated = 0
    if (matchPayload.length) {
      const result = await tx.match.createMany({ data: matchPayload })
      matchesCreated = result.count
    }

    logger.info({
      seasonId: createdSeason.id,
      participantsCreated,
      matchesCreated,
      rosterEntriesCreated
    }, 'season automation completed')

    return {
      season: createdSeason,
      stats: {
        participantsCreated,
        matchesCreated,
        rosterEntriesCreated
      }
    }
  })

  return {
    seasonId: season.season.id,
    participantsCreated: season.stats.participantsCreated,
    matchesCreated: season.stats.matchesCreated,
    rosterEntriesCreated: season.stats.rosterEntriesCreated
  }
}
