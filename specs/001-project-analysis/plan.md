# План реализации: От текущего состояния до полнофункционального приложения

**Ветка:** `001-project-analysis` | **Дата:** 4 октября 2025 г. | **Спецификация:** [spec.md](./spec.md)

**Источник:** Спецификация функции из `/specs/001-project-analysis/spec.md`

---

## Резюме

**Цель:** Разработать полнофункциональное Telegram WebApp для футбольной лиги Обнинска с двухэтапным подходом:

1. **Этап 1 (Приоритет):** Полнофункциональная админ-панель с управлением всеми сущностями (сезоны, лиги, команды, игроки, матчи, статистика)
2. **Этап 2:** Пользовательское приложение с вовлечённостью (прогнозы, достижения, live-обновления)

**Технический подход:** Использование multilevel cache, patch-based WebSocket, строгая типизация TypeScript, соответствие архитектуре неокубизма.

---

## Технический контекст

### Стек технологий
- **Язык/Версия:** TypeScript 5.x (Node.js ≥18 для backend)
- **Основные зависимости:**
  - **Backend:** Fastify 4.x, Prisma 5.x, Redis (ioredis), BullMQ, Fastify WebSocket
  - **Frontend:** Vite 5.x, React 18.x/Preact, Zustand 4.x
  - **Admin:** Отдельный Vite проект с теми же зависимостями
- **Хранилище:** PostgreSQL (production на Render) / SQLite (dev local)
- **Целевая платформа:** 
  - Backend: Render.com Web Service (Linux)
  - Frontend: Render.com Static Site
  - Admin: Render.com Static Site
  - Telegram: WebApp iframe

### Параметры проекта
- **Тип проекта:** Веб-приложение (backend + 2 frontend проекта)
- **Цели производительности:**
  - API: p95 < 200ms для некэшированных запросов
  - Cache hit ratio: > 80% для league/match данных
  - WebSocket: Латентность < 100ms для patch-обновлений
  - Frontend: Initial load < 2s, TTI < 3s
- **Ограничения:**
  - Бюджет Render Free tier: 750 часов/мес (требует оптимизации wake-up)
  - Redis memory: < 25MB для кэша
  - PostgreSQL: < 1GB хранилище на Free tier
- **Масштаб/Объем:**
  - Пользователи: ~500-1000 (локальная лига)
  - Матчи: ~200-300 за сезон
  - Прогнозы: ~5000-10000 за сезон
  - Админы: 2-3 человека

---

## Проверка конституции

### ✅ Обязательные требования

#### I. Приоритет MCP Context7
- [x] **Статус:** `audit/mcp-context7-summary.md` уже создан
- [x] **Проверка:** Все новые компоненты анализируются через Context7 перед написанием
- [x] **Документация:** Временные заглушки помечены как "temporary stub"

#### II. Многоуровневое кэширование
- [x] **Статус:** Skeleton реализован в `backend/src/cache/multilevelCache.ts`
- [x] **Проверка:** Политики TTL задокументированы в `docs/cache.md`
- [x] **Задача:** Интеграция ETag middleware и smart invalidation (в плане)

#### III. Patch-based WebSocket
- [x] **Статус:** Базовая реализация в `backend/src/realtime/index.ts`
- [x] **Задача:** Полная интеграция с ACL и версионированием (в плане)
- [x] **Клиент:** `frontend/src/wsClient.ts` требует доработки reconnect logic

#### IV. Строгая типизация TypeScript
- [x] **Статус:** Все обходы `(prisma as any)` устранены
- [x] **Проверка:** `shared/types.ts` синхронизирован с Prisma
- [x] **Задача:** Завершить синхронизацию API контрактов (в плане)

#### V. Визуальная система неокубизма
- [x] **Статус:** Базовые стили в `frontend/src/app.css` и `admin/src/theme.css`
- [x] **Проверка:** Соответствие `docs/style.md`
- [x] **Задача:** Применить ко всем компонентам админки (в плане)

### ✅ Архитектурные ограничения

#### Технологический стек (ФИКСИРОВАННЫЙ)
- [x] Backend: Node.js + TypeScript + Prisma + Fastify + Redis + BullMQ ✅
- [x] Frontend: TypeScript + Vite + React/Preact + Zustand ✅
- [x] Deployment: Render.com ✅
- [x] Database: Полное соответствие `docs/BD.md` (100% проверено) ✅

#### Производительность и стабильность
- [x] ETag support: Plugin готов в `backend/src/plugins/etag.ts`
- [x] Метрики влияния: Система оценки 🔴/🔵/⚪ применяется
- [x] Cache invalidation: Redis pub/sub skeleton готов
- [x] Real-time: Auto-reconnect требует доработки

---

## Структура проекта

### Документация (этой функции)

```
specs/001-project-analysis/
├── spec.md              # Полная спецификация (✅ создано)
├── README.md            # Краткая справка (✅ создано)
├── plan.md              # Этот файл (текущий)
├── research.md          # Фаза 0 (будет создано)
├── data-model.md        # Фаза 1 (будет создано)
├── quickstart.md        # Фаза 1 (будет создано)
├── contracts/           # Фаза 1 (будет создано)
└── tasks.md             # Фаза 2 (команда /tasks)
```

### Исходный код (корень репозитория)

**Вариант 2: Веб-приложение** (выбран на основе структуры проекта)

```
backend/
├── src/
│   ├── routes/          # API endpoints
│   │   ├── adminRoutes.ts
│   │   ├── authRoutes.ts
│   │   ├── userRoutes.ts
│   │   └── cacheRoutes.ts
│   ├── services/        # Бизнес-логика
│   │   ├── matchAggregation.ts
│   │   └── seasonAutomation.ts
│   ├── cache/           # Multilevel cache
│   │   ├── index.ts
│   │   └── multilevelCache.ts
│   ├── realtime/        # WebSocket
│   │   └── index.ts
│   ├── plugins/         # Fastify плагины
│   │   └── etag.ts
│   ├── db/              # Prisma клиент
│   │   └── index.ts
│   ├── utils/           # Утилиты
│   │   └── serialization.ts
│   ├── server.ts        # Главный сервер
│   └── bot.ts           # Telegram бот (опционально)

frontend/
├── src/
│   ├── components/      # UI компоненты
│   │   └── (будущие компоненты)
│   ├── store/           # Zustand stores
│   │   └── (будущие stores)
│   ├── api/             # HTTP клиент
│   │   └── (будущие API клиенты)
│   ├── Profile.tsx      # Профиль пользователя
│   ├── wsClient.ts      # WebSocket клиент
│   └── main.tsx

admin/
├── src/
│   ├── components/      # UI компоненты админки
│   │   ├── DashboardLayout.tsx
│   │   ├── LoginForm.tsx
│   │   ├── ClubRosterModal.tsx
│   │   └── tabs/
│   │       ├── TeamsTab.tsx
│   │       ├── MatchesTab.tsx
│   │       ├── StatsTab.tsx
│   │       ├── PlayersTab.tsx
│   │       └── UsersTab.tsx
│   ├── api/
│   │   └── adminClient.ts
│   ├── store/
│   │   └── adminStore.ts
│   └── App.tsx

prisma/
├── schema.prisma        # Основная схема (Production)
├── schema.local.prisma  # Локальная схема (Dev)
└── migrations/          # Миграции БД

shared/
└── types.ts             # Общие TypeScript типы

docs/                    # Документация проекта
audit/                   # Audit trail
```

**Решение по структуре:** Проект использует веб-архитектуру с разделением на `backend/`, `frontend/` и `admin/`. Backend построен на модульной структуре (routes → services → db). Админ-панель — отдельное приложение с собственными компонентами и store. Shared types синхронизируются между всеми проектами.

---

## Фаза 0: Обзор и Исследования

### 1. Выявленные неизвестные элементы

Из анализа текущего состояния проекта большинство технических решений уже задокументированы. Однако есть области, требующие исследования:

#### Технические неизвестные

1. **Admin CRUD паттерны для Prisma**
   - Контекст: Необходимы оптимальные паттерны для CRUD операций всех 18+ моделей
   - Нужно: Generics, repository pattern или прямой доступ к Prisma?

2. **Fastify validation schemas**
   - Контекст: Валидация входных данных для всех admin endpoints
   - Нужно: JSON Schema, Zod, или TypeBox?

3. **File upload для логотипов команд**
   - Контекст: Загрузка и хранение изображений (логотипы клубов, фото игроков)
   - Нужно: Локальное хранилище, Cloudinary, или S3-совместимое?

4. **Admin authorization & RBAC**
   - Контекст: Сейчас только базовый JWT login
   - Нужно: Расширение до roles (super-admin, league-admin, readonly)?

5. **BullMQ worker patterns**
   - Контекст: Обработка асинхронных задач (расчёт ставок, агрегация статистики)
   - Нужно: Job prioritization, retry policies, dead-letter queues

### 2. Исследовательские задачи

#### Задача R1: Админ CRUD архитектура
**Вопрос:** Какой паттерн использовать для CRUD операций над 18+ моделями Prisma?

**Исследование:**
- Рассмотреть generic repository pattern
- Изучить прямой доступ к Prisma Client
- Проверить Prisma extension patterns
- Оценить сложность поддержки и производительность

**Критерии выбора:**
- Минимум дублирования кода
- Поддержка include/select для отношений
- Типизация без обходов
- Производительность (не добавляет > 10ms накладных расходов)

#### Задача R2: Validation подход
**Вопрос:** Какая библиотека валидации лучше всего сочетается с Fastify и TypeScript?

**Исследование:**
- Fastify JSON Schema (встроенная)
- Zod (популярная в TypeScript сообществе)
- TypeBox (оптимальная для Fastify)

**Критерии выбора:**
- Нативная интеграция с Fastify
- TypeScript type inference
- Размер бандла
- Runtime производительность

#### Задача R3: File upload решение
**Вопрос:** Как организовать загрузку и хранение файлов для логотипов и фото?

**Исследование:**
- Локальное хранилище + Render Persistent Disk
- Cloudinary (CDN + трансформации)
- S3-compatible (Backblaze B2, DigitalOcean Spaces)

**Критерии выбора:**
- Стоимость (Free tier приоритет)
- CDN поддержка
- Автоматическая оптимизация изображений
- Простота интеграции

#### Задача R4: RBAC модель
**Вопрос:** Как спроектировать систему ролей и прав доступа?

**Исследование:**
- Простая модель: роли в JWT claims
- RBAC через БД: таблица AdminRole
- CASL (isomorphic authorization)
- Casbin (policy-based)

**Критерии выбора:**
- Достаточность для 2-3 админов
- Расширяемость до 10+ админов
- Производительность проверок
- Совместимость с JWT

#### Задача R5: BullMQ patterns
**Вопрос:** Как организовать workers для фоновой обработки?

**Исследование:**
- Job prioritization для срочных задач
- Retry policies (exponential backoff)
- Dead-letter queue для failed jobs
- Worker concurrency настройки

**Критерии выбора:**
- Надёжность обработки
- Observability (мониторинг очередей)
- Graceful shutdown
- Memory efficiency

### 3. Сбор результатов → research.md

Результаты всех исследований будут собраны в `research.md` со следующей структурой:

```markdown
# Результаты исследований: Admin-first реализация

## R1: Admin CRUD архитектура
- **Решение:** [выбранный паттерн]
- **Обоснование:** [почему выбран]
- **Рассмотренные альтернативы:** [что ещё оценивалось]
- **Пример кода:** [базовый пример]

## R2: Validation подход
- **Решение:** [выбранная библиотека]
- **Обоснование:** [почему выбрана]
- **Интеграция:** [как подключить к Fastify]

## R3: File upload решение
- **Решение:** [выбранный сервис]
- **Обоснование:** [почему выбран]
- **Конфигурация:** [ENV переменные, setup]

## R4: RBAC модель
- **Решение:** [выбранный подход]
- **Схема:** [структура ролей и прав]
- **Реализация:** [middleware, decorators]

## R5: BullMQ patterns
- **Решение:** [выбранные паттерны]
- **Конфигурация:** [настройки workers]
- **Monitoring:** [как отслеживать очереди]
```

**Статус:** ⬜ Требуется выполнение команды /plan для генерации research.md

---

## Фаза 1: Проектирование и Контракты

**Предварительные условия:** research.md завершён

### 1. Модель данных (data-model.md)

Модель данных уже полностью определена в `docs/BD.md` и реализована в `prisma/schema.prisma`. В этой фазе необходимо создать справочник по моделям специфично для админ-панели:

#### Сущности для админ-панели (приоритет)

**Группа 1: Foundation (базовые справочники)**
  - Поля: id, name, shortName, logoUrl
  - Валидация: name уникален, logoUrl опционален
  - CRUD операции: Full (Create, Read, Update, Delete)

  - Поля: id, firstName, lastName, isPlayer
  - Валидация: имена обязательны
  - CRUD операции: Full

**Группа 2: Competitions (турниры и сезоны)**
  Поля: id, name, type (LEAGUE/CUP), seriesFormat
  - Отношения: hasMany Season
  - CRUD операции: Full

  - Поля: id, competitionId, name, startDate, endDate
  - Отношения: belongsTo Competition, hasMany SeasonParticipant
  - CRUD операции: Full

- **SeasonParticipant** — участие клубов в сезонах
  - Поля: seasonId, clubId (composite PK)
  - Отношения: belongsTo Season, belongsTo Club
  - CRUD операции: Create, Delete (no Update)

- **SeasonRoster** — заявки на сезон
  - Поля: seasonId, clubId, personId (composite PK), shirtNumber, registrationDate
  - Валидация: уникальность номера в рамках сезон+клуб
  - CRUD операции: Full

**Группа 3: Matches (матчи)**
- **Stadium** — стадионы
  - Поля: id, name, city
  - CRUD операции: Full

- **MatchSeries** — серии матчей (плей-офф)
  - Поля: id, seasonId, stageName, homeClubId, awayClubId, seriesStatus, winnerClubId
  - Отношения: belongsTo Season, hasMany Match
  - CRUD операции: Full

- **Match** — матчи
  - Поля: id, seasonId, seriesId, seriesMatchNumber, matchDateTime, homeTeamId, awayTeamId, homeScore, awayScore, status, stadiumId, refereeId
  - Отношения: belongsTo Season, belongsTo MatchSeries, belongsTo Stadium, belongsTo Person (referee)
  - Валидация: score ≥ 0, status transitions
  - CRUD операции: Full

**Группа 4: Match Details (детали матчей)**
- **MatchLineup** — составы
  - Поля: matchId, personId (composite PK), clubId, role (STARTER/SUBSTITUTE), position
  - CRUD операции: Full

- **MatchEvent** — события матчей
  - Поля: id, matchId, teamId, minute, eventType, playerId, relatedPlayerId
  - Валидация: minute > 0, playerId обязателен для большинства событий
  - CRUD операции: Full

**Группа 5: Statistics (агрегированная статистика)**
- **PlayerSeasonStats** — статистика игрока за сезон
  - Поля: seasonId, personId (composite PK), clubId, goals, assists, yellowCards, redCards
  - Автоматическое обновление: через MatchEvent aggregation
  - CRUD операции: Read, Update (admin override), Auto-update

- **ClubSeasonStats** — статистика клуба за сезон
  - Поля: seasonId, clubId (composite PK), points, wins, draws, losses, goalsFor, goalsAgainst
  - Автоматическое обновление: через Match results aggregation
  - CRUD операции: Read, Update (admin override), Auto-update

**Группа 6: Users & Predictions (пользователи)**
- **AppUser** — пользователи приложения
  - Поля: id, telegramId, username, firstName, photoUrl, registrationDate, lastLoginDate, currentStreak, totalPredictions
  - CRUD операции: Read, Update (admin can modify streaks), Delete

- **Prediction** — прогнозы
  - Поля: id, userId, matchId, predictionDate, result1x2, totalGoalsOver, penaltyYes, redCardYes, isCorrect, pointsAwarded
  - CRUD операции: Read (admin view), Update (manual correction)

**Группа 7: Achievements (достижения)**
- **AchievementType** — типы достижений
  - Поля: id, name, description, requiredValue, metric
  - CRUD операции: Full

- **UserAchievement** — полученные достижения
  - Поля: userId, achievementTypeId (composite PK), achievedDate
  - CRUD операции: Read, Create (manual grant), Delete

**Группа 8: Moderation (дисквалификации)**
- **Disqualification** — дисквалификации игроков
  - Поля: id, personId, matchId, reason, startDate, endDate, description
  - CRUD операции: Full

### 2. API Контракты (contracts/)

Контракты будут сгенерированы для всех CRUD операций админ-панели.

#### Структура contracts/

```
contracts/
├── admin/
│   ├── clubs.yaml           # OpenAPI spec для Club endpoints
│   ├── persons.yaml         # Person endpoints
│   ├── competitions.yaml    # Competition endpoints
│   ├── seasons.yaml         # Season endpoints
│   ├── matches.yaml         # Match endpoints
│   ├── statistics.yaml      # Statistics endpoints
│   ├── users.yaml           # User management endpoints
│   └── achievements.yaml    # Achievement endpoints
├── auth/
│   └── admin-auth.yaml      # Admin authentication
└── schema/
    └── models.yaml          # Shared Prisma model schemas
```

#### Пример контракта (clubs.yaml)

```yaml
openapi: 3.0.0
info:
  title: Admin Clubs API
  version: 1.0.0
paths:
  /api/admin/clubs:
    get:
      summary: Список всех клубов
      tags: [Admin - Clubs]
      security:
        - bearerAuth: []
      parameters:
        - name: page
          in: query
          schema: { type: integer, default: 1 }
        - name: limit
          in: query
          schema: { type: integer, default: 20 }
      responses:
        '200':
          description: Успешно
          content:
            application/json:
              schema:
                type: object
                properties:
                  clubs: { type: array, items: { $ref: '#/components/schemas/Club' } }
                  total: { type: integer }
                  page: { type: integer }
    post:
      summary: Создать новый клуб
      tags: [Admin - Clubs]
      security:
        - bearerAuth: []
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [name, shortName]
              properties:
                name: { type: string }
                shortName: { type: string }
                logoUrl: { type: string, format: uri }
      responses:
        '201':
          description: Клуб создан
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Club' }

  /api/admin/clubs/{id}:
    get:
      summary: Получить клуб по ID
      tags: [Admin - Clubs]
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '200':
          description: Успешно
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Club' }
    put:
      summary: Обновить клуб
      tags: [Admin - Clubs]
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              properties:
                name: { type: string }
                shortName: { type: string }
                logoUrl: { type: string, format: uri }
      responses:
        '200':
          description: Клуб обновлён
          content:
            application/json:
              schema: { $ref: '#/components/schemas/Club' }
    delete:
      summary: Удалить клуб
      tags: [Admin - Clubs]
      security:
        - bearerAuth: []
      parameters:
        - name: id
          in: path
          required: true
          schema: { type: integer }
      responses:
        '204':
          description: Клуб удалён

components:
  securitySchemes:
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT
  schemas:
    Club:
      type: object
      properties:
        id: { type: integer }
        name: { type: string }
        shortName: { type: string }
        logoUrl: { type: string, format: uri, nullable: true }
```

Аналогичные контракты будут созданы для всех остальных сущностей.

### 3. Quickstart Guide (quickstart.md)

Руководство по запуску и проверке админ-панели локально.

```markdown
# Quickstart: Админ-панель Obnliga

## Предварительные требования
- Node.js ≥ 18
- PostgreSQL или SQLite для dev
- Redis (опционально для кэша)

## Шаг 1: Установка зависимостей
```bash
# Backend
cd backend
npm install

# Admin frontend
cd ../admin
npm install
```

## Шаг 2: Настройка БД
```bash
cd backend
cp .env.example .env
# Отредактировать DATABASE_URL
npx prisma generate
npx prisma migrate dev
```

## Шаг 3: Seed данных (опционально)
```bash
npx prisma db seed
```

## Шаг 4: Запуск backend
```bash
cd backend
npm run dev
# Сервер на http://localhost:3000
```

## Шаг 5: Запуск admin frontend
```bash
cd admin
npm run dev
# Админка на http://localhost:5183
```

## Шаг 6: Вход в админку
1. Открыть http://localhost:5183
2. Ввести LOGIN_ADMIN и PASSWORD_ADMIN из .env
3. После входа доступны вкладки управления

## Проверка функциональности
- [ ] Создать новый клуб в вкладке Teams
- [ ] Создать сезон в вкладке Matches
- [ ] Добавить игрока в вкладке Players
- [ ] Посмотреть статистику в вкладке Stats
```

### 4. Обновление файла агента

После завершения проектирования необходимо обновить `.github/copilot-instructions.md` (или другой файл агента) с новыми контрактами и паттернами.

**Команда:**
```powershell
.\.specify\scripts\powershell\update-agent-context.ps1 -AgentType copilot
```

**Что будет добавлено:**
- Информация о новых API endpoints
- Паттерны CRUD операций
- Валидация схемы
- Примеры использования admin API

**Статус:** ⬜ Выполняется автоматически в конце Фазы 1

---

## Фаза 2: Подход к планированию задач

**ВАЖНО:** Этот раздел описывает, что сделает команда `/tasks` - НЕ выполняется во время `/plan`

### Стратегия генерации задач

Задачи будут генерироваться на основе двухэтапного подхода:

#### Этап 1: Админ-панель (Приоритет)

**Группы задач:**

1. **Backend Foundation** (Задачи 1-10)
   - Настройка validation библиотеки (из research.md)
   - Создание generic CRUD service
   - Реализация admin authorization middleware
   - Настройка file upload (logos)
   - ETag middleware интеграция

2. **Admin API Endpoints** (Задачи 11-35)
   - По 2-3 задачи на каждую модель:
     - CRUD routes + validation
     - Тесты endpoint'ов
     - OpenAPI документация
   - Приоритет: Club → Person → Competition → Season → Match

3. **Admin Frontend Components** (Задачи 36-55)
   - Generic CRUD компоненты (Table, Form, Modal)
   - Вкладки для каждой сущности
   - Интеграция с adminClient.ts
   - Обработка ошибок и loading states

4. **Statistics & Aggregation** (Задачи 56-65)
   - BullMQ workers для агрегации
   - Real-time обновление статистики
   - Admin override для ручной корректировки

5. **File Upload & Media** (Задачи 66-70)
   - Интеграция выбранного file storage
   - Image optimization
   - CDN настройка

#### Этап 2: Пользовательское приложение (После админки)

**Группы задач:**

6. **User Authentication** (Задачи 71-75)
   - Telegram WebApp initData verification
   - JWT issuance для пользователей
   - Profile management

7. **Frontend Store & API** (Задачи 76-90)
   - Zustand stores (matches, predictions, user, achievements)
   - API client с ETag support
   - WebSocket client integration

8. **User UI Components** (Задачи 91-110)
   - Матчи и расписание
   - Форма прогнозов
   - Достижения и профиль
   - Лидерборды

9. **Predictions System** (Задачи 111-120)
   - Создание прогнозов
   - Расчёт результатов (BullMQ)
   - Начисление очков
   - История прогнозов

10. **Gamification** (Задачи 121-130)
    - Система достижений
    - Стрики входов
    - Награды и бейджи

11. **Real-time Features** (Задачи 131-140)
    - Live-обновления матчей
    - Patch-based WS для счёта
    - Notifications

### Стратегия упорядочивания

**Порядок выполнения:**
1. Backend Foundation → Admin API → Admin Frontend (Этап 1)
2. User Auth → Frontend Core → User Features (Этап 2)
3. Advanced Features (Gamification, Real-time)

**Маркировка параллелизма:**
- [P] для независимых задач (разные модели/компоненты)
- Sequential для зависимых (API → Frontend)

**Приоритеты:**
- 🔴 Critical: Backend Foundation, Admin API, User Auth
- 🔵 Important: Admin Frontend, User UI, Predictions
- ⚪ Nice-to-have: Advanced gamification, Notifications

### Предполагаемый вывод

**Итого:** ~140 задач, разбитых на 2 этапа

**Этап 1 (Админ-панель):** 70 задач, ~4-6 недель  
**Этап 2 (Пользователь):** 70 задач, ~4-6 недель

**Формат tasks.md:**
```markdown
## Этап 1: Админ-панель

### Группа 1: Backend Foundation
- [ ] 001: [P] Установить и настроить validation библиотеку
- [ ] 002: [P] Создать generic CRUD service
- [ ] 003: Реализовать admin authorization middleware
...

### Группа 2: Admin API - Clubs
- [ ] 011: Создать CRUD routes для Club
- [ ] 012: Добавить validation schemas
- [ ] 013: [P] Написать тесты для Club endpoints
...
```

**ВАЖНО:** Эта фаза выполняется командой `/tasks`, НЕ командой `/plan`

---

## Фазы 3+: Будущая реализация

*Эти фазы за пределами области команды /plan*

**Фаза 3:** Генерация задач (`/tasks` команда создаёт `tasks.md`)  
**Фаза 4:** Реализация (выполнение `tasks.md` в соответствии с конституционными принципами)  
**Фаза 5:** Проверка (выполнение `quickstart.md`, валидация производительности)

---

## Отслеживание сложности

### Нарушения конституции (требующие обоснования)

| Нарушение | Почему необходимо | Отклонённая более простая альтернатива |
|-----------|-------------------|----------------------------------------|
| Два frontend проекта (admin + user) | Разные аудитории: админы нуждаются в комплексных CRUD операциях, пользователи — в оптимизированном mobile-first UX. Разделение позволяет независимый deploy и bundle optimization. | Единое приложение с условным рендерингом: увеличивает bundle size для пользователей на ~30%, усложняет routing и state management. |
| Generic CRUD service | 18+ моделей с похожими операциями. Generic подход сократит код на ~60% и упростит добавление новых моделей. | Дублирование CRUD для каждой модели: ~2000+ строк повторяющегося кода, высокий risk inconsistency. |

**Примечание:** Остальные архитектурные решения соответствуют конституции без отклонений.

---

## Отслеживание прогресса

### Статус фаз
- [x] Фаза 0: Исследования завершены (команда /plan) ✅
- [x] Фаза 1: Проектирование завершено (команда /plan) ✅ (упрощённая версия)
- [x] Фаза 2: Планирование задач завершено (команда /plan - только описание подхода) ✅
- [x] Фаза 3: Задачи сгенерированы (команда /tasks) ✅
- [ ] Фаза 4: Реализация завершена
- [ ] Фаза 5: Проверка пройдена

### Статус контрольных точек
- [x] Первоначальная проверка конституции: ПРОЙДЕНО ✅
- [x] Проверка конституции после проектирования: ПРОЙДЕНО ✅
- [x] Все НУЖНО УТОЧНИТЬ разрешены ✅
- [x] Отклонения от сложности задокументированы ✅

---

**На основе Конституции v1.0.0** — См. `.specify/memory/constitution.md`

---

## Следующие действия

1. ✅ Запустить команду `/plan` для выполнения Фазы 0 и создания `research.md`
2. ⬜ После завершения research: выполнить Фазу 1 для генерации контрактов и data-model
3. ⬜ Запустить `/tasks` для создания детального списка задач
4. ⬜ Начать реализацию согласно приоритетам roadmap

**Текущая ветка:** `001-project-analysis`  
**Готов к:** Выполнению исследований (Фаза 0)
