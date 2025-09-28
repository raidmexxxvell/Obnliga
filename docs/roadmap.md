##  Цель: построить мини-приложение Telegram WebApp с прогнозами на спортивные события футбольной лиги г.Обнинск с live-обновлениями, достижениями и профилем пользователя.

На стеке: Node.js+TS+Prisma+Fastify+Redis+BullMQ (бекенд) и Vite+React/Preact+TS+single-store (фронтенд). Сохраняем архитектурные идеи: multilevel cache, ETag/SWR, patch-based WS, admin-logger. 

План разбит на фазы; для каждого пункта указаны: чекбокс выполнения, Статус (✅/🟨/⬜) и Приоритет влияния (🔴/🔵/⚪).

##  Легенда:

Статус: ✅ — выполнено, 🟨 — в процессе, ⬜ — не начато
Приоритет: 🔴 — высокий, 🔵 — средний, ⚪ — низкий

##  Фаза 0 — Скелет проекта (ветка skeleton/init)
Цель: минимальный skeleton репо + CI, инструкции dev (без docker-compose).
 Создать ветку skeleton/init. — Статус: ⬜ — Приоритет: 🔴
 backend/: Fastify bootstrap (TS), package.json, tsconfig.json, src/server.ts с /health. — Статус: ⬜ — Приоритет: 🔴
 frontend/: Vite + React/Preact skeleton, package.json, tsconfig.json, src/main.tsx. — Статус: ⬜ — Приоритет: 🔴
 shared/: types.ts (черновые интерфейсы). — Статус: ⬜ — Приоритет: 🔵
 .github/workflows/ci.yml — базовый CI (lint/test/build). — Статус: ⬜ — Приоритет: 🔴
 docs/dev-setup.md — команды dev (локально с локальной БД или с Render DB). — Статус: ⬜ — Приоритет: 🔵

Acceptance / проверки локально
cd backend && npm ci && npm run dev → сервер отвечает /health.
cd frontend && npm ci && npm run dev → Vite dev server запускается.

##  Фаза 1 — Prisma + схема БД (ветка backend/prisma)
Цель: модели DB и генерация типов Prisma → shared types.
 Добавить prisma/schema.prisma (User, Team, Player, Match, ShopItem, Cart, Bet, AdminActionLog). — Статус: ⬜ — Приоритет: 🔴
 Настроить миграции и seed (для локальной разработки / тестов). — Статус: ⬜ — Приоритет: 🔵
 Интеграция Prisma Client в backend/src/db/index.ts и экспорт типов. — Статус: ⬜ — Приоритет: 🔴
 Синхронизировать ключевые TS-типы в shared/types.ts (DB → API → frontend). — Статус: ⬜ — Приоритет: 🔴

Acceptance
npx prisma migrate dev выполняется локально (при наличии локальной БД) или миграции документированы для запуска на Render.
Prisma Client успешно сгенерирован.

##  Фаза 2 — Core API (Fastify) + контракты (ветка backend/core-api)
Цель: реализовать основные HTTP endpoint’ы с ETag и схемами (валидация).
 Fastify bootstrap с плагинами (health, cors, helmet). — Статус: ⬜ — Приоритет: 🔴
 Endpoints и схемы: GET /api/matches, GET /api/matches/:id, POST /api/admin/matches/:id/score, GET /api/shop/items, POST /api/shop/cart, POST /api/auth/telegram-init. — Статус: ⬜ — Приоритет: 🔴
 ETag middleware: выставление ETag, обработка If-None-Match. — Статус: ⬜ — Приоритет: 🔴
 Создать ./docs/api-contracts.md и сгенерировать/обновить shared/types.ts. — Статус: ⬜ — Приоритет: 🔵

Acceptance
curl -I https://<local-or-render-host>/api/matches возвращает ETag.
При If-None-Match возвращается 304.

##  Фаза 3 — Multilevel cache + smart invalidation (ветка backend/cache)
Цель: in-process LRU + Redis layer + invalidation/publish.
 Реализовать multilevelCache (API: get(key, loader), set, invalidate). — Статус: ⬜ — Приоритет: 🔴
 Интеграция Redis (используя Render Redis URL) и in-memory LRU (quick-lru). — Статус: ⬜ — Приоритет: 🔴
 smartInvalidator: при DB-write инвалидация + publish в Redis channel. — Статус: ⬜ — Приоритет: 🔴
 Тесты для cache API. — Статус: ⬜ — Приоритет: 🔵

Acceptance
После POST /admin/matches/:id/score выполняется invalidate и публикуется событие в Redis.

##  Фаза 4 — Realtime: patch-based WebSocket (ветки backend/realtime, frontend/realtime)
Цель: типизированный patch-based WS с Redis pub/sub (горизонтальность).
 Сервер: Fastify WebSocket или native ws + подписка на Redis pub/sub. — Статус: ⬜ — Приоритет: 🔴
 Сообщения: { protocolVersion, type: 'patch'|'full', topic, payload }. — Статус: ⬜ — Приоритет: 🔴
 Клиент: typed WS client с reconnect/backoff, subscribe/unsubscribe, applyPatch → store. — Статус: ⬜ — Приоритет: 🔴
 Механизм versioning и backward compatibility (v1/v2). — Статус: ⬜ — Приоритет: 🔵

Acceptance
Бекенд публикует patch при изменении счёта → фронтенд применяет patch без полной перезагрузки ресурса.

##  Фаза 5 — Фронтенд core (ветка frontend/core)
Цель: SPA для Telegram WebApp с typed store façade (Zustand/adapter).
 storeFacade (Zustand) + модули: matchesStore, userStore, shopStore, realtimeStore. — Статус: ⬜ — Приоритет: 🔴
 api/etag.ts — fetch wrapper с If-None-Match + SWR-like revalidate. — Статус: ⬜ — Приоритет: 🔴
 Подключение WS клиентa → обновления store. — Статус: ⬜ — Приоритет: 🔴
 Telegram WebApp integration: initData verification endpoint flow (server + client). — Статус: ⬜ — Приоритет: 🔴

Acceptance
UI показывает список матчей, обновляется по patch-уведомлениям, ETag работает для fetch.

##  Фаза 6 — Shop / Cart / Bets + очереди (ветка features/shop-bets)
Цель: shop, cart persistence, place bet → BullMQ jobs → settle.
 Endpoints: shop items, cart mutate, place bet. — Статус: ⬜ — Приоритет: 🔵
 BullMQ (использовать Render Redis): worker skeleton workers/settleWorker.ts. — Статус: ⬜ — Приоритет: 🔴
 Транзакции Prisma при расчёте выплат и обновлении баланса. — Статус: ⬜ — Приоритет: 🔴
 Frontend: cart UI + localStorage adapter + server sync. — Статус: ⬜ — Приоритет: 🔵

Acceptance
Place bet → добавлен job → обработан worker → изменения в БД и emission update → фронтенд видит результат.

##  Фаза 7 — Admin panel + audit logging + RBAC (ветка features/admin)
Цель: интерфейс администратора, логирование действий, роль/доступ.
 Модель AdminActionLog и endpoint GET /api/admin/actions. — Статус: ⬜ — Приоритет: 🔵
 Middleware RBAC (role checks) + логирование действий админа. — Статус: ⬜ — Приоритет: 🔴
 Frontend: lazy-loaded admin area (editor матчей, логи). — Статус: ⬜ — Приоритет: 🔵

Acceptance
Admin action сохраняется в таблицу логов и отображается в UI.

##  Фаза 8 — Тестирование, CI/CD, деплой на Render (ветка ci/infra)
Цель: стабильный CI, покрытие тестами, инструкция и конфигурация деплоя на Render.
 Unit: Jest/ts-jest для backend & frontend. — Статус: ⬜ — Приоритет: 🔵
 Integration: supertest для Fastify endpoint’ов. — Статус: ⬜ — Приоритет: 🔵
 E2E: Playwright (smoke тесты: place bet + receive update). — Статус: ⬜ — Приоритет: 🔵
 CI (GitHub Actions): lint → tsc → test → build. — Статус: ⬜ — Приоритет: 🔴
 Инструкция и пример render.yaml / Render services setup (backend, frontend static site, worker service, cron/cron job для миграций). — Статус: ⬜ — Приоритет: 🔴

 Secrets/ENV: документировать все требуемые переменные (RENDER_DATABASE_URL, REDIS_URL, SENTRY_DSN, TELEGRAM_BOT_TOKEN и т.д.). — Статус: ⬜ — Приоритет: 🔴

Acceptance
CI проходит на PR.
Деплой на Render (staging) описан и проверен (smoke).

##  Фаза 9 — Мониторинг, алерты и безопасность (ветка hardening)
Цель: SLO/alerts, Sentry, Prometheus (metrics), защита.
 Sentry интеграция frontend + backend (errors + performance). — Статус: ⬜ — Приоритет: 🔵
 Prometheus / metrics endpoint /metrics (queue sizes, ws connections). — Статус: ⬜ — Приоритет: 🔵
 Health checks: /health должен проверять DB, Redis, BullMQ connectivity. — Статус: ⬜ — Приоритет: 🔴

 Security hardening: rate limiting, input validation (zod), helmet, secure cookies, secret management на Render. — Статус: ⬜ — Приоритет: 🔴

Acceptance
Алерты настроены; health endpoint отражает состояние всех критичных зависимостей.

##  Фаза 10 — Производительность, полировка, релиз (ветка release/v1)
Цель: оптимизация, final QA, релиз.
 Включать tsconfig strict постепенно (по модулю). — Статус: ⬜ — Приоритет: 🔵
 Code splitting, lazy load admin, минимизация размера бандла. — Статус: ⬜ — Приоритет: 🔵
 Smoke tests на staging, мониторинг первые 48ч. — Статус: ⬜ — Приоритет: 🔴
 Документация: migration notes, rollback steps, postmortem template. — Статус: ⬜ — Приоритет: 🔵

Acceptance
Bundle size, latency, ошибки в Sentry в пределах приемлемых порогов; нет критических инцидентов в 48 часов.