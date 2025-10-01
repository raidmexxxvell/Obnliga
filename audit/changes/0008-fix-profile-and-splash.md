# Изменение 0008: Исправление профиля и заставки (обновлено для Render.com)

**Дата**: 1 октября 2025  
**Автор**: GitHub Copilot

## Проблемы

1. При входе в приложение отображается "Гость" вместо имени и фото пользователя из Telegram
2. Заставка отображается внутри блока с задним фоном, а должна быть просто логотип на фоне
3. Frontend на Render.com не знает URL backend сервера

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

### 3. Исправление заставки - убран блок с фоном

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

- **Убран блок `.splash-inner`** - удалены `backdrop-filter`, `border-radius`, `box-shadow` и `background`:
  ```css
  .splash-inner {
    text-align: center;
    padding: 28px;
    /* Убраны: backdrop-filter, border-radius, box-shadow, background */
  }
  ```
  
  Теперь логотип отображается прямо на градиентном фоне без квадратного блока!

### 4. Настройка CORS на backend

**Файл**: `backend/src/server.ts`

#### Изменения:
- Установлен пакет `@fastify/cors`
- Добавлена регистрация CORS middleware:
  ```typescript
  import cors from '@fastify/cors'
  
  server.register(cors, {
    origin: true,  // Allow all origins in development
    credentials: true
  })
  ```

Это позволяет frontend (на другом домене Render) делать запросы к backend API.

### 5. Конфигурация Render.com

**Файл**: `render.yaml`

#### Изменения:
- Добавлена переменная окружения для frontend:
  ```yaml
  - type: web
    name: futbol-league-frontend
    envVars:
      - key: VITE_BACKEND_URL
        value: "https://futbol-league-backend.onrender.com"
  ```

Теперь frontend знает, куда отправлять API запросы на Render.

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
2. ✅ Заставка занимает весь экран, логотип отображается без квадратного блока на чистом градиентном фоне
3. ✅ Добавлено логирование для отладки процесса аутентификации
4. ✅ Улучшена обработка различных форматов данных от Telegram
5. ✅ Настроен CORS для работы frontend и backend на разных доменах Render
6. ✅ Frontend знает URL backend через `VITE_BACKEND_URL`

## Деплой на Render.com

### Шаги для деплоя:

1. **Закоммитьте изменения:**
   ```bash
   git add .
   git commit -m "fix: убран блок заставки, настроен CORS и VITE_BACKEND_URL для Render"
   git push origin main
   ```

2. **Render автоматически задеплоит изменения** (настроено `autoDeployTrigger: commit`)

3. **Проверьте переменные окружения в Render Dashboard:**
   - Backend должен иметь: `TELEGRAM_BOT_TOKEN`, `DATABASE_URL`, `REDIS_URL`
   - Frontend должен иметь: `VITE_BACKEND_URL=https://futbol-league-backend.onrender.com`

4. **После деплоя откройте бота в Telegram** и отправьте `/start`

### Проверка работы:

1. Откройте приложение через Telegram WebApp (бот `@footballobn_bot`)
2. Проверьте заставку - должна быть без блока, только логотип на градиенте
3. После загрузки откройте вкладку "Профиль" (👤)
4. Должны отображаться:
   - Ваше фото из Telegram (если есть)
   - Ваше имя или username
   - Дата регистрации

## Отладка (если не работает)

### Если профиль показывает "Гость":

1. Откройте DevTools в Telegram (если доступно)
2. Проверьте консоль на ошибки
3. Проверьте Network tab - должен быть запрос к `https://futbol-league-backend.onrender.com/api/auth/telegram-init`
4. Если запрос идет на `localhost` - значит `VITE_BACKEND_URL` не подхватился, нужен rebuild frontend

### Если CORS ошибки:

- Проверьте, что `@fastify/cors` установлен на backend
- Проверьте логи backend на Render Dashboard

## Примечания

- **Render.com** используется для production деплоя
- Локальная разработка без Telegram WebApp API невозможна (можно только через бота)
- Redis опционален для dev окружения (нормально видеть ECONNREFUSED в локальных логах)
