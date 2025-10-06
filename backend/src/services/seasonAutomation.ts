import { Competition, MatchStatus, Prisma, PrismaClient, RoundType, SeriesFormat, SeriesStatus } from '@prisma/client'
import { FastifyBaseLogger } from 'fastify'

type ClubId = number

type RoundRobinPair = {
  roundIndex: number
  homeClubId: ClubId
  awayClubId: ClubId
}

type GroupStageSlotInput = {
  position: number
  clubId: ClubId
}

type GroupStageGroupInput = {
  groupIndex: number
  label: string
  qualifyCount: number
  slots: GroupStageSlotInput[]
}

type GroupStageConfigInput = {
  groupCount: number
  groupSize: number
  qualifyCount: number
  groups: GroupStageGroupInput[]
}

type ValidatedGroupStage = {
  groupSize: number
  groups: GroupStageGroupInput[]
  clubIds: ClubId[]
}

const validateGroupStageConfig = (config?: GroupStageConfigInput): ValidatedGroupStage => {
  if (!config) {
    throw new Error('group_stage_missing')
  }
  const { groupCount, groupSize, groups } = config
  if (!Number.isFinite(groupCount) || groupCount <= 0) {
    throw new Error('group_stage_invalid_count')
  }
  if (!Number.isFinite(groupSize) || groupSize < 2) {
    throw new Error('group_stage_invalid_size')
  }
  if (!Array.isArray(groups) || groups.length !== groupCount) {
    throw new Error('group_stage_count_mismatch')
  }

  const normalizedGroups = [...groups].sort((a, b) => a.groupIndex - b.groupIndex)
  const seenGroupIndexes = new Set<number>()
  const seenClubIds = new Set<number>()
  const allClubIds: number[] = []

  normalizedGroups.forEach((group, index) => {
    if (!Number.isFinite(group.groupIndex) || group.groupIndex < 1) {
      throw new Error('group_stage_invalid_index')
    }
    if (seenGroupIndexes.has(group.groupIndex)) {
      throw new Error('group_stage_duplicate_index')
    }
    seenGroupIndexes.add(group.groupIndex)

    if (!group.label || !group.label.trim()) {
      throw new Error('group_stage_label_required')
    }

    if (!Array.isArray(group.slots) || group.slots.length !== groupSize) {
      throw new Error('group_stage_slot_count')
    }

    if (!Number.isFinite(group.qualifyCount) || group.qualifyCount < 1 || group.qualifyCount > groupSize) {
      throw new Error('group_stage_invalid_qualify')
    }

    const seenPositions = new Set<number>()
    group.slots.forEach((slot) => {
      if (!Number.isFinite(slot.position) || slot.position < 1 || slot.position > groupSize) {
        throw new Error('group_stage_invalid_slot_position')
      }
      if (seenPositions.has(slot.position)) {
        throw new Error('group_stage_duplicate_slot_position')
      }
      seenPositions.add(slot.position)

      if (!Number.isFinite(slot.clubId) || slot.clubId <= 0) {
        throw new Error('group_stage_slot_club_required')
      }
      if (seenClubIds.has(slot.clubId)) {
        throw new Error('group_stage_duplicate_club')
      }
      seenClubIds.add(slot.clubId)
      allClubIds.push(slot.clubId)
    })

    // Поддерживаем непрерывность индексов групп (1..groupCount)
    if (index === 0 && group.groupIndex !== 1) {
      throw new Error('group_stage_index_range')
    }
    if (index > 0) {
      const previous = normalizedGroups[index - 1].groupIndex
      if (group.groupIndex !== previous + 1) {
        throw new Error('group_stage_index_range')
      }
    }
  })

  if (seenClubIds.size !== groupCount * groupSize) {
    throw new Error('group_stage_incomplete')
  }

  return {
    groupSize,
    groups: normalizedGroups,
    clubIds: allClubIds
  }
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
  groupStage?: GroupStageConfigInput
}

export type SeasonAutomationResult = {
  seasonId: number
  matchesCreated: number
  participantsCreated: number
  rosterEntriesCreated: number
  seriesCreated: number
  groupsCreated: number
  groupSlotsCreated: number
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
  if (format === ('PLAYOFF_BRACKET' as SeriesFormat)) {
    return 0
  }
  switch (format) {
    case SeriesFormat.TWO_LEGGED:
      return 2
    case SeriesFormat.DOUBLE_ROUND_PLAYOFF:
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

export const stageNameForTeams = (teamCount: number): string => {
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

type InitialPlayoffPlanResult = {
  plans: PlayoffSeriesPlan[]
  byeClubId?: number
}

export const createInitialPlayoffPlans = (
  seeds: number[],
  startDate: Date,
  matchTime: string | null | undefined,
  bestOfLength: number
): InitialPlayoffPlanResult => {
  if (seeds.length < 2) {
    return { plans: [] }
  }

  const sortedSeeds = [...seeds]
  const hasBye = sortedSeeds.length % 2 === 1
  const eliminatedClubId = hasBye ? sortedSeeds.pop() : undefined
  const stageTeamsCount = sortedSeeds.length
  if (stageTeamsCount < 2) {
    return { plans: [], byeClubId: eliminatedClubId }
  }

  const stageName = stageNameForTeams(stageTeamsCount)
  const plans: PlayoffSeriesPlan[] = []

  let left = 0
  let right = sortedSeeds.length - 1
  let slotIndex = 0

  while (left < right) {
    const homeClubId = sortedSeeds[left]
    const awayClubId = sortedSeeds[right]
    const seriesBaseDate = addDays(startDate, slotIndex * 2)
    const matchDates: Date[] = []
    for (let game = 0; game < bestOfLength; game++) {
      const scheduled = addDays(seriesBaseDate, game * 3)
      matchDates.push(applyTimeToDate(scheduled, matchTime))
    }
    plans.push({
      stageName,
      homeClubId,
      awayClubId,
      matchDateTimes: matchDates
    })

    left += 1
    right -= 1
    slotIndex += 1
  }

  const result: InitialPlayoffPlanResult = { plans }
  if (hasBye && eliminatedClubId !== undefined) {
    result.byeClubId = eliminatedClubId
  }

  return result
}

const shuffleNumbers = (values: number[]): number[] => {
  const arr = [...values]
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

export const createRandomPlayoffPlans = (
  clubIds: number[],
  startDate: Date,
  matchTime: string | null | undefined,
  bestOfLength = 1,
  options?: { shuffle?: boolean }
): InitialPlayoffPlanResult => {
  if (clubIds.length < 2) {
    return { plans: [], byeClubId: clubIds[0] }
  }

  const shouldShuffle = options?.shuffle !== false
  const ordered = shouldShuffle ? shuffleNumbers(clubIds) : [...clubIds]
  const hasBye = ordered.length % 2 === 1
  const stageTeamsCount = hasBye ? ordered.length - 1 : ordered.length

  if (stageTeamsCount < 2) {
    const byeClubId = hasBye ? ordered[ordered.length - 1] : undefined
    return { plans: [], byeClubId }
  }

  const stageName = stageNameForTeams(stageTeamsCount)
  const plans: PlayoffSeriesPlan[] = []

  for (let index = 0; index < stageTeamsCount; index += 2) {
    const homeClubId = ordered[index]
    const awayClubId = ordered[index + 1]
    const seriesBaseDate = addDays(startDate, Math.floor(index / 2) * 2)
    const matchDates: Date[] = []
    for (let game = 0; game < bestOfLength; game += 1) {
      const scheduled = addDays(seriesBaseDate, game * 3)
      matchDates.push(applyTimeToDate(scheduled, matchTime))
    }
    plans.push({ stageName, homeClubId, awayClubId, matchDateTimes: matchDates })
  }

  const result: InitialPlayoffPlanResult = { plans }
  if (hasBye) {
    result.byeClubId = ordered[ordered.length - 1]
  }

  return result
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

export const applyTimeToDate = (date: Date, time?: string | null): Date => {
  if (!time) return date
  const match = /^([0-2]\d):([0-5]\d)$/.exec(time.trim())
  if (!match) return date
  const hours = Number(match[1])
  const minutes = Number(match[2])
  const withTime = new Date(date)
  withTime.setUTCHours(hours, minutes, 0, 0)
  return withTime
}

export const addDays = (date: Date, days: number): Date => {
  const next = new Date(date)
  next.setUTCDate(next.getUTCDate() + days)
  return next
}

export const runSeasonAutomation = async (
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
  input: SeasonAutomationInput
): Promise<SeasonAutomationResult> => {
  const isGroupStageFormat = input.seriesFormat === (SeriesFormat.GROUP_SINGLE_ROUND_PLAYOFF as SeriesFormat)
  const validatedGroupStage = isGroupStageFormat ? validateGroupStageConfig(input.groupStage) : undefined

  const sourceClubIds = isGroupStageFormat ? validatedGroupStage!.clubIds : input.clubIds
  const uniqueClubIds = ensureUniqueClubs(sourceClubIds)
  if (uniqueClubIds.length < 2) {
    throw new Error('not_enough_participants')
  }

  const groupRounds = isGroupStageFormat ? 0 : getGroupStageRounds(input.seriesFormat)
  const pairs = isGroupStageFormat ? [] : generateRoundRobinPairs(uniqueClubIds, groupRounds)
  const alignedStartDate = alignDateToWeekday(new Date(input.startDateISO), input.matchDayOfWeek)
  const kickoffDate = applyTimeToDate(alignedStartDate, input.matchTime)
  const totalRounds = isGroupStageFormat
    ? 0
    : pairs.reduce((max, pair) => Math.max(max, pair.roundIndex), 0) + (pairs.length ? 1 : 0)

  const seasonEndDate = totalRounds > 0 ? addDays(kickoffDate, (totalRounds - 1) * 7) : kickoffDate

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

    if (participantsData.length) {
      const statsPayload = uniqueClubIds.map((clubId) => ({
        seasonId: createdSeason.id,
        clubId,
        points: 0,
        wins: 0,
        losses: 0,
        goalsFor: 0,
        goalsAgainst: 0
      }))
      await tx.clubSeasonStats.createMany({ data: statsPayload, skipDuplicates: true })
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

    const isRandomPlayoff = input.seriesFormat === ('PLAYOFF_BRACKET' as SeriesFormat)
    const roundIndexToId = new Map<number, number>()
    if (!isGroupStageFormat && !isRandomPlayoff && totalRounds > 0) {
      for (let roundIndex = 0; roundIndex < totalRounds; roundIndex += 1) {
        const label = `${roundIndex + 1} тур`
        const existing = await tx.seasonRound.findFirst({
          where: { seasonId: createdSeason.id, label }
        })
        const round =
          existing ??
          (await tx.seasonRound.create({
            data: {
              seasonId: createdSeason.id,
              roundType: RoundType.REGULAR,
              roundNumber: roundIndex + 1,
              label
            }
          }))
        roundIndexToId.set(roundIndex, round.id)
      }
    }

    let matchesCreated = 0
    let seriesCreated = 0
    let groupsCreated = 0
    let groupSlotsCreated = 0
    const bracketByeClubIds: number[] = []

    if (isGroupStageFormat && validatedGroupStage) {
      const groupStageResult = await createGroupStageSchedule(tx, {
        seasonId: createdSeason.id,
        seasonStart: kickoffDate,
        matchTime: input.matchTime ?? null,
        groups: validatedGroupStage.groups
      })
      matchesCreated += groupStageResult.matchesCreated
      groupsCreated += groupStageResult.groupsCreated
      groupSlotsCreated += groupStageResult.groupSlotsCreated

      if (groupStageResult.lastMatchDate && groupStageResult.lastMatchDate > createdSeason.endDate) {
        await tx.season.update({ where: { id: createdSeason.id }, data: { endDate: groupStageResult.lastMatchDate } })
        createdSeason.endDate = groupStageResult.lastMatchDate
      }
    } else if (isRandomPlayoff) {
      const { plans, byeClubId } = createRandomPlayoffPlans(uniqueClubIds, kickoffDate, input.matchTime, 1)
      if (byeClubId) {
        bracketByeClubIds.push(byeClubId)
      }
      let latestMatchDate: Date | null = null

      for (const plan of plans) {
        let playoffRound = await tx.seasonRound.findFirst({
          where: { seasonId: createdSeason.id, label: plan.stageName }
        })
        if (!playoffRound) {
          playoffRound = await tx.seasonRound.create({
            data: {
              seasonId: createdSeason.id,
              roundType: RoundType.PLAYOFF,
              roundNumber: null,
              label: plan.stageName
            }
          })
        }

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

        const seriesMatches = plan.matchDateTimes.map((date, index) => {
          if (!latestMatchDate || date > latestMatchDate) {
            latestMatchDate = date
          }
          return {
            seasonId: createdSeason.id,
            matchDateTime: date,
            homeTeamId: plan.homeClubId,
            awayTeamId: plan.awayClubId,
            status: MatchStatus.SCHEDULED,
            seriesId: series.id,
            seriesMatchNumber: index + 1,
            roundId: playoffRound?.id ?? null
          }
        })

        if (seriesMatches.length) {
          const result = await tx.match.createMany({ data: seriesMatches })
          matchesCreated += result.count
        }
      }

      if (byeClubId) {
        const fallbackStage = plans[0]?.stageName ?? stageNameForTeams(Math.max(2, uniqueClubIds.length - 1))
        await tx.matchSeries.create({
          data: {
            seasonId: createdSeason.id,
            stageName: fallbackStage,
            homeClubId: byeClubId,
            awayClubId: byeClubId,
            seriesStatus: SeriesStatus.FINISHED,
            winnerClubId: byeClubId
          }
        })
        seriesCreated += 1
      }

      if (latestMatchDate) {
        await tx.season.update({ where: { id: createdSeason.id }, data: { endDate: latestMatchDate } })
        createdSeason.endDate = latestMatchDate
      }
    } else {
      const matchPayload = pairs.map((pair) => {
        const matchDate = addDays(kickoffDate, pair.roundIndex * 7)
        return {
          seasonId: createdSeason.id,
          matchDateTime: matchDate,
          homeTeamId: pair.homeClubId,
          awayTeamId: pair.awayClubId,
          status: MatchStatus.SCHEDULED,
          roundId: roundIndexToId.get(pair.roundIndex) ?? null
        }
      })

      if (matchPayload.length) {
        const result = await tx.match.createMany({ data: matchPayload })
        matchesCreated += result.count
      }
    }

    logger.info(
      {
        seasonId: createdSeason.id,
        participantsCreated,
        matchesCreated,
        rosterEntriesCreated,
        seriesCreated,
        groupsCreated,
        groupSlotsCreated,
        format: input.seriesFormat,
        byeClubIds: bracketByeClubIds
      },
      'season automation completed'
    )

    return {
      season: createdSeason,
      stats: {
        participantsCreated,
        matchesCreated,
        rosterEntriesCreated,
        seriesCreated,
        groupsCreated,
        groupSlotsCreated
      }
    }
  })

  return {
    seasonId: season.season.id,
    participantsCreated: season.stats.participantsCreated,
    matchesCreated: season.stats.matchesCreated,
    rosterEntriesCreated: season.stats.rosterEntriesCreated,
    seriesCreated: season.stats.seriesCreated,
    groupsCreated: season.stats.groupsCreated,
    groupSlotsCreated: season.stats.groupSlotsCreated
  }
}

type GroupStageCreationResult = {
  matchesCreated: number
  groupsCreated: number
  groupSlotsCreated: number
  lastMatchDate: Date | null
}

const createGroupStageSchedule = async (
  tx: Prisma.TransactionClient,
  params: {
    seasonId: number
    seasonStart: Date
    matchTime: string | null | undefined
    groups: GroupStageGroupInput[]
  }
): Promise<GroupStageCreationResult> => {
  let matchesCreated = 0
  let groupsCreated = 0
  let groupSlotsCreated = 0
  let latestMatchDate: Date | null = null

  for (const group of params.groups) {
    const seasonGroup = await tx.seasonGroup.create({
      data: {
        seasonId: params.seasonId,
        groupIndex: group.groupIndex,
        label: group.label.trim(),
        qualifyCount: group.qualifyCount
      }
    })
    groupsCreated += 1

    const slotsPayload = group.slots.map((slot) => ({
      groupId: seasonGroup.id,
      position: slot.position,
      clubId: slot.clubId
    }))
    if (slotsPayload.length) {
      const createdSlots = await tx.seasonGroupSlot.createMany({ data: slotsPayload, skipDuplicates: true })
      groupSlotsCreated += createdSlots.count
    }

    const clubIds = group.slots.map((slot) => slot.clubId)
    const pairs = generateRoundRobinPairs(clubIds, 1)
    if (!pairs.length) {
      continue
    }

    const roundCache = new Map<number, number>()
    const matchesPayload: Array<{
      seasonId: number
      matchDateTime: Date
      homeTeamId: number
      awayTeamId: number
      status: MatchStatus
      roundId: number | null
      groupId: number
    }> = []

    for (const pair of pairs) {
      let roundId = roundCache.get(pair.roundIndex) ?? null
      if (!roundId) {
        const round = await tx.seasonRound.create({
          data: {
            seasonId: params.seasonId,
            roundType: RoundType.REGULAR,
            roundNumber: pair.roundIndex + 1,
            label: `${group.label.trim()} — тур ${pair.roundIndex + 1}`,
            groupId: seasonGroup.id
          }
        })
        roundId = round.id
        roundCache.set(pair.roundIndex, roundId)
      }

      const baseDate = addDays(params.seasonStart, pair.roundIndex * 7)
      const scheduled = applyTimeToDate(baseDate, params.matchTime)
      if (!latestMatchDate || scheduled > latestMatchDate) {
        latestMatchDate = scheduled
      }

      matchesPayload.push({
        seasonId: params.seasonId,
        matchDateTime: scheduled,
        homeTeamId: pair.homeClubId,
        awayTeamId: pair.awayClubId,
        status: MatchStatus.SCHEDULED,
        roundId,
        groupId: seasonGroup.id
      })
    }

    if (matchesPayload.length) {
      const result = await tx.match.createMany({ data: matchesPayload })
      matchesCreated += result.count
    }
  }

  return {
    matchesCreated,
    groupsCreated,
    groupSlotsCreated,
    lastMatchDate: latestMatchDate
  }
}

export type PlayoffCreationResult = {
  seriesCreated: number
  matchesCreated: number
  byeClubId?: number
}

export const createSeasonPlayoffs = async (
  prisma: PrismaClient,
  logger: FastifyBaseLogger,
  input: { seasonId: number; bestOfLength?: number }
): Promise<PlayoffCreationResult> => {
  const { seasonId } = input

  return prisma.$transaction(async (tx) => {
    const season = await tx.season.findUnique({
      where: { id: seasonId },
      include: { competition: true }
    })

    if (!season) {
      throw new Error('season_not_found')
    }
    if (
      season.competition.seriesFormat !== SeriesFormat.BEST_OF_N &&
      season.competition.seriesFormat !== SeriesFormat.DOUBLE_ROUND_PLAYOFF
    ) {
      throw new Error('playoffs_not_supported')
    }

    const existingSeries = await tx.matchSeries.count({ where: { seasonId } })
    if (existingSeries > 0) {
      throw new Error('series_already_exist')
    }

    const unfinishedMatches = await tx.match.count({
      where: { seasonId, NOT: { status: MatchStatus.FINISHED } }
    })
    if (unfinishedMatches > 0) {
      throw new Error('matches_not_finished')
    }

    const participants = await tx.seasonParticipant.findMany({
      where: { seasonId },
      include: { club: true }
    })
    if (participants.length < 2) {
      throw new Error('not_enough_participants')
    }

    const stats = await tx.clubSeasonStats.findMany({
      where: { seasonId },
      orderBy: [
        { points: 'desc' },
        { wins: 'desc' },
        { goalsFor: 'desc' },
        { goalsAgainst: 'asc' }
      ]
    })

    const statsMap = new Map<number, (typeof stats)[number]>()
    for (const stat of stats) {
      statsMap.set(stat.clubId, stat)
    }

    for (const participant of participants) {
      if (!statsMap.has(participant.clubId)) {
        const zeroStat = await tx.clubSeasonStats.upsert({
          where: { seasonId_clubId: { seasonId, clubId: participant.clubId } },
          create: {
            seasonId,
            clubId: participant.clubId,
            points: 0,
            wins: 0,
            losses: 0,
            goalsFor: 0,
            goalsAgainst: 0
          },
          update: {}
        })
        statsMap.set(participant.clubId, zeroStat)
      }
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

    const seededClubIds = participants
      .map((participant) => participant.clubId)
      .sort(compareClubs)

  const configuredBestOf = input.bestOfLength && input.bestOfLength >= 3 ? input.bestOfLength : 3
    const bestOfLength = toOdd(configuredBestOf)

    const lastMatch = await tx.match.findFirst({
      where: { seasonId },
      orderBy: { matchDateTime: 'desc' }
    })
    const matchTime = lastMatch ? lastMatch.matchDateTime.toISOString().slice(11, 16) : null
    const playoffStart = addDays(season.endDate, 7)

    const { plans, byeClubId } = createInitialPlayoffPlans(seededClubIds, playoffStart, matchTime, bestOfLength)
    if (plans.length === 0) {
      throw new Error('not_enough_pairs')
    }

    let latestDate: Date | null = null
    let matchesCreated = 0
    let seriesCreated = 0

    for (const plan of plans) {
      let playoffRound = await tx.seasonRound.findFirst({
        where: { seasonId, label: plan.stageName }
      })
      if (!playoffRound) {
        playoffRound = await tx.seasonRound.create({
          data: {
            seasonId,
            roundType: RoundType.PLAYOFF,
            roundNumber: null,
            label: plan.stageName
          }
        })
      }

      const series = await tx.matchSeries.create({
        data: {
          seasonId,
          stageName: plan.stageName,
          homeClubId: plan.homeClubId,
          awayClubId: plan.awayClubId,
          seriesStatus: SeriesStatus.IN_PROGRESS
        }
      })
      seriesCreated += 1

      const seriesMatches = plan.matchDateTimes.map((date, index) => {
        if (!latestDate || date > latestDate) {
          latestDate = date
        }
        return {
          seasonId,
          matchDateTime: date,
          homeTeamId: index % 2 === 0 ? plan.homeClubId : plan.awayClubId,
          awayTeamId: index % 2 === 0 ? plan.awayClubId : plan.homeClubId,
          status: MatchStatus.SCHEDULED,
          seriesId: series.id,
          seriesMatchNumber: index + 1,
          roundId: playoffRound.id
        }
      })

      if (seriesMatches.length) {
        const created = await tx.match.createMany({ data: seriesMatches })
        matchesCreated += created.count
      }
    }

    if (latestDate) {
      await tx.season.update({ where: { id: seasonId }, data: { endDate: latestDate } })
    }

    logger.info({ seasonId, seriesCreated, matchesCreated, byeClubId }, 'playoff series created')

    return {
      seriesCreated,
      matchesCreated,
      byeClubId
    }
  })
}
