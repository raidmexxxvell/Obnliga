# 0007 — Update profile auth flow and frontend Profile.tsx

Дата: 2025-09-28

Кратко:
- Обновлён фронтенд `frontend/src/Profile.tsx`: логика отправки Telegram `initData` (кнопка "Send initData to server") теперь находится внутри компонента и корректно сохраняет полученный JWT в `localStorage`.
- Серверная часть: маршрут `/api/auth/telegram-init` поддерживает оба формата `initData` — как набор flattened params, так и JSON-поле `user` (как в старом примере из `docs/profile.md`). После валидации HMAC выполняется upsert в таблицу `users`.
- Добавлен endpoint `/api/auth/me` для получения текущего пользователя по JWT (Authorization: Bearer <token>) или cookie `session`.

ДО:
- В старой реализации initData мог быть только в теле или в форме, а фронтенд содержал дублирующуюся глобальную функцию `onSendInit`, что приводило к ошибкам компиляции/области видимости.

ПОСЛЕ:
- Фронтенд: `onSendInit` внутри компонента, сохраняет `token` в `localStorage` и перезапрашивает `/api/auth/me` для отображения профиля.
- Бэкенд: поддержка JSON `user` внутри `initData`, upsert пользователя, выдача JWT и попытка установки httpOnly cookie.

Влияние на метрики:
- Retention: 🔵 — пользователи, вошедшие через Telegram WebApp, теперь получают стабильный профиль и токен для последующих запросов.
- Engagement: 🔵 — профиль отображает аватар и дату регистрации, что улучшает персонализацию.
- Revenue: ⚪ — нет прямого влияния.
- Tech Stability: 🔵 — исправлена ошибка компиляции во фронтенде, добавлена более надёжная обработка initData.

Проверки и команды (локально):
- Сборка фронтенда:
```
cd frontend
npm run build
```
- Сборка бэкенда (генерация Prisma + TypeScript):
```
cd backend
npm run build
```
- Тест ручного запроса (пример):
  - Сгенерировать корректный initData и выполнить POST к `/api/auth/telegram-init` либо через Telegram WebApp (рекомендовано), либо вручную через curl/postman.

Риски и mitigation:
- Если BOT_TOKEN в окружении не совпадает с тем, что использовался при создании initData у клиента, HMAC-проверка упадёт. Mitigation: убедиться, что окружение содержит актуальный BOT_TOKEN.
- `prisma db push` использовался для быстрого создания таблиц в CI; в будущем заменить на миграции с `prisma migrate`.

Изменённые файлы:
- `frontend/src/Profile.tsx` — moved onSendInit into component; save token to localStorage; call /api/auth/me.
- `backend/src/routes/authRoutes.ts` — support for JSON user in initData; issue JWT; /api/auth/me endpoint.
- `docs/profile.md` — добавлено примечание о текущей реализации.

Проверки (что сделано в этой задаче):
- [x] Удалён дублирующийся глобальный `onSendInit` во фронтенде (исправление компиляции).
- [x] Собрана фронтенд-папка (vite build) — успешно.
- [x] Собран бэкенд (prisma generate + tsc) — успешно.

