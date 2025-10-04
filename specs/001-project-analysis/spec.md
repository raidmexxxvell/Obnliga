# Спецификация: Анализ проекта "Футбольная Лига Обнинска"

**Ветка функции:** `001-project-analysis`  
**Создано:** 4 октября 2025 г.  
**Статус:** Завершён  
**Источник:** Анализ папок `audit/` и `docs/`

---

## 📋 Краткое резюме проекта

**Obnliga** — это Telegram WebApp для управления локальной футбольной лигой города Обнинск с акцентом на максимальную вовлечённость пользователей, live-обновления матчей, систему прогнозов, достижений и магазин.

### 🎯 Ключевые цели
- **Вовлечённость**: Реалтайм-обновления матчей, система ставок/прогнозов, достижения
- **Масштабируемость**: Простая архитектура БД для расширения лиг, команд, игроков
- **Производительность**: Multilevel cache (in-memory LRU + Redis), ETag/SWR, patch-based WebSocket
- **Администрирование**: Отдельная админ-панель для управления матчами, командами, игроками

---

## 🏗️ Архитектура проекта

### Стек технологий

#### Backend
- **Фреймворк**: Node.js + TypeScript + Fastify
- **База данных**: SQLite (dev) / PostgreSQL (production на Render)
- **ORM**: Prisma
- **Кэширование**: Redis + in-memory LRU (quick-lru)
- **Очереди**: BullMQ (для обработки ставок и расчёта результатов)
- **Realtime**: Fastify WebSocket + Redis pub/sub

#### Frontend
- **Основное приложение**: Vite + React/Preact + TypeScript
- **Админ-панель**: Отдельный Vite проект в `admin/`
- **State management**: Zustand (через store façade)
- **Дизайн**: Неокубизм с неоновыми акцентами, стеклянные панели

#### Инфраструктура
- **Хостинг**: Render.com
- **CI/CD**: GitHub Actions
- **Мониторинг**: Планируется Sentry + Prometheus

---

## 🗄️ Структура базы данных

БД спроектирована согласно `docs/BD.md` и полностью реализована в `prisma/schema.prisma`.

### Основные группы таблиц

#### 1️⃣ Базовые справочники (Foundation)
- **Club** — футбольные клубы (название, логотип)
- **Person** — люди (игроки, судьи)
- **Club_Player** — шаблон состава клуба (привязка игроков к клубам)

#### 2️⃣ Структура турниров (Competition Structure)
- **Competition** — турниры (Высшая Лига, 1я Лига и т.д.)
- **Season** — сезоны турниров
- **SeasonParticipant** — участники сезона
- **SeasonRoster** — заявки команд на сезон (игроки + номера)

#### 3️⃣ Матчи и расписание
- **Stadium** — стадионы
- **MatchSeries** — серии матчей (плей-офф, противостояния)
- **Match** — отдельные матчи
  - Поддержка серий через `series_id` и `series_match_number`
  - Статусы: SCHEDULED, LIVE, FINISHED, POSTPONED

#### 4️⃣ Детали матчей
- **MatchLineup** — составы команд на матч
- **MatchEvent** — события (голы, карточки, замены)

#### 5️⃣ Агрегированная статистика
- **PlayerSeasonStats** — статистика игрока за сезон
- **PlayerClubCareerStats** — карьерная статистика за клуб
- **ClubSeasonStats** — статистика клуба за сезон

#### 6️⃣ Пользователи и прогнозы
- **AppUser** — пользователи приложения
  - Интеграция с Telegram (`telegramId`, `username`, `firstName`)
  - Трекинг серий входов (`current_streak`, `last_login_date`)
  - Поле `photoUrl` для аватаров
- **Prediction** — прогнозы на матчи
  - Типы: исход (1X2), тотал, пенальти, удаления
  - Начисление очков после матча

#### 7️⃣ Достижения
- **AchievementType** — типы достижений
- **UserAchievement** — полученные достижения

#### 8️⃣ Дисквалификации
- **Disqualification** — дисквалификации игроков

### Важные особенности БД

✅ **100% соответствие BD.md** — все 8 разделов схемы полностью реализованы  
✅ **Очистка выполнена** — удалены устаревшие таблицы (AdminLog, старая модель User)  
✅ **Унификация** — модель `User` заменена на `AppUser` во всём коде  
✅ **Типизация** — убраны все `(prisma as any)` обходы

---

## 🚀 Система кэширования

Реализована multilevel cache стратегия согласно `docs/cache.md`.

### Уровни кэша

1. **In-memory LRU** (quick-lru)
   - Быстрый доступ на уровне процесса
   - Защита от кэш-бомб: лимит 50 записей на пользователя

2. **Redis**
   - Shared cache между инстансами
   - Pub/Sub для инвалидации

### TTL политики

| Категория | Ключ | TTL | Обоснование |
|-----------|------|-----|-------------|
| **Критичное** | `league:table` | 5-30с | Часто меняющиеся данные |
| | `md:stats:{id}` | Realtime | Live-статистика матча |
| **Важное** | `predictions:user:{id}` | 2-5мин | Прогнозы пользователя |
| | `lb:*` | 1мин | Лидерборды |
| **Стабильное** | `achievements:v1` | 30мин | Редко изменяющиеся |

### Инвалидация

- **Automatic**: По TTL + продление при 304 Not Modified
- **Event-driven**: WebSocket события → инвалидация связанных ключей
  - `match_results_update` → `league:table`, `league:stats`
  - `schedule_update` → `league:schedule`

### ETag поддержка

- Middleware: `backend/src/plugins/etag.ts`
- Клиент отправляет `If-None-Match`
- Сервер возвращает `304` при совпадении

---

## 🌐 Realtime система

### Архитектура

```
Клиент WS ←→ Fastify WebSocket ←→ Redis Pub/Sub ←→ Другие инстансы
```

### Протокол сообщений

```typescript
{
  protocolVersion: 1,
  type: 'patch' | 'full',
  topic: string,
  payload: any
}
```

### Топики подписок

- `tab:<name>` — обновления для конкретной вкладки
- `user:<userId>` — персональные обновления пользователя
- `match:<matchId>` — события конкретного матча

### Reconnect стратегия

- Экспоненциальный backoff: 500ms → 30s cap
- Jitter для распределения нагрузки

---

## 👥 Пользовательские сценарии

### Основной пользовательский поток

1. **Вход в приложение**
   - Пользователь открывает Telegram WebApp
   - Автоматическая аутентификация через `initData` (server-side verification)
   - Выдача JWT токена

2. **Просмотр матчей**
   - Загрузка расписания с ETag
   - Live-обновления через WebSocket при LIVE статусе
   - Отображение счёта, времени, событий

3. **Создание прогноза**
   - Выбор матча
   - Указание прогнозов (исход, тотал, пенальти, удаления)
   - Подтверждение и сохранение

4. **Просмотр достижений**
   - Отображение полученных достижений
   - Прогресс до следующих достижений

### Админский поток

1. **Вход в админ-панель**
   - Авторизация через `/api/admin/login` (ENV переменные)
   - Получение JWT токена
   - Доступ к вкладкам: Команды, Матчи, Статистика, Игроки, Новости

2. **Управление матчем**
   - Создание/редактирование матча
   - Обновление счёта → публикация в Redis → realtime клиентам
   - Добавление событий (голы, карточки)

---

## 📊 Текущее состояние проекта

### ✅ Реализовано (согласно roadmap.md)

#### Фаза 0: Скелет проекта ✅
- Backend: Fastify bootstrap с /health endpoint
- Frontend: Vite + React skeleton
- Shared: Базовые типы

#### Фаза 1: Prisma + БД ✅
- Полная схема БД (8 разделов)
- Миграции для PostgreSQL
- Интеграция Prisma Client
- Очистка устаревших моделей
- Добавление `photoUrl` в AppUser

#### Фаза 2: Core API 🟨 (частично)
- ✅ Health endpoint
- ✅ Demo cache endpoints
- ✅ Admin login endpoint
- ⬜ ETag middleware (запланирован)
- ⬜ Auth/telegram-init (в разработке)

#### Фаза 3: Multilevel cache ✅
- ✅ Skeleton multilevelCache
- ✅ LRU + Redis pub/sub
- 🟨 Smart invalidation (требует доработки)

#### Фаза 7: Admin panel 🟨 (частично)
- ✅ Отдельный проект `admin/`
- ✅ Авторизация через ENV
- ✅ Вкладочная структура (заглушки)
- ⬜ CRUD операции для моделей

### ⬜ В планах

#### Фаза 4: Realtime WebSocket
- Полная интеграция WS клиента
- Версионирование протокола
- ACL для топиков

#### Фаза 5: Frontend core
- Store façade (Zustand modules)
- api/etag.ts wrapper
- Telegram WebApp integration

#### Фаза 6: Shop / Bets
- Shop items endpoints
- Cart persistence
- BullMQ workers для расчёта ставок

#### Фазы 8-10: Тестирование, CI/CD, Production
- Unit/Integration тесты
- E2E тесты (Playwright)
- Sentry + Prometheus
- Performance оптимизация

---

## 🎨 Визуальная система

Дизайн следует принципам из `docs/style.md`:

### Стиль: Неокубизм с неоновыми акцентами

**Цветовая палитра:**
- `--neon-cyan`: #00f0ff
- `--neon-magenta`: #781f8f
- `--accent`: #7aff6a
- Фоны: глубокие ночные градиенты

**Компоненты:**
- Сплеш-экран: логотип с анимацией `logoPop`, heartbeat, прогресс-бар
- Карточки: полупрозрачные с `backdrop-filter: blur`
- Скругления: 8-12px

**Анимации:**
- Короткие (≤700ms)
- Eased cubic-bezier для "pop" эффектов

**Типографика:**
- Segoe UI, Roboto, Arial, sans-serif
- Заголовки: uppercase, letter-spacing: 1px

---

## 🔧 Audit trail (история изменений)

### Ключевые изменения (из audit/changes/)

1. **0001-profile-fix.md** — Исправление профиля пользователя
2. **0002-realtime-profile.md** — Интеграция WebSocket для профиля
3. **0003-cleanup-editing.md** — Очистка редактирования
4. **0004-admin-dashboard.md** — Создание админ-панели
5. **0005-backend-sync.md** — Синхронизация backend
6. **0006-database-cleanup.md** — Очистка БД (удаление AdminLog, User→AppUser)
7. **0007-profile-websocket-fix.md** — Исправление WebSocket для профиля
8. **0008-add-photo-url.md** — Добавление поля photoUrl

---

## 📈 Метрики и влияние

### Retention (Удержание) 🔵
- Live-обновления → более плавный UX
- Достижения и стрики → gamification
- Быстрые отклики через cache

### Engagement (Вовлечённость) 🔵
- Система прогнозов с начислением очков
- Лидерборды
- Магазин (планируется)

### Tech Stability (Техническая стабильность) 🔴
- Multilevel cache → снижение latency
- ETag → экономия трафика
- Типизация → меньше runtime ошибок
- Audit trail → прозрачность изменений

---

## 🚦 Следующие приоритетные шаги

### Высокий приоритет 🔴

1. **Завершить ETag middleware**
   - Реализовать `backend/src/plugins/etag.ts`
   - Интеграция в основные endpoints
   - Frontend wrapper `api/etag.ts`

2. **Telegram WebApp auth flow**
   - Endpoint `/api/auth/telegram-init`
   - Server-side `initData` verification
   - JWT issuance

3. **Smart cache invalidation**
   - Интеграция в места записи в БД
   - Publish в Redis channels
   - Тесты на consistency

4. **CRUD endpoints для админки**
   - Реализация операций для всех моделей
   - Интеграция с admin frontend

### Средний приоритет 🔵

5. **Realtime WebSocket доработка**
   - ACL для топиков
   - Версионирование протокола
   - Frontend WS client с reconnect

6. **Store façade**
   - Zustand modules: matchesStore, userStore, shopStore
   - SWR-like revalidation

7. **Unit/Integration тесты**
   - Jest для backend
   - Supertest для endpoints
   - Frontend component tests

---

## 📚 Ключевые документы

### Обязательные к изучению

- **docs/BD.md** — Полная спецификация схемы БД
- **docs/project.md** — Общее описание проекта и статус
- **docs/roadmap.md** — Детальный план развития по фазам
- **docs/state.md** — Контракт store/state management
- **docs/cache.md** — Политика кэширования

### Справочные

- **docs/style.md** — Визуальная система
- **docs/prisma.md** — Работа с Prisma
- **audit/bd-compliance-analysis.md** — Соответствие БД спецификации
- **audit/tables-cleanup-analysis.md** — Анализ очистки таблиц

---

## ✅ Контрольный список качества

### Качество содержания
- [x] Понятна суть приложения (футбольная лига с вовлечённостью)
- [x] Архитектура описана (backend, frontend, БД, cache)
- [x] Текущее состояние зафиксировано
- [x] Приоритеты определены

### Полнота анализа
- [x] Изучены все файлы в audit/ и docs/
- [x] Понятна структура БД (8 разделов)
- [x] Система кэширования ясна
- [x] Realtime архитектура понятна
- [x] Дизайн-система описана
- [x] Roadmap изучен

### Статус выполнения
- [x] Документация прочитана
- [x] Ключевые концепции извлечены
- [x] Схема БД проанализирована
- [x] Кэш-политики изучены
- [x] История изменений просмотрена
- [x] Следующие шаги определены

---

## 🎯 Заключение

**Obnliga** — это технически продуманный проект с:

- ✅ Чётко структурированной БД (полное соответствие спецификации)
- ✅ Современной архитектурой (multilevel cache, realtime WS, ETag)
- ✅ Хорошей документацией (audit trail, roadmap, спецификации)
- ✅ Прогрессом в реализации (скелет готов, админка создана, БД очищена)

**Основные сильные стороны:**
1. Масштабируемость БД — легко добавлять лиги, команды, турниры
2. Performance-first подход — cache на всех уровнях
3. Real-time UX — WebSocket для живых обновлений
4. Чистая архитектура — типизация, audit, separation of concerns

**Текущие вызовы:**
1. Завершить core API endpoints (auth, matches, predictions)
2. Интегрировать ETag и smart invalidation
3. Подключить frontend к realtime
4. Покрыть тестами критичные потоки

Проект находится в активной разработке (Фазы 0-3 в основном завершены, Фазы 4-10 впереди) и готов к дальнейшему развитию согласно roadmap.
