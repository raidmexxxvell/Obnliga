# 🏆 Obnliga — Футбольная Лига Обнинска

## 📊 Краткая справка

**Тип проекта:** Telegram WebApp для локальной футбольной лиги  
**Цель:** Максимальная вовлечённость пользователей через прогнозы, достижения и live-обновления  
**Статус:** Активная разработка (MVP-фаза)

---

## 🎯 Что это?

Приложение для управления футбольной лигой небольшого города с функциями:

- 📅 **Расписание и результаты** матчей в реальном времени
- 🎲 **Прогнозы** на исходы матчей (1X2, тоталы, события)
- 🏅 **Достижения** и система вовлечённости (стрики входов)
- 📊 **Статистика** игроков, команд, турниров
- 🛒 **Магазин** (в планах)
- 👑 **Лидерборды** прогнозистов

---

## 🛠️ Технологии

### Backend
```
Node.js + TypeScript + Fastify + Prisma
PostgreSQL (prod) / SQLite (dev)
Redis (cache + pub/sub)
BullMQ (очереди)
WebSocket (realtime)
```

### Frontend
```
Vite + React/Preact + TypeScript
Zustand (state management)
Неокубизм дизайн с неоновыми акцентами
```

### Инфраструктура
```
Render.com (hosting)
GitHub Actions (CI/CD)
```

---

## 📁 Структура репозитория

```
.
├── backend/          # Fastify сервер
│   ├── src/
│   │   ├── routes/   # API endpoints
│   │   ├── cache/    # Multilevel cache
│   │   ├── realtime/ # WebSocket
│   │   └── plugins/  # ETag, etc.
│
├── frontend/         # Основное приложение
│   └── src/
│       ├── components/
│       ├── store/    # Zustand stores
│       └── api/      # HTTP клиент
│
├── admin/            # Админ-панель (отдельный Vite проект)
│
├── prisma/           # ORM схема и миграции
│   ├── schema.prisma
│   └── migrations/
│
├── shared/           # Общие TypeScript типы
│
├── docs/             # Документация проекта
│   ├── BD.md         # Схема БД
│   ├── roadmap.md    # План развития
│   ├── cache.md      # Политика кэширования
│   └── ...
│
├── audit/            # История изменений
│   ├── changes/      # Changelog по изменениям
│   └── *.md          # Анализы и отчёты
│
└── specs/            # Спецификации функций
    └── 001-project-analysis/
```

---

## 🗄️ База данных (8 групп таблиц)

1. **Foundation** — Club, Person, Club_Player
2. **Competitions** — Competition, Season, SeasonParticipant, SeasonRoster
3. **Matches** — Stadium, Match, MatchSeries
4. **Match Details** — MatchLineup, MatchEvent
5. **Statistics** — PlayerSeasonStats, ClubSeasonStats, PlayerClubCareerStats
6. **Users** — AppUser, Prediction
7. **Achievements** — AchievementType, UserAchievement
8. **Moderation** — Disqualification

**Статус:** ✅ 100% соответствие спецификации BD.md

---

## ⚡ Система кэширования

**Уровни:**
- In-memory LRU (quick-lru) — процессный кэш
- Redis — распределённый кэш + pub/sub

**TTL политики:**
```
league:table      → 5-30с   (критичное)
predictions:*     → 2-5мин  (важное)
achievements:v1   → 30мин   (стабильное)
```

**Инвалидация:**
- Автоматическая по TTL
- Event-driven через WebSocket

**ETag:**
- Middleware готов к интеграции
- If-None-Match → 304 Not Modified

---

## 🔥 Realtime обновления

**Протокол:**
```json
{
  "protocolVersion": 1,
  "type": "patch|full",
  "topic": "match:123",
  "payload": {...}
}
```

**Транспорт:**
```
Client WS ← → Fastify WS ← → Redis Pub/Sub ← → Other instances
```

**Reconnect:** Экспоненциальный backoff (500ms → 30s)

---

## 📈 Прогресс (Roadmap)

### ✅ Завершено
- [x] Фаза 0: Скелет проекта
- [x] Фаза 1: Prisma + схема БД
- [x] Фаза 3: Multilevel cache (skeleton)
- [x] Админ-панель (skeleton)

### 🟨 В процессе
- [ ] Фаза 2: Core API endpoints
- [ ] ETag middleware
- [ ] Telegram auth flow

### ⬜ В планах
- [ ] Фаза 4: Realtime WebSocket (полная интеграция)
- [ ] Фаза 5: Frontend core (stores, UI)
- [ ] Фаза 6: Shop + Bets (BullMQ)
- [ ] Фазы 8-10: Тесты, CI/CD, Production

---

## 🎨 Дизайн

**Стиль:** Неокубизм с неоновыми акцентами

**Цвета:**
- Neon Cyan: `#00f0ff`
- Neon Magenta: `#781f8f`
- Accent Green: `#7aff6a`

**Компоненты:**
- Стеклянные панели (backdrop-filter: blur)
- Короткие анимации (≤700ms)
- Geometric shapes + soft shadows

---

## 🚀 Запуск локально

### Backend
```powershell
cd backend
npm install
npm run dev  # Порт 3000
```

### Frontend
```powershell
cd frontend
npm install
npm run dev  # Порт 5173
```

### Admin Panel
```powershell
cd admin
npm install
npm run dev  # Порт 5183
```

### Redis (опционально для realtime)
```powershell
docker run -d --name obnliga-redis -p 6379:6379 redis:7-alpine
```

---

## 📚 Ключевые документы

**Обязательные:**
- `docs/BD.md` — Полная схема БД
- `docs/roadmap.md` — План развития
- `docs/project.md` — Описание проекта
- `docs/state.md` — Store контракты

**Справочные:**
- `docs/cache.md` — Кэш-политики
- `docs/style.md` — Дизайн-система
- `audit/bd-compliance-analysis.md` — Анализ БД
- `specs/001-project-analysis/spec.md` — Полный анализ проекта

---

## 🎯 Следующие шаги (High Priority)

1. ✅ Завершить ETag middleware
2. ✅ Реализовать Telegram auth flow
3. ✅ Smart cache invalidation
4. ✅ CRUD endpoints для админки
5. ✅ WebSocket ACL + версионирование

---

## 💡 Сильные стороны

✅ **Масштабируемость** — простое добавление лиг/турниров  
✅ **Performance** — multilevel cache  
✅ **Real-time** — WebSocket для живых обновлений  
✅ **Документация** — подробный audit trail  
✅ **Типизация** — TypeScript на всех уровнях  

---

## 📞 Контакты

**Репозиторий:** Obnliga (raidmexxxvell)  
**Текущая ветка:** main  
**Спецификация:** specs/001-project-analysis/

---

**Последнее обновление:** 4 октября 2025 г.
