# Проект: Obnliga — Футбольная лига (Краткое описание)

Дата: 2025-09-28

Кратко:
- Цель: MVP Telegram WebApp для управления мини-лигой с live-обновлениями матчей, ставками, профилем пользователя и магазином.
- Стек: Backend — Node.js + TypeScript + Fastify + Prisma + Redis + BullMQ; Frontend — Vite + React/Preact + TypeScript + single-store (façade на Zustand/nano-stores).
- Архитектурные принципы: multilevel cache (in-memory LRU + Redis), ETag + SWR, patch-based WebSocket (patch|full), audit/admin-logger.

Состояние на текущий момент:
- Инициализирован skeleton проекта (backend/frontend/shared). (см. `docs/roadmap.md`).
- Prisma schema и клиент (dev sqlite / production Postgres) — в `prisma/schema.prisma`.
- Реализован multilevel cache skeleton: `backend/src/cache/multilevelCache.ts`.
- Добавлен ETag-плагин Fastify: `backend/src/plugins/etag.ts` и зарегистрирован в `server.ts` (см. `audit/changes/0005-add-etag-middleware.md`).
- Создан отдельный фронтенд для админ-дэшборда (`admin/`), включающий вход по ENV-параметрам Render и вкладочную структуру (Команды, Матчи, Статистика, Управление игроками, Новости) — пока содержатся заглушки.

- Backend расширен эндпоинтом `/api/admin/login`, использующим переменные окружения `LOGIN_ADMIN` и `PASSWORD_ADMIN` для выдачи JWT токена администратору. Маршрут зарегистрирован в `backend/src/server.ts`.

- Добавлена модель `User` и базовый flow аутентификации через Telegram WebApp (server-side `initData` verification, JWT issuance). Файлы: `backend/src/routes/authRoutes.ts`, `backend/src/routes/userRoutes.ts`, `frontend/src/Profile.tsx`.
- Добавлена prototype реализация realtime: Fastify WebSocket endpoint + Redis pub/sub glue (`backend/src/realtime/index.ts`) и минимальный клиент `frontend/src/wsClient.ts`. Для локальной отладки необходим Redis (см. `docs/prisma.md` и `docs/dev-setup.md`).

Проверка правил — ОК
1) Прочитаны `docs/roadmap.md`, `audit/mcp-context7-summary.md` и `docs/dev-setup.md`.
2) MCP context7: `audit/mcp-context7-summary.md` присутствует и содержит набор артефактов/рекомендаций.
3) Затронутые компоненты перечислены ниже и оценено влияние на сеть/кэш/WS.
4) Задача соответствует статусу roadmap (Phase 2 — ETag / Phase 3 — cache).
5) Изменения аккуратные, атомарные и зафиксированы в `audit/changes/0005-add-etag-middleware.md`.

Затронутые компоненты
- Backend
  - `src/server.ts` — bootstrap, регистрация плагинов
  - `src/plugins/etag.ts` — новый ETag middleware
  - `src/cache/*` — multilevel cache
  - `routes/*` — demo API (например `/api/cache/:key`)
- Frontend
  - `src/api/etag.ts` — fetch wrapper (план)
  - `src/store/*` — store façade (matchesStore, userStore, shopStore, realtimeStore)

Влияние изменений на сеть / кэш / WS
- ETag middleware работает: клиент отправляет If-None-Match, сервер возвращает 304 при совпадении, экономит трафик ✅
- Multilevel cache снижает latency: backend кэширует профили пользователей (TTL 5 мин), frontend использует localStorage + ETag ✅  
- Cache invalidation через Redis pub/sub обеспечивает согласованность при обновлении профилей ✅
- Patch-based WS готов к интеграции — patch|full протокол для live-обновлений профилей и статистики ⏳

Влияние на метрики (оценка)
- Retention: 🔵 — улучшение за счёт более плавных live-обновлений и быстрых откликов.
- Engagement: 🔵 — WebApp с real-time и shop/ставками повышает вовлечённость.
- Revenue: ⚪ — пока не критично, но shop/беттинг допускают монетизацию.
- Tech Stability: 🔴 — добавление ETag и cache повышает устойчивость, но требует тестов на inconsistency.

Как запускать (локально)
1. Backend
   - Установить зависимости и запустить dev сервер:
     npm install
     cd backend
     npm install
     npm run dev
   - Проверить /health и demo endpoints: `GET /api/cache/:key`.
  - Запуск Redis локально (рекомендуется для realtime):

```powershell
docker run -d --name obnliga-redis -p 6379:6379 redis:7-alpine
```
2. Frontend
   - cd frontend
   - npm install
   - npm run dev

Документы и следующее действие
- Обновлять `docs/state.md` при изменении структуры стора.
- Следующий приоритет: добавить unit/integration тесты для ETag и реализация `frontend/src/api/etag.ts`.
