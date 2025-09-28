import { Bot, InlineKeyboard } from 'grammy'
import dotenv from 'dotenv'

dotenv.config({ path: __dirname + '/../.env' })

const token = process.env.TELEGRAM_BOT_TOKEN
const webAppUrl = process.env.WEBAPP_URL || 'http://localhost:5173'

let botInstance: Bot | null = null

if (token) {
  botInstance = new Bot(token)

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
    botInstance.start()
    console.log('Telegram bot started (long polling)')
  } catch (err) {
    console.error('Failed to start bot', err)
  }
}
