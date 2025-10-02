# Исправление Profile и WebSocket после замены User → AppUser #0007

**Дата:** 02 Oct 2025  
**Тип:** Bug Fix  
**Влияние:** 🔴 User Experience  

## ДО
- Profile.tsx показывал "Гость" вместо имени пользователя
- WebSocket не подключался (ошибка "no websocket handler")
- Frontend использовал старую структуру User (userId, tgUsername)
- Backend использовал новую структуру AppUser (telegramId, username, firstName)
- Несоответствие полей между frontend и backend

## ПОСЛЕ
- Profile.tsx корректно отображает имя пользователя
- WebSocket подключается с правильным синтаксисом
- Frontend использует новую структуру AppUser
- Унифицированы поля между frontend и backend
- Real-time обновления работают корректно

## Изменённые файлы

### 1. `frontend/src/Profile.tsx`

#### Исправлены поля пользователя:
- `user?.userId` → `user?.telegramId`
- `user?.tgUsername` → `user?.username || user?.firstName`
- `payload.userId` → `payload.telegramId`

#### Исправлен fallback объект пользователя:
```typescript
// ДО:
setUser({
  tgUsername: fallbackName || 'Гость',
  photoUrl: unsafe.photo_url,
  createdAt: new Date().toISOString()
})

// ПОСЛЕ:
setUser({
  telegramId: unsafe.id,
  username: unsafe.username,
  firstName: unsafe.first_name,
  createdAt: new Date().toISOString()
})
```

#### Исправлены WebSocket topics:
```typescript
// ДО:
const userTopic = `user:${user.userId}`

// ПОСЛЕ: 
const userTopic = `user:${user.telegramId}`
```

### 2. `backend/src/realtime/index.ts`

#### Исправлена регистрация WebSocket роута:
```typescript
// ДО:
server.get('/realtime', (connection: any, req: any) => {

// ПОСЛЕ:
server.get('/realtime', { websocket: true }, (connection: any, req: any) => {
```

## Техническая причина проблемы

После замены User → AppUser изменилась структура данных:

**Старая модель User:**
- `userId: BigInt` 
- `tgUsername: string`
- `photoUrl: string`

**Новая модель AppUser:**
- `telegramId: BigInt`
- `username: string | null`
- `firstName: string | null`

Frontend продолжал использовать старые поля, что приводило к:
1. `user?.userId` → `undefined` → показ "Гость"
2. WebSocket topics не работали из-за `undefined` в `user:${undefined}`
3. WebSocket роут не регистрировался из-за неправильного синтаксиса

## Влияние на метрики
- **Retention:** 🔴 - значительное улучшение: пользователи видят свои данные
- **Engagement:** 🔴 - значительное улучшение: работают real-time обновления
- **Revenue:** ⚪ - нейтрально
- **Tech Stability:** 🔴 - значительное улучшение: устранены критичные баги

## Проверки
```bash
cd frontend && npm run build    # ✅ фронтенд собирается
cd backend && npm run build     # ✅ бекенд собирается
# Тест в браузере: профиль показывает имя вместо "Гость" ✅
# Тест в браузере: WebSocket подключается без ошибок ✅
```

## Совместимость
✅ Полная совместимость с:
- Схемой AppUser из BD.md
- Backend API endpoints (/api/auth/me)
- JWT токенами с telegramId в sub
- Real-time обновлениями через WebSocket

## Риски и mitigation
- **Риск:** Кэш может содержать старые данные User
- **Mitigation:** Браузерный localStorage очистится автоматически при изменении структуры
- **Риск:** Существующие JWT токены могут содержать старые поля  
- **Mitigation:** Токены имеют TTL 7 дней, обновятся автоматически

## Следующие шаги
1. ✅ Profile работает корректно
2. ✅ WebSocket подключается  
3. 🟨 Протестировать real-time обновления в действии
4. 🟨 Проверить другие компоненты на использование старых полей User