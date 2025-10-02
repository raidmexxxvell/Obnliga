# Анализ таблиц для удаления из БД

**Дата анализа:** 02 Oct 2025  
**Цель:** Выявить неиспользуемые таблицы для оптимизации схемы БД

## 🔍 МЕТОДОЛОГИЯ АНАЛИЗА

Проверены следующие аспекты:
1. **Использование в backend коде** - поиск обращений через Prisma Client
2. **Использование в frontend/admin** - проверка типов и API вызовов  
3. **Связанность схемы** - анализ FK constraints и relations
4. **Документация** - соответствие BD.md и roadmap.md

## ❌ ТАБЛИЦЫ ДЛЯ УДАЛЕНИЯ

### 1. Таблицы "призраки" из старых миграций 
**(Уже удалены в миграции 20250928184321)**

- ❌ `news` - была в старых миграциях, удалена
- ❌ `admin_logs` (старая версия) - заменена на `AdminLog` 
- ❌ `player_statistics` - заменена на `PlayerSeasonStats`
- ❌ `players` - заменена на `Person`
- ❌ `teams` - заменена на `Club`
- ❌ `tournaments` - заменена на `Competition`
- ❌ `matches` (старая) - заменена на `Match`
- ❌ `match_events` (старая) - заменена на `MatchEvent`

**Статус:** ✅ Эти таблицы уже удалены в миграции

### 2. Устаревшие модели в коде

#### ❌ **User** (из userRoutes/authRoutes)
```typescript
// Используется в userRoutes.ts и authRoutes.ts с (prisma as any).user
```

**Проблемы:**
- ❌ Не определена в schema.prisma (только в schema.local.prisma)
- ❌ Использует `(prisma as any).user` - обход типизации
- ❌ Дублирует функциональность `AppUser`
- ❌ Конфликтует с текущей архитектурой

**Решение:** Удалить модель `User`, заменить на `AppUser` в коде

#### ❌ **AdminLog** (текущая версия)
```prisma
model AdminLog {
  id              Int      @id @default(autoincrement())
  adminId         BigInt?  @map("admin_id")
  action          String
  description     String
  endpoint        String?
  // ... остальные поля
}
```

**Проблемы:**
- ❌ НЕ используется в коде (нет обращений через Prisma)
- ❌ Отсутствует в adminRoutes.ts
- ❌ Планировалась, но не реализована
- ❌ Занимает место в схеме

**Решение:** Удалить до реальной реализации аудита

## ✅ ТАБЛИЦЫ НЕОБХОДИМО ОСТАВИТЬ

### Активно используемые:
- ✅ **Club** - CRUD в adminRoutes.ts
- ✅ **Person** - CRUD в adminRoutes.ts  
- ✅ **Competition** - CRUD в adminRoutes.ts
- ✅ **Season** - CRUD в adminRoutes.ts
- ✅ **Stadium** - CRUD в adminRoutes.ts
- ✅ **Match** - CRUD в adminRoutes.ts
- ✅ **MatchSeries** - CRUD в adminRoutes.ts
- ✅ **MatchLineup** - используется в составах
- ✅ **MatchEvent** - используется в событиях матчей
- ✅ **AppUser** - CRUD в adminRoutes.ts
- ✅ **Prediction** - CRUD в adminRoutes.ts
- ✅ **AchievementType** - CRUD в adminRoutes.ts
- ✅ **UserAchievement** - CRUD в adminRoutes.ts
- ✅ **Disqualification** - CRUD в adminRoutes.ts

### Агрегированная статистика:
- ✅ **PlayerSeasonStats** - используется в админке
- ✅ **PlayerClubCareerStats** - используется в админке
- ✅ **ClubSeasonStats** - используется в админке

### Связующие таблицы:
- ✅ **SeasonParticipant** - связь сезон-клуб
- ✅ **SeasonRoster** - заявки команд

## 🛠 ПЛАН ДЕЙСТВИЙ

### Шаг 1: Удалить модель User
```typescript
// Заменить в userRoutes.ts и authRoutes.ts:
// (prisma as any).user → prisma.appUser
```

### Шаг 2: Удалить AdminLog из схемы
```prisma
// Удалить модель AdminLog из schema.prisma
// (вернуть позже при реализации аудита)
```

### Шаг 3: Обновить миграции
```bash
# Создать новую миграцию без AdminLog и User
npx prisma migrate dev --name remove_unused_tables
```

## 📊 ИТОГОВЫЕ ЦИФРЫ

### К удалению: 2 таблицы
- ❌ `User` (конфликтует с AppUser)
- ❌ `AdminLog` (не используется)

### Остается: 17 активных таблиц
- 8 основных (Club, Person, Competition, Season, Stadium, Match, MatchSeries, AppUser)
- 3 детализации (MatchLineup, MatchEvent, Disqualification)  
- 3 статистики (PlayerSeasonStats, PlayerClubCareerStats, ClubSeasonStats)
- 3 связующие (SeasonParticipant, SeasonRoster, Prediction)
- 2 достижения (AchievementType, UserAchievement)

## 🎯 ПРЕИМУЩЕСТВА ОЧИСТКИ

1. **Производительность** - меньше таблиц = быстрее запросы
2. **Типизация** - убираем `(prisma as any)` обходы
3. **Чистота архитектуры** - одна модель пользователя (AppUser)
4. **Простота поддержки** - нет неиспользуемого кода

## ⚠️ ПРЕДУПРЕЖДЕНИЯ

- Удаление AdminLog безопасно - таблица не используется
- Замена User → AppUser требует обновления 4 файлов в backend
- После удаления нужно пересоздать Prisma client