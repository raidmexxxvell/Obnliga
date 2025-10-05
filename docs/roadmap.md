##  Цель: построить мини-приложение Telegram WebApp с прогнозами на спортивные события футбольной лиги г.Обнинск с live-обновлениями, достижениями и профилем пользователя.

На стеке: Node.js+TS+Prisma+Fastify+Redis+BullMQ (бекенд) и Vite+React/Preact+TS+single-store (фронтенд). Сохраняем архитектурные идеи: multilevel cache, ETag/SWR, patch-based WS, admin-logger. 

План разбит на фазы; для каждого пункта указаны: чекбокс выполнения, Статус (✅/🟨/⬜) и Приоритет влияния (🔴/🔵/⚪).

##  Легенда:

Статус: ✅ — выполнено, 🟨 — в процессе, ⬜ — не начато
Приоритет: 🔴 — высокий, 🔵 — средний, ⚪ — низкий

##  Фаза 0 — Скелет проекта (ветка skeleton/init)
Цель: минимальный skeleton репо + CI, инструкции dev (без docker-compose).
 Создать ветку skeleton/init. — Статус: ✅ — Приоритет: 🔴
 backend/: Fastify bootstrap (TS), package.json, tsconfig.json, src/server.ts с /health. — Статус: ✅ — Приоритет: 🔴
  - Sub: добавлен `/health`, демо маршруты для кэша, root route и dotenv автозагрузка. — Статус: ✅ — Приоритет: 🔴
 frontend/: Vite + React/Preact skeleton, package.json, tsconfig.json, src/main.tsx. — Статус: ✅ — Приоритет: 🔴
 shared/: types.ts (черновые интерфейсы). — Статус: 🟨 — Приоритет: 🔵
 .github/workflows/ci.yml — базовый CI (lint/test/build). — Статус: 🟨 — Приоритет: 🔴
 docs/dev-setup.md — команды dev (локально с локальной БД или с Render DB). — Статус: ✅ — Приоритет: 🔵

Acceptance / проверки локально
 - cd backend && npm install && npm run dev → сервер отвечает /health (PASS).
 - cd frontend && npm install && npm run dev → Vite dev server запускается (PASS).

##  Фаза 1 — Prisma + схема БД (ветка backend/prisma)
Цель: модели DB и генерация типов Prisma → shared types.
 Добавить prisma/schema.prisma (User, Team, Player, Match, ShopItem, Cart, Bet, AdminActionLog). — Статус: ✅ — Приоритет: 🔴
  - Sub: схема адаптирована и переключена на `provider = "postgresql"` для Render. — Статус: ✅ — Приоритет: 🔴
  - Sub: локально была создана sqlite миграция (dev) — она удаляется/перегенерируется под Postgres для production. — Статус: 🟨 — Приоритет: 🔵
 Настроить миграции и seed (для локальной разработки / тестов). — Статус: 🟨 — Приоритет: 🔵
  - Sub: добавлен `render.yaml` и job `run-migrations` + обновлён `backend/package.json` с явными prisma скриптами. — Статус: ✅ — Приоритет: 🔴
 Интеграция Prisma Client в backend/src/db/index.ts и экспорт типов. — Статус: ✅ — Приоритет: 🔴
 Синхронизировать ключевые TS-типы в shared/types.ts (DB → API → frontend). — Статус: ⬜ — Приоритет: 🔴
 Backend синхронизация с adminRoutes и исправление ошибок компиляции. — Статус: ✅ — Приоритет: 🔴
 Очистка БД: удаление неиспользуемых таблиц (AdminLog) и унификация модели пользователя (User → AppUser). — Статус: ✅ — Приоритет: 🔴
 Исправление Profile и WebSocket после замены User → AppUser. — Статус: ✅ — Приоритет: 🔴
 Добавление поля photoUrl в AppUser для отображения фото пользователей. — Статус: ✅ — Приоритет: 🔴

Acceptance
 - Prisma Client успешно сгенерирован локально (генерация в билде работает). ✅
 - Backend компилируется без ошибок TypeScript ✅
 - Admin routes синхронизированы с новой схемой ✅
 - Схема БД очищена от неиспользуемых таблиц ✅
 - Убраны обходы типизации (prisma as any) ✅
 - Profile отображает имя и фото пользователя корректно ✅
 - WebSocket подключается без ошибок ✅
 - Требуется: пересоздать миграции под Postgres и запустить `prisma migrate deploy` на Render (job подготовлен).

##  Фаза 2 — Core API (Fastify) + контракты (ветка backend/core-api)
Цель: реализовать основные HTTP endpoint’ы с ETag и схемами (валидация).
 Fastify bootstrap с плагинами (health, cors, helmet). — Статус: ✅ — Приоритет: 🔴
  - Sub: health endpoint реализован; CORS/helmet базовая подготовка — частично (🟨). — Статус: 🟨 — Приоритет: 🔴
 Endpoints и схемы: GET /api/matches, GET /api/matches/:id, POST /api/admin/matches/:id/score, GET /api/shop/items, POST /api/shop/cart, POST /api/auth/telegram-init. — Статус: 🟨 — Приоритет: 🔴
  - Sub: демо кэш‑эндпоинты `/api/cache/:key` и invalidate реализованы. — Статус: ✅ — Приоритет: 🔵
  - Sub: auth/telegram-init ещё не реализован (ожидает верификацию initData flow). — Статус: ⬜ — Приоритет: 🔴
 ETag middleware: выставление ETag, обработка If-None-Match. — Статус: ⬜ — Приоритет: 🔴
 Создать ./docs/api-contracts.md и сгенерировать/обновить shared/types.ts. — Статус: ⬜ — Приоритет: 🔵

Acceptance
 - `/health` — работает.
 - `/api/cache/:key` — демонстрация multilevel cache возвращает ожидаемые данные.
 - Требуется: реализация оставшихся core endpoints и ETag middleware.

##  Фаза 3 — Multilevel cache + smart invalidation (ветка backend/cache)
Цель: in-process LRU + Redis layer + invalidation/publish.
 Реализовать multilevelCache (API: get(key, loader), set, invalidate). — Статус: ✅ — Приоритет: 🔴
  - Sub: реализован LRU + Redis pub/sub skeleton и демо интеграция (`/api/cache/*`). — Статус: ✅ — Приоритет: 🔴
 Интеграция Redis (используя Render Redis URL) и in-memory LRU (quick-lru). — Статус: 🟨 — Приоритет: 🔴
 smartInvalidator: при DB-write инвалидация + publish в Redis channel. — Статус: ⬜ — Приоритет: 🔴
 Тесты для cache API. — Статус: ⬜ — Приоритет: 🔵

Acceptance
 - Демонстрация cache API работает локально; нужен Redis в prod и включение smart invalidation в местах записи в БД.

##  Фаза 4 — Realtime: patch-based WebSocket (ветки backend/realtime, frontend/realtime)
Цель: типизированный patch-based WS с Redis pub/sub (горизонтальность).
 Сервер: Fastify WebSocket или native ws + подписка на Redis pub/sub. — Статус: ⬜ — Приоритет: 🔴
 Сообщения: { protocolVersion, type: 'patch'|'full', topic, payload }. — Статус: ⬜ — Приоритет: 🔴
 Клиент: typed WS client с reconnect/backoff, subscribe/unsubscribe, applyPatch → store. — Статус: ⬜ — Приоритет: 🔴
 Механизм versioning и backward compatibility (v1/v2). — Статус: ⬜ — Приоритет: 🔵

Acceptance
 - Оставлено на следующую итерацию после завершения core API и cache invalidation.

##  Фаза 5 — Фронтенд core (ветка frontend/core)
Цель: SPA для Telegram WebApp с typed store façade (Zustand/adapter).
 storeFacade (Zustand) + модули: matchesStore, userStore, shopStore, realtimeStore. — Статус: 🟨 — Приоритет: 🔴
 api/etag.ts — fetch wrapper с If-None-Match + SWR-like revalidate. — Статус: ⬜ — Приоритет: 🔴
 Подключение WS клиентa → обновления store. — Статус: ⬜ — Приоритет: 🔴
 Telegram WebApp integration: initData verification endpoint flow (server + client). — Статус: ⬜ — Приоритет: 🔴
 Система управления составами: полнофункциональная реализация с валидацией, мобильной адаптивностью и синхронизацией UX между админ-панелью и капитанским порталом. — Статус: ✅ — Приоритет: 🔴

Acceptance
 - Frontend skeleton и splash реализованы; интеграция WebApp/ETag/WS — следующая крупная задача.
 - ✅ Система управления составами полностью реализована и протестирована.

##  Фаза 6 — Shop / Cart / Bets + очереди (ветка features/shop-bets)
Цель: shop, cart persistence, place bet → BullMQ jobs → settle.
 Endpoints: shop items, cart mutate, place bet. — Статус: ⬜ — Приоритет: 🔵
 BullMQ (использовать Render Redis): worker skeleton workers/settleWorker.ts. — Статус: ⬜ — Приоритет: 🔴
 Транзакции Prisma при расчёте выплат и обновлении баланса. — Статус: ⬜ — Приоритет: 🔴
 Frontend: cart UI + localStorage adapter + server sync. — Статус: ⬜ — Приоритет: 🔵

Acceptance
 - План остаётся в roadmap; реализуется после core API и очередей.

##  Фаза 7 — Admin panel + audit logging + RBAC (ветка features/admin)
Цель: интерфейс администратора, логирование действий, роль/доступ.
 Модель AdminActionLog и endpoint GET /api/admin/actions. — Статус: ✅ — Приоритет: 🔵
 Middleware RBAC (role checks) + логирование действий админа. — Статус: 🟨 — Приоритет: 🔴 (эндпоинт авторизации создан, требуется связка с RBAC и логгером)
 Frontend: lazy-loaded admin area (editor матчей, логи). — Статус: 🟨 — Приоритет: 🔵 (создан отдельный Vite-проект `admin/` с заглушками вкладок)

Acceptance
 - Модель логов присутствует в Prisma схеме; endpoints и UI — в следующем этапе.

##  Фаза 8 — Тестирование, CI/CD, деплой на Render (ветка ci/infra)
Цель: стабильный CI, покрытие тестами, инструкция и конфигурация деплоя на Render.
 Unit: Jest/ts-jest для backend & frontend. — Статус: ⬜ — Приоритет: 🔵
 Integration: supertest для Fastify endpoint’ов. — Статус: ⬜ — Приоритет: 🔵
 E2E: Playwright (smoke тесты: place bet + receive update). — Статус: ⬜ — Приоритет: 🔵
 CI (GitHub Actions): lint → tsc → test → build. — Статус: 🟨 — Приоритет: 🔴
 Инструкция и пример render.yaml / Render services setup (backend, frontend static site, worker service, cron/cron job для миграций). — Статус: ✅ — Приоритет: 🔴

 Secrets/ENV: документировать все требуемые переменные (RENDER_DATABASE_URL, REDIS_URL, SENTRY_DSN, TELEGRAM_BOT_TOKEN и т.д.). — Статус: 🟨 — Приоритет: 🔴

Acceptance
 - `render.yaml` и job для миграций добавлены; CI workflow требует доработки и тестов.

##  Фаза 9 — Мониторинг, алерты и безопасность (ветка hardening)
Цель: SLO/alerts, Sentry, Prometheus (metrics), защита.
 Sentry интеграция frontend + backend (errors + performance). — Статус: ⬜ — Приоритет: 🔵
 Prometheus / metrics endpoint /metrics (queue sizes, ws connections). — Статус: ⬜ — Приоритет: 🔵
 Health checks: /health должен проверять DB, Redis, BullMQ connectivity. — Статус: 🟨 — Приоритет: 🔴

 Security hardening: rate limiting, input validation (zod), helmet, secure cookies, secret management на Render. — Статус: 🟨 — Приоритет: 🔴

Acceptance
 - Health endpoint реализован базово; дальнейшие проверки подключений — следующая задача.

##  Фаза 10 — Производительность, полировка, релиз (ветка release/v1)
Цель: оптимизация, final QA, релиз.
 Включать tsconfig strict постепенно (по модулю). — Статус: ⬜ — Приоритет: 🔵
 Code splitting, lazy load admin, минимизация размера бандла. — Статус: ⬜ — Приоритет: 🔵
 Smoke tests на staging, мониторинг первые 48ч. — Статус: ⬜ — Приоритет: 🔴
 Документация: migration notes, rollback steps, postmortem template. — Статус: ⬜ — Приоритет: 🔵

Acceptance
 - Bundle size, latency, ошибки в Sentry в пределах приемлемых порогов; нет критических инцидентов в 48 часов.