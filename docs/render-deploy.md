# Деплой на Render.com — инструкция

Этот файл описывает рекомендуемую конфигурацию Render для проекта `Футбольная Лига`.

1) Подготовка репозитория
- Убедитесь, что `render.yaml` находится в корне репозитория (уже добавлен).

2) Сервисы
- Backend — Node web service (Fastify). Build: `cd backend && npm ci && npm run build`. Start: `npx prisma migrate deploy && npm run start`.
- Frontend — Static Site (Vite build → `frontend/dist`). Build: `cd frontend && npm ci && npm run build`.
- Worker — опционально (BullMQ workers) может работать как отдельный Node worker.
- Job `run-migrations` — запускает `prisma migrate deploy` при деплое.

3) Переменные окружения (обязательно настроить в Render Dashboard)
- DATABASE_URL — Postgres connection string (Render Managed Postgres)
- REDIS_URL — Redis connection (Render Managed Redis)
- TELEGRAM_BOT_TOKEN — токен Telegram бота
- SENTRY_DSN (опционально)

4) Замечания по миграциям
- Для production используйте `npx prisma migrate deploy` (не требует shadow DB).
- Job `run-migrations` в `render.yaml` настроен как `on-deploy` — он выполнит миграции при деплое.

5) Build & start commands
- Backend Build: `cd backend && npm ci && npm run build`
- Backend Start: `cd backend && npx prisma migrate deploy && npm run start`
- Frontend Build: `cd frontend && npm ci && npm run build`

6) Инструкция быстрой проверки после деплоя
- В Render Dashboard откройте публичный URL фронтенда и бэкенда.
- Проверка health: GET `https://<backend-url>/health` → { status: 'ok' }
