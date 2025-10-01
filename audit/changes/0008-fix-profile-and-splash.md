# Изменение 0008: Исправление профиля и заставки

**Дата**: 1 октября 2025  
**Автор**: GitHub Copilot

## Проблемы

1. При входе в приложение отображается "Гость" вместо имени и фото пользователя из Telegram
2. Заставка отображается внутри блока, а не на весь экран

## Решение

### 1. Исправление загрузки профиля пользователя

**Файл**: `frontend/src/Profile.tsx`

#### Изменения:
- Переработана логика `loadProfile()`:
  - Теперь сначала проверяется наличие Telegram WebApp и данных пользователя
  - Данные из `initDataUnsafe.user` отправляются на backend для аутентификации
  - Добавлено логирование для отладки
  - Улучшена обработка различных форматов `initData`
  - Добавлен fallback на token-based загрузку
  
- Исправлено отображение имени пользователя:
  - Убран символ `@` перед именем
  - Теперь отображается `tgUsername` напрямую (который содержит `username` или `first_name` с бэкенда)

#### Логика работы:
1. При загрузке компонента проверяется `window.Telegram.WebApp.initDataUnsafe.user`
2. Если данные есть, они отправляются на `/api/auth/telegram-init`
3. Backend проверяет и сохраняет пользователя, возвращает JWT токен
4. Токен сохраняется в `localStorage`
5. Загружается профиль пользователя через `/api/auth/me`

### 2. Исправление backend для корректного извлечения имени

**Файл**: `backend/src/routes/authRoutes.ts`

#### Изменения:
- Улучшена логика извлечения `username`:
  ```typescript
  let username = params.username || params.first_name
  ```
  Теперь если `username` отсутствует, используется `first_name`
  
- Добавлено логирование извлеченных данных:
  ```typescript
  server.log.info({ userId, username, photoUrl }, 'Extracted user data from initData')
  ```

- Улучшена обработка JSON-объекта `user`:
  ```typescript
  username = username || uobj.username || uobj.first_name
  ```

### 3. Исправление заставки на весь экран

**Файл**: `frontend/src/app.css`

#### Изменения:
- Убран фон из базового `.app-root`, перенесен только в `.app-root.main`
- Для `.splash` добавлены стили полноэкранного отображения:
  ```css
  .splash {
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
    background: /* градиенты */;
    z-index: 9999;
  }
  ```

- Это обеспечивает, что заставка занимает весь экран браузера, независимо от размера viewport

## Технические детали

### Поддержка данных Telegram

Согласно документации в `docs/profile.md`, Telegram WebApp предоставляет данные пользователя через:
- `window.Telegram.WebApp.initData` - подписанная строка (для HMAC проверки)
- `window.Telegram.WebApp.initDataUnsafe` - небезопасный объект с данными

Данные включают:
- `id` - Telegram user ID
- `first_name` - имя пользователя
- `last_name` - фамилия (опционально)
- `username` - username (опционально)
- `photo_url` - URL фото профиля (опционально)
- `language_code` - код языка

### Схема базы данных

Таблица `users`:
```prisma
model User {
  id        Int      @id @default(autoincrement())
  userId    BigInt   @unique @map("user_id")  // Telegram ID
  tgUsername String? @map("tg_username")      // username или first_name
  photoUrl  String?  @map("photo_url")        // URL фото
  createdAt DateTime @map("created_at") @default(now())
  updatedAt DateTime @map("updated_at") @updatedAt
}
```

## Результат

1. ✅ При входе в приложение через Telegram WebApp теперь автоматически отображается имя и фото пользователя
2. ✅ Заставка теперь занимает весь экран и выглядит профессионально
3. ✅ Добавлено логирование для отладки процесса аутентификации
4. ✅ Улучшена обработка различных форматов данных от Telegram

## Тестирование

Для тестирования:
1. Откройте приложение через Telegram WebApp (через бота с командой `/start`)
2. Проверьте, что заставка отображается на весь экран
3. После загрузки проверьте, что в профиле отображается ваше имя и фото из Telegram
4. Проверьте консоль браузера на наличие логов аутентификации

## Примечания

- Redis кеш не работает в локальной разработке (ошибки ECONNREFUSED), но это не критично для функционала профиля
- Backend сервер запущен на `http://localhost:3000`
- Frontend сервер запущен на `http://localhost:5173`
- Для production потребуется настроить правильный `VITE_BACKEND_URL` в переменных окружения
