import { FastifyPluginAsync } from 'fastify'
import prisma from '../db'
import { defaultCache } from '../cache'
import {
  LeagueSeasonSummary,
  LeagueTableResponse,
  SeasonWithCompetition,
  buildLeagueTable,
  fetchLeagueSeasons,
} from '../services/leagueTable'

const SEASONS_CACHE_KEY = 'public:league:seasons'
const SEASONS_TTL_SECONDS = 60
const TABLE_TTL_SECONDS = 300

const leagueRoutes: FastifyPluginAsync = async fastify => {
  fastify.get('/api/league/seasons', async (_request, reply) => {
    const { value, version } = await defaultCache.getWithMeta<LeagueSeasonSummary[]>(
      SEASONS_CACHE_KEY,
      fetchLeagueSeasons,
      SEASONS_TTL_SECONDS
    )
    reply.header('X-Resource-Version', version)
    return reply.send({ ok: true, data: value, meta: { version } })
  })

  fastify.get<{ Querystring: { seasonId?: string } }>('/api/league/table', async (request, reply) => {
    const seasonIdRaw = request.query.seasonId
    let requestedSeasonId: number | undefined
    if (seasonIdRaw !== undefined) {
      const parsed = Number(seasonIdRaw)
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return reply.status(400).send({ ok: false, error: 'season_invalid' })
      }
      requestedSeasonId = parsed
    }

    let season: SeasonWithCompetition | null
    if (requestedSeasonId) {
      const found = await prisma.season.findUnique({
        where: { id: requestedSeasonId },
        include: { competition: true },
      })
      season = found
    } else {
      const found = await prisma.season.findFirst({
        where: { isActive: true },
        orderBy: { startDate: 'desc' },
        include: { competition: true },
      })
      season = found
    }

    if (!season) {
      return reply.status(404).send({ ok: false, error: 'season_not_found' })
    }

    const cacheKey = requestedSeasonId ? `public:league:table:${season.id}` : 'public:league:table'
    const { value, version } = await defaultCache.getWithMeta<LeagueTableResponse>(
      cacheKey,
      () => buildLeagueTable(season),
      TABLE_TTL_SECONDS
    )

    reply.header('X-Resource-Version', version)
    return reply.send({ ok: true, data: value, meta: { version } })
  })
}

export default leagueRoutes
