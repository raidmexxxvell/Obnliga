# Анализ фронтенд кодовой базы: Obnliga

## 📁 Структура проекта
```
.
├─ admin/
│  ├─ src/
│  │  ├─ api/
│  │  ├─ components/
│  │  ├─ store/
│  │  ├─ wsClient.ts
│  │  └─ types.ts
│  ├─ vite.config.ts
│  └─ tsconfig.json
├─ backend/
│  ├─ src/
│  │  ├─ routes/
│  │  ├─ services/
│  │  ├─ realtime/
│  │  ├─ queue/
│  │  ├─ cache/
│  │  └─ utils/
│  ├─ package.json
│  └─ tsconfig.json
├─ frontend/
│  ├─ src/
│  │  ├─ api/
│  │  ├─ components/
│  │  ├─ pages/
│  │  ├─ store/
│  │  ├─ LineupPortal.tsx
│  │  ├─ Profile.tsx
│  │  └─ wsClient.ts
│  └─ vite.config.ts
├─ shared/
│  ├─ types.ts
│  └─ utils/
├─ prisma/
│  ├─ schema.prisma
│  └─ migrations/
├─ docs/
│  ├─ roadmap.md
│  ├─ state.md
│  └─ style.md
├─ audit/
│  └─ changes/
└─ render.yaml
```
- `admin/` — отдельный Vite-приложение для админ-панели: сложные табы, Zustand-стор, клиенты к административным API, CSS под неокубизм.
- `frontend/` — публичный Telegram WebApp: сплэш, новости, профиль, капитанский портал составов, WebSocket-клиент и модуль вкладки «Лига» (API + Zustand store).
- `backend/` — Fastify-сервер с Prisma, кэшированием, BullMQ, Telegram-ботом и богатым REST/WS слоем.
- `shared/` — кросс-пакетные типы и утилиты (словоформы, DTO для News и пользователей).
- `prisma/` — схема, миграции и журналы dev-базы; генерируется для backend и клиентов.
- `docs/` — архитектурные и стилистические артефакты; актуальный roadmap, state-фасад, UI-гайдлайн.
- `audit/` — журнал изменений/аналитики по PR.
- `render.yaml` — декларация деплоя (Render.com) для backend, фронта и миграционного job.

**Организация кода.** Бэкенд построен по доменно-слойной схеме: маршруты группируются по предметным областям (auth, news, admin, lineup), бизнес-логика вынесена в `services/`, инфраструктура (кэш, realtime, очереди) лежит отдельно. Фронтенды используют смесь feature-based подхода (новости, профиль, lineup portal) и слойного разделения на API/компоненты/store. Общие типы вынесены в `shared/`, что упрощает контракт между слоями.

## 🛠 Технологический стек
| Слой | Технологии | Версии/особенности | Назначение |
| --- | --- | --- | --- |
| Клиент (публичный) | React 18, TypeScript 5, Vite 5, SW WebSocket | `frontend/package.json` | Telegram WebApp, офлайн-кэш новостей, профиль, навигация bottom-nav |
| Клиент (админ) | React 18, Zustand 4.5.2, Vite 5 | `admin/src/store`, `vite.config.ts` | Дашборд с табами, live-редактирование матчей, управление новостями |
| CSS | Кастомные CSS-файлы, переменные `--bg-*`, `--neon-*`, адаптивные гриды | `frontend/src/app.css`, `admin/src/theme.css` | Стиль «неокубизм» с неоновыми акцентами, доступность WCAG AA |
| Backend | Fastify 4, Prisma 5.x, Node.js ≥20, `@fastify/websocket`, BullMQ 5.61, ioredis 5.8, grammy | `backend/package.json` | REST API, WebSocket-шина, очереди уведомлений, Telegram-бот |
| Данные | PostgreSQL (Render), Prisma ORM, Redis (кэш/pub-sub), LRU (quick-lru) | `prisma/schema.prisma`, `backend/src/cache` | Хранение матчей/новостей/профилей, многоуровневое кэширование |
| Тесты/линт | ESLint (TS + React), Prettier, npm workspaces скрипты | `.eslintrc.cjs`, `.prettierrc`, корневой `package.json` | Статический анализ, форматирование; тесты пока не реализованы |
| Инфраструктура | Render web/static services, миграционный job, dotenv | `render.yaml`, `.env` загрузка | Деплой backend/SPA, генерация Prisma, миграции через job |

## 🏗 Архитектура
- **Компонентная модель.** Публичный фронт держит простое дерево: `App` управляет навигацией табов, `NewsSection` инкапсулирует кэш, swipe и RealTime, `Profile` выполняет Telegram auth+ETag, `LineupPortal` — полноценное CRUD-модальное приложение. В админке основная логика живёт в Zustand-сторе, компоненты (`DashboardLayout`, `PlayoffBracket`, `JudgePanel`) подписываются селекторами и вызывают экшены.
- **Разделение логики.** Прикладные функции вынесены в API-клиенты (например, `admin/src/api/adminClient.ts` с envelope/мета и словарём ошибок), инфраструктура — в `backend/src/cache`, `backend/src/realtime`. Повторяемые операции обёрнуты в помощники (`runCachedFetch` в сторе, `adminRequestWithMeta` на клиенте, `defaultCache.getWithMeta` на сервере).
- **Состояние.** Публичный фронт получил первый модуль стора (`frontend/src/store/appStore.ts`) для вкладки «Лига» с TTL-кэшом и WebSocket-подпиской; остальные экраны пока опираются на локальные `useState`/`useEffect`. Админ-панель использует полноценный Zustand с TTL и ролями (admin → judge → assistant → lineup). Серверный state — через Prisma транзакции + кэш-версии в Redis.
- **API-слой.** REST организован вокруг Fastify-плагинов: каждый набор маршрутов регистрируется модульно, под капотом идут Prisma-операции и кэш-инвалидации (например, `newsRoutes` подставляет ETag, `adminRoutes` публикует обновления в WS и инвалидирует кэш ключами `season:*`). Клиенты строят относительные URL (`buildApiUrl`, `buildUrl`) и поддерживают условные заголовки.
- **Реалтайм.** Реализована WebSocket-шина с Redis pub/sub, JWT-проверкой несколько секретов и таблицей подписок по топикам; клиент `frontend/src/wsClient.ts` умеет heartbeat, экспоненциальный бэкофф и мультиплекс тем.
- **Навигация.** React Router не используется: публичный SPA делает ручной state-машину табов (адекватно для WebApp), админка опирается на `activeTab` в сторе.
- **Ошибки и загрузки.** Практически каждый fetch окружён индикаторами (`loading`, `portalError`, `modalError`), ошибки переводятся в локализованные сообщения словарями. На сервере ошибки мапятся в `translateAdminError`, в `authRoutes` обрабатывается несколько вариантов некорректного initData.

## 🎨 UI/UX и стилизация
- **Стили.** Глобальные CSS с переменными и темой «неокубизм». Общие токены синхронизированы между фронтами (через дублирование файлов, планируется вынос в shared UI).
- **Компонентные паттерны.** Используются стеклянные панели, неоновые акценты, heartbeat-анимации для сплеша, гриды для карточек (LineupPortal, PlayoffBracket). Нет сторонних UI-kit — всё кастомно.
- **Адаптивность.** Основные экраны оптимизированы под мобильные: bottom-nav, модальные roster окна с `grid-template-columns: repeat(auto-fill, minmax(...))`, медиазапросы для отступов.
- **Темизация.** Темы управляются CSS-переменными; поддержка смены темы пока не реализована, но структура допускает расширение.
- **Доступность.** Композиция компонентов содержит aria-атрибуты (например, `nav role="navigation"`, `aria-selected` на табах, `role="dialog"` в новостной модалке). Контрастность соблюдается переменными, но требуется аудит на всех экранных состояниях.

## ✅ Качество кода
- **Линтеры и форматирование.** ESLint + Prettier настроены для всех пакетов, правила строгие (запрет `any`, `max-warnings 0`, обязательная `eol-last`). Форматирование по Prettier (без точек с запятой, single quotes).
- **Типизация.** Код преимущественно строго типизирован (Prisma типы, DTO, Zustand state). Есть места с нестрогим `unknown` → runtime проверки (например, `isNewsItem`, `isProfileUser`), что улучшает надёжность.
- **Тестов нет.** Юнит/интеграционные тесты отсутствуют, roadmap (Фаза 8) упоминает потребность. Это главный пробел в качестве.
- **Документация.** Проект ведёт детальные `docs/*.md`, roadmap и описание стора, что облегчает онбординг.
- **CI/CD.** Скрипты для lint/format/build есть, корневые `npm run lint|format` пробрасывают в workspaces.

## 🔧 Ключевые компоненты
**NewsSection (`frontend/src/components/NewsSection.tsx`)**
- **Роль.** Главный блок новостей: загрузка с ETag, локальный кеш, автопрокрутка, real-time обновления.
- **Ключевой код:**
```tsx
useEffect(() => {
  const handler = (message: WSMessage) => {
    if (!isNewsItem(message.payload)) return
    const item = message.payload
    setNews(current => {
      const deduped = current.filter(entry => entry.id !== item.id)
      const nextItems = [item, ...deduped]
      writeCache(nextItems, etagRef.current)
      newsRef.current = nextItems
      return nextItems
    })
    setActiveIndex(0)
  }
  const detachFull = wsClient.on('news.full', handler)
  const detachRemove = wsClient.on('news.remove', removeHandler)
  return () => {
    detachFull()
    detachRemove()
  }
}, [writeCache])
```
- **API/пропсы.** Не принимает пропсов, работает с локальным состоянием и `wsClient`.
- **Зависимости.** `@shared/types`, кастомный WS-клиент, локальное хранилище, ETag.

**Profile (`frontend/src/Profile.tsx`)**
- **Роль.** Авторизация WebApp через Telegram initData, синхронизация с сервером, real-time патчи профиля.
- **Фрагмент:**
```tsx
const loadProfile = async () => {
  const cached = getCachedProfile()
  if (cached?.data) {
    setUser(cached.data)
    console.log('Loaded profile from cache')
    return
  }
  setLoading(true)
  const backend = (import.meta.env.VITE_BACKEND_URL ?? '').replace(/\/$/, '')
  const meUrl = backend ? `${backend}/api/auth/me` : '/api/auth/me'
  try {
    const token = localStorage.getItem('session')
    if (token) {
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` }
      if (cached?.etag) headers['If-None-Match'] = cached.etag
      const resp = await fetch(meUrl, { headers, credentials: 'include' })
      if (resp.status === 304 && cached?.data) {
        setUser(cached.data)
        wsClient.setToken(token)
        setLoading(false)
        return
      }
      if (resp.ok) {
        const payload = (await resp.json()) as unknown
        const profileUser = readProfileUser(payload)
        if (profileUser) {
          setCachedProfile(profileUser, resp.headers.get('ETag') ?? undefined)
          setUser(profileUser)
          wsClient.setToken(token)
        }
      }
    }
  } catch (e) {
    console.error('Token-based load error:', e)
  }
  setLoading(false)
}
```
- **API/пропсы.** Нет пропсов; взаимодействует с `wsClient` и localStorage.
- **Зависимости.** Telegram WebApp API, JWT-токен, ETag-логика, real-time топики `user:${id}` и `profile`.

**Admin store (`admin/src/store/adminStore.ts`)**
- **Роль.** Централизованное управление административной панелью (авторизация, словари, матчи, новости, кэширование).
- **Фрагмент:**
```ts
const runCachedFetch = async (
  scope: FetchKey,
  parts: Array<string | number | undefined>,
  fetcher: () => Promise<void>,
  ttlOverride?: number
) => {
  const cacheKey = composeCacheKey(scope, parts)
  const ttl = ttlOverride ?? FETCH_TTL[scope]
  const last = fetchTimestamps[cacheKey]
  if (ttl > 0 && last && Date.now() - last < ttl) {
    return
  }
  const existing = fetchPromises[cacheKey]
  if (existing) {
    await existing
    return
  }
  const task = (async () => {
    try {
      await run(scope, fetcher)
      fetchTimestamps[cacheKey] = Date.now()
    } finally {
      fetchPromises[cacheKey] = undefined
    }
  })()
  fetchPromises[cacheKey] = task
  await task
}
```
- **API/пропсы.** Экшены (`login`, `fetchDictionaries`, `refreshTab` и т.д.) экспортируются через Zustand.
- **Зависимости.** `adminClient`, `assistantStore`, локальный TTL-кэш, localStorage токены.

**Realtime hub (`backend/src/realtime/index.ts`)**
- **Роль.** WebSocket-шлюз с аутентификацией, подписками и Redis pub/sub.
- **Фрагмент:**
```ts
const token = getAuthToken(req)
const secretCandidates = [
  process.env.JWT_SECRET,
  process.env.ASSISTANT_JWT_SECRET,
  process.env.ADMIN_JWT_SECRET,
  process.env.JUDGE_JWT_SECRET,
  process.env.TELEGRAM_BOT_TOKEN,
  'dev-secret',
].filter(Boolean) as string[]
let verified = false
if (token) {
  const tokenStr = String(token)
  for (const secret of secretCandidates) {
    try {
      jwt.verify(tokenStr, secret)
      verified = true
      break
    } catch (err) {
      /* try next */
    }
  }
}
if (!verified) {
  socket.close(4001, 'unauthorized')
  return
}
```
- **API/пропсы.** Поддерживает команды `{ action: 'subscribe' | 'unsubscribe', topic }`, публикацию через `server.publishTopic`.
- **Зависимости.** `@fastify/websocket`, `ioredis`, JWT-секреты, Redis pub/sub.

**Match aggregation (`backend/src/services/matchAggregation.ts`)**
- **Роль.** Пост-обработка завершённых матчей: пересчёт статистики, дисквалификаций, прогнозов, кэш-инвалидация.
- **Фрагмент:**
```ts
await prisma.$transaction(async tx => {
  const includePlayoffRounds = isBracketFormat
  await rebuildClubSeasonStats(seasonId, tx, { includePlayoffRounds })
  await rebuildPlayerSeasonStats(seasonId, tx)
  await rebuildPlayerCareerStats(seasonId, tx)
  await processDisqualifications(match, tx)
  await updatePredictions(match, tx)
  await updateSeriesState(match, tx, logger)
})
const cacheKeys = [
  `season:${seasonId}:club-stats`,
  `season:${seasonId}:player-stats`,
  `competition:${competitionId}:club-career`,
  ...Array.from(impactedClubIds).map(clubId => `club:${clubId}:player-career`),
]
await Promise.all(cacheKeys.map(key => defaultCache.invalidate(key).catch(() => undefined)))
```
- **API/пропсы.** Вызывается из `adminRoutes` при финализации матча; опирается на Prisma Tx и `defaultCache`.
- **Зависимости.** Prisma, кэш, enums (`MatchStatus`, `SeriesFormat`), логи Fastify, Redis-инвалидация.

## 📋 Выводы и рекомендации
- **Сильные стороны.** Чёткая доменная модель (Prisma), развитая админка с TTL-кэшем и several roles, продвинутый WebSocket-клиент, строгая типизация, богатая документация.
- **Слабые стороны.** Отсутствие автоматизированных тестов, неполная реализация стор-фасада на публичном фронте, частичная реализация realtime-конвенций (нет message версионности `patch|full`), дублирование UI-темы между пакетами, CI/infra требует доводки.
- **Уровень сложности.** Кодовая база ориентирована на upper-middle/senior уровень: много тонкой логики, интеграция с Prisma, Redis, BullMQ, Telegram.

**Оценка подсистем**
- API — 7/10: маршруты богаты и типизированы, но местами отсутствует валидация схем и унификация ошибок.
- БД — 8/10: Prisma покрывает домен, есть транзакционные сервисы; нужно завершить миграции и тесты на целостность.
- Realtime/stream — 6/10: WebSocket-хаб и клиент продвинуты, но протокол patch|full не доведён, отсутствует версионирование сообщений.
- Frontend — 7/10: UI богат, есть кеширование и realtime, однако отсутствует единый store фасад и тесты, часть экранов — заглушки.
- Infra — 6/10: Render-конфиг и workspaces настроены, но CI и мониторинг из roadmap ещё не закрыты, нет pre-commit.

**Приоритетный roadmap**
1. [High/M] Завершить протокол real-time (`type: 'patch'|'full'`, версия сообщений, ACL) и синхронизировать клиентов с сервером.
2. [High/M] Внедрить модульный store фасад на публичном фронте (Zustand/RTK) по контракту `docs/state.md`, покрыть unit-тестами.
3. [High/M] Добавить схему валидации запросов/ответов (zod или TypeBox) на ключевых REST-эндпоинтах, включить автоматические 400/422 ответы.
4. [High/S] Настроить CI (lint → tsc → test → build) и секреты Render вне репозитория; проверить deploy pipeline.
5. [Medium/M] Реализовать тестовый слой: unit для стора и сервисов, интеграционные Fastify (supertest) для auth/news/admin endpoints.
6. [Medium/M] Выделить общие UI-токены/компоненты в `shared/ui`, синхронизировать admin и public тему.
7. [Medium/L] Завершить smart-инвалидацию кэша и публикации из `adminRoutes` (news, stats) в Redis pub/sub + документировать ключи.
8. [Low/M] Реализовать мониторинг `/metrics` и health-check расширение (DB, Redis, очереди) согласно roadmap Фазы 9.
9. [Low/S] Добавить pre-commit (lint-staged) и git hooks для форматирования/линта.
10. [Low/M] Подготовить примеры e2e (chrome-devtools) для критических пользовательских сценариев (просмотр новостей, подтверждение состава, обновление профиля).
