import { FastifyBaseLogger } from 'fastify'
import { Job, QueueEvents, Worker } from 'bullmq'
import TelegramBot from 'node-telegram-bot-api'
import {
  NEWS_QUEUE_NAME,
  ensureNewsQueue,
  enqueueTelegramNewsJob,
  getNewsQueueConnection,
  shutdownNewsQueue,
  TelegramNewsJobPayload
} from './newsQueue'

const POLL_INTERVAL_MS = 60_000
const FLOOD_RETRY_FALLBACK_MS = 5_000

let bot: TelegramBot | null = null
let worker: Worker<TelegramNewsJobPayload> | null = null
let pollTimer: NodeJS.Timeout | null = null
let workerRunning = false
let baseLogger: FastifyBaseLogger | null = null
let queueEvents: QueueEvents | null = null

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const ensureBot = (logger: FastifyBaseLogger): TelegramBot | null => {
  if (bot) return bot
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_NEWS_CHAT_ID
  if (!token || !chatId) {
    logger.warn('news worker: telegram token or chatId missing — notifications disabled')
    return null
  }
  bot = new TelegramBot(token, { polling: false })
  return bot
}

const getChatId = () => process.env.TELEGRAM_NEWS_CHAT_ID

const isFloodError = (err: unknown) => {
  const error = err as any
  return error?.code === 'ETELEGRAM' && error?.response?.statusCode === 429
}

const resolveFloodRetryDelay = (err: unknown): number => {
  const error = err as any
  const retry = Number(error?.response?.body?.parameters?.retry_after ?? 0)
  if (Number.isFinite(retry) && retry > 0) {
    return retry * 1000
  }
  return FLOOD_RETRY_FALLBACK_MS
}

const sendTelegramPayload = async (job: Job<TelegramNewsJobPayload>, logger: FastifyBaseLogger) => {
  const chatId = getChatId()
  if (!chatId) {
    logger.warn({ jobId: job.id }, 'news worker: chatId missing — skipping telegram broadcast')
    return
  }
  const client = ensureBot(logger)
  if (!client) {
    logger.warn({ jobId: job.id }, 'news worker: telegram client unavailable')
    return
  }

  const { title, content, coverUrl } = job.data
  const intro = `<b>${escapeHtml(title)}</b>`
  const body = escapeHtml(content).replace(/\n{2,}/g, '\n\n')
  const message = `${intro}\n\n${body}`

  try {
    if (coverUrl) {
      await client.sendPhoto(chatId, coverUrl, {
        caption: message,
        parse_mode: 'HTML'
      })
    } else {
      await client.sendMessage(chatId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: false
      })
    }
  } catch (err) {
    if (isFloodError(err) && worker) {
      const delay = resolveFloodRetryDelay(err)
      logger.warn({ jobId: job.id, delay }, 'news worker: flood control, requeue job')
      await worker.rateLimit(delay)
      throw Worker.RateLimitError()
    }
    throw err
  }
}

const processJob = async (job: Job<TelegramNewsJobPayload>) => {
  const logger = baseLogger ?? (console as unknown as FastifyBaseLogger)
  await sendTelegramPayload(job, logger)
}

const createWorker = (logger: FastifyBaseLogger): Worker<TelegramNewsJobPayload> | null => {
  if (worker) return worker
  const connection = getNewsQueueConnection()
  if (!connection) {
    logger.warn('news worker: redis connection unavailable')
    return null
  }

  worker = new Worker<TelegramNewsJobPayload>(NEWS_QUEUE_NAME, processJob, {
    autorun: false,
    concurrency: 1,
    limiter: {
      max: 1,
      duration: 1000
    },
    connection
  })

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'news worker: telegram broadcast completed')
  })

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'news worker: job failed')
  })

  worker.on('drained', async () => {
    logger.info('news worker: queue drained, stopping worker')
    await stopWorker(logger)
  })

  worker.on('error', (err) => {
    logger.error({ err }, 'news worker: runtime error')
  })

  return worker
}

const runWorker = async (logger: FastifyBaseLogger) => {
  if (workerRunning) return
  const instance = createWorker(logger)
  if (!instance) return
  workerRunning = true
  try {
    await instance.run()
  } catch (err) {
    logger.error({ err }, 'news worker: run terminated with error')
  } finally {
    workerRunning = false
  }
}

async function stopWorker(logger: FastifyBaseLogger) {
  if (!worker) return
  try {
    await worker.close()
  } catch (err) {
    logger.error({ err }, 'news worker: failed to close worker')
  }
  worker = null
  workerRunning = false
}

const evaluateQueue = async (logger: FastifyBaseLogger) => {
  const queue = await ensureNewsQueue()
  if (!queue) return
  const [waiting, delayed, active] = await Promise.all([
    queue.getWaitingCount(),
    queue.getDelayedCount(),
    queue.getActiveCount()
  ])
  const pending = waiting + delayed + active
  if (pending > 0) {
    await runWorker(logger)
  }
}

export async function startNewsWorkerSupervisor(logger: FastifyBaseLogger) {
  baseLogger = logger
  const queue = await ensureNewsQueue()
  if (!queue) {
    logger.warn('news worker: queue not initialised (no redis url)')
    return
  }

  if (!queueEvents) {
    const connection = getNewsQueueConnection()
    if (connection) {
      queueEvents = new QueueEvents(NEWS_QUEUE_NAME, { connection })
      await queueEvents.waitUntilReady()
      queueEvents.on('waiting', () => {
        evaluateQueue(logger).catch((err) => logger.error({ err }, 'news worker: evaluate failed'))
      })
    } else {
      logger.warn('news worker: queue events connection unavailable')
    }
  }

  await evaluateQueue(logger)

  if (pollTimer) {
    clearInterval(pollTimer)
  }
  pollTimer = setInterval(() => {
    evaluateQueue(logger).catch((err) => logger.error({ err }, 'news worker: evaluate failed'))
  }, POLL_INTERVAL_MS)
}

export async function shutdownNewsWorker(logger: FastifyBaseLogger) {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  await stopWorker(logger)
  if (queueEvents) {
    try {
      await queueEvents.close()
    } catch (err) {
      logger.error({ err }, 'news worker: failed to close queue events')
    }
    queueEvents = null
  }
  await shutdownNewsQueue()
}

export { enqueueTelegramNewsJob }
