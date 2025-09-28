Дата: 2025-09-28
PR: skeleton/init — первичный skeleton проекта (Phase 0)

Что сделано:
- Добавлены минимальные пакеты и конфигурации для backend (Fastify + TS) и frontend (Vite + React + TS)
- Добавлен `shared/types.ts` с черновыми интерфейсами
- Добавлен CI workflow (placeholder)
- Добавлен `docs/dev-setup.md` с командами для локальной разработки

Почему безопасно:
- Изменения не трогают существующую логику (это добавление новых файлов)
- Скрипты и зависимости минимальны и не меняют продакшн-код

Проверки (локально):
- cd backend && npm ci && npm run dev → /health
- cd frontend && npm ci && npm run dev → Vite dev server

DO: skeleton добавлен, готов к Phase 1 (Prisma)
ПОСЛЕ: реализовать prisma/schema.prisma, миграции и интеграцию Prisma Client в backend/src/db
