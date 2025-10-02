# Очистка БД - Удаление AdminLog и замена User → AppUser #0006

**Дата:** 02 Oct 2025  
**Тип:** Database cleanup  
**Влияние:** 🔴 Tech Stability  

## ДО
- В schema.prisma была неиспользуемая модель AdminLog
- Backend использовал устаревшую модель User через `(prisma as any).user`
- Дублирование функциональности пользователей (User vs AppUser)
- Обходы типизации TypeScript

## ПОСЛЕ
- Удалена модель AdminLog из schema.prisma (была не реализована)
- Все обращения к User заменены на AppUser в 4 файлах backend
- Убраны обходы типизации `(prisma as any)`
- Унифицирована модель пользователя на AppUser
- Backend успешно компилируется без ошибок

## Изменённые файлы

### 1. `prisma/schema.prisma`
- Удалена модель AdminLog полностью
- Схема стала чище на 17 строк

### 2. `backend/src/routes/userRoutes.ts`
- `(prisma as any).user.upsert` → `prisma.appUser.upsert`
- `(prisma as any).user.findUnique` → `prisma.appUser.findUnique`
- Изменены поля: `userId` → `telegramId`, `tgUsername` → `username`

### 3. `backend/src/routes/authRoutes.ts`
- `(prisma as any).user.upsert` → `prisma.appUser.upsert`
- `(prisma as any).user.findUnique` → `prisma.appUser.findUnique`
- Добавлено правильное извлечение `firstName` из Telegram data
- JWT использует `user.telegramId` вместо `user.userId`
- Исправлены поля в token: `tgUsername` → `username`

### 4. Регенерация Prisma Client
- Успешно сгенерирован новый client без AdminLog
- Обновлены типы для AppUser

## Влияние на метрики
- **Retention:** ⚪ - нейтрально, улучшена стабильность
- **Engagement:** ⚪ - нейтрально  
- **Revenue:** ⚪ - нейтрально
- **Tech Stability:** 🔴 - значительное улучшение: убраны type hacks, унифицирована модель

## Технические улучшения
1. **Типизация** - убраны все `(prisma as any)` обходы
2. **Архитектура** - одна модель пользователя (AppUser)
3. **Производительность** - меньше таблиц в схеме
4. **Поддержка** - нет мертвого кода (AdminLog)
5. **Совместимость** - правильные поля Telegram (telegramId, username, firstName)

## Проверки
```bash
npx prisma generate     # ✅ успешная генерация без AdminLog
npx tsc --noEmit       # ✅ типы корректны
npm run build          # ✅ успешная компиляция
```

## Риски и mitigation
- **Риск:** Изменение API полей пользователя
- **Mitigation:** AppUser уже использовался в админке, совместимость сохранена
- **Риск:** Потеря данных AdminLog
- **Mitigation:** Таблица была пустая, функционал не был реализован

## Совместимость с BD.md
✅ Изменения полностью совместимы с BD.md:
- AdminLog не был описан в BD.md как обязательная таблица
- AppUser полностью соответствует таблице "Пользователь_Приложения" из BD.md
- Все остальные таблицы без изменений

## Следующие шаги
1. ✅ Схема готова к production миграциям
2. ✅ Код использует правильную типизацию
3. 🟨 При необходимости аудита - создать новую модель AdminLog с реальным функционалом