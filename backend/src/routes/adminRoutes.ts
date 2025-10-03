import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import prisma from '../db'
import jwt from 'jsonwebtoken'
import { timingSafeEqual } from 'crypto'
import {
  AchievementMetric,
  CompetitionType,
  DisqualificationReason,
  LineupRole,
  MatchEventType,
  MatchStatus,
  PredictionResult,
  Prisma,
  SeriesFormat,
  SeriesStatus
} from '@prisma/client'
import { handleMatchFinalization } from '../services/matchAggregation'
import { runSeasonAutomation } from '../services/seasonAutomation'

declare module 'fastify' {
  interface FastifyRequest {
    admin?: {
      sub: string
      role: string
    }
  }
}

const secureEquals = (left: string, right: string) => {
  const leftBuf = Buffer.from(left)
  const rightBuf = Buffer.from(right)
  if (leftBuf.length !== rightBuf.length) {
    return false
  }
  return timingSafeEqual(leftBuf, rightBuf)
}

const getJwtSecret = () => process.env.JWT_SECRET || process.env.TELEGRAM_BOT_TOKEN || 'admin-dev-secret'

const parseNumericId = (value: string | number | undefined, field: string): number => {
  const numeric = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new Error(`${field}_invalid`)
  }
  return numeric
}

const parseBigIntId = (value: string | number | bigint | undefined, field: string): bigint => {
  try {
    if (typeof value === 'bigint') return value
    if (typeof value === 'number') return BigInt(value)
    return BigInt(value ?? '')
  } catch (err) {
    throw new Error(`${field}_invalid`)
  }
}

const adminAuthHook = async (request: FastifyRequest, reply: FastifyReply) => {
  const authHeader = request.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return reply.status(401).send({ ok: false, error: 'unauthorized' })
  }
  const token = authHeader.slice('Bearer '.length)
  try {
    const payload = jwt.verify(token, getJwtSecret()) as { sub: string; role?: string }
    if (!payload.role || payload.role !== 'admin') {
      return reply.status(403).send({ ok: false, error: 'forbidden' })
    }
    request.admin = { sub: payload.sub, role: payload.role }
  } catch (err) {
    return reply.status(401).send({ ok: false, error: 'invalid_token' })
  }
}

export default async function (server: FastifyInstance) {
  server.post('/api/admin/login', async (request, reply) => {
    const { login, password } = (request.body || {}) as { login?: string; password?: string }

    if (!login || !password) {
      return reply.status(400).send({ ok: false, error: 'login_and_password_required' })
    }

    const expectedLogin = process.env.LOGIN_ADMIN
    const expectedPassword = process.env.PASSWORD_ADMIN

    if (!expectedLogin || !expectedPassword) {
      server.log.error('LOGIN_ADMIN or PASSWORD_ADMIN env variables are not configured')
      return reply.status(503).send({ ok: false, error: 'admin_auth_unavailable' })
    }

    const loginMatches = secureEquals(login, expectedLogin)
    const passwordMatches = secureEquals(password, expectedPassword)

    if (!loginMatches || !passwordMatches) {
      server.log.warn({ login }, 'admin login failed')
      return reply.status(401).send({ ok: false, error: 'invalid_credentials' })
    }

    const token = jwt.sign({ sub: 'admin', role: 'admin' }, getJwtSecret(), {
      expiresIn: '2h',
      issuer: 'obnliga-backend',
      audience: 'admin-dashboard'
    })

    return reply.send({ ok: true, token, expiresIn: 7200 })
  })

  server.post('/api/admin/test-login', async (request, reply) => {
    const headerSecret = (request.headers['x-admin-secret'] || '') as string
    const adminSecret = process.env.ADMIN_SECRET
    if (!adminSecret || headerSecret !== adminSecret) {
      return reply.status(403).send({ error: 'forbidden' })
    }

    const body = request.body as any
    const { userId, username, firstName } = body || {}
    if (!userId) return reply.status(400).send({ error: 'userId required' })

    try {
      const user = await prisma.appUser.upsert({
        where: { id: Number(userId) },
        create: {
          id: Number(userId),
          telegramId: BigInt(userId),
          username,
          firstName
        },
        update: {
          username,
          firstName
        }
      })

      const token = jwt.sign({ sub: String(user.id), role: 'admin-tester' }, getJwtSecret(), { expiresIn: '7d' })
      return reply.send({ ok: true, user, token })
    } catch (err) {
      server.log.error({ err }, 'admin test-login failed')
      return reply.status(500).send({ error: 'internal' })
    }
  })

  server.register(async (admin) => {
    admin.addHook('onRequest', adminAuthHook)

    // Admin profile info
    admin.get('/me', async (request, reply) => {
      return reply.send({ ok: true, admin: request.admin })
    })

    // Clubs CRUD
    admin.get('/clubs', async (_request, reply) => {
      const clubs = await prisma.club.findMany({ orderBy: { name: 'asc' } })
      return reply.send({ ok: true, data: clubs })
    })

    admin.post('/clubs', async (request, reply) => {
      const body = request.body as { name?: string; shortName?: string; logoUrl?: string }
      if (!body?.name || !body?.shortName) {
        return reply.status(400).send({ ok: false, error: 'name_and_short_name_required' })
      }
      const club = await prisma.club.create({
        data: {
          name: body.name.trim(),
          shortName: body.shortName.trim(),
          logoUrl: body.logoUrl?.trim() || null
        }
      })
      return reply.send({ ok: true, data: club })
    })

    admin.put('/clubs/:clubId', async (request, reply) => {
      const clubId = parseNumericId((request.params as any).clubId, 'clubId')
      const body = request.body as { name?: string; shortName?: string; logoUrl?: string }
      try {
        const club = await prisma.club.update({
          where: { id: clubId },
          data: {
            name: body.name?.trim(),
            shortName: body.shortName?.trim(),
            logoUrl: body.logoUrl?.trim()
          }
        })
        return reply.send({ ok: true, data: club })
      } catch (err) {
        request.server.log.error({ err }, 'club update failed')
        return reply.status(500).send({ ok: false, error: 'update_failed' })
      }
    })

    admin.delete('/clubs/:clubId', async (request, reply) => {
      const clubId = parseNumericId((request.params as any).clubId, 'clubId')
      const hasParticipants = await prisma.seasonParticipant.findFirst({ where: { clubId } })
      const hasFinishedMatches = await prisma.match.count({
        where: {
          status: MatchStatus.FINISHED,
          OR: [{ homeTeamId: clubId }, { awayTeamId: clubId }]
        }
      })
      if (hasParticipants) {
        return reply.status(409).send({ ok: false, error: 'club_in_active_season' })
      }
      if (hasFinishedMatches > 0) {
        return reply.status(409).send({ ok: false, error: 'club_in_finished_matches' })
      }
      await prisma.club.delete({ where: { id: clubId } })
      return reply.send({ ok: true })
    })

    admin.get('/clubs/:clubId/players', async (request, reply) => {
      const clubId = parseNumericId((request.params as any).clubId, 'clubId')
      const players = await prisma.clubPlayer.findMany({
        where: { clubId },
        orderBy: [{ defaultShirtNumber: 'asc' }, { personId: 'asc' }],
        include: { person: true }
      })
      return reply.send({ ok: true, data: players })
    })

    admin.put('/clubs/:clubId/players', async (request, reply) => {
      const clubId = parseNumericId((request.params as any).clubId, 'clubId')
      const body = request.body as {
        players?: Array<{ personId?: number; defaultShirtNumber?: number | null }>
      }

      const entries = Array.isArray(body?.players) ? body.players : []
      if (!entries.length) {
        await prisma.clubPlayer.deleteMany({ where: { clubId } })
        return reply.send({ ok: true, data: [] })
      }

      const normalized: Array<{ personId: number; defaultShirtNumber: number | null }> = []
      const seenPersons = new Set<number>()

      for (const entry of entries) {
        if (!entry?.personId || entry.personId <= 0) {
          return reply.status(400).send({ ok: false, error: 'personId_required' })
        }
        if (seenPersons.has(entry.personId)) {
          return reply.status(409).send({ ok: false, error: 'duplicate_person' })
        }
        seenPersons.add(entry.personId)

        const shirtNumber = entry.defaultShirtNumber && entry.defaultShirtNumber > 0 ? Math.floor(entry.defaultShirtNumber) : null
        normalized.push({ personId: entry.personId, defaultShirtNumber: shirtNumber })
      }

      try {
        await prisma.$transaction(async (tx) => {
          await tx.clubPlayer.deleteMany({
            where: { clubId, personId: { notIn: normalized.map((item) => item.personId) } }
          })

          for (const item of normalized) {
            await tx.clubPlayer.upsert({
              where: { clubId_personId: { clubId, personId: item.personId } },
              create: {
                clubId,
                personId: item.personId,
                defaultShirtNumber: item.defaultShirtNumber
              },
              update: {
                defaultShirtNumber: item.defaultShirtNumber
              }
            })
          }
        })
      } catch (err) {
        const prismaErr = err as Prisma.PrismaClientKnownRequestError
        if (prismaErr?.code === 'P2002') {
          return reply.status(409).send({ ok: false, error: 'duplicate_shirt_number' })
        }
        request.server.log.error({ err }, 'club players update failed')
        return reply.status(500).send({ ok: false, error: 'club_players_update_failed' })
      }

      const players = await prisma.clubPlayer.findMany({
        where: { clubId },
        orderBy: [{ defaultShirtNumber: 'asc' }, { personId: 'asc' }],
        include: { person: true }
      })

      return reply.send({ ok: true, data: players })
    })

    // Persons CRUD
    admin.get('/persons', async (request, reply) => {
      const { isPlayer } = request.query as { isPlayer?: string }
      const persons = await prisma.person.findMany({
        where: typeof isPlayer === 'string' ? { isPlayer: isPlayer === 'true' } : undefined,
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }]
      })
      return reply.send({ ok: true, data: persons })
    })

    admin.post('/persons', async (request, reply) => {
      const body = request.body as { firstName?: string; lastName?: string; isPlayer?: boolean }
      if (!body?.firstName || !body?.lastName) {
        return reply.status(400).send({ ok: false, error: 'first_and_last_name_required' })
      }
      const person = await prisma.person.create({
        data: {
          firstName: body.firstName.trim(),
          lastName: body.lastName.trim(),
          isPlayer: body.isPlayer ?? true
        }
      })
      return reply.send({ ok: true, data: person })
    })

    admin.put('/persons/:personId', async (request, reply) => {
      const personId = parseNumericId((request.params as any).personId, 'personId')
      const body = request.body as { firstName?: string; lastName?: string; isPlayer?: boolean }
      try {
        const person = await prisma.person.update({
          where: { id: personId },
          data: {
            firstName: body.firstName?.trim(),
            lastName: body.lastName?.trim(),
            isPlayer: body.isPlayer
          }
        })
        return reply.send({ ok: true, data: person })
      } catch (err) {
        request.server.log.error({ err }, 'person update failed')
        return reply.status(500).send({ ok: false, error: 'update_failed' })
      }
    })

    admin.delete('/persons/:personId', async (request, reply) => {
      const personId = parseNumericId((request.params as any).personId, 'personId')
      const roster = await prisma.seasonRoster.findFirst({ where: { personId } })
      const lineup = await prisma.matchLineup.findFirst({ where: { personId } })
      if (roster || lineup) {
        return reply.status(409).send({ ok: false, error: 'person_has_history' })
      }
      await prisma.person.delete({ where: { id: personId } })
      return reply.send({ ok: true })
    })

    // Stadiums
    admin.get('/stadiums', async (_request, reply) => {
      const stadiums = await prisma.stadium.findMany({ orderBy: { name: 'asc' } })
      return reply.send({ ok: true, data: stadiums })
    })

    admin.post('/stadiums', async (request, reply) => {
      const body = request.body as { name?: string; city?: string }
      if (!body?.name || !body?.city) {
        return reply.status(400).send({ ok: false, error: 'name_and_city_required' })
      }
      const stadium = await prisma.stadium.create({
        data: { name: body.name.trim(), city: body.city.trim() }
      })
      return reply.send({ ok: true, data: stadium })
    })

    admin.put('/stadiums/:stadiumId', async (request, reply) => {
      const stadiumId = parseNumericId((request.params as any).stadiumId, 'stadiumId')
      const body = request.body as { name?: string; city?: string }
      try {
        const stadium = await prisma.stadium.update({
          where: { id: stadiumId },
          data: { name: body.name?.trim(), city: body.city?.trim() }
        })
        return reply.send({ ok: true, data: stadium })
      } catch (err) {
        request.server.log.error({ err }, 'stadium update failed')
        return reply.status(500).send({ ok: false, error: 'update_failed' })
      }
    })

    admin.delete('/stadiums/:stadiumId', async (request, reply) => {
      const stadiumId = parseNumericId((request.params as any).stadiumId, 'stadiumId')
      const hasMatches = await prisma.match.findFirst({ where: { stadiumId } })
      if (hasMatches) {
        return reply.status(409).send({ ok: false, error: 'stadium_used_in_matches' })
      }
      await prisma.stadium.delete({ where: { id: stadiumId } })
      return reply.send({ ok: true })
    })

    // Competitions
    admin.get('/competitions', async (_request, reply) => {
      const competitions = await prisma.competition.findMany({ orderBy: { name: 'asc' } })
      return reply.send({ ok: true, data: competitions })
    })

    admin.post('/competitions', async (request, reply) => {
      const body = request.body as { name?: string; type?: CompetitionType; seriesFormat?: SeriesFormat }
      if (!body?.name || !body?.type || !body?.seriesFormat) {
        return reply.status(400).send({ ok: false, error: 'name_type_series_format_required' })
      }
      const competition = await prisma.competition.create({
        data: {
          name: body.name.trim(),
          type: body.type,
          seriesFormat: body.seriesFormat
        }
      })
      return reply.send({ ok: true, data: competition })
    })

    admin.put('/competitions/:competitionId', async (request, reply) => {
      const competitionId = parseNumericId((request.params as any).competitionId, 'competitionId')
      const body = request.body as { name?: string; type?: CompetitionType; seriesFormat?: SeriesFormat }
      const hasActiveSeason = await prisma.season.findFirst({ where: { competitionId } })
      if (hasActiveSeason && body.seriesFormat && hasActiveSeason) {
        return reply.status(409).send({ ok: false, error: 'series_format_locked' })
      }
      const competition = await prisma.competition.update({
        where: { id: competitionId },
        data: {
          name: body.name?.trim(),
          type: body.type,
          seriesFormat: body.seriesFormat
        }
      })
      return reply.send({ ok: true, data: competition })
    })

    admin.delete('/competitions/:competitionId', async (request, reply) => {
      const competitionId = parseNumericId((request.params as any).competitionId, 'competitionId')
      const hasSeasons = await prisma.season.findFirst({ where: { competitionId } })
      if (hasSeasons) {
        return reply.status(409).send({ ok: false, error: 'competition_in_use' })
      }
      await prisma.competition.delete({ where: { id: competitionId } })
      return reply.send({ ok: true })
    })

    // Seasons & configuration
    admin.get('/seasons', async (_request, reply) => {
      const seasons = await prisma.season.findMany({
        orderBy: [{ startDate: 'desc' }],
        include: {
          competition: true,
          participants: { include: { club: true } },
          rosters: {
            include: {
              person: true,
              club: true
            },
            orderBy: [{ clubId: 'asc' }, { shirtNumber: 'asc' }]
          }
        }
      })
      return reply.send({ ok: true, data: seasons })
    })

    admin.post('/seasons', async (request, reply) => {
      const body = request.body as {
        competitionId?: number
        name?: string
        startDate?: string
        endDate?: string
      }
      if (!body?.competitionId || !body?.name || !body?.startDate || !body?.endDate) {
        return reply.status(400).send({ ok: false, error: 'season_fields_required' })
      }
      const season = await prisma.season.create({
        data: {
          competitionId: body.competitionId,
          name: body.name.trim(),
          startDate: new Date(body.startDate),
          endDate: new Date(body.endDate)
        }
      })
      return reply.send({ ok: true, data: season })
    })

    admin.post('/seasons/auto', async (request, reply) => {
      const body = request.body as {
        competitionId?: number
        seasonName?: string
        startDate?: string
        matchDayOfWeek?: number
        matchTime?: string
        clubIds?: number[]
        roundsPerPair?: number
        copyClubPlayersToRoster?: boolean
        bestOfLength?: number
      }

      if (!body?.competitionId || !body?.seasonName || !body?.startDate || typeof body.matchDayOfWeek !== 'number') {
        return reply.status(400).send({ ok: false, error: 'automation_fields_required' })
      }

      const clubIds = Array.isArray(body.clubIds) ? body.clubIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0) : []
      if (clubIds.length < 2) {
        return reply.status(400).send({ ok: false, error: 'automation_needs_participants' })
      }

      const competition = await prisma.competition.findUnique({ where: { id: body.competitionId } })
      if (!competition) {
        return reply.status(404).send({ ok: false, error: 'competition_not_found' })
      }

      const matchDay = Number(body.matchDayOfWeek)
      const normalizedMatchDay = ((matchDay % 7) + 7) % 7

      try {
        const result = await runSeasonAutomation(prisma, request.log, {
          competition,
          clubIds,
          seasonName: body.seasonName,
          startDateISO: body.startDate,
          matchDayOfWeek: normalizedMatchDay,
          matchTime: body.matchTime,
          roundsPerPair: body.roundsPerPair,
          copyClubPlayersToRoster: body.copyClubPlayersToRoster ?? true,
          bestOfLength: body.bestOfLength
        })

        return reply.send({ ok: true, data: result })
      } catch (err) {
        const error = err as Error & { code?: string }
        request.server.log.error({ err }, 'season automation failed')
        if ((error.message as string) === 'not_enough_participants') {
          return reply.status(400).send({ ok: false, error: 'automation_needs_participants' })
        }
        return reply.status(500).send({ ok: false, error: 'automation_failed' })
      }
    })

    admin.put('/seasons/:seasonId', async (request, reply) => {
      const seasonId = parseNumericId((request.params as any).seasonId, 'seasonId')
      const body = request.body as { name?: string; startDate?: string; endDate?: string }
      const matchesPlayed = await prisma.match.findFirst({
        where: { seasonId, status: MatchStatus.FINISHED }
      })
      if (matchesPlayed && (body.startDate || body.endDate)) {
        return reply.status(409).send({ ok: false, error: 'season_dates_locked' })
      }
      const season = await prisma.season.update({
        where: { id: seasonId },
        data: {
          name: body.name?.trim(),
          startDate: body.startDate ? new Date(body.startDate) : undefined,
          endDate: body.endDate ? new Date(body.endDate) : undefined
        }
      })
      return reply.send({ ok: true, data: season })
    })

    admin.post('/seasons/:seasonId/participants', async (request, reply) => {
      const seasonId = parseNumericId((request.params as any).seasonId, 'seasonId')
      const body = request.body as { clubId?: number }
      if (!body?.clubId) {
        return reply.status(400).send({ ok: false, error: 'clubId_required' })
      }
      try {
        const participant = await prisma.seasonParticipant.create({
          data: { seasonId, clubId: body.clubId }
        })
        return reply.send({ ok: true, data: participant })
      } catch (err) {
        request.server.log.error({ err }, 'season participant create failed')
        return reply.status(409).send({ ok: false, error: 'participant_exists_or_invalid' })
      }
    })

    admin.delete('/seasons/:seasonId/participants/:clubId', async (request, reply) => {
      const { seasonId: seasonParam, clubId: clubParam } = request.params as any
      const seasonId = parseNumericId(seasonParam, 'seasonId')
      const clubId = parseNumericId(clubParam, 'clubId')
      const matchPlayed = await prisma.match.findFirst({ where: { seasonId, OR: [{ homeTeamId: clubId }, { awayTeamId: clubId }] } })
      if (matchPlayed) {
        return reply.status(409).send({ ok: false, error: 'club_already_played' })
      }
      await prisma.seasonParticipant.delete({ where: { seasonId_clubId: { seasonId, clubId } } })
      return reply.send({ ok: true })
    })

    admin.post('/seasons/:seasonId/roster', async (request, reply) => {
      const seasonId = parseNumericId((request.params as any).seasonId, 'seasonId')
      const body = request.body as { clubId?: number; personId?: number; shirtNumber?: number; registrationDate?: string }
      if (!body?.clubId || !body?.personId || !body?.shirtNumber) {
        return reply.status(400).send({ ok: false, error: 'roster_fields_required' })
      }
      const person = await prisma.person.findUnique({ where: { id: body.personId } })
      if (!person?.isPlayer) {
        return reply.status(409).send({ ok: false, error: 'person_is_not_player' })
      }
      const entry = await prisma.seasonRoster.create({
        data: {
          seasonId,
          clubId: body.clubId,
          personId: body.personId,
          shirtNumber: body.shirtNumber,
          registrationDate: body.registrationDate ? new Date(body.registrationDate) : new Date()
        }
      })
      return reply.send({ ok: true, data: entry })
    })

    admin.put('/seasons/:seasonId/roster/:personId', async (request, reply) => {
      const { seasonId: seasonParam, personId: personParam } = request.params as any
      const seasonId = parseNumericId(seasonParam, 'seasonId')
      const personId = parseNumericId(personParam, 'personId')
      const body = request.body as { clubId?: number; shirtNumber?: number }
      if (!body?.clubId || !body?.shirtNumber) {
        return reply.status(400).send({ ok: false, error: 'club_and_shirt_required' })
      }
      const entry = await prisma.seasonRoster.update({
        where: { seasonId_clubId_personId: { seasonId, clubId: body.clubId, personId } },
        data: { shirtNumber: body.shirtNumber }
      })
      return reply.send({ ok: true, data: entry })
    })

    admin.delete('/seasons/:seasonId/roster/:personId', async (request, reply) => {
      const { seasonId: seasonParam, personId: personParam } = request.params as any
      const { clubId: clubQuery } = request.query as { clubId?: string }
      if (!clubQuery) {
        return reply.status(400).send({ ok: false, error: 'clubId_required' })
      }
      const seasonId = parseNumericId(seasonParam, 'seasonId')
      const personId = parseNumericId(personParam, 'personId')
      const clubId = parseNumericId(clubQuery, 'clubId')
      await prisma.seasonRoster.delete({ where: { seasonId_clubId_personId: { seasonId, clubId, personId } } })
      return reply.send({ ok: true })
    })

    // Match series management
    admin.get('/series', async (request, reply) => {
      const { seasonId } = request.query as { seasonId?: string }
      const where = seasonId ? { seasonId: Number(seasonId) } : undefined
      const series = await prisma.matchSeries.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        include: { season: true }
      })
      return reply.send({ ok: true, data: series })
    })

    admin.post('/series', async (request, reply) => {
      const body = request.body as {
        seasonId?: number
        stageName?: string
        homeClubId?: number
        awayClubId?: number
      }
      if (!body?.seasonId || !body?.stageName || !body?.homeClubId || !body?.awayClubId) {
        return reply.status(400).send({ ok: false, error: 'series_fields_required' })
      }
      const series = await prisma.matchSeries.create({
        data: {
          seasonId: body.seasonId,
          stageName: body.stageName.trim(),
          homeClubId: body.homeClubId,
          awayClubId: body.awayClubId,
          seriesStatus: SeriesStatus.IN_PROGRESS
        }
      })
      return reply.send({ ok: true, data: series })
    })

    admin.put('/series/:seriesId', async (request, reply) => {
      const seriesId = parseBigIntId((request.params as any).seriesId, 'seriesId')
      const body = request.body as { seriesStatus?: SeriesStatus; winnerClubId?: number }
      const series = await prisma.matchSeries.update({
        where: { id: seriesId },
        data: {
          seriesStatus: body.seriesStatus,
          winnerClubId: body.winnerClubId
        }
      })
      return reply.send({ ok: true, data: series })
    })

    admin.delete('/series/:seriesId', async (request, reply) => {
      const seriesId = parseBigIntId((request.params as any).seriesId, 'seriesId')
      const hasMatches = await prisma.match.findFirst({ where: { seriesId } })
      if (hasMatches) {
        return reply.status(409).send({ ok: false, error: 'series_has_matches' })
      }
      await prisma.matchSeries.delete({ where: { id: seriesId } })
      return reply.send({ ok: true })
    })

    // Matches
    admin.get('/matches', async (request, reply) => {
      const { seasonId } = request.query as { seasonId?: string }
      const matches = await prisma.match.findMany({
        where: seasonId ? { seasonId: Number(seasonId) } : undefined,
        orderBy: [{ matchDateTime: 'desc' }],
        include: {
          season: { select: { name: true } },
          series: true,
          stadium: true
        }
      })
      return reply.send({ ok: true, data: matches })
    })

    admin.post('/matches', async (request, reply) => {
      const body = request.body as {
        seasonId?: number
        seriesId?: bigint
        seriesMatchNumber?: number
        matchDateTime?: string
        homeTeamId?: number
        awayTeamId?: number
        stadiumId?: number
        refereeId?: number
      }
      if (!body?.seasonId || !body?.matchDateTime || !body?.homeTeamId || !body?.awayTeamId) {
        return reply.status(400).send({ ok: false, error: 'match_fields_required' })
      }
      const match = await prisma.match.create({
        data: {
          seasonId: body.seasonId,
          seriesId: body.seriesId ?? null,
          seriesMatchNumber: body.seriesMatchNumber ?? null,
          matchDateTime: new Date(body.matchDateTime),
          homeTeamId: body.homeTeamId,
          awayTeamId: body.awayTeamId,
          stadiumId: body.stadiumId ?? null,
          refereeId: body.refereeId ?? null,
          status: MatchStatus.SCHEDULED
        }
      })
      return reply.send({ ok: true, data: match })
    })

    admin.put('/matches/:matchId', async (request, reply) => {
      const matchId = parseBigIntId((request.params as any).matchId, 'matchId')
      const body = request.body as Partial<{
        matchDateTime: string
        homeScore: number
        awayScore: number
        status: MatchStatus
        stadiumId: number | null
        refereeId: number | null
      }>

      const existing = await prisma.match.findUnique({ where: { id: matchId } })
      if (!existing) {
        return reply.status(404).send({ ok: false, error: 'match_not_found' })
      }

      const updated = await prisma.match.update({
        where: { id: matchId },
        data: {
          matchDateTime: body.matchDateTime ? new Date(body.matchDateTime) : undefined,
          homeScore: body.homeScore ?? undefined,
          awayScore: body.awayScore ?? undefined,
          status: body.status ?? undefined,
          stadiumId: body.stadiumId ?? undefined,
          refereeId: body.refereeId ?? undefined
        }
      })

      if (body.status === MatchStatus.FINISHED && existing.status !== MatchStatus.FINISHED) {
        await handleMatchFinalization(matchId, request.server.log)
      }

      return reply.send({ ok: true, data: updated })
    })

    admin.delete('/matches/:matchId', async (request, reply) => {
      const matchId = parseBigIntId((request.params as any).matchId, 'matchId')
      const match = await prisma.match.findUnique({ where: { id: matchId } })
      if (!match) return reply.status(404).send({ ok: false, error: 'match_not_found' })
      if (match.status === MatchStatus.FINISHED) {
        return reply.status(409).send({ ok: false, error: 'finished_match_locked' })
      }
      await prisma.match.delete({ where: { id: matchId } })
      return reply.send({ ok: true })
    })

    // Lineups
    admin.get('/matches/:matchId/lineup', async (request, reply) => {
      const matchId = parseBigIntId((request.params as any).matchId, 'matchId')
      const lineup = await prisma.matchLineup.findMany({
        where: { matchId },
        orderBy: [{ role: 'asc' }, { personId: 'asc' }],
        include: {
          person: true,
          club: true
        }
      })
      return reply.send({ ok: true, data: lineup })
    })

    admin.put('/matches/:matchId/lineup', async (request, reply) => {
      const matchId = parseBigIntId((request.params as any).matchId, 'matchId')
      const body = request.body as { personId?: number; clubId?: number; role?: LineupRole; position?: string }
      if (!body?.personId || !body?.clubId || !body?.role) {
        return reply.status(400).send({ ok: false, error: 'lineup_fields_required' })
      }
      const entry = await prisma.matchLineup.upsert({
        where: { matchId_personId: { matchId, personId: body.personId } },
        create: {
          matchId,
          personId: body.personId,
          clubId: body.clubId,
          role: body.role,
          position: body.position ?? null
        },
        update: {
          clubId: body.clubId,
          role: body.role,
          position: body.position ?? null
        }
      })
      return reply.send({ ok: true, data: entry })
    })

    admin.delete('/matches/:matchId/lineup/:personId', async (request, reply) => {
      const matchId = parseBigIntId((request.params as any).matchId, 'matchId')
      const personId = parseNumericId((request.params as any).personId, 'personId')
      await prisma.matchLineup.delete({ where: { matchId_personId: { matchId, personId } } })
      return reply.send({ ok: true })
    })

    // Events
    admin.get('/matches/:matchId/events', async (request, reply) => {
      const matchId = parseBigIntId((request.params as any).matchId, 'matchId')
      const events = await prisma.matchEvent.findMany({
        where: { matchId },
        orderBy: [{ minute: 'asc' }, { id: 'asc' }],
        include: {
          player: true,
          relatedPerson: true,
          team: true
        }
      })
      return reply.send({ ok: true, data: events })
    })

    admin.post('/matches/:matchId/events', async (request, reply) => {
      const matchId = parseBigIntId((request.params as any).matchId, 'matchId')
      const body = request.body as {
        playerId?: number
        teamId?: number
        minute?: number
        eventType?: MatchEventType
        relatedPlayerId?: number | null
      }
      if (!body?.playerId || !body?.teamId || !body?.minute || !body?.eventType) {
        return reply.status(400).send({ ok: false, error: 'event_fields_required' })
      }
      const event = await prisma.matchEvent.create({
        data: {
          matchId,
          playerId: body.playerId,
          teamId: body.teamId,
          minute: body.minute,
          eventType: body.eventType,
          relatedPlayerId: body.relatedPlayerId ?? null
        }
      })

      const match = await prisma.match.findUnique({ where: { id: matchId } })
      if (match?.status === MatchStatus.FINISHED) {
        await handleMatchFinalization(matchId, request.server.log)
      }

      return reply.send({ ok: true, data: event })
    })

    admin.put('/matches/:matchId/events/:eventId', async (request, reply) => {
      const matchId = parseBigIntId((request.params as any).matchId, 'matchId')
      const eventId = parseBigIntId((request.params as any).eventId, 'eventId')
      const body = request.body as Partial<{
        minute: number
        eventType: MatchEventType
        teamId: number
        playerId: number
        relatedPlayerId: number | null
      }>
      const event = await prisma.matchEvent.update({
        where: { id: eventId },
        data: {
          minute: body.minute ?? undefined,
          eventType: body.eventType ?? undefined,
          teamId: body.teamId ?? undefined,
          playerId: body.playerId ?? undefined,
          relatedPlayerId: body.relatedPlayerId ?? undefined
        }
      })

      const match = await prisma.match.findUnique({ where: { id: matchId } })
      if (match?.status === MatchStatus.FINISHED) {
        await handleMatchFinalization(matchId, request.server.log)
      }

      return reply.send({ ok: true, data: event })
    })

    admin.delete('/matches/:matchId/events/:eventId', async (request, reply) => {
      const matchId = parseBigIntId((request.params as any).matchId, 'matchId')
      const eventId = parseBigIntId((request.params as any).eventId, 'eventId')
      await prisma.matchEvent.delete({ where: { id: eventId } })
      const match = await prisma.match.findUnique({ where: { id: matchId } })
      if (match?.status === MatchStatus.FINISHED) {
        await handleMatchFinalization(matchId, request.server.log)
      }
      return reply.send({ ok: true })
    })

    // Stats read-only
    admin.get('/stats/club-season', async (request, reply) => {
      const { seasonId } = request.query as { seasonId?: string }
      if (!seasonId) {
        return reply.status(400).send({ ok: false, error: 'seasonId_required' })
      }
      const stats = await prisma.clubSeasonStats.findMany({
        where: { seasonId: Number(seasonId) },
        include: { club: true },
        orderBy: { points: 'desc' }
      })
      return reply.send({ ok: true, data: stats })
    })

    admin.get('/stats/player-season', async (request, reply) => {
      const { seasonId } = request.query as { seasonId?: string }
      if (!seasonId) {
        return reply.status(400).send({ ok: false, error: 'seasonId_required' })
      }
      const stats = await prisma.playerSeasonStats.findMany({
        where: { seasonId: Number(seasonId) },
        include: { person: true, club: true },
        orderBy: [{ goals: 'desc' }, { assists: 'desc' }]
      })
      return reply.send({ ok: true, data: stats })
    })

    admin.get('/stats/player-career', async (_request, reply) => {
      const stats = await prisma.playerClubCareerStats.findMany({
        include: { person: true, club: true },
        orderBy: [{ totalGoals: 'desc' }]
      })
      return reply.send({ ok: true, data: stats })
    })

    // Users & predictions
    admin.get('/users', async (_request, reply) => {
      const users = await prisma.appUser.findMany({
        orderBy: { createdAt: 'desc' }
      })
      return reply.send({ ok: true, data: users })
    })

    admin.put('/users/:userId', async (request, reply) => {
      const userId = parseNumericId((request.params as any).userId, 'userId')
      const body = request.body as { firstName?: string; currentStreak?: number; totalPredictions?: number }
      const user = await prisma.appUser.update({
        where: { id: userId },
        data: {
          firstName: body.firstName ?? undefined,
          currentStreak: body.currentStreak ?? undefined,
          totalPredictions: body.totalPredictions ?? undefined
        }
      })
      return reply.send({ ok: true, data: user })
    })

    admin.get('/predictions', async (request, reply) => {
      const { matchId, userId } = request.query as { matchId?: string; userId?: string }
      const predictions = await prisma.prediction.findMany({
        where: {
          matchId: matchId ? BigInt(matchId) : undefined,
          userId: userId ? Number(userId) : undefined
        },
        include: { user: true }
      })
      return reply.send({ ok: true, data: predictions })
    })

    admin.put('/predictions/:predictionId', async (request, reply) => {
      const predictionId = parseBigIntId((request.params as any).predictionId, 'predictionId')
      const body = request.body as { isCorrect?: boolean; pointsAwarded?: number }
      const prediction = await prisma.prediction.update({
        where: { id: predictionId },
        data: {
          isCorrect: body.isCorrect ?? undefined,
          pointsAwarded: body.pointsAwarded ?? undefined
        }
      })
      return reply.send({ ok: true, data: prediction })
    })

    // Achievements
    admin.get('/achievements/types', async (_request, reply) => {
      const types = await prisma.achievementType.findMany({ orderBy: { name: 'asc' } })
      return reply.send({ ok: true, data: types })
    })

    admin.post('/achievements/types', async (request, reply) => {
      const body = request.body as { name?: string; description?: string; requiredValue?: number; metric?: AchievementMetric }
      if (!body?.name || !body?.requiredValue || !body?.metric) {
        return reply.status(400).send({ ok: false, error: 'achievement_fields_required' })
      }
      const type = await prisma.achievementType.create({
        data: {
          name: body.name.trim(),
          description: body.description?.trim() ?? null,
          requiredValue: body.requiredValue,
          metric: body.metric
        }
      })
      return reply.send({ ok: true, data: type })
    })

    admin.put('/achievements/types/:achievementTypeId', async (request, reply) => {
      const achievementTypeId = parseNumericId((request.params as any).achievementTypeId, 'achievementTypeId')
      const body = request.body as { name?: string; description?: string; requiredValue?: number; metric?: AchievementMetric }
      const type = await prisma.achievementType.update({
        where: { id: achievementTypeId },
        data: {
          name: body.name?.trim(),
          description: body.description?.trim(),
          requiredValue: body.requiredValue ?? undefined,
          metric: body.metric ?? undefined
        }
      })
      await recomputeAchievementsForType(achievementTypeId)
      return reply.send({ ok: true, data: type })
    })

    admin.delete('/achievements/types/:achievementTypeId', async (request, reply) => {
      const achievementTypeId = parseNumericId((request.params as any).achievementTypeId, 'achievementTypeId')
      await prisma.userAchievement.deleteMany({ where: { achievementTypeId } })
      await prisma.achievementType.delete({ where: { id: achievementTypeId } })
      return reply.send({ ok: true })
    })

    admin.get('/achievements/users', async (_request, reply) => {
      const achievements = await prisma.userAchievement.findMany({
        include: {
          user: true,
          achievementType: true
        },
        orderBy: { achievedDate: 'desc' }
      })
      return reply.send({ ok: true, data: achievements })
    })

    admin.delete('/achievements/users/:userId/:achievementTypeId', async (request, reply) => {
      const { userId: userParam, achievementTypeId: typeParam } = request.params as any
      const userId = parseNumericId(userParam, 'userId')
      const achievementTypeId = parseNumericId(typeParam, 'achievementTypeId')
      await prisma.userAchievement.delete({ where: { userId_achievementTypeId: { userId, achievementTypeId } } })
      return reply.send({ ok: true })
    })

    // Disqualifications
    admin.get('/disqualifications', async (_request, reply) => {
      const disqualifications = await prisma.disqualification.findMany({
        include: { person: true, club: true },
        orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }]
      })
      return reply.send({ ok: true, data: disqualifications })
    })

    admin.post('/disqualifications', async (request, reply) => {
      const body = request.body as {
        personId?: number
        clubId?: number | null
        reason?: DisqualificationReason
        sanctionDate?: string
        banDurationMatches?: number
      }
      if (!body?.personId || !body?.reason || !body?.banDurationMatches) {
        return reply.status(400).send({ ok: false, error: 'disqualification_fields_required' })
      }
      const disqualification = await prisma.disqualification.create({
        data: {
          personId: body.personId,
          clubId: body.clubId ?? null,
          reason: body.reason,
          sanctionDate: body.sanctionDate ? new Date(body.sanctionDate) : new Date(),
          banDurationMatches: body.banDurationMatches,
          matchesMissed: 0,
          isActive: true
        }
      })
      return reply.send({ ok: true, data: disqualification })
    })

    admin.put('/disqualifications/:disqualificationId', async (request, reply) => {
      const disqualificationId = parseBigIntId((request.params as any).disqualificationId, 'disqualificationId')
      const body = request.body as Partial<{
        matchesMissed: number
        isActive: boolean
        banDurationMatches: number
      }>
      const disqualification = await prisma.disqualification.update({
        where: { id: disqualificationId },
        data: {
          matchesMissed: body.matchesMissed ?? undefined,
          isActive: body.isActive ?? undefined,
          banDurationMatches: body.banDurationMatches ?? undefined
        }
      })
      return reply.send({ ok: true, data: disqualification })
    })

    admin.delete('/disqualifications/:disqualificationId', async (request, reply) => {
      const disqualificationId = parseBigIntId((request.params as any).disqualificationId, 'disqualificationId')
      await prisma.disqualification.delete({ where: { id: disqualificationId } })
      return reply.send({ ok: true })
    })
  }, { prefix: '/api/admin' })
}

async function recomputeAchievementsForType(achievementTypeId: number) {
  const type = await prisma.achievementType.findUnique({ where: { id: achievementTypeId } })
  if (!type) return
  const users = await prisma.appUser.findMany({ include: { predictions: true, achievements: true } })
  for (const user of users) {
    let achieved = false
    if (type.metric === AchievementMetric.TOTAL_PREDICTIONS) {
      achieved = user.predictions.length >= type.requiredValue
    } else if (type.metric === AchievementMetric.CORRECT_PREDICTIONS) {
      const correct = user.predictions.filter((p) => p.isCorrect).length
      achieved = correct >= type.requiredValue
    }
    if (achieved) {
      const existing = user.achievements.find((ua) => ua.achievementTypeId === type.id)
      if (!existing) {
        await prisma.userAchievement.create({
          data: {
            userId: user.id,
            achievementTypeId: type.id,
            achievedDate: new Date()
          }
        })
      }
    }
  }
}
