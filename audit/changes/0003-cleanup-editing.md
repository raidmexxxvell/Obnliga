# 0013-cleanup-editing.md
**Дата**: 2024-12-20  
**Тип**: Cleanup / Refactor  
**Приоритет**: 🔵 (Medium)

## Цель
Убрать компоненты редактирования профиля в соответствии с требованием пользователя:
> "я не говорил тебе добавлять редактирование профиля, а только что бы был топик для вкладки профиль"

## Изменения

### Удалено
- `frontend/src/ProfileAdmin.tsx` - компонент редактирования профиля
- Импорт ProfileAdmin в `frontend/src/Profile.tsx`
- Использование ProfileAdmin в JSX Profile.tsx

### Упрощено  
- `backend/src/routes/userRoutes.ts` - убраны PUT эндпоинты для редактирования
- Оставлены только POST /api/users (upsert) и GET /api/users/:userId

### Сохранено
- WebSocket топики user:${userId} и 'profile' для будущих функций
- Publishing в userRoutes.ts при upsert операциях
- WebSocket subscription в Profile.tsx

## ДО
- Функциональность редактирования профиля через ProfileAdmin компонент
- PUT эндпоинты для обновления профиля
- Форма редактирования в UI

## ПОСЛЕ
- Только отображение профиля с real-time обновлениями
- WebSocket инфраструктура готова для будущих функций
- Чистый код без ненужных компонентов

## Влияние на метрики
- **Retention**: ⚪ (Neutral) - не влияет на пользовательский опыт
- **Engagement**: ⚪ (Neutral) - убрана неиспользуемая функциональность  
- **Revenue**: ⚪ (Neutral) - нет влияния
- **Tech Stability**: 🔵 (Positive) - упрощение кодовой базы

## Проверки
```bash
cd backend && npm run build
cd frontend && npm run build
npm run dev  # Убедиться что профиль отображается корректно
```

## WebSocket инфраструктура (сохранена)
- Топики: `user:${userId}` и `profile`
- Publishing при upsert в authRoutes.ts и userRoutes.ts
- Subscription в Profile.tsx для real-time обновлений
- Готова для будущих функций редактирования/admin панели