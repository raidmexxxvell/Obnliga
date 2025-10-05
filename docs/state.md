# State / Store — контракт и текущее состояние

Дата: 2025-09-28

Цель:
- Задокументировать фасад стора (store façade) для фронтенда — типы, публичный API, сценарии использования и ожидаемое поведение при real-time обновлениях.

Общий контракт фасада (коротко)
- Inputs: HTTP API (ETag/If-None-Match), WebSocket (patch|full), local persistence (localStorage) для корзины.
- Outputs: подписываемые селекторы/колбеки, синхронные геттеры состояния и асинхронные экшены для мутирующих операций.
- Ошибки: сетевые ошибки/таймауты возвращаются в форме `{ ok: false, error }` для action-методов; store остаётся в консистентном состоянии.

Ядро: фасад store (пример API)
- createStoreFacade(): Store

Store — публичные методы и селекторы (пример)
- getState(): RootState — синхронный снимок
- subscribe(listener: (state) => void): Unsubscribe
- actions:
  - fetchMatches(force?: boolean): Promise<{ ok: boolean }>
  - fetchMatch(id: number): Promise<{ ok: boolean }>
  - placeBet(betPayload): Promise<{ ok: boolean, id?: number }>
  - addToCart(itemId, qty): void
  - syncCart(): Promise<{ ok: boolean }>

Stores (модули)
- matchesStore
  - state: { items: Match[], byId: Record<number, Match>, loading: boolean, etag?: string }
  - actions: fetchMatches, fetchMatch, applyPatch
- lineupStore
  - state: { lineups: Record<number, MatchLineup>, validationErrors: ValidationError[], saveSuccess: boolean }
  - actions: fetchLineup, saveLineup, setPlayerNumber, validateLineup
- realtimeStore
  - state: { connected: boolean, topics: string[] }
  - actions: connect(url), subscribe(topic), unsubscribe(topic), applyPatch
- userStore
  - state: { me?: User, loggedIn: boolean }
  - actions: telegramInit(initData) — flow with server verification
- shopStore
  - state: { items: ShopItem[], cart: Cart }
  - actions: loadItems, addToCart, removeFromCart, placeOrder

UI / Navigation state
- currentTab: 'home'|'league'|'predictions'|'leaderboard'|'shop'|'profile' — текущее активное представление.
- Поведение:
  - 'home' — основная страница с контентом (сейчас реализована).
  - остальные значения — показывают placeholder ("Страница в разработке") до реализации реальных страниц.

Пример добавления в фасад стора/контракта:

```ts
type UITab = 'home'|'league'|'predictions'|'leaderboard'|'shop'|'profile'
interface UIState { currentTab: UITab }
// actions
setTab(tab: UITab): void
```

Замечания по UX
- Закрытие/переход со сплеша: сплеш скрывается только после завершения прогресса (100%) и небольшой задержки (примерно 350ms), чтобы избежать мерцания при коротких задержках загрузки.
- Модальные окна составов: поддерживают скролл и адаптивную сетку на мобильных устройствах.
- Ошибки валидации: отображаются внутри модальных окон, не закрывая их.
- Успешное сохранение: показывается уведомление на 3 секунды с сохранением при закрытии модального окна.

Типы и shape (коротко)
- Match { id: number, homeTeamId: number, awayTeamId: number, matchDate: string, homeScore: number, awayScore: number, status: 'scheduled'|'live'|'finished' }
- MatchLineupEntry { id: number, matchId: number, playerId: number, shirtNumber?: number | null, confirmed: boolean }
- ValidationError { field: string, message: string, playerId?: number }
- ShopItem { id: number, title: string, price: number }
- Cart { items: { itemId: number, qty: number }[] }

ETag / SWR behaviour (client-side)
- При fetchMatches: если локально известен `etag`, отправляем `If-None-Match`.
- При 304 — не обновляем state; при 200 — сохраняем тело и новый `ETag`.
- При получении WS-патча для matches — применяем патч к store через `applyPatch`, опционально инвалидация ETag.

Edge cases
- Пустой ответ / отсутствие данных — store держит `items = []` и `loading = false`.
- Конфликты между WS-патчем и локальным optimistic update — оптимистичные апдейты должны быть отменяемы при ошибке сервера.
- Большие payloads — при необходимости использовать pagination / incremental fetch.

Тесты (минимальный набор)
- Unit: matchesStore.fetchMatches happy path + 304 handling + error handling.
- Integration: WS patch apply → store state changes (mock WS).

Документы к обновлению при изменениях
- При любом изменении shape стора обновлять `docs/state.md`.

Следующие шаги
- Реализовать `frontend/src/api/etag.ts` с поддержкой If-None-Match и SWR.
- Создать `src/store/facade.ts` и покрыть unit тестами (Jest + msw / nock).

Обновление: User / Profile / Realtime

- User shape (DB / shared types)

```ts
interface DbUser {
  id: number;
  userId: string; // telegram numeric id as string (BigInt in DB)
  tgUsername?: string | null;
  photoUrl?: string | null;
  createdAt: string; // ISO UTC in DB
  updatedAt: string; // ISO UTC in DB
}
```

- userStore behaviour
  - `telegramInit(initData)` — отправляет `initData` на `/api/auth/telegram-init`; сервер валидирует строку и возвращает { ok, user, token } где token — JWT. При успехе store сохраняет `me = user` и `loggedIn = true`.
  - Отображение дат: frontend конвертирует UTC в МСК (UTC+3) и форматирует как `dd.MM.yyyy` для `createdAt` / `updatedAt`.

- realtimeStore / WS рекомендации
  - Клиент WS должен поддерживать reconnect с экспоненциальным бэкоффом (начиная с 500ms, cap ~30s) и jitter.
  - Подписки происходят по топикам; текущая реализация использует имя вкладки (`tab:<name>`) и `user:<userId>` как возможные топики. Сервер должен валидировать права подписки (ACL) — реализовать проверку в `backend/src/realtime/index.ts`.
  - Для локальной отладки запускайте Redis и убедитесь, что `REDIS_URL` корректен.

Edge cases / Notes
- Если token истёк — WS клиент должен попытаться повторно получить токен (refresh flow не реализован — требование для следующего этапа) и переавторизоваться.


## Admin Dashboard Store (новый модуль)

- Расположение: `admin/src/store/adminStore.ts` (отдельный Vite-проект `admin/`).
- Состояние:
  - `status: 'idle' | 'authenticating' | 'authenticated' | 'error'`
  - `token?: string` — JWT после успешного входа.
  - `activeTab: 'teams' | 'matches' | 'stats' | 'players' | 'news'`
  - `error?: string`
- Действия:
  - `login(login: string, password: string)` — обращается к `/api/admin/login`, сохраняет JWT в `localStorage` (`obnliga-admin-token`).
  - `logout()` — очищает токен, сбрасывает вкладку.
  - `setTab(tab)` — переключает активную вкладку.
  - `clearError()` — сбрасывает сообщение об ошибке при фокусе формы.
- Вкладки пока рендерят заглушки (панель `DashboardLayout`); позже будет подключение к данным (команды, матчи и т.д.).
- Влияние на realtime/кэш: пока отсутствует, данные не запрашиваются; при подключении API необходимо интегрировать ETag/WS.

