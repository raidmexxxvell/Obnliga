import { FastifyBaseLogger } from 'fastify'
import {
  AchievementMetric,
  ClubSeasonStats,
  DisqualificationReason,
  Match,
  MatchEvent,
  MatchEventType,
  MatchSeries,
  MatchStatus,
  PlayerClubCareerStats,
  PredictionResult,
  Prisma,
  RoundType,
  SeriesFormat,
  SeriesStatus
} from '@prisma/client'
import prisma from '../db'
import { defaultCache } from '../cache'
import { addDays, createInitialPlayoffPlans, createRandomPlayoffPlans, stageNameForTeams } from './seasonAutomation'

const YELLOW_CARD_LIMIT = 4
const RED_CARD_BAN_MATCHES = 1

export async function handleMatchFinalization(matchId: bigint, logger: FastifyBaseLogger) {
  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      season: { include: { competition: true } },
      events: true,
      lineups: true,
      series: { include: { matches: true } },
      predictions: { include: { user: { include: { achievements: true } } } }
    }
  })

  if (!match) {
    logger.warn({ matchId: matchId.toString() }, 'handleMatchFinalization: match not found')
    return
  }

  if (match.status !== MatchStatus.FINISHED) {
    logger.info({ matchId: matchId.toString(), status: match.status }, 'match not finished, skip aggregation')
    return
  }

  const seasonId = match.seasonId
  await prisma.$transaction(async (tx) => {
    const includePlayoffRounds = match.season.competition.seriesFormat === ('PLAYOFF_BRACKET' as SeriesFormat)
    await rebuildClubSeasonStats(seasonId, tx, { includePlayoffRounds })
    await rebuildPlayerSeasonStats(seasonId, tx)
    await rebuildPlayerCareerStats(seasonId, tx)
    await processDisqualifications(match, tx)
    await updatePredictions(match, tx)
    await updateSeriesState(match, tx, logger)
  })

  // invalidate caches related to season/club summaries
  const cacheKeys = [
    `season:${seasonId}:club-stats`,
    `season:${seasonId}:player-stats`,
    `season:${seasonId}:player-career`,
    `competition:${match.season.competitionId}:club-stats`,
    `competition:${match.season.competitionId}:player-stats`,
    `match:${matchId.toString()}`
  ]
  await Promise.all(cacheKeys.map((key) => defaultCache.invalidate(key).catch(() => undefined)))
}

type PrismaTx = Prisma.TransactionClient

async function rebuildClubSeasonStats(
  seasonId: number,
  tx: PrismaTx,
  options?: { includePlayoffRounds?: boolean }
) {
  const includePlayoffRounds = options?.includePlayoffRounds ?? false

  const finishedMatches = await tx.match.findMany({
    where: {
      seasonId,
      status: MatchStatus.FINISHED,
      ...(includePlayoffRounds
        ? {}
        : {
            OR: [{ roundId: null }, { round: { roundType: RoundType.REGULAR } }]
          })
    },
    select: {
      homeTeamId: true,
      awayTeamId: true,
      homeScore: true,
      awayScore: true
    }
  })

  const totals = new Map<number, ClubSeasonStats>()

  for (const m of finishedMatches) {
    const homeEntry = totals.get(m.homeTeamId) ?? newClubSeasonStats(seasonId, m.homeTeamId)
    const awayEntry = totals.get(m.awayTeamId) ?? newClubSeasonStats(seasonId, m.awayTeamId)

    homeEntry.goalsFor += m.homeScore
    homeEntry.goalsAgainst += m.awayScore
    awayEntry.goalsFor += m.awayScore
    awayEntry.goalsAgainst += m.homeScore

    if (m.homeScore > m.awayScore) {
      homeEntry.points += 3
      homeEntry.wins += 1
      awayEntry.losses += 1
    } else if (m.homeScore < m.awayScore) {
      awayEntry.points += 3
      awayEntry.wins += 1
      homeEntry.losses += 1
    } else {
      homeEntry.points += 1
      awayEntry.points += 1
    }

    totals.set(m.homeTeamId, homeEntry)
    totals.set(m.awayTeamId, awayEntry)
  }

  const participants = await tx.seasonParticipant.findMany({
    where: { seasonId },
    select: { clubId: true }
  })

  for (const participant of participants) {
    if (!totals.has(participant.clubId)) {
      totals.set(participant.clubId, newClubSeasonStats(seasonId, participant.clubId))
    }
  }

  const clubIds = Array.from(totals.keys())
  await tx.clubSeasonStats.deleteMany({ where: { seasonId, clubId: { notIn: clubIds } } })

  for (const entry of totals.values()) {
    await tx.clubSeasonStats.upsert({
      where: { seasonId_clubId: { seasonId, clubId: entry.clubId } },
      create: {
        seasonId,
        clubId: entry.clubId,
        points: entry.points,
        wins: entry.wins,
        losses: entry.losses,
        goalsFor: entry.goalsFor,
        goalsAgainst: entry.goalsAgainst
      },
      update: {
        points: entry.points,
        wins: entry.wins,
        losses: entry.losses,
        goalsFor: entry.goalsFor,
        goalsAgainst: entry.goalsAgainst
      }
    })
  }
}

function newClubSeasonStats(seasonId: number, clubId: number): ClubSeasonStats {
  return {
    seasonId,
    clubId,
    points: 0,
    wins: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    updatedAt: new Date()
  }
}

async function rebuildPlayerSeasonStats(seasonId: number, tx: PrismaTx) {
  const events = await tx.matchEvent.findMany({
    where: {
      match: { seasonId, status: MatchStatus.FINISHED }
    },
    select: {
      matchId: true,
      playerId: true,
      relatedPlayerId: true,
      teamId: true,
      eventType: true
    }
  })

  const statsMap = new Map<
    number,
    {
      clubId: number
      goals: number
      penaltyGoals: number
      assists: number
      yellow: number
      red: number
      matches: number
    }
  >()
  const eventMatchesMap = new Map<number, Set<bigint>>()

  for (const ev of events) {
    const primary =
      statsMap.get(ev.playerId) ??
      { clubId: ev.teamId, goals: 0, penaltyGoals: 0, assists: 0, yellow: 0, red: 0, matches: 0 }
    primary.clubId = ev.teamId
    if (ev.eventType === MatchEventType.GOAL || ev.eventType === MatchEventType.PENALTY_GOAL) {
      primary.goals += 1
      if (ev.eventType === MatchEventType.PENALTY_GOAL) {
        primary.penaltyGoals += 1
      }
    }
    if (ev.eventType === MatchEventType.YELLOW_CARD) {
      primary.yellow += 1
    }
    if (ev.eventType === MatchEventType.RED_CARD) {
      primary.red += 1
    }
    statsMap.set(ev.playerId, primary)

    const playerMatches = eventMatchesMap.get(ev.playerId) ?? new Set<bigint>()
    playerMatches.add(ev.matchId)
    eventMatchesMap.set(ev.playerId, playerMatches)

    if (
      (ev.eventType === MatchEventType.GOAL || ev.eventType === MatchEventType.PENALTY_GOAL) &&
      ev.relatedPlayerId
    ) {
      const assist =
        statsMap.get(ev.relatedPlayerId) ??
        { clubId: ev.teamId, goals: 0, penaltyGoals: 0, assists: 0, yellow: 0, red: 0, matches: 0 }
      assist.clubId = ev.teamId
      assist.assists += 1
      statsMap.set(ev.relatedPlayerId, assist)

      const assistMatches = eventMatchesMap.get(ev.relatedPlayerId) ?? new Set<bigint>()
      assistMatches.add(ev.matchId)
      eventMatchesMap.set(ev.relatedPlayerId, assistMatches)
    }
  }

  const lineupAggregates = await tx.matchLineup.groupBy({
    by: ['personId', 'clubId'],
    where: {
      match: { seasonId, status: MatchStatus.FINISHED }
    },
    _count: { matchId: true }
  })

  for (const lineup of lineupAggregates) {
    const entry =
      statsMap.get(lineup.personId) ??
      { clubId: lineup.clubId, goals: 0, penaltyGoals: 0, assists: 0, yellow: 0, red: 0, matches: 0 }
    entry.clubId = lineup.clubId
    entry.matches += lineup._count.matchId ?? 0
    statsMap.set(lineup.personId, entry)
  }

  for (const [personId, matches] of eventMatchesMap.entries()) {
    const entry = statsMap.get(personId)
    if (!entry) continue
    entry.matches = Math.max(entry.matches, matches.size)
    statsMap.set(personId, entry)
  }

  await tx.playerSeasonStats.deleteMany({ where: { seasonId } })

  for (const [personId, entry] of statsMap.entries()) {
    await tx.playerSeasonStats.upsert({
      where: { seasonId_personId: { seasonId, personId } },
      create: {
        seasonId,
        personId,
        clubId: entry.clubId,
        goals: entry.goals,
        penaltyGoals: entry.penaltyGoals,
        assists: entry.assists,
        yellowCards: entry.yellow,
        redCards: entry.red,
        matchesPlayed: entry.matches
      },
      update: {
        clubId: entry.clubId,
        goals: entry.goals,
        penaltyGoals: entry.penaltyGoals,
        assists: entry.assists,
        yellowCards: entry.yellow,
        redCards: entry.red,
        matchesPlayed: entry.matches
      }
    })
  }
}

async function rebuildPlayerCareerStats(seasonId: number, tx: PrismaTx) {
  const participants = await tx.seasonParticipant.findMany({
    where: { seasonId },
    select: { clubId: true }
  })

  const clubIds = Array.from(new Set(participants.map((item) => item.clubId)))
  if (!clubIds.length) return

  await rebuildCareerStatsForClubs(clubIds, tx)
}

export async function rebuildCareerStatsForClubs(clubIds: number[], tx: PrismaTx) {
  if (!clubIds.length) return

  const aggregates = await tx.playerSeasonStats.groupBy({
    by: ['clubId', 'personId'],
    where: { clubId: { in: clubIds } },
    _sum: {
      goals: true,
      penaltyGoals: true,
      assists: true,
      yellowCards: true,
      redCards: true,
      matchesPlayed: true
    }
  })

  await tx.playerClubCareerStats.deleteMany({ where: { clubId: { in: clubIds } } })

  const createdKeys = new Set<string>()

  for (const aggregate of aggregates) {
    const sum = aggregate._sum ?? {}
    const totalGoals = sum.goals ?? 0
    const totalPenaltyGoals = sum.penaltyGoals ?? 0
    const totalAssists = sum.assists ?? 0
    const yellowCards = sum.yellowCards ?? 0
    const redCards = sum.redCards ?? 0
    const totalMatches = sum.matchesPlayed ?? 0

    await tx.playerClubCareerStats.upsert({
      where: {
        personId_clubId: {
          personId: aggregate.personId,
          clubId: aggregate.clubId
        }
      },
      create: {
        personId: aggregate.personId,
        clubId: aggregate.clubId,
        totalGoals,
        penaltyGoals: totalPenaltyGoals,
        totalMatches,
        totalAssists,
        yellowCards,
        redCards
      },
      update: {
        totalGoals,
        penaltyGoals: totalPenaltyGoals,
        totalMatches,
        totalAssists,
        yellowCards,
        redCards
      }
    })

    createdKeys.add(`${aggregate.personId}:${aggregate.clubId}`)
  }

  const rosterLinks = await tx.clubPlayer.findMany({
    where: { clubId: { in: clubIds } },
    select: { clubId: true, personId: true }
  })

  for (const link of rosterLinks) {
    const key = `${link.personId}:${link.clubId}`
    if (createdKeys.has(key)) continue

    await tx.playerClubCareerStats.upsert({
      where: {
        personId_clubId: {
          personId: link.personId,
          clubId: link.clubId
        }
      },
      create: {
        personId: link.personId,
        clubId: link.clubId,
        totalGoals: 0,
        penaltyGoals: 0,
        totalMatches: 0,
        totalAssists: 0,
        yellowCards: 0,
        redCards: 0
      },
      update: {}
    })
  }
}

type MatchWithEvents = Match & { events: Pick<MatchEvent, 'playerId' | 'teamId' | 'eventType'>[] }

async function processDisqualifications(match: MatchWithEvents, tx: PrismaTx) {
  const { homeTeamId, awayTeamId } = match
  const involvedClubs = [homeTeamId, awayTeamId]

  const activeDisquals = await tx.disqualification.findMany({
    where: { isActive: true, clubId: { in: involvedClubs } },
    select: { id: true, matchesMissed: true, banDurationMatches: true }
  })

  for (const dq of activeDisquals) {
    const newMissed = dq.matchesMissed + 1
    await tx.disqualification.update({
      where: { id: dq.id },
      data: {
        matchesMissed: newMissed,
        isActive: newMissed >= dq.banDurationMatches ? false : true
      }
    })
  }

  for (const ev of match.events) {
    if (ev.eventType === MatchEventType.RED_CARD) {
      const exists = await tx.disqualification.findFirst({
        where: {
          personId: ev.playerId,
          reason: DisqualificationReason.RED_CARD,
          isActive: true
        }
      })
      if (!exists) {
        await tx.disqualification.create({
          data: {
            personId: ev.playerId,
            clubId: ev.teamId,
            reason: DisqualificationReason.RED_CARD,
            sanctionDate: match.matchDateTime,
            banDurationMatches: RED_CARD_BAN_MATCHES,
            matchesMissed: 0,
            isActive: true
          }
        })
      }
    }
  }

  const seasonStats = await tx.playerSeasonStats.findMany({ where: { seasonId: match.seasonId } })
  for (const stat of seasonStats) {
    if (stat.yellowCards >= YELLOW_CARD_LIMIT) {
      const exists = await tx.disqualification.findFirst({
        where: {
          personId: stat.personId,
          reason: DisqualificationReason.ACCUMULATED_CARDS,
          isActive: true
        }
      })
      if (!exists) {
        await tx.disqualification.create({
          data: {
            personId: stat.personId,
            clubId: stat.clubId,
            reason: DisqualificationReason.ACCUMULATED_CARDS,
            sanctionDate: match.matchDateTime,
            banDurationMatches: 1,
            matchesMissed: 0,
            isActive: true
          }
        })
      }
    }
  }
}

type MatchWithPredictions = Match & { predictions: { id: bigint; result1x2: PredictionResult | null; userId: number }[] }

async function updatePredictions(match: MatchWithPredictions, tx: PrismaTx) {
  const result = resolveMatchResult(match)

  for (const prediction of match.predictions) {
    const isCorrect = prediction.result1x2 != null && prediction.result1x2 === result
    await tx.prediction.update({
      where: { id: prediction.id },
      data: {
        isCorrect,
        pointsAwarded: isCorrect ? 3 : 0
      }
    })

    await tx.appUser.update({
      where: { id: prediction.userId },
      data: {
        totalPredictions: {
          increment: 0
        }
      }
    })
  }

  const achievementTypes = await tx.achievementType.findMany()
  if (achievementTypes.length === 0) return

  const usersToCheck = [...new Set(match.predictions.map((p) => p.userId))]
  if (usersToCheck.length === 0) return

  for (const userId of usersToCheck) {
    const user = await tx.appUser.findUnique({
      where: { id: userId },
      include: {
        predictions: true,
        achievements: true
      }
    })
    if (!user) continue

    const correctCount = user.predictions.filter((p) => p.isCorrect).length
    const totalPredictions = user.predictions.length

    for (const achievement of achievementTypes) {
      let achieved = false
      if (achievement.metric === AchievementMetric.TOTAL_PREDICTIONS) {
        achieved = totalPredictions >= achievement.requiredValue
      } else if (achievement.metric === AchievementMetric.CORRECT_PREDICTIONS) {
        achieved = correctCount >= achievement.requiredValue
      }

      if (achieved) {
        const already = user.achievements.find((ua) => ua.achievementTypeId === achievement.id)
        if (!already) {
          await tx.userAchievement.create({
            data: {
              userId,
              achievementTypeId: achievement.id,
              achievedDate: new Date()
            }
          })
        }
      }
    }
  }
}

function resolveMatchResult(match: Match): PredictionResult | null {
  if (match.homeScore > match.awayScore) return PredictionResult.ONE
  if (match.homeScore < match.awayScore) return PredictionResult.TWO
  return PredictionResult.DRAW
}

type SeriesMatch = Match & {
  season: { competition: { seriesFormat: SeriesFormat } }
  series: (MatchSeries & { matches: Match[] }) | null
}

async function updateSeriesState(match: SeriesMatch, tx: PrismaTx, logger: FastifyBaseLogger) {
  if (!match.seriesId) return

  const series = await tx.matchSeries.findUnique({
    where: { id: match.seriesId },
    include: {
      season: { include: { competition: true } },
      matches: {
        orderBy: { seriesMatchNumber: 'asc' }
      }
    }
  })

  if (!series) return
  if (series.seriesStatus === SeriesStatus.FINISHED) return

  const format = series.season.competition.seriesFormat

  if (format === SeriesFormat.BEST_OF_N) {
    const scheduledMatches = series.matches
    const finishedMatches = scheduledMatches.filter((m) => m.status === MatchStatus.FINISHED)
    if (finishedMatches.length === 0) return
    const totalPlannedMatches = scheduledMatches.length

    let winnerClubId: number | null = null
    {
      let homeWins = 0
      let awayWins = 0
      for (const m of finishedMatches) {
        if (m.homeScore > m.awayScore) {
          if (m.homeTeamId === series.homeClubId) homeWins += 1
          else awayWins += 1
        } else if (m.homeScore < m.awayScore) {
          if (m.awayTeamId === series.homeClubId) homeWins += 1
          else awayWins += 1
        }
      }
      const requiredWins = Math.floor(totalPlannedMatches / 2) + 1
      if (homeWins >= requiredWins) winnerClubId = series.homeClubId
      if (awayWins >= requiredWins) winnerClubId = series.awayClubId
    }

    if (winnerClubId != null) {
      await tx.matchSeries.update({
        where: { id: series.id },
        data: {
          seriesStatus: SeriesStatus.FINISHED,
          winnerClubId
        }
      })

      await tx.match.deleteMany({
        where: {
          seriesId: series.id,
          status: {
            in: [MatchStatus.SCHEDULED, MatchStatus.LIVE, MatchStatus.POSTPONED]
          }
        }
      })

      await maybeCreateNextPlayoffStage(tx, {
        seasonId: series.seasonId,
        currentStageName: series.stageName,
        bestOfLength: totalPlannedMatches,
        format,
        logger
      })
    }
    return
  }

  if (format === ('PLAYOFF_BRACKET' as SeriesFormat)) {
    if (match.homeScore === match.awayScore) {
      logger.warn(
        {
          matchId: match.id.toString(),
          seriesId: series.id,
          stage: series.stageName
        },
        'playoff bracket match finished in draw, unable to determine winner automatically'
      )
      return
    }

    const winnerClubId = match.homeScore > match.awayScore ? match.homeTeamId : match.awayTeamId

    await tx.matchSeries.update({
      where: { id: series.id },
      data: {
        seriesStatus: SeriesStatus.FINISHED,
        winnerClubId
      }
    })

    await tx.match.deleteMany({
      where: {
        seriesId: series.id,
        status: {
          in: [MatchStatus.SCHEDULED, MatchStatus.LIVE, MatchStatus.POSTPONED]
        }
      }
    })

    await maybeCreateNextPlayoffStage(tx, {
      seasonId: series.seasonId,
      currentStageName: series.stageName,
      bestOfLength: 1,
      format,
      logger
    })
  }
}

type PlayoffProgressionContext = {
  seasonId: number
  currentStageName: string
  bestOfLength: number
  format: SeriesFormat
  logger: FastifyBaseLogger
}

async function maybeCreateNextPlayoffStage(tx: PrismaTx, context: PlayoffProgressionContext) {
  const stageSeries = await tx.matchSeries.findMany({
    where: { seasonId: context.seasonId, stageName: context.currentStageName },
    orderBy: { createdAt: 'asc' }
  })

  if (!stageSeries.length) return
  if (stageSeries.some((item) => item.seriesStatus !== SeriesStatus.FINISHED)) return

  const orderedWinners = stageSeries
    .map((item) => item.winnerClubId)
    .filter((clubId): clubId is number => typeof clubId === 'number')

  const uniqueWinners: number[] = []
  for (const clubId of orderedWinners) {
    if (!uniqueWinners.includes(clubId)) {
      uniqueWinners.push(clubId)
    }
  }

  if (uniqueWinners.length < 2) return

  if (context.format === SeriesFormat.BEST_OF_N) {
    const stats = await tx.clubSeasonStats.findMany({ where: { seasonId: context.seasonId } })
    const statsMap = new Map<number, (typeof stats)[number]>()
    for (const stat of stats) {
      statsMap.set(stat.clubId, stat)
    }

    const compareClubs = (left: number, right: number): number => {
      const l = statsMap.get(left) ?? {
        points: 0,
        wins: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0
      }
      const r = statsMap.get(right) ?? {
        points: 0,
        wins: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0
      }
      if (l.points !== r.points) return r.points - l.points
      if (l.wins !== r.wins) return r.wins - l.wins
      const lDiff = l.goalsFor - l.goalsAgainst
      const rDiff = r.goalsFor - r.goalsAgainst
      if (lDiff !== rDiff) return rDiff - lDiff
      if (l.goalsFor !== r.goalsFor) return r.goalsFor - l.goalsFor
      return l.goalsAgainst - r.goalsAgainst
    }

    const seededWinners = [...uniqueWinners].sort(compareClubs)
    if (seededWinners.length < 2) return

    const nextStageName = stageNameForTeams(seededWinners.length)
    const existingNextStage = await tx.matchSeries.count({
      where: { seasonId: context.seasonId, stageName: nextStageName }
    })

    if (existingNextStage > 0) return

    const latestMatch = await tx.match.findFirst({
      where: { seasonId: context.seasonId },
      orderBy: { matchDateTime: 'desc' }
    })

    const matchTime = latestMatch ? latestMatch.matchDateTime.toISOString().slice(11, 16) : null
    const startDate = latestMatch ? addDays(latestMatch.matchDateTime, 7) : new Date()

    const { plans, byeClubId } = createInitialPlayoffPlans(
      seededWinners,
      startDate,
      matchTime,
      context.bestOfLength
    )

    if (plans.length === 0 && !byeClubId) return

    let latestDate: Date | null = latestMatch?.matchDateTime ?? null
    let createdSeries = 0
    let createdMatches = 0

    for (const plan of plans) {
      let playoffRound = await tx.seasonRound.findFirst({
        where: { seasonId: context.seasonId, label: plan.stageName }
      })
      if (!playoffRound) {
        playoffRound = await tx.seasonRound.create({
          data: {
            seasonId: context.seasonId,
            roundType: RoundType.PLAYOFF,
            roundNumber: null,
            label: plan.stageName
          }
        })
      }

      const series = await tx.matchSeries.create({
        data: {
          seasonId: context.seasonId,
          stageName: plan.stageName,
          homeClubId: plan.homeClubId,
          awayClubId: plan.awayClubId,
          seriesStatus: SeriesStatus.IN_PROGRESS
        }
      })
      createdSeries += 1

      const matches = plan.matchDateTimes.map((date, index) => {
        if (!latestDate || date > latestDate) {
          latestDate = date
        }
        return {
          seasonId: context.seasonId,
          matchDateTime: date,
          homeTeamId: index % 2 === 0 ? plan.homeClubId : plan.awayClubId,
          awayTeamId: index % 2 === 0 ? plan.awayClubId : plan.homeClubId,
          status: MatchStatus.SCHEDULED,
          seriesId: series.id,
          seriesMatchNumber: index + 1,
          roundId: playoffRound?.id ?? null
        }
      })

      if (matches.length) {
        const created = await tx.match.createMany({ data: matches })
        createdMatches += created.count
      }
    }

    if (latestDate) {
      await tx.season.update({ where: { id: context.seasonId }, data: { endDate: latestDate } })
    }

    context.logger.info(
      {
        seasonId: context.seasonId,
        stageName: nextStageName,
        seriesCreated: createdSeries,
        matchesCreated: createdMatches,
        byeClubId
      },
      'playoff stage progressed'
    )

    return
  }

  if (context.format === ('PLAYOFF_BRACKET' as SeriesFormat)) {
    const nextStageName = stageNameForTeams(uniqueWinners.length)
    const existingNextStage = await tx.matchSeries.count({
      where: { seasonId: context.seasonId, stageName: nextStageName }
    })

    if (existingNextStage > 0) return

    const latestMatch = await tx.match.findFirst({
      where: { seasonId: context.seasonId },
      orderBy: { matchDateTime: 'desc' }
    })

    const matchTime = latestMatch ? latestMatch.matchDateTime.toISOString().slice(11, 16) : null
    const startDate = latestMatch ? addDays(latestMatch.matchDateTime, 7) : new Date()

  const bestOfLength = Math.max(1, context.bestOfLength ?? 1)
    const { plans, byeClubId } = createRandomPlayoffPlans(uniqueWinners, startDate, matchTime, bestOfLength, {
      shuffle: false
    })

    if (plans.length === 0 && !byeClubId) return

    let latestDate: Date | null = latestMatch?.matchDateTime ?? null
    let createdSeries = 0
    let createdMatches = 0

    for (const plan of plans) {
      let playoffRound = await tx.seasonRound.findFirst({
        where: { seasonId: context.seasonId, label: nextStageName }
      })
      if (!playoffRound) {
        playoffRound = await tx.seasonRound.create({
          data: {
            seasonId: context.seasonId,
            roundType: RoundType.PLAYOFF,
            roundNumber: null,
            label: nextStageName
          }
        })
      }

      const series = await tx.matchSeries.create({
        data: {
          seasonId: context.seasonId,
          stageName: nextStageName,
          homeClubId: plan.homeClubId,
          awayClubId: plan.awayClubId,
          seriesStatus: SeriesStatus.IN_PROGRESS
        }
      })
      createdSeries += 1

      const matches = plan.matchDateTimes.map((date, index) => {
        if (!latestDate || date > latestDate) {
          latestDate = date
        }
        return {
          seasonId: context.seasonId,
          matchDateTime: date,
          homeTeamId: plan.homeClubId,
          awayTeamId: plan.awayClubId,
          status: MatchStatus.SCHEDULED,
          seriesId: series.id,
          seriesMatchNumber: index + 1,
          roundId: playoffRound?.id ?? null
        }
      })

      if (matches.length) {
        const created = await tx.match.createMany({ data: matches })
        createdMatches += created.count
      }
    }

    if (byeClubId) {
      await tx.matchSeries.create({
        data: {
          seasonId: context.seasonId,
          stageName: nextStageName,
          homeClubId: byeClubId,
          awayClubId: byeClubId,
          seriesStatus: SeriesStatus.FINISHED,
          winnerClubId: byeClubId
        }
      })
    }

    if (latestDate) {
      await tx.season.update({ where: { id: context.seasonId }, data: { endDate: latestDate } })
    }

    context.logger.info(
      {
        seasonId: context.seasonId,
        stageName: nextStageName,
        seriesCreated: createdSeries + (byeClubId ? 1 : 0),
        matchesCreated: createdMatches,
        byeClubId
      },
      'playoff stage progressed'
    )
  }
}
