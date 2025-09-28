Дата: 2025-09-28
PR: backend/prisma — инициализация Prisma (Phase 1 starter)

Что сделано:
- Добавлена `prisma/schema.prisma` (схема взята из `docs/prisma.md`)
- Обновлён `backend/package.json`: добавлены зависимости `prisma` и `@prisma/client`, скрипты для миграций/генерации/studio и требование Node.js >= 20
- Добавлен `backend/.env.example` для локальной разработки (по умолчанию SQLite)
- Добавлен `backend/src/db/index.ts` с экспортом PrismaClient

Почему безопасно:
- Только добавление файлов и dev-скриптов; работа с БД не выполнялась автоматически.

Проверки (локально):
- cd backend && npm ci
- при наличии DATABASE_URL (или используя .env.example с sqlite): npx prisma generate
- опционально: npx prisma migrate dev --name init (создаст локальную миграцию для sqlite/postgres)

Следующие шаги:
- выполнить `npx prisma generate` и `npx prisma migrate dev` локально (если хотите, могу запустить эти команды и показать вывод).
