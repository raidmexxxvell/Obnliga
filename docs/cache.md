# Политика кэширования: Лига Обнинска

## Схема кэш-ключей

Все кэш-ключи следуют принципу `категория:тип[:дополнительные_параметры]`

### 1. League (Лига) — TTL: 5-30 сек
- `league:table` — таблица лиги (5 сек, SWR=15 сек)
- `league:schedule` — расписание матчей (8 сек)
- `league:stats` — статистика лиги (30 сек)
- `league:results` — результаты матчей (15 сек)
- `league:bracket` — сетка плей-офф (10 сек, SWR=30 сек, ETag обязателен после завершения stub-реализации `/api/bracket`)

### 2. Match Details (Детали матчей) — TTL: 10 мин/реалтайм
- `md:{match_id}` — основные детали матча (10 мин)
- `md:etag-temp:{match_id}` — временные ETag записи
- `md:stats:{match_id}` — статистика матча (реалтайм, SWR=5 сек)
    - Инвалидируется через `broadcastMatchStatistics`: любые ручные правки статистики или CRUD событий (жёлтые/красные карточки)
        пересчитывают payload и публикуют patch на топик `match:{match_id}:stats`.

### 3. Predictions (Прогнозы) — TTL: 2-5 мин
- `predictions:list` — список доступных прогнозов (5 мин)
- `predictions:user:{user_id}` — прогнозы пользователя (2 мин)

### 4. Leaderboard (Лидерборды) — TTL: 1 мин
- `lb:predictors` — топ прогнозистов (1 мин)
- `lb:rich` — топ богатых игроков (1 мин) 
- `lb:server` — серверные лидеры (1 мин)
- `lb:prizes` — призы и награды (30 сек)

### 5. Achievements (Достижения) — TTL: 30 мин
- `achievements:v1` — пользовательские достижения (30 мин)

### 6. Ads & Features (Реклама/Фичи) — TTL: 5-15 мин
- `ads:topmatch` — топ матч для рекламы (15 мин)

### 7. Database API — TTL: varies
- `GET:{endpoint}` — общий паттерн

### 8. Admin Stats Cache (Fastify Multi-Level)
- `season:{seasonId}:club-stats` — 3600 c (инвалидация при финализации матча, по ключу сезона)
- `season:{seasonId}:player-stats` — 3600 c (аналогично)
- `competition:{competitionId}:club-career` — 7200 c (инвалидация при финализации матча)
- `competition:{competitionId}:player-career` — 7200 c (инвалидация при финализации матча)
- `league:club-career` — 7200 c (инвалидация при финализации матча)
- `league:player-career` — 7200 c (инвалидация при финализации матча)
- `club:{clubId}:player-career` — 7200 c (инвалидация при финализации матча)

Каждый ответ админских статистических эндпоинтов возвращает `X-Resource-Version` и `meta.version`, чтобы клиенты могли сравнивать версии без повторной выборки при неизменном payload.

### 9. Public Aggregates (HTTP + WS)
- `public:league:table` — 300 c (SWR 45 c, WS topic `league:table`)
- `public:league:top-scorers` — 300 c (SWR 60 c, WS topic `league:scorers`)
- `public:league:form:{seasonId}` — 600 c (SWR 120 c, WS topic `league:form`)
- `public:matches:live` — 5 c (SWR 15 c, WS topic `matches:live`)
- `public:club:{clubId}:summary` — 1200 c (SWR 300 c, WS topic `club:{clubId}:summary`)
- `public:predictions:leaderboard` — 1200 c (SWR 300 c, WS topic `predictions:leaderboard`)

Версия ресурса передаётся через `X-Resource-Version` и `meta.version`, обновляется воркером `stats-aggregation` после пересчётов `handleMatchFinalization`.

###	8.Защита от кэш-бомб
-	Ограничение размера кэша на пользователя:
	MAX_CACHE_ENTRIES_PER_USER = 50
-	Ограничение частоты запросов к одному ключу:
	RATE_LIMIT_PER_KEY = "10/мин"
-	Автоматическая очистка при превышении лимита:
	LRU (Least Recently Used) стратегия

## Стратегии инвалидации

### Automatic (Автоматическая)
- По TTL срока давности
- При получении 304 Not Modified — продление кэша

### Event-driven (По событиям)
- WS события `data_patch` → инвалидация соответствующих ключей
- `match_results_update` → `league:table`, `league:stats`
- `match_stats_update` (публикуется `broadcastMatchStatistics`) → `md:stats:{matchId}`
- `schedule_update` → `league:schedule`
- `bracket_update` → `league:bracket`
- `odds_update` → `predictions:*`
- `match_finalized` (Fastify `handleMatchFinalization`) → `season:{id}:club-stats`, `season:{id}:player-stats`, `competition:{id}:club-stats`, `competition:{id}:player-stats`, `competition:{id}:club-career`, `competition:{id}:player-career`, `league:club-career`, `league:player-career`, `club:{id}:player-career`

###	🔁 Стратегии инвалидации
-	Automatic
    По истечении TTL
    При 304 Not Modified — продление TTL
-	Event-driven (через WebSocket)
    data_patch → инвалидация связанных ключей
    match_results_update → league:table, league:stats
    schedule_update → league:schedule
    odds_update → predictions:*

## TTL по приоритету обновлений

### Критически важные (реалтайм) — 5-30 сек
- Счет матчей, таблица лиги, коэффициенты
- Сетка плей-офф (обновления стадий и результатов)

### Важные (частые обновления) — 1-5 мин
- Прогнозы, лидерборды, статистика

### Стабильные (редкие обновления) — 10-30 мин
- Достижения, детали пользователя, настройки
- Admin career stats (клубы/игроки) — 3 мин (TTL 180 c без фоновых воркеров, rely on event-driven invalidation)

## Правила версионирования

### ETag-based
- Сервер возвращает ETag в заголовках
- Клиент отправляет `If-None-Match`
- 304 → использовать кэш, обновить TTL

### Version-based (для WS патчей)
- ETag-based: для HTTP-запросов
- Version-based: для WS-патчей (version > current)
- MultiLevel Cache: каждый cache key сопровождается `X-Resource-Version` (числовой инкремент), вычисляемый по SHA1-фингерпринту сериализованного payload. Значение пробрасывается через заголовок ответа и `meta.version` в теле.

## Мониторинг кэша

### Метрики в debug режиме
- Cache hit/miss ratio по категориям
- Частота инвалидации
- Размер кэшированных данных

## Конфигурация по окружениям

### Development
- Короткие TTL для быстрого тестирования
- Подробное логирование кэш-операций

### Production
- Оптимальные TTL для баланса нагрузки/свежести
- Ошибки кэша не должны блокировать UI
- Приложение админ-панели использует локальный TTL (SWR) без фоновых воркеров: повторные запросы на вкладках «Команды», «Матчи», «Статистика» триггерятся только при явном истечении TTL или смене параметров (сезон/турнир)