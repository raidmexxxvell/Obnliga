# Публичные агрегированные эндпоинты и WebSocket-топики

Дата: 2025-10-05
Ответственный: GitHub Copilot (автоматизированный ассистент)

## 1. Цели
- Предоставить публичной витрине (порталу и Telegram WebApp) агрегированные данные без необходимости авторизации.
- Обеспечить согласованность данных между HTTP-ответами и WebSocket-патчами.
- Минимизировать нагрузку на Postgres через использование существующего multilevel cache + версионирование.
- Обойти ограничение Render.com на платные background worker'ы: переработки должны выполняться в рамках существующего веб-сервиса.

## 2. Источники данных (reuse)
| Модуль | Назначение | Использование |
| --- | --- | --- |
| `backend/src/services/matchAggregation.ts` | финализация матчей, пересчёт сезонных/карьерных статистик | Основной триггер для инвалидации публичных агрегатов.
| `backend/src/routes/adminRoutes.ts` | готовые агрегированные выборки для админки | Бэкэнд-логика/SQL запросы переиспользуются как источники данных для публичных API.
| `defaultCache` (multilevel) | Redis + LRU + версии | Шарим ключи, добавляем публичные с новым префиксом `public:`.
| `admin/src/store/adminStore.ts` TTL-ы | Используем как ориентир для SWR интервалов на публичной стороне.

## 3. Предлагаемые HTTP эндпоинты (GET)
| Путь | Описание | Источник данных | Кэш-ключ | TTL | ETag/Версия |
| --- | --- | --- | --- | --- | --- |
| `/api/public/league/table` | турнирная таблица активного сезона | `getSeasonClubStats` (reuse) | `public:league:table` | 15 c | `ETag` + `X-Resource-Version`
| `/api/public/league/top-scorers` | топ бомбардиров (текущий сезон) | `getSeasonPlayerStats` | `public:league:top-scorers` | 30 c | аналогично
| `/api/public/league/form` | серия последних результатов по клубам | новая выборка (на базе `matchAggregation`) | `public:league:form:{seasonId}` | 60 c | да
| `/api/public/matches/live` | список live-матчей с минимальными полями | reuse `match` таблицы (статус LIVE) | `public:matches:live` | 5 c | да
| `/api/public/club/:clubId/summary` | краткая сводка клуба (последние 5 матчей, топ игроки) | комбинация существующих запросов + `playerCareerStats` | `public:club:{clubId}:summary` | 120 c | да
| `/api/public/predictions/leaderboard` | общий лидерборд прогнозов | reuse admin predictions агрегата | `public:predictions:leaderboard` | 120 c | да

### Ответы
- Структуры описываются через `shared/types.ts` (потребуются новые интерфейсы `PublicLeagueTableRow`, `PublicScorer`, `ClubSummary` и т.д.).
- Все ответы — `Envelope { ok, data, meta: { version, ttl } }`.
- Поддерживаем `If-None-Match` с existing `etag` плагином + версию из multilevel cache.

## 4. WebSocket-топики
| Топик | Тип события | Триггеры | Payload |
| --- | --- | --- | --- |
| `league:table` | `patch`/`full` | `match_finalized`, ручная инвалидация | массив standings + `version`
| `league:scorers` | `patch` | гол/удаление | топ-список, тот же формат, сокращённый payload
| `matches:live` | `patch` | изменение состояния матча (счёт/статус) | список live-матчей + version
| `club:{clubId}:summary` | `full` | матчи клуба завершены/изменены | объект summary + version
| `predictions:leaderboard` | `full` | завершение матчей, обновление ставок | топ-лист + version

**Протокол:**
```json
{
  "protocolVersion": 1,
  "type": "patch" | "full",
  "topic": "league:table",
  "version": 42,
  "payload": { ...diff или новое состояние }
}
```
- Для таблицы и топ бомбардиров используем `jsondiffpatch` для генерации патчей (опционально, MVP — full-update).
- Клиент обязан проверять `version`; если пропущен патч, запрашивать HTTP.

## 5. Воркеры и обновление Redis
### Ограничения Render.com
- Нельзя запускать отдельный Background Worker без доплаты.
- Решение: интегрируем BullMQ Worker внутрь основного Fastify-приложения (in-process worker).

### Подход
1. Создаём очередь `stats-aggregation` (BullMQ).
2. На `server.ready` регистрируем `Worker` с `concurrency = 1`, `autorun = false` в dev; в прод окружении запускаем, если `ENABLE_INPROC_WORKER=true`.
3. Триггеры на добавление задач:
   - `handleMatchFinalization` после пересчёта статистик → `queue.add('rebuild-public-aggregates', { seasonId, competitionId, clubIds }, { jobId: ... , removeOnComplete: true })`.
   - Cron-like задачи (опционально) через `QueueScheduler`/`repeatable` jobs, но в MVP можно ограничиться событиями финализации.
4. Процессор задачи:
   - Строит необходимые агрегаты (переиспользуя функции из `adminRoutes`);
   - Обновляет Redis ключи (`defaultCache.set`) и публикует `server.publishTopic` для соответствующих топиков.
5. Фолбэк при отключённом worker: HTTP хэндлеры выполняют lazy-loading (как сейчас), версия увеличивается только при invalidate.

### Безопасность и мониторинг
- Лимитируем количество job'ов (дедупликация через `jobId` = `${seasonId}:${type}` ).
- Добавляем метрики (count hits/misses) позже.
- Булл-клиент использует ту же Redis-конфигурацию.

## 6. TTL и кэш-ключи
- Префикс `public:` для отделения от админских кэшей.
- Примеры: `public:league:table`, `public:league:top-scorers`, `public:club:${clubId}:summary`.
- TTL согласован с UX: таблица — 15 c (🔴), live-матчи — 5 c (🔴), топ-счётчики — 30 c (🔵), клубная сводка — 120 c (⚪), лидерборд — 120 c (🔵).
- Версии увеличиваются в воркере, публикуются через `X-Resource-Version`.

## 7. План работ
1. **(Текущий документ)** Утверждение схемы HTTP/WS и воркера — ✅.
2. Добавить shared типы для публичных агрегатов, реализовать `/api/public/*` маршруты с переиспользованием текущей логики.
3. Интегрировать BullMQ Worker в `backend/src/server.ts` (hook `onReady`).
4. Расширить `matchAggregation` для постановки job'ов в очередь + публикация WS.
5. Создать клиента WS (`frontend/src/wsClient.ts`) с подпиской на новые топики.
6. Покрыть документацию (`docs/api-contracts.md`, `docs/cache.md`, `docs/state.md`) и тесты.

## 8. Открытые вопросы / TODO
- Уточнить формат для `league/form` (нужны ли streaks или процент побед?).
- Решить, нужен ли общий endpoint для нескольких сезонов (история).
- Дополнить roadmap задачами по мониторингу worker (BullBoard/Sentry breadcrumbs).
- После MVP — перейти на patch-диффы для `league:table`.
