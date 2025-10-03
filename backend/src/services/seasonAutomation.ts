import { Competition, MatchStatus, PrismaClient, SeriesFormat, SeriesStatus } from '@prisma/client'
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
  copyClubPlayersToRoster?: boolean
  seriesFormat: SeriesFormat
  bestOfLength?: number
}

export type SeasonAutomationResult = {
  seasonId: number
  matchesCreated: number
  participantsCreated: number
  rosterEntriesCreated: number
  seriesCreated: number
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

const getGroupStageRounds = (format: SeriesFormat): number => {
  switch (format) {
    case SeriesFormat.TWO_LEGGED:
      return 2
    case SeriesFormat.SINGLE_MATCH:
    case SeriesFormat.BEST_OF_N:
    default:
      return 1
  }
}

type PlayoffSeriesPlan = {
  stageName: string
  homeClubId: number
  awayClubId: number
  matchDateTimes: Date[]
}

const stageNameForTeams = (teamCount: number): string => {
  if (teamCount <= 2) return 'Финал'
  if (teamCount <= 4) return 'Полуфинал'
  if (teamCount <= 8) return 'Четвертьфинал'
  if (teamCount <= 16) return '1/8 финала'
  if (teamCount <= 32) return '1/16 финала'
  return `Плей-офф (${teamCount} команд)`
}

const toOdd = (value: number): number => {
  const normalized = Math.max(1, Math.floor(value))
  return normalized % 2 === 0 ? normalized + 1 : normalized
}

const createBestOfPlayoffPlans = (
  seeds: number[],
  startDate: Date,
  matchTime: string | null | undefined,
  bestOfLength: number
): PlayoffSeriesPlan[] => {
  if (seeds.length < 2) return []
  const plans: PlayoffSeriesPlan[] = []
  let roundSeeds = [...seeds]
  let roundStart = new Date(startDate)

  while (roundSeeds.length > 1) {
    const pairCount = Math.floor(roundSeeds.length / 2)
    const nextRoundSeeds: number[] = []

    for (let i = 0; i < pairCount; i++) {
      const home = roundSeeds[i]
      const away = roundSeeds[roundSeeds.length - 1 - i]
      const seriesBaseDate = addDays(roundStart, i * 2)
      const matchDates: Date[] = []
      for (let game = 0; game < bestOfLength; game++) {
        const scheduled = addDays(seriesBaseDate, game * 3)
        matchDates.push(applyTimeToDate(scheduled, matchTime))
      }
      plans.push({
        stageName: stageNameForTeams(roundSeeds.length),
        homeClubId: home,
        awayClubId: away,
        matchDateTimes: matchDates
      })
      nextRoundSeeds.push(home)
    }

    if (roundSeeds.length % 2 === 1) {
      const middleSeed = roundSeeds[Math.floor(roundSeeds.length / 2)]
      nextRoundSeeds.push(middleSeed)
    }

    roundSeeds = nextRoundSeeds.sort((a, b) => a - b)
    roundStart = addDays(roundStart, Math.max(7, pairCount > 0 ? 7 : 0))
  }

  return plans
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

  const groupRounds = getGroupStageRounds(input.seriesFormat)
  const pairs = generateRoundRobinPairs(uniqueClubIds, groupRounds)
  const alignedStartDate = alignDateToWeekday(new Date(input.startDateISO), input.matchDayOfWeek)
  const kickoffDate = applyTimeToDate(alignedStartDate, input.matchTime)
  const totalRounds = pairs.reduce((max, pair) => Math.max(max, pair.roundIndex), 0) + (pairs.length ? 1 : 0)

  let seasonEndDate = totalRounds > 0 ? addDays(kickoffDate, (totalRounds - 1) * 7) : kickoffDate
  let playoffPlans: PlayoffSeriesPlan[] = []
  let bestOfLength = 3
  let droppedSeeds = 0

  if (input.seriesFormat === SeriesFormat.BEST_OF_N) {
    const playoffSeeds = [...uniqueClubIds]
    if (playoffSeeds.length % 2 === 1) {
      playoffSeeds.pop()
      droppedSeeds = 1
    }
    if (playoffSeeds.length >= 2) {
      const playoffStart = totalRounds > 0 ? addDays(kickoffDate, totalRounds * 7) : kickoffDate
      const configuredBestOf = input.bestOfLength && input.bestOfLength >= 3 ? input.bestOfLength : 3
      bestOfLength = toOdd(configuredBestOf)
      playoffPlans = createBestOfPlayoffPlans(playoffSeeds, playoffStart, input.matchTime, bestOfLength)
      const latestPlayoff = playoffPlans.reduce<Date | null>((latest, plan) => {
        for (const date of plan.matchDateTimes) {
          if (!latest || date > latest) {
            latest = date
          }
        }
        return latest
      }, null)
      if (latestPlayoff) {
        seasonEndDate = latestPlayoff
      }
    }
  }

  const season = await prisma.$transaction(async (tx) => {
    const createdSeason = await tx.season.create({
      data: {
        competitionId: input.competition.id,
        name: input.seasonName.trim(),
        startDate: kickoffDate,
        endDate: seasonEndDate
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
      matchesCreated += result.count
    }

    let seriesCreated = 0
    if (playoffPlans.length) {
      for (const plan of playoffPlans) {
        const series = await tx.matchSeries.create({
          data: {
            seasonId: createdSeason.id,
            stageName: plan.stageName,
            homeClubId: plan.homeClubId,
            awayClubId: plan.awayClubId,
            seriesStatus: SeriesStatus.IN_PROGRESS
          }
        })
        seriesCreated += 1

        const seriesMatches = plan.matchDateTimes.map((date, index) => ({
          seasonId: createdSeason.id,
          matchDateTime: date,
          homeTeamId: index % 2 === 0 ? plan.homeClubId : plan.awayClubId,
          awayTeamId: index % 2 === 0 ? plan.awayClubId : plan.homeClubId,
          status: MatchStatus.SCHEDULED,
          seriesId: series.id,
          seriesMatchNumber: index + 1
        }))

        if (seriesMatches.length) {
          const created = await tx.match.createMany({ data: seriesMatches })
          matchesCreated += created.count
        }
      }
    }

    logger.info({
      seasonId: createdSeason.id,
      participantsCreated,
      matchesCreated,
      rosterEntriesCreated,
      seriesCreated,
      bestOfLength,
      droppedSeeds
    }, 'season automation completed')

    return {
      season: createdSeason,
      stats: {
        participantsCreated,
        matchesCreated,
        rosterEntriesCreated,
        seriesCreated
      }
    }
  })

  return {
    seasonId: season.season.id,
    participantsCreated: season.stats.participantsCreated,
    matchesCreated: season.stats.matchesCreated,
    rosterEntriesCreated: season.stats.rosterEntriesCreated,
    seriesCreated: season.stats.seriesCreated
  }
}
