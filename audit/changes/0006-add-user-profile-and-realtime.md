# 0006 — Add User, Profile tab, Telegram initData flow, JWT, and Realtime (WebSocket + Redis)

Дата: 2025-09-28

Кратко:
- Добавлена модель `User` в `prisma/schema.prisma`.
- Реализован серверный маршрут `/api/auth/telegram-init` для верификации `initData` от Telegram WebApp (HMAC-SHA256 с secret_key=SHA256(TELEGRAM_BOT_TOKEN)).
- При успешной верификации сервер создаёт/обновляет запись `User` и выдаёт JWT. Попытка установки httpOnly cookie при наличии плагина `fastify-cookie`, иначе возвращается токен в JSON (frontend сохраняет в localStorage как fallback).
- Добавлены CRUD маршруты для пользователей: `backend/src/routes/userRoutes.ts`.
- Добавлена вкладка Profile на фронтенде `frontend/src/Profile.tsx` (неон/неокубизм стиль) — отображает `tgUsername`, `photoUrl` и дату создания (формат dd.MM.yyyy МСК).
- Прототип realtime: `backend/src/realtime/index.ts` (Fastify WebSocket + Redis pub/sub) и `frontend/src/wsClient.ts` (connect/subscribe/unsubscribe). Топики по имени вкладки и per-user (`user:<id>`).

Почему это безопасно / почему добавлено:
- Telegram Web App требует server-side верификацию initData для предотвращения фальсификации данных пользователя. JWT позволяет поддержать сессии между WS и HTTP.
- Redis + pub/sub обеспечивает масштабируемость realtime между инстансами.

Как протестировать локально:
1. Установите зависимости и запустите бэкенд и фронтенд (см. `docs/project.md`).
2. Запустите Redis локально (рекомендуется через Docker):

```powershell
# запускает Redis в контейнере
docker run -d --name obnliga-redis -p 6379:6379 redis:7-alpine
```

3. Для тестирования initData можно использовать WebApp в режиме разработки или сгенерировать тестовые `initData` по документации Telegram; после успешной верификации запрос создаст/обновит запись в `users` таблице и вернёт JWT.

Проверки / команды:
- npx prisma migrate dev --schema=prisma/schema.local.prisma --name add_users_local
- npx prisma generate
- npm --prefix backend run dev
- npm --prefix frontend run dev

Риски и ограничения:
- ACL для подписок на топики пока минимален — требуется доработка перед продакшеном.
- Cookie-based auth для WS не полностью автоматизирована — временно используется query param `?token=` если cookie отсутствует.
- Redis обязателен для realtime; отсутствие Redis не ломает HTTP API, но realtime не будет работать.

ДО / ПОСЛЕ:
ДО: нет user модели, WebApp не верифицировал initData, realtime отсутствовал.
ПОСЛЕ: user модель добавлена, initData валидируется серверно, JWT-авторизация доступна, prototype realtime работает через Redis pub/sub.

Проверки локально / CI:
- Запустить локальную миграцию и приложить `prisma/dev.db`.
- npm --prefix backend run dev и убедиться, что сервер стартует без критических ошибок; для проверки realtime — убедиться, что Redis доступен и WS-клиент получает сообщения.

Примечание: Для полноты PR body включите секцию метрик и проверки (Retention/Engagement/Revenue/Tech Stability) согласно internal checklist.
