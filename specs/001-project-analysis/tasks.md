# Задачи: От текущего состояния до полнофункционального приложения

**Входные данные:** Документы проектирования из `/specs/001-project-analysis/`  
**Предварительные условия:** ✅ plan.md, ✅ research.md  
**Дата создания:** 4 октября 2025 г.  
**Обновлено:** 4 октября 2025 г. (убраны уже реализованные функции, тесты, background workers)

---

## ⚠️ Важные примечания

- ❌ **Тесты исключены** — тестирование выполняется вручную
- ❌ **BullMQ workers исключены** — это платные функции на Render.com, обойдёмся без них пока
- ✅ **Проверено существующее** — не дублируем уже реализованный функционал из `adminRoutes.ts`

---

**[ ] T000** Провести анализ MCP Context7 и сохранить summary
→ Файл: `audit/mcp-context7-summary-phase-1.md`
→ Действие: собрать текущее состояние (SPEC, PLAN, TASKS), проверить соответствие принципам устава и задокументировать выводы и коррекции перед началом работ по фазе 1
→ Обязательное требование устава: обновить перед началом реализации фазы


## Обзор

Этот документ содержит список оставшихся задач для реализации Obnliga:
- **Этап 1 (Приоритет):** Доработка админ-панели
- **Этап 2:** Пользовательское приложение с вовлечённостью

**Структура проекта:** Веб-приложение  
- Backend: `backend/src/`
- Frontend (пользователь): `frontend/src/`
- Admin (админ-панель): `admin/src/`

---

## ✅ Уже реализовано (НЕ ТРОГАТЬ!)

### Backend
- ✅ Admin authentication (`/api/admin/login`)
- ✅ CRUD для всех основных моделей в `adminRoutes.ts` (1340 строк):
  - Clubs, Persons, Competitions, Seasons, Stadiums
  - Matches, MatchSeries, MatchLineup, MatchEvents
  - AppUser, Predictions, Achievements, Disqualifications
  - Statistics (PlayerSeasonStats, ClubSeasonStats)
- ✅ Match finalization logic (`handleMatchFinalization`)
- ✅ Season automation (`runSeasonAutomation`, `createSeasonPlayoffs`)
- ✅ Prisma integration
- ✅ Cache routes (demo)
- ✅ User routes, Auth routes

### Frontend (Admin)
- ✅ DashboardLayout
- ✅ LoginForm
- ✅ ClubRosterModal
- ✅ TabPlaceholder
- ✅ Все вкладки (TeamsTab, MatchesTab, PlayersTab, StatsTab, UsersTab)
- ✅ Admin store (Zustand)
- ✅ Admin API client

### Frontend (User)
- ✅ Profile.tsx
- ✅ wsClient.ts (WebSocket client)
- ✅ Базовый App.tsx
- ✅ Стили (app.css, неокубизм)

---

---

## ЭТАП 1: ДОРАБОТКА АДМИН-ПАНЕЛИ

### Фаза 1.1: Backend - Дополнительные возможности (T001-T010)

#### File Upload для логотипов и фото

**[ ] T001** Настроить Cloudinary интеграцию  
→ Файл: `backend/src/services/uploadService.ts`  
→ Функция: `uploadImage(file, folder, publicId)`  
→ Использовать: `cloudinary` npm package  
→ ENV: CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET

**[ ] T002** Добавить endpoint для загрузки логотипа Club  
→ Файл: `backend/src/routes/adminRoutes.ts` (добавить в существующий)  
→ Endpoint: `POST /api/admin/clubs/:id/logo`  
→ Использовать @fastify/multipart для file upload  
→ После загрузки обновить Club.logoUrl

**[ ] T003** Добавить endpoint для загрузки фото Person  
→ Файл: `backend/src/routes/adminRoutes.ts`  
→ Endpoint: `POST /api/admin/persons/:id/photo`  
→ Аналогично T002

**[ ] T004** Добавить endpoint для загрузки фото AppUser  
→ Файл: `backend/src/routes/adminRoutes.ts`  
→ Endpoint: `POST /api/admin/users/:id/photo`  
→ Обновить AppUser.photoUrl

#### Улучшения существующих endpoints

**[ ] T005** Добавить пагинацию в GET /api/admin/* списки  
→ Файлы: все GET endpoints в `adminRoutes.ts`  
→ Query params: `?page=1&limit=20`  
→ Response: `{ data: [...], total, page, totalPages }`

**[ ] T006** Добавить поиск/фильтры для основных списков  
→ Clubs: поиск по name  
→ Persons: фильтр по isPlayer, поиск по имени  
→ Matches: фильтр по seasonId, status, date range  
→ Users: поиск по username, telegramId

**[ ] T007** Добавить валидацию входных данных  
→ Использовать TypeBox (рекомендация из research.md — компактная схема и нативная интеграция с Fastify JSON Schema)  
→ Минимум для: Club, Person, Competition, Season, Match создания/обновления  
→ Возвращать 400 с понятными ошибками

**[ ] T008** Добавить RBAC roles в JWT  
→ Файл: `backend/src/routes/authRoutes.ts` (admin login)  
→ Добавить поле `role` в JWT payload: 'super_admin' | 'admin' | 'readonly'  
→ По умолчанию 'admin'  
→ Файл: `shared/types.ts` — добавить AdminRole enum

**[ ] T009** Создать middleware для проверки roles  
→ Файл: `backend/src/plugins/auth.ts`  
→ Функция: `requireRole(roles: AdminRole[])`  
→ Использовать в критичных endpoints (DELETE, некоторые POST)

**[ ] T010** Добавить endpoint для просмотра всех доступных API админки  
→ Endpoint: `GET /api/admin/routes`  
→ Возвращать список всех зарегистрированных admin routes с методами

---

### Фаза 1.2: Admin Frontend - Улучшения UI (T011-T025)

#### Generic компоненты для переиспользования

**[ ] T011** Создать DataTable component  
→ Файл: `admin/src/components/generic/DataTable.tsx`  
→ Props: columns, data, onEdit, onDelete, onRowClick, loading  
→ Features: сортировка по столбцам, пагинация UI  
→ Стиль: неокубизм (docs/style.md)

**[ ] T012** Создать CrudForm component  
→ Файл: `admin/src/components/generic/CrudForm.tsx`  
→ Props: fields (массив field config), initialValues, onSubmit, loading  
→ Field types: text, number, date, select, textarea, file  
→ Автоматическая генерация input'ов

**[ ] T013** Создать Modal component  
→ Файл: `admin/src/components/generic/Modal.tsx`  
→ Props: isOpen, onClose, title, children, size  
→ Backdrop, ESC для закрытия, анимация

**[ ] T014** Создать ConfirmDialog component  
→ Файл: `admin/src/components/generic/ConfirmDialog.tsx`  
→ Props: isOpen, title, message, onConfirm, onCancel  
→ Использовать для подтверждения DELETE операций

**[ ] T015** Создать LoadingSpinner component  
→ Файл: `admin/src/components/generic/LoadingSpinner.tsx`  
→ Неоновый spinner согласно style.md  
→ Размеры: small, medium, large

**[ ] T016** Создать ErrorMessage component  
→ Файл: `admin/src/components/generic/ErrorMessage.tsx`  
→ Props: error (string | Error), onRetry  
→ User-friendly display ошибок

#### Доработка вкладок

**[ ] T017** Доработать TeamsTab — использовать DataTable и CrudForm  
→ Файл: `admin/src/components/tabs/TeamsTab.tsx`  
→ Заменить заглушки на реальные CRUD операции  
→ Интеграция с `/api/admin/clubs`  
→ Добавить кнопку Upload Logo (после T002)

**[ ] T018** Доработать PlayersTab  
→ Файл: `admin/src/components/tabs/PlayersTab.tsx`  
→ CRUD для Persons  
→ Фильтр: All / Players / Referees (isPlayer)  
→ Upload Photo кнопка

**[ ] T019** Доработать MatchesTab — секции  
→ Файл: `admin/src/components/tabs/MatchesTab.tsx`  
→ Подвкладки: Competitions, Seasons, Matches, Series  
→ CRUD для каждой секции  
→ Для Matches: inline edit score, change status dropdown

**[ ] T020** Создать MatchDetailsModal  
→ Файл: `admin/src/components/MatchDetailsModal.tsx`  
→ Вкладки: Lineup, Events  
→ Управление составами (добавить/удалить игрока)  
→ Управление событиями (создать goal, card, substitution)

**[ ] T021** Доработать StatsTab  
→ Файл: `admin/src/components/tabs/StatsTab.tsx`  
→ Просмотр PlayerSeasonStats, ClubSeasonStats  
→ Фильтры по сезону  
→ Возможность admin override (ручная корректировка)

**[ ] T022** Доработать UsersTab  
→ Файл: `admin/src/components/tabs/UsersTab.tsx`  
→ Список AppUser с пагинацией  
→ Просмотр профиля пользователя  
→ Ручное обновление currentStreak  
→ Просмотр predictions пользователя  
→ Выдача/удаление achievements

#### Admin API Client доработка

**[ ] T023** Расширить adminClient.ts generic методами  
→ Файл: `admin/src/api/adminClient.ts`  
→ Методы: `getAll<T>(resource, params?)`, `getOne<T>(resource, id)`, `create<T>(resource, data)`, `update<T>(resource, id, data)`, `delete(resource, id)`  
→ Добавить обработку ошибок с toast notifications

**[ ] T024** Добавить методы file upload в adminClient  
→ Файл: `admin/src/api/adminClient.ts`  
→ Метод: `uploadFile(resource, id, file, field)`  
→ Progress callback для отслеживания загрузки

**[ ] T025** Создать React hooks для API  
→ Файл: `admin/src/hooks/useApi.ts`  
→ Hooks: `useGetAll(resource)`, `useGetOne(resource, id)`, `useCreate(resource)`, `useUpdate(resource)`, `useDelete(resource)`  
→ Автоматический loading/error states

---

## ЭТАП 2: ПОЛЬЗОВАТЕЛЬСКОЕ ПРИЛОЖЕНИЕ


### Фаза 2.1: User Authentication (T026-T030)

**[✅] T026** Реализовать Telegram WebApp initData verification  
→ Файл: `backend/src/routes/authRoutes.ts`  
→ Endpoint: `POST /api/auth/telegram-init`  
→ Валидация initData hash (используя TELEGRAM_BOT_TOKEN)  
→ Создание/обновление AppUser  
→ Выдача JWT для пользователя

**[✅] T027** Создать утилиту для Telegram auth  
→ Файл: `backend/src/utils/telegramAuth.ts`  
→ Функции: `parseInitData(initDataString)`, `verifyHash(initData, botToken)`

**[ ] T028** Обновить userStore для Telegram auth  
→ Файл: `frontend/src/store/userStore.ts` (создать если нет)  
→ Action: `telegramInit(initData)`  
→ Сохранение JWT в localStorage  
→ State: `user`, `isAuthenticated`, `loading`, `error`

**[ ] T029** Доработать Profile.tsx  
→ Файл: `frontend/src/Profile.tsx`  
→ Отображение: firstName, photoUrl, registrationDate, currentStreak, totalPredictions  
→ Форматирование дат (dd.MM.yyyy, МСК)  
→ Стиль: неокубизм

**[ ] T030** Добавить auto-login при открытии в Telegram  
→ Файл: `frontend/src/main.tsx` или `App.tsx`  
→ Проверка `window.Telegram.WebApp.initData`  
→ Автоматический вызов `telegramInit()` при наличии

---

### Фаза 2.2: Frontend Store & API (T031-T040)

#### Store modules (Zustand)

**[ ] T031** Создать базовый store façade  
→ Файл: `frontend/src/store/index.ts`  
→ Zustand configuration  
→ Экспорт useStore hook

**[ ] T032** Создать matchesStore  
→ Файл: `frontend/src/store/matchesStore.ts`  
→ State: `matches: Match[]`, `byId: Record<number, Match>`, `loading`, `error`  
→ Actions: `fetchMatches()`, `fetchMatch(id)`, `subscribeToMatch(id)`

**[ ] T033** Создать predictionsStore  
→ Файл: `frontend/src/store/predictionsStore.ts`  
→ State: `userPredictions`, `availableMatches`  
→ Actions: `createPrediction(data)`, `fetchUserPredictions()`

**[ ] T034** Создать achievementsStore  
→ Файл: `frontend/src/store/achievementsStore.ts`  
→ State: `achievements`, `userAchievements`  
→ Actions: `fetchAchievements()`, `fetchUserAchievements()`

**[ ] T035** Создать leaderboardStore  
→ Файл: `frontend/src/store/leaderboardStore.ts`  
→ State: `topPredictors`  
→ Actions: `fetchLeaderboard()`

**[ ] T036** Обновить realtimeStore  
→ Файл: `frontend/src/store/realtimeStore.ts` (создать если нет)  
→ Integration с wsClient  
→ Topics: `match:{id}`, `user:{id}`, `leaderboard`  
→ Reconnect logic (exponential backoff)

#### API Client

**[ ] T037** Создать базовый API client  
→ Файл: `frontend/src/api/apiClient.ts`  
→ Функции: `get(url)`, `post(url, data)`, `put(url, data)`, `delete(url)`  
→ JWT из localStorage в Authorization header  
→ Error handling

**[ ] T038** Создать matches API  
→ Файл: `frontend/src/api/matches.ts`  
→ Функции: `getMatches(filters?)`, `getMatch(id)`, `getSchedule()`

**[ ] T039** Создать predictions API  
→ Файл: `frontend/src/api/predictions.ts`  
→ Функции: `createPrediction(matchId, data)`, `getUserPredictions()`

**[ ] T040** Создать achievements & leaderboard API  
→ Файлы: `frontend/src/api/achievements.ts`, `frontend/src/api/leaderboard.ts`  
→ Функции: `getAchievements()`, `getUserAchievements()`, `getLeaderboard()`

---

### Фаза 2.3: User UI Components (T041-T060)

#### Navigation & Layout

**[ ] T041** Обновить App.tsx с навигацией  
→ Файл: `frontend/src/App.tsx`  
→ Bottom navigation: Home, League, Predictions, Leaderboard, Profile  
→ Tab switching logic  
→ Сплеш с прогрессом при первой загрузке

**[ ] T042** Создать BottomNav component  
→ Файл: `frontend/src/components/BottomNav.tsx`  
→ 5 кнопок: Home, League, Predictions, Leaderboard, Profile  
→ Стиль: неокубизм, active state  
→ Icons (можно SVG или emoji)

**[ ] T043** Обновить splash screen  
→ Файл: `frontend/src/App.tsx` или отдельный компонент  
→ Анимация logo (heartbeat, logoPop из style.md)  
→ Progress bar (симуляция загрузки)  
→ Плавный переход к main UI

#### Home Tab

**[ ] T044** Создать HomeTab component  
→ Файл: `frontend/src/components/tabs/HomeTab.tsx`  
→ Highlights: ближайший матч, недавние результаты  
→ Quick stats (total predictions, accuracy)  
→ Announcements (заглушка пока)

#### League Tab

**[ ] T045** Создать LeagueTab component  
→ Файл: `frontend/src/components/tabs/LeagueTab.tsx`  
→ Секции: Table (standings), Schedule  
→ League table: позиция, команда, очки, разница мячей  
→ Фильтр по сезону

**[ ] T046** Создать MatchCard component  
→ Файл: `frontend/src/components/MatchCard.tsx`  
→ Отображение: команды (логотипы), счёт, время, статус  
→ Live indicator для LIVE матчей (pulsing dot)  
→ Клик → открыть MatchDetails

**[ ] T047** Создать MatchSchedule component  
→ Файл: `frontend/src/components/MatchSchedule.tsx`  
→ Список предстоящих матчей  
→ Группировка по датам  
→ Использовать MatchCard

**[ ] T048** Создать MatchDetails component  
→ Файл: `frontend/src/components/MatchDetails.tsx`  
→ Детальная информация о матче  
→ События (голы, карточки, замены) в timeline  
→ Составы команд  
→ Кнопка "Сделать прогноз" (если матч доступен)

#### Predictions Tab

**[ ] T049** Создать PredictionsTab component  
→ Файл: `frontend/src/components/tabs/PredictionsTab.tsx`  
→ Секции: Available (доступные для прогноза), My Predictions (история)  
→ Список матчей с кнопкой "Predict"

**[ ] T050** Создать PredictionForm component  
→ Файл: `frontend/src/components/PredictionForm.tsx`  
→ Поля:  
  - Result (1X2): Radio buttons  
  - Total Goals Over: Input number (опционально)  
  - Penalty: Checkbox "Will there be a penalty?"  
  - Red Card: Checkbox "Will there be a red card?"  
→ Валидация: прогноз до начала матча  
→ Submit → API → update predictionsStore

**[ ] T051** Создать PredictionCard component  
→ Файл: `frontend/src/components/PredictionCard.tsx`  
→ Отображение своего прогноза  
→ Status: pending (серый), correct (зелёный), incorrect (красный)  
→ Points awarded (если матч завершён)

#### Leaderboard Tab

**[ ] T052** Создать LeaderboardTab component  
→ Файл: `frontend/src/components/tabs/LeaderboardTab.tsx`  
→ Top predictors list  
→ User's position highlight (золотой если в топ-3)  
→ Refresh button

**[ ] T053** Создать LeaderboardList component  
→ Файл: `frontend/src/components/LeaderboardList.tsx`  
→ Ranking (1, 2, 3 с иконками), username, points, avatar  
→ Scroll or pagination

#### Profile Tab

**[ ] T054** Обновить ProfileTab как отдельный компонент  
→ Файл: `frontend/src/components/tabs/ProfileTab.tsx`  
→ User info: firstName, photoUrl, registrationDate  
→ Stats: totalPredictions, correct predictions, accuracy %, currentStreak  
→ Achievements grid (badges)

**[ ] T055** Создать AchievementBadge component  
→ Файл: `frontend/src/components/AchievementBadge.tsx`  
→ Icon (можно emoji), name, description  
→ Locked/unlocked states (grayscale для locked)

**[ ] T056** Создать StreakCounter component  
→ Файл: `frontend/src/components/StreakCounter.tsx`  
→ Current streak display  
→ Animated flame icon (🔥)  
→ "X days in a row!"

#### Shared Components

**[ ] T057** Создать LoadingSpinner (user version)  
→ Файл: `frontend/src/components/LoadingSpinner.tsx`  
→ Неоновый spinner  
→ Использовать в loading states

**[ ] T058** Создать ErrorMessage (user version)  
→ Файл: `frontend/src/components/ErrorMessage.tsx`  
→ User-friendly error display  
→ Retry button

**[ ] T059** Создать EmptyState component  
→ Файл: `frontend/src/components/EmptyState.tsx`  
→ Placeholder для пустых списков  
→ Message + icon/illustration

**[ ] T060** Применить неокубизм стили ко всем компонентам  
→ Проверка соответствия `docs/style.md`  
→ CSS variables из `app.css`  
→ Анимации ≤ 700ms

---

### Фаза 2.4: Predictions System Backend (T061-T065)

**[ ] T061** Создать CRUD routes для Prediction  
→ Файл: `backend/src/routes/predictions/predictionRoutes.ts` (или добавить в существующий)  
→ Endpoints:  
  - `GET /api/predictions/matches` — доступные матчи для прогнозов  
  - `POST /api/predictions` — создать прогноз  
  - `GET /api/predictions/me` — мои прогнозы  
→ Валидация: один прогноз на матч, до начала матча

**[ ] T062** Создать service для расчёта результатов  
→ Файл: `backend/src/services/predictionService.ts`  
→ Функция: `calculatePredictionResults(matchId)`  
→ Логика начисления очков:  
  - Correct result: +3 points  
  - Correct total: +2 points  
  - Correct penalty: +1 point  
  - Correct red card: +1 point  
→ Обновление `isCorrect`, `pointsAwarded`

**[ ] T063** Добавить manual trigger для settlement  
→ Админка: кнопка "Settle Predictions" в MatchDetailsModal  
→ Endpoint: `POST /api/admin/matches/:id/settle-predictions`  
→ Вызывать `calculatePredictionResults(matchId)`  
→ Вместо автоматического worker

**[ ] T064** Создать endpoint для leaderboard  
→ Файл: `backend/src/routes/leaderboard/leaderboardRoutes.ts`  
→ Endpoint: `GET /api/leaderboard/predictors?limit=100`  
→ Запрос: сумма pointsAwarded по пользователям  
→ Кэширование: multilevelCache с TTL 1 мин, key: `lb:predictors`

**[ ] T065** Добавить endpoint для user stats  
→ Файл: `backend/src/routes/userRoutes.ts` (расширить)  
→ Endpoint: `GET /api/users/me/stats`  
→ Response: `{ total, correct, accuracy, totalPoints }`

---

### Фаза 2.5: Gamification (T066-T070)

**[ ] T066** Создать service для проверки достижений (manual trigger)  
→ Файл: `backend/src/services/achievementService.ts`  
→ Функция: `checkAndGrantAchievements(userId)`  
→ Проверка метрик: DAILY_LOGIN, TOTAL_PREDICTIONS, CORRECT_PREDICTIONS  
→ Автоматическая выдача достижений

**[ ] T067** Добавить endpoint для manual check достижений  
→ Endpoint: `POST /api/users/me/check-achievements`  
→ Вызывать `checkAndGrantAchievements(userId)`  
→ Использовать после: login, создание прогноза, settlement

**[ ] T068** Создать service для streak management  
→ Файл: `backend/src/services/streakService.ts`  
→ Функция: `updateStreak(userId)`  
→ Логика: если lastLoginDate < сегодня → увеличить streak или reset

**[ ] T069** Интегрировать streak update в login  
→ Файл: `backend/src/routes/authRoutes.ts`  
→ После успешного Telegram auth → вызвать `updateStreak(userId)`

**[ ] T070** Создать AchievementNotification component (frontend)  
→ Файл: `frontend/src/components/AchievementNotification.tsx`  
→ Toast уведомление при получении достижения  
→ Анимация появления (slide + fade)  
→ Автоматическое скрытие через 5 секунд

---

### Фаза 2.6: Real-time Features (T071-T075)

**[ ] T071** Расширить backend WS для match updates  
→ Файл: `backend/src/realtime/index.ts`  
→ Topics: `match:{matchId}`  
→ Events: `score_update`, `status_change`, `event_created`

**[ ] T072** Добавить broadcast при обновлении счёта  
→ Файл: `backend/src/routes/adminRoutes.ts` (в match update endpoint)  
→ После обновления Match.homeScore/awayScore → broadcast `score_update` через Redis pub/sub

**[ ] T073** Добавить broadcast при создании события  
→ Файл: `backend/src/routes/adminRoutes.ts` (в MatchEvent creation)  
→ После создания event → broadcast `event_created`

**[ ] T074** Подключить live-обновления в MatchCard  
→ Файл: `frontend/src/components/MatchCard.tsx`  
→ Subscribe на `match:{id}` при рендере LIVE матча  
→ Автообновление счёта при получении `score_update`  
→ Smooth transition (анимация изменения счёта)

**[ ] T075** Подключить live-обновления в MatchDetails  
→ Файл: `frontend/src/components/MatchDetails.tsx`  
→ Subscribe на `match:{id}`  
→ Real-time добавление событий в timeline  
→ Smooth animations для новых событий

---

**[ ] T076** Добавить ETag middleware и интеграцию в GET endpoints  
→ Файл: `backend/src/plugins/etag.ts`  
→ Действие: реализовать middleware, подключить к основным GET endpoint'ам (matches, leagues, users), добавить описание в `docs/cache.md` и интеграцию в frontend apiClient

**[ ] T077** Проверить/добавить endpoint user stats  
→ Файл: `backend/src/routes/userRoutes.ts`  
→ Endpoint: `GET /api/users/me/stats`  
→ Response: `{ total, correct, accuracy, totalPoints }`  
→ Если уже реализован — проверить корректность и пометить как ✅


## Приоритеты выполнения

### 🔴 Critical (Must Have для MVP)
1. **Admin UI доработка:** T011-T022 (generic компоненты + основные вкладки)
2. **Telegram Auth:** T026-T030
3. **User App Core:** T031-T043 (stores, API client, navigation)
4. **Predictions System:** T049-T051, T061-T065 (frontend + backend + settlement)

### 🔵 Important (Should Have)
5. **Admin доп. функции:** T001-T010 (file upload, pagination, RBAC)
6. **User Components:** T044-T056 (все вкладки и компоненты)
7. **Leaderboard:** T052-T053, T064
8. **Real-time:** T071-T075 (live-обновления матчей)

### ⚪ Nice-to-have (Could Have)
9. **Gamification:** T066-T070 (achievements, streaks, уведомления)
10. **Advanced Features:** детализация статистики, расширенные фильтры

---

## Коммиты и документация

### Формат коммитов
- `feat(scope): T### краткое описание`
- Примеры:
  - `feat(admin): T011 add DataTable generic component`
  - `feat(user): T026 implement Telegram auth`
  - `feat(backend): T001 add Cloudinary integration`

### Документация
- Обновлять `docs/roadmap.md` после завершения фазы
- Создавать `audit/changes/000X-название.md` для крупных изменений

### Проверка качества
- TypeScript: `npx tsc --noEmit` перед коммитом
- Соответствие конституции (docs/project.md)

---

**Итого задач:** 75  
**Этап 1 (Админ):** 25 задач  
**Этап 2 (Пользователь):** 50 задач

**Статус:** Готово к выполнению ✅  
**Следующее действие:** Протестировать админку и начать с T011 или T026 (в зависимости от приоритета)
