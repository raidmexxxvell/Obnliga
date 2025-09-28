## 0003 — Добавление профиля пользователя (DB model + API + frontend)

Дата: 2025-09-28

Что сделано:
- Добавлена модель `User` в `prisma/schema.prisma` (user_id, tg_username, photo_url, created_at, updated_at).
- Создан backend роут `backend/src/routes/userRoutes.ts` с `POST /api/users` (upsert) и `GET /api/users/:userId`.
- Добавлен фронтенд компонент `frontend/src/Profile.tsx` и стили `profile.css`, подключён в `App.tsx`.
- Обновлён `shared/types.ts` — добавлен интерфейс `DbUser`.

Почему безопасно:
- Изменения инкрементальны и не ломают существующие API (роуты добавлены отдельно).
- Prisma migration ещё не применён в проде; разработка ведётся в dev окружении.

Проверки:
- Локальная проверка TypeScript: `npm --prefix backend run build` — прошла после генерации Prisma Client.
- Frontend typecheck: `npx --prefix frontend tsc -p frontend/tsconfig.json --noEmit` — прошла.

ДО: профили отсутствовали.
ПОСЛЕ: минимальный профиль доступен через WebApp UI и API; далее — интеграция с initData flow Telegram.

Дальше:
- Запустить `npm --prefix backend run prisma:migrate:dev` локально для создания миграции `users` и сгенерировать client.
- Реализовать серверную проверку `initData` из Telegram (ETag / hash validation) в отдельном PR.

Локально выполнено:
- Создана временная схема `prisma/schema.local.prisma` с provider = "sqlite" и выполнена миграция:
	`DATABASE_URL="file:./prisma/dev.db" npx prisma migrate dev --schema prisma/schema.local.prisma --name add_users_local`.
	Это создало миграцию в `prisma/migrations/20250928184321_add_users_local` и обновило локальную `prisma/dev.db`.

Примечание: production schema остаётся PostgreSQL — при деплое нужно использовать `prisma migrate deploy` против продакшен БД. Локальная sqlite-схема создана для удобства разработки и не должна автоматически пушиться в prod.
