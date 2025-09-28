import { Bot, InlineKeyboard } from 'grammy'
import dotenv from 'dotenv'

dotenv.config({ path: __dirname + '/../.env' })

const token = process.env.TELEGRAM_BOT_TOKEN
const webAppUrl = process.env.WEBAPP_URL || 'http://localhost:5173'

let botInstance: Bot | null = null

if (token) {
  botInstance = new Bot(token)

  // Global error catcher for grammy — prevents unhandled rejections from crashing the process.
  botInstance.catch((err) => {
    // err is a GrammyError wrapper; original error info available at err.error
    try {
      const code = (err as any)?.error?.error_code
      if (code === 409) {
        // Conflict: another getUpdates instance is running (common on PaaS). Log and ignore.
        console.warn('Telegram getUpdates conflict (409) — another bot instance likely running. Ignoring.')
        return
      }
    } catch (e) {
      // ignore
    }
    console.error('Unhandled bot error', err)
  })

  botInstance.command('start', async (ctx) => {
    const name = ctx.from?.first_name || 'игрок'
    const keyboard = new InlineKeyboard().url('Открыть WebApp', webAppUrl)
    await ctx.reply(`Привет, ${name}! Добро пожаловать в Футбольную Лига WebApp.`)
    await ctx.reply('Нажмите кнопку, чтобы открыть WebApp:', { reply_markup: keyboard })
  })

  botInstance.on('message', async (ctx) => {
    if (ctx.message && 'text' in ctx.message) {
      const text = ctx.message.text
      if (text === '/help') {
        await ctx.reply('Отправьте /start чтобы получить ссылку на WebApp')
      } else {
        await ctx.reply('Я пока маленький бот — отправьте /start')
      }
    }
  })
} else {
  console.warn('TELEGRAM_BOT_TOKEN not set — bot will not start')
}

export const startBot = async () => {
  if (!botInstance) {
    console.warn('startBot: bot instance not configured (no token)')
    return
  }
  try {
    await botInstance.init()
    // Start polling but don't let an unhandled rejection bubble up: catch and log.
    botInstance.start().then(() => {
      console.log('Telegram bot started (long polling)')
    }).catch((err) => {
      // If getUpdates was claimed by another instance, it's safe to continue without crashing.
      const code = (err as any)?.error_code || (err as any)?.error?.error_code
      if (code === 409) {
        console.warn('Telegram getUpdates conflict on start (409) — another instance running. Bot will not poll.')
      } else {
        console.error('Bot start failed', err)
      }
    })
  } catch (err) {
    console.error('Failed to start bot', err)
  }
}
